import test from "node:test";
import assert from "node:assert/strict";
import { isPlausibleDate, isValidCurrencyAmount, isValidTin, isValidZipCode } from "../electron/extraction-templates";
import { isValidAbaRoutingNumber, passesLuhnCheck, scanForPii } from "../electron/pii-detection";

test("rejects February overflow", () => {
  assert.equal(isPlausibleDate("02/31/2026"), false);
});
