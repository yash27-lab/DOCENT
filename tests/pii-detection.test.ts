import test from "node:test";
import assert from "node:assert/strict";
import { isValidAbaRoutingNumber, passesLuhnCheck, scanForPii } from "../electron/pii-detection";

function findingFor(text: string, category: string) {
  return scanForPii(text).findings.find((finding) => finding.category === category);
}

test("detects delimited Social Security numbers and masks all but the serial", () => {
  const result = scanForPii("Employee SSN: 536-22-1234 on file.");
  const finding = result.findings.find((entry) => entry.category === "Social Security number");

  assert.ok(finding);
  assert.equal(finding.count, 1);
  assert.deepEqual(finding.examples, ["***-**-1234"]);
  assert.equal(result.riskLevel, "High");
});

test("rejects SSNs with invalid area, group, or serial segments", () => {
  assert.equal(findingFor("SSN 000-12-3456", "Social Security number"), undefined);
  assert.equal(findingFor("SSN 666-12-3456", "Social Security number"), undefined);
  assert.equal(findingFor("SSN 900-12-3456", "Social Security number"), undefined);
  assert.equal(findingFor("SSN 536-00-3456", "Social Security number"), undefined);
  assert.equal(findingFor("SSN 536-12-0000", "Social Security number"), undefined);
});

test("validates credit card candidates with the Luhn checksum", () => {
  assert.equal(passesLuhnCheck("4111111111111111"), true);
  assert.equal(passesLuhnCheck("4111111111111112"), false);

  const detected = findingFor("Card on file: 4111 1111 1111 1111", "Credit card number");
  assert.ok(detected);
  assert.deepEqual(detected.examples, ["**** 1111"]);

  assert.equal(findingFor("Reference: 4111 1111 1111 1112", "Credit card number"), undefined);
});

test("validates bank routing numbers with the ABA checksum and prefix ranges", () => {
  assert.equal(isValidAbaRoutingNumber("021000021"), true);
  assert.equal(isValidAbaRoutingNumber("021000022"), false);
  assert.equal(isValidAbaRoutingNumber("990000021"), false);

  const detected = findingFor("Routing number 021000021 for ACH.", "Bank routing number");
  assert.ok(detected);
  assert.equal(detected.examples[0], "*****0021");
});

test("detects and masks email addresses and phone numbers as low risk", () => {
  const result = scanForPii("Contact jane.doe@example.com or call (415) 555-0123.");

  const email = result.findings.find((entry) => entry.category === "Email address");
  const phone = result.findings.find((entry) => entry.category === "Phone number");

  assert.ok(email);
  assert.equal(email.examples[0], "j***@example.com");
  assert.ok(phone);
  assert.equal(phone.examples[0], "(***) ***-0123");
  assert.equal(result.riskLevel, "Low");
});

test("detects labeled dates of birth and treats them as high risk", () => {
  const result = scanForPii("Date of Birth: 04/12/1988");
  const finding = result.findings.find((entry) => entry.category === "Date of birth");

  assert.ok(finding);
  assert.equal(finding.examples[0], "**/**/****");
  assert.equal(result.riskLevel, "High");
});

test("detects employer identification numbers with plausible prefixes", () => {
  assert.ok(findingFor("EIN: 12-3456789", "Employer identification number"));
  assert.equal(findingFor("EIN: 07-3456789", "Employer identification number"), undefined);
});

test("does not attribute one digit run to multiple categories", () => {
  const result = scanForPii("Account: 4111 1111 1111 1111");
  assert.equal(result.totalMatches, 1);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].category, "Credit card number");
});

test("returns an empty scan for text without identifiers", () => {
  const result = scanForPii("This memo covers the quarterly planning meeting agenda.");

  assert.equal(result.riskLevel, "None");
  assert.equal(result.totalMatches, 0);
  assert.deepEqual(result.findings, []);
});

test("counts repeated identifiers and caps stored examples", () => {
  const result = scanForPii(
    "Primary 536-22-1234, spouse 536-22-2345, dependent 536-22-3456, alternate 536-22-4567."
  );
  const finding = result.findings.find((entry) => entry.category === "Social Security number");

  assert.ok(finding);
  assert.equal(finding.count, 4);
  assert.equal(finding.examples.length, 3);
});
