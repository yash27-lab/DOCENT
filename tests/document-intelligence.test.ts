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

test("returns a conservative fallback when parsed pdf text is empty", () => {
  const result = buildDocumentIntelligence("PDF", "", emptyMetadata);

  assert.equal(result.analysis.documentClass, "Unclassified PDF");
  assert.equal(result.extraction.template, null);
  assert.match(result.extraction.summary, /no structured template/i);
});
