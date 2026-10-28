import test from "node:test";
import assert from "node:assert/strict";
import { isPlausibleDate } from "../electron/extraction-templates";

test("preserves valid day-first dates", () => {
  assert.equal(isPlausibleDate("30 April 2026"), true);
});

test("rejects impossible day-first dates", () => {
  assert.equal(isPlausibleDate("31 April 2026"), false);
});

test("applies the century leap exception to named dates", () => {
  assert.equal(isPlausibleDate("February 29, 1900"), false); assert.equal(isPlausibleDate("February 29, 2000"), true);
});

test("rejects non-leap named February 29", () => {
  assert.equal(isPlausibleDate("February 29, 2025"), false);
});

test("accepts leap days in named dates", () => {
  assert.equal(isPlausibleDate("February 29, 2024"), true);
});

test("rejects February overflow in named dates", () => {
  assert.equal(isPlausibleDate("February 31, 2026"), false);
});
