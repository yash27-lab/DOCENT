import test from "node:test";
import assert from "node:assert/strict";
import { isPlausibleDate } from "../electron/extraction-templates";

test("accepts leap days in named dates", () => {
  assert.equal(isPlausibleDate("February 29, 2024"), true);
});

test("rejects February overflow in named dates", () => {
  assert.equal(isPlausibleDate("February 31, 2026"), false);
});
