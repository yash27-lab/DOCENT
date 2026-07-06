import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTemplateExtraction,
  detectTemplate,
  isPlausibleDate,
  isValidCurrencyAmount,
  isValidTin
} from "../electron/extraction-templates";

test("detects the W-9 template and keeps unfilled fields conservative", () => {
  const source = `
    Form W-9
    Request for Taxpayer Identification Number and Certification
    Name (as shown on your income tax return)
    Business name/disregarded entity name, if different from above
    Federal tax classification
    Address (number, street, and apt. or suite no.)
    City, state, and ZIP code
    Taxpayer Identification Number
  `;

  const result = buildTemplateExtraction(source);

  assert.ok(result);
  assert.equal(result.extraction.template, "IRS W-9");
  assert.ok(result.extraction.fields.some((field) => field.key === "name" && field.status === "Detected label"));
  assert.ok(result.extraction.fields.some((field) => field.key === "tinNumber"));
});

test("extracts and validates a filled W-9 TIN", () => {
  const source = `
    Form W-9
    Request for Taxpayer Identification Number and Certification
    Taxpayer Identification Number: 12-3456789
  `;

  const result = buildTemplateExtraction(source);

  assert.ok(result);
  const tin = result.extraction.fields.find((field) => field.key === "tinNumber");
  assert.ok(tin);
  assert.equal(tin.status, "Extracted");
  assert.equal(tin.value, "12-3456789");
  assert.equal(tin.validation, "Valid");
});

test("detects the IRS 1040 template with filing status extraction", () => {
  const source = `
    Form 1040
    U.S. Individual Income Tax Return
    Filing status: Married filing jointly
    Your first name and middle initial
    Last name
    Your social security number
    Standard deduction
    Adjusted gross income
  `;

  const result = buildTemplateExtraction(source);

  assert.ok(result);
  assert.equal(result.extraction.template, "IRS 1040");
  assert.equal(result.match.template.documentClass, "Tax form");

  const filingStatus = result.extraction.fields.find((field) => field.key === "filingStatus");
  assert.ok(filingStatus);
  assert.equal(filingStatus.status, "Extracted");
  assert.equal(filingStatus.validation, "Valid");
});

test("detects the USCIS I-9 template and validates date of birth", () => {
  const source = `
    Form I-9
    Employment Eligibility Verification
    Department of Homeland Security
    U.S. Citizenship and Immigration Services
    Last Name (Family Name): Rivera
    First Name (Given Name): Ana
    Date of Birth (mm/dd/yyyy): 04/12/1988
    Employee's E-mail Address: ana.rivera@example.com
  `;

  const result = buildTemplateExtraction(source);

  assert.ok(result);
  assert.equal(result.extraction.template, "USCIS I-9");
  assert.equal(result.match.template.documentClass, "Employment verification form");

  const dateOfBirth = result.extraction.fields.find((field) => field.key === "dateOfBirth");
  assert.ok(dateOfBirth);
  assert.equal(dateOfBirth.value, "04/12/1988");
  assert.equal(dateOfBirth.validation, "Valid");

  const email = result.extraction.fields.find((field) => field.key === "email");
  assert.ok(email);
  assert.equal(email.validation, "Valid");
});

test("detects the CMS-1500 template with charge and diagnosis extraction", () => {
  const source = `
    Health Insurance Claim Form
    Approved by National Uniform Claim Committee CMS-1500
    Medicare Medicaid Tricare
    Patient's Name (Last Name, First Name, Middle Initial): Doe, John, A
    Patient's Birth Date: 01 15 1975
    Insured's I.D. Number: XQV-448812
    Diagnosis or Nature of Illness or Injury: E11.65
    Total Charge: $1,240.00
  `;

  const result = buildTemplateExtraction(source);

  assert.ok(result);
  assert.equal(result.extraction.template, "CMS-1500");
  assert.equal(result.match.template.documentClass, "Healthcare claim or intake form");

  const totalCharge = result.extraction.fields.find((field) => field.key === "totalCharge");
  assert.ok(totalCharge);
  assert.equal(totalCharge.value, "1,240.00");
  assert.equal(totalCharge.validation, "Valid");

  const diagnosis = result.extraction.fields.find((field) => field.key === "diagnosisCode");
  assert.ok(diagnosis);
  assert.equal(diagnosis.validation, "Valid");
});

test("detects a generic invoice and validates amount and terms", () => {
  const source = `
    INVOICE
    Invoice Number: INV-2026-0142
    Invoice Date: March 3, 2026
    Due Date: April 2, 2026
    Payment Terms: Net 30
    Bill To: Canyon Rift Operations LLC
    Subtotal: $8,400.00
    Amount Due: $8,652.00
  `;

  const result = buildTemplateExtraction(source);

  assert.ok(result);
  assert.equal(result.extraction.template, "Invoice");

  const invoiceNumber = result.extraction.fields.find((field) => field.key === "invoiceNumber");
  assert.ok(invoiceNumber);
  assert.equal(invoiceNumber.value.toUpperCase(), "INV-2026-0142");

  const amountDue = result.extraction.fields.find((field) => field.key === "amountDue");
  assert.ok(amountDue);
  assert.equal(amountDue.value, "8,652.00");
  assert.equal(amountDue.validation, "Valid");

  const terms = result.extraction.fields.find((field) => field.key === "paymentTerms");
  assert.ok(terms);
  assert.equal(terms.validation, "Valid");
});

test("marks extracted values that fail format validation as suspect", () => {
  const source = `
    Form I-9
    Employment Eligibility Verification
    Date of Birth (mm/dd/yyyy): 44/99/1988
  `;

  const result = buildTemplateExtraction(source);

  assert.ok(result);
  const dateOfBirth = result.extraction.fields.find((field) => field.key === "dateOfBirth");
  assert.ok(dateOfBirth);
  assert.equal(dateOfBirth.status, "Extracted");
  assert.equal(dateOfBirth.validation, "Suspect");
  assert.ok(dateOfBirth.confidence < 50);
});

test("returns null when no template reaches its detection threshold", () => {
  assert.equal(buildTemplateExtraction("Quarterly all-hands meeting notes and action items."), null);
  assert.equal(detectTemplate("An unrelated shipping manifest without form markers."), null);
});

test("field format validators accept and reject expected shapes", () => {
  assert.equal(isValidTin("536-22-1234"), true);
  assert.equal(isValidTin("12-3456789"), true);
  assert.equal(isValidTin("12345"), false);

  assert.equal(isValidCurrencyAmount("$1,240.00"), true);
  assert.equal(isValidCurrencyAmount("1240"), true);
  assert.equal(isValidCurrencyAmount("12,40.0"), false);

  assert.equal(isPlausibleDate("04/12/1988"), true);
  assert.equal(isPlausibleDate("March 3, 2026"), true);
  assert.equal(isPlausibleDate("44/99/1988"), false);
});
