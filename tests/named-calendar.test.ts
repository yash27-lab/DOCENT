import test from "node:test";
import assert from "node:assert/strict";
import { isPlausibleDate } from "../electron/extraction-templates";

test("preserves named date whitespace and rejects trailing junk", () => {
  assert.equal(isPlausibleDate("  March 31, 2026  "), true); assert.equal(isPlausibleDate("March 31, 2026 extra"), false);
});

test("validates month-end lengths consistently", () => {
  for (const month of ["April", "June", "September", "November"]) { assert.equal(isPlausibleDate(`${month} 31, 2026`), false); assert.equal(isPlausibleDate(`${month} 30, 2026`), true); }
});

test("preserves case-insensitive month recognition", () => {
  assert.equal(isPlausibleDate("FEBRUARY 28, 2026"), true);
});

test("preserves abbreviated month formats", () => {
  assert.equal(isPlausibleDate("Jan. 31, 2026"), true); assert.equal(isPlausibleDate("31 Jan 2026"), true);
});

test("rejects zero days in named dates", () => {
  assert.equal(isPlausibleDate("January 0, 2026"), false); assert.equal(isPlausibleDate("0 January 2026"), false);
});

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
