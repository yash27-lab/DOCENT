import test from "node:test";
import assert from "node:assert/strict";
import { extractWithTemplate, scoreTemplate, type DocumentTemplate } from "../electron/extraction-templates";

test("missing fields have no value or confidence", () => {
  const field = extractWithTemplate(template(), "unrelated").fields[0];
  assert.equal(field.status, "Missing"); assert.equal(field.value, ""); assert.equal(field.confidence, 0);
});

test("empty schemas produce no invented fields", () => {
  assert.deepEqual(extractWithTemplate(template({ fields: [] }), "text").fields, []);
});

test("repeated source words do not inflate pattern-hit scores", () => {
  assert.deepEqual(scoreTemplate(template(), "invoice invoice amount amount"), { anchorHits: 1, score: 4 });
});

test("scoring preserves the caller regex cursor", () => {
  const pattern = /invoice/g;
  pattern.lastIndex = 99;
  assert.equal(scoreTemplate(template({ anchorPatterns: [pattern] }), "invoice").anchorHits, 1);
  assert.equal(pattern.lastIndex, 99);
});

test("global scoring patterns remain repeatable", () => {
  const t = template({ anchorPatterns: [/invoice/gi] });
  const first = scoreTemplate(t, "invoice");
  assert.deepEqual(scoreTemplate(t, "invoice"), first);
});

test("support patterns retain one-point scoring weight", () => {
  assert.deepEqual(scoreTemplate(template(), "amount"), { anchorHits: 0, score: 1 });
});

test("anchors retain three-point scoring weight", () => {
  assert.deepEqual(scoreTemplate(template(), "Invoice"), { anchorHits: 1, score: 3 });
});

test("empty content produces zero scoring hits", () => {
  assert.deepEqual(scoreTemplate(template(), ""), { anchorHits: 0, score: 0 });
});

function template(overrides: Partial<DocumentTemplate> = {}): DocumentTemplate {
  return {
    id: "fixture", name: "Fixture", documentClass: "Test", minScore: 3,
    anchorPatterns: [/invoice/i], supportPatterns: [/amount/i],
    fields: [{ key: "value", label: "Value", valuePatterns: [/Value: (.+)/], labelPatterns: [/Value:/] }],
    ...overrides
  };
}
