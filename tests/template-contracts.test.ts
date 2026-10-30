import test from "node:test";
import assert from "node:assert/strict";
import { extractWithTemplate, scoreTemplate, type DocumentTemplate } from "../electron/extraction-templates";

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
