import test from "node:test";
import assert from "node:assert/strict";
import { extractWithTemplate, scoreTemplate, type DocumentTemplate } from "../electron/extraction-templates";

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
