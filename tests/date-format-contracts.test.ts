import test from "node:test";
import assert from "node:assert/strict";
import { isPlausibleDate } from "../electron/extraction-templates";

test("rejects unsupported three-digit numeric years", () => {
  for (const value of ["01/15/026", "01-15-126", "01 15 999"]) {
    assert.equal(isPlausibleDate(value), false);
  }
});

test("preserves two-digit years across consistent separators", () => {
  for (const separator of ["/", "-", " "]) {
    assert.equal(isPlausibleDate(`02${separator}29${separator}24`), true);
    assert.equal(isPlausibleDate(`02${separator}29${separator}25`), false);
  }
});

test("rejects all mixed numeric date separator combinations", () => {
  for (const a of ["/", "-", " "]) {
    for (const b of ["/", "-", " "]) {
      assert.equal(isPlausibleDate(`04${a}30${b}2026`), a === b);
    }
  }
});
