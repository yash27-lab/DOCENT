import test from "node:test";
import assert from "node:assert/strict";
import { isPlausibleDate, isValidCurrencyAmount, isValidTin, isValidZipCode } from "../electron/extraction-templates";
import { isValidAbaRoutingNumber, passesLuhnCheck, scanForPii } from "../electron/pii-detection";

test("rejects alphabetic and truncated TIN shapes", () => {
  for (const tin of ["12345678", "1234567890", "ABC-DE-FGHI"]) {
    assert.equal(isValidTin(tin), false);
  }
});

test("recognizes supported TIN shapes without claiming issuance validity", () => {
  for (const tin of ["123-45-6789", "12-3456789", "123456789"]) {
    assert.equal(isValidTin(tin), true);
  }
});

test("rejects malformed currency precision and grouping", () => {
  for (const amount of ["1.234", "12,34.56", "1.2", "NaN"]) {
    assert.equal(isValidCurrencyAmount(amount), false);
  }
});

test("accepts grouped and plain currency amounts", () => {
  for (const amount of ["$1,234.56", "1234.56", "0.00"]) {
    assert.equal(isValidCurrencyAmount(amount), true);
  }
});

test("rejects malformed postal formats", () => {
  for (const zip of ["1234", "123456", "12345-678", "ABCDE"]) {
    assert.equal(isValidZipCode(zip), false);
  }
});

test("accepts five-digit and ZIP-plus-four postal formats", () => {
  assert.equal(isValidZipCode("01234"), true);
  assert.equal(isValidZipCode("01234-5678"), true);
});

test("rejects numeric dates containing trailing junk", () => {
  assert.equal(isPlausibleDate("04/30/2026 extra"), false);
});

test("preserves supported numeric date separators", () => {
  for (const date of ["04-30-2026", "04 30 2026", " 04/30/2026 "]) {
    assert.equal(isPlausibleDate(date), true);
  }
});

test("preserves two-digit-year leap handling", () => {
  assert.equal(isPlausibleDate("02/29/24"), true);
  assert.equal(isPlausibleDate("02/29/25"), false);
});

test("rejects zero months and days", () => {
  assert.equal(isPlausibleDate("00/10/2026"), false);
  assert.equal(isPlausibleDate("01/00/2026"), false);
});

test("preserves valid month-end dates", () => {
  for (const month of ["01", "03", "05", "07", "08", "10", "12"]) {
    assert.equal(isPlausibleDate(`${month}/31/2026`), true);
  }
});

test("rejects day 31 in every thirty-day month", () => {
  for (const month of ["04", "06", "09", "11"]) {
    assert.equal(isPlausibleDate(`${month}/31/2026`), false);
  }
});

test("applies the Gregorian century exception", () => {
  assert.equal(isPlausibleDate("02/29/1900"), false);
  assert.equal(isPlausibleDate("02/29/2000"), true);
});

test("rejects non-leap February 29", () => {
  assert.equal(isPlausibleDate("02/29/2025"), false);
});

test("accepts leap-year February 29", () => {
  assert.equal(isPlausibleDate("02/29/2024"), true);
});

test("rejects February overflow", () => {
  assert.equal(isPlausibleDate("02/31/2026"), false);
});
