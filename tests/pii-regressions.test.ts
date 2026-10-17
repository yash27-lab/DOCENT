import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyPiiScan, scanForPii } from "../electron/pii-detection";

test("SSN detection rejects a preceding extra digit", () => {
  assert.equal(finding("1536-22-1234", "Social Security number"), undefined);
});

test("space-delimited SSN candidates are masked", () => {
  assert.deepEqual(finding("SSN 536 22 1234", "Social Security number")?.examples, ["***-**-1234"]);
});

test("non-identifier Unicode text stays unflagged", () => {
  assert.equal(scanForPii("研究 résumé 🧬").totalMatches, 0);
});

test("whitespace-only scans remain empty", () => {
  assert.deepEqual(scanForPii(" \n\t\r "), createEmptyPiiScan());
});

test("empty PII scans allocate independent findings arrays", () => {
  const a = createEmptyPiiScan();
  const b = createEmptyPiiScan();
  assert.notStrictEqual(a.findings, b.findings);
  a.findings.push({ category: "Email address", count: 1, examples: [] });
  assert.equal(b.findings.length, 0);
});

function finding(text: string, category: string) {
  return scanForPii(text).findings.find((entry) => entry.category === category);
}
