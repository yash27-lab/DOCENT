import test from "node:test";
import assert from "node:assert/strict";
import { buildDocumentIntelligence } from "../electron/document-intelligence";

const emptyMetadata = {
  title: "",
  author: "",
  creator: "",
  producer: "",
  subject: ""
};

test("detects W-9 tax forms and exposes structured extraction fields", () => {
  const previewText = `
    Form W-9
    Request for Taxpayer Identification Number and Certification
    Name (as shown on your income tax return)
    Business name/disregarded entity name, if different from above
    Federal tax classification
    Address (number, street, and apt. or suite no.)
    City, state, and ZIP code
    Taxpayer Identification Number
  `;

  const result = buildDocumentIntelligence("PDF", previewText, emptyMetadata);

  assert.equal(result.analysis.documentClass, "Tax form");
  assert.equal(result.analysis.sensitivity, "Restricted");
  assert.equal(result.extraction.template, "IRS W-9");
  assert.ok(result.extraction.fields.some((field) => field.key === "name" && field.status === "Detected label"));
  assert.ok(result.extraction.fields.some((field) => field.key === "tinNumber"));
});

test("falls back safely for non-pdf documents", () => {
  const result = buildDocumentIntelligence("DOCX", "Employee onboarding packet", emptyMetadata);

  assert.equal(result.analysis.documentClass, "Unparsed file");
  assert.equal(result.analysis.sensitivity, "Unknown");
  assert.equal(result.extraction.template, null);
});

test("classifies OCR-backed image documents when usable text is present", () => {
  const previewText = `
    Form W-9
    Request for Taxpayer Identification Number and Certification
    Name (as shown on your income tax return)
    Taxpayer Identification Number
  `;

  const result = buildDocumentIntelligence("PNG", previewText, emptyMetadata);

  assert.equal(result.analysis.documentClass, "Tax form");
  assert.equal(result.analysis.sensitivity, "Restricted");
  assert.equal(result.extraction.template, "IRS W-9");
});

test("returns a conservative fallback when parsed pdf text is empty", () => {
  const result = buildDocumentIntelligence("PDF", "", emptyMetadata);

  assert.equal(result.analysis.documentClass, "Unclassified PDF");
  assert.equal(result.extraction.template, null);
  assert.match(result.extraction.summary, /no structured template/i);
});

test("returns a scanned-document fallback when OCR does not recover image text", () => {
  const result = buildDocumentIntelligence("PNG", "", emptyMetadata);

  assert.equal(result.analysis.documentClass, "Unclassified scanned document");
  assert.equal(result.extraction.template, null);
  assert.equal(result.pii.riskLevel, "None");
});

test("classifies invoices through the template registry", () => {
  const previewText = `
    Invoice Number: INV-889
    Invoice Date: March 3, 2026
    Payment Terms: Net 30
    Bill To: Example Manufacturing
    Amount Due: $2,150.00
  `;

  const result = buildDocumentIntelligence("PDF", previewText, emptyMetadata);

  assert.equal(result.analysis.documentClass, "Invoice or billing document");
  assert.equal(result.extraction.template, "Invoice");
  assert.ok(result.analysis.confidence >= 60);
});

test("surfaces local PII findings and escalates sensitivity", () => {
  const previewText = `
    Reimbursement request
    Employee SSN: 536-22-1234
    Contact: jane.doe@example.com
  `;

  const result = buildDocumentIntelligence("PDF", previewText, emptyMetadata);

  assert.equal(result.pii.riskLevel, "High");
  assert.ok(result.pii.findings.some((finding) => finding.category === "Social Security number"));
  assert.equal(result.analysis.sensitivity, "Restricted");
  assert.ok(result.analysis.signals.some((signal) => signal.startsWith("Local PII scan flagged")));
});

test("keeps clean business text at standard sensitivity with no findings", () => {
  const previewText = "Quarterly planning summary for the operations review meeting.";
  const result = buildDocumentIntelligence("PDF", previewText, emptyMetadata);

  assert.equal(result.pii.riskLevel, "None");
  assert.equal(result.analysis.sensitivity, "Standard");
});
