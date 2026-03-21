import test from "node:test";
import assert from "node:assert/strict";
import { getPdfOcrPageBudget, shouldRunPdfOcr } from "../electron/local-ocr";

test("runs OCR fallback when extracted PDF text is effectively empty", () => {
  assert.equal(shouldRunPdfOcr(" \n \n "), true);
});

test("runs OCR fallback when extracted PDF text is too weak for useful classification", () => {
  assert.equal(shouldRunPdfOcr("a b c 1 2 3"), true);
});

test("skips OCR fallback when extracted PDF text is already strong", () => {
  const text = `
    Request for Taxpayer Identification Number and Certification
    Name (as shown on your income tax return)
    Address (number, street, and apt. or suite no.)
    City, state, and ZIP code
  `;

  assert.equal(shouldRunPdfOcr(text), false);
});

test("caps PDF OCR to a bounded number of pages", () => {
  assert.equal(getPdfOcrPageBudget(1), 1);
  assert.equal(getPdfOcrPageBudget(2), 2);
  assert.equal(getPdfOcrPageBudget(8), 3);
});
