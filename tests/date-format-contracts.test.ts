import test from "node:test";
import assert from "node:assert/strict";
import { isPlausibleDate } from "../electron/extraction-templates";

test("numeric and named month-end validation agree for every month", () => {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  months.forEach((month, index) => {
    for (const day of [days[index], days[index] + 1]) {
      const expected = day === days[index];
      assert.equal(isPlausibleDate(`${index + 1}/${day}/2026`), expected);
      assert.equal(isPlausibleDate(`${month} ${day}, 2026`), expected);
    }
  });
});

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
