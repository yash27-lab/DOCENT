import test from "node:test";
import assert from "node:assert/strict";
import { isPlausibleDate, isValidCurrencyAmount, isValidTin, isValidZipCode } from "../electron/extraction-templates";
import { isValidAbaRoutingNumber, passesLuhnCheck, scanForPii } from "../electron/pii-detection";

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
