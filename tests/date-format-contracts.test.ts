import test from "node:test";
import assert from "node:assert/strict";
import { isPlausibleDate } from "../electron/extraction-templates";

test("rejects all mixed numeric date separator combinations", () => {
  for (const a of ["/", "-", " "]) {
    for (const b of ["/", "-", " "]) {
      assert.equal(isPlausibleDate(`04${a}30${b}2026`), a === b);
    }
  }
});
