import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyPiiScan, scanForPii } from "../electron/pii-detection";

test("repeated emails count every occurrence", () => {
  const result = finding("jane@example.com; jane@example.com", "Email address");
  assert.equal(result?.count, 2);
  assert.equal(result?.examples.length, 1);
});

test("uppercase email candidates remain detectable", () => {
  assert.ok(finding("JANE@EXAMPLE.COM", "Email address"));
});

test("plus-addressed emails keep masking the local part", () => {
  assert.deepEqual(finding("jane+reports@example.com", "Email address")?.examples, ["j***@example.com"]);
});

test("serialized SSN findings never contain the full input identifier", () => {
  const result = JSON.stringify(scanForPii("Employee 536-22-1234"));
  assert.equal(result.includes("536-22-1234"), false);
  assert.ok(result.includes("***-**-1234"));
});

test("different SSNs with equal masked tails share one safe example", () => {
  const result = finding("536-22-1234; 537-23-1234", "Social Security number");
  assert.equal(result?.count, 2);
  assert.deepEqual(result?.examples, ["***-**-1234"]);
});

test("repeated SSNs count occurrences without duplicating examples", () => {
  const result = finding("536-22-1234; 536-22-1234", "Social Security number");
  assert.equal(result?.count, 2);
  assert.equal(result?.examples.length, 1);
});

test("SSN detection rejects a following extra digit", () => {
  assert.equal(finding("536-22-12345", "Social Security number"), undefined);
});

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
