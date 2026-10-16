import test from "node:test";
import assert from "node:assert/strict";
import { isPlausibleDate, isValidCurrencyAmount, isValidTin, isValidZipCode } from "../electron/extraction-templates";
import { isValidAbaRoutingNumber, passesLuhnCheck, scanForPii } from "../electron/pii-detection";

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
