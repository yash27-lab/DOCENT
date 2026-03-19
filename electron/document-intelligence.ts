export type DocumentMetadata = {
  title: string;
  author: string;
  creator: string;
  producer: string;
  subject: string;
};

export type DocumentAnalysis = {
  documentClass: string;
  sensitivity: "Restricted" | "Internal" | "Standard" | "Unknown";
  confidence: number;
  summary: string;
  signals: string[];
};

export type ExtractionFieldStatus = "Extracted" | "Detected label" | "Missing";

export type ExtractionField = {
  key: string;
  label: string;
  value: string;
  confidence: number;
  status: ExtractionFieldStatus;
};

export type StructuredExtraction = {
  template: string | null;
  summary: string;
  fields: ExtractionField[];
};

function countKeywordMatches(source: string, patterns: RegExp[]) {
  return patterns.reduce((total, pattern) => total + (pattern.test(source) ? 1 : 0), 0);
}

function detectSignals(source: string) {
  const signals: string[] = [];

  if (/social security|ssn|taxpayer identification|tin\b/i.test(source)) {
    signals.push("National identifier language detected");
  }

  if (/patient|diagnosis|insurance|provider|treatment/i.test(source)) {
    signals.push("Healthcare-related language detected");
  }

  if (/bank account|routing number|payment terms|amount due|invoice/i.test(source)) {
    signals.push("Financial or billing language detected");
  }

  if (/employee|employer|citizenship|employment eligibility|passport/i.test(source)) {
    signals.push("Employment verification language detected");
  }

  if (/signature|sign here|authorized signature/i.test(source)) {
    signals.push("Signature fields detected");
  }

  if (/address|phone|email|contact/i.test(source)) {
    signals.push("Contact information fields detected");
  }

  return signals;
}

function detectSensitivity(source: string): DocumentAnalysis["sensitivity"] {
  if (/social security|ssn|taxpayer identification|patient|diagnosis|insurance|passport|date of birth|dob/i.test(source)) {
    return "Restricted";
  }

  if (/invoice|payment|employee|vendor|purchase order|contract/i.test(source)) {
    return "Internal";
  }

  return "Standard";
}

function buildFallbackIntelligence(extension: string): { analysis: DocumentAnalysis; extraction: StructuredExtraction } {
  if (extension === "PDF") {
    return {
      analysis: {
        documentClass: "Unclassified PDF",
        sensitivity: "Standard",
        confidence: 24,
        summary: "PDF parsed locally, but there was not enough extracted text to classify it with confidence.",
        signals: []
      },
      extraction: {
        template: null,
        summary: "No structured template was detected from the available text.",
        fields: []
      }
    };
  }

  return {
    analysis: {
      documentClass: "Unparsed file",
      sensitivity: "Unknown",
      confidence: 0,
      summary: "No content analysis is available for this file type yet.",
      signals: []
    },
    extraction: {
      template: null,
      summary: "Structured extraction is available only for locally parsed PDFs.",
      fields: []
    }
  };
}

function extractConservativeValue(source: string, labelPattern: RegExp, guardPattern: RegExp) {
  const match = source.match(labelPattern);
  const value = match?.[1]?.replace(/\s+/g, " ").trim() ?? "";

  if (!value || guardPattern.test(value)) {
    return "";
  }

  return value;
}

function buildW9Extraction(source: string): StructuredExtraction {
  const fields: ExtractionField[] = [
    {
      key: "name",
      label: "Name",
      value: extractConservativeValue(
        source,
        /name \(as shown on your income tax return\)\s*[:\-]?\s*([^\n]{2,80})/i,
        /business name|federal tax classification|address/i
      ),
      confidence: 0,
      status: "Missing"
    },
    {
      key: "businessName",
      label: "Business name / disregarded entity name",
      value: extractConservativeValue(
        source,
        /business name(?:\/disregarded entity name)?(?:, if different from above)?\s*[:\-]?\s*([^\n]{2,80})/i,
        /federal tax classification|exemptions|address/i
      ),
      confidence: 0,
      status: "Missing"
    },
    {
      key: "federalTaxClassification",
      label: "Federal tax classification",
      value: extractConservativeValue(
        source,
        /federal tax classification\s*[:\-]?\s*([^\n]{2,80})/i,
        /llc|other|exemptions|address/i
      ),
      confidence: 0,
      status: "Missing"
    },
    {
      key: "address",
      label: "Address",
      value: extractConservativeValue(
        source,
        /address \(number, street, and apt\. or suite no\.\)\s*[:\-]?\s*([^\n]{2,80})/i,
        /city, state|requester/i
      ),
      confidence: 0,
      status: "Missing"
    },
    {
      key: "cityStateZip",
      label: "City, state, and ZIP code",
      value: extractConservativeValue(
        source,
        /city, state, and zip code\s*[:\-]?\s*([^\n]{2,80})/i,
        /list account|requester/i
      ),
      confidence: 0,
      status: "Missing"
    },
    {
      key: "tinNumber",
      label: "Taxpayer identification number",
      value: extractConservativeValue(
        source,
        /taxpayer identification number.*?([0-9xX\-]{4,})/i,
        /social security|employer identification/i
      ),
      confidence: 0,
      status: "Missing"
    }
  ];

  const labelPresenceChecks: Record<string, RegExp> = {
    name: /name \(as shown on your income tax return\)/i,
    businessName: /business name(?:\/disregarded entity name)?/i,
    federalTaxClassification: /federal tax classification/i,
    address: /address \(number, street, and apt\. or suite no\.\)/i,
    cityStateZip: /city, state, and zip code/i,
    tinNumber: /taxpayer identification number|social security number|employer identification number/i
  };

  for (const field of fields) {
    const labelDetected = labelPresenceChecks[field.key]?.test(source) ?? false;

    if (field.value) {
      field.status = "Extracted";
      field.confidence = field.key === "tinNumber" ? 82 : 68;
      continue;
    }

    if (labelDetected) {
      field.status = "Detected label";
      field.confidence = 36;
    }
  }

  const extractedCount = fields.filter((field) => field.status === "Extracted").length;
  const detectedCount = fields.filter((field) => field.status === "Detected label").length;

  return {
    template: "IRS W-9",
    summary:
      extractedCount > 0
        ? `W-9 template detected. ${extractedCount} field value(s) extracted locally and ${detectedCount} schema marker(s) confirmed.`
        : `W-9 template detected. ${detectedCount} schema marker(s) confirmed locally; value extraction is conservative in this first workflow.`,
    fields
  };
}

function buildStructuredExtraction(source: string, documentClass: string): StructuredExtraction {
  if (/w-9|request for taxpayer identification number/i.test(source) || documentClass === "Tax form") {
    return buildW9Extraction(source);
  }

  return {
    template: null,
    summary: "No structured template was detected from the available text.",
    fields: []
  };
}

export function buildDocumentIntelligence(
  extension: string,
  previewText: string,
  metadata: DocumentMetadata
): { analysis: DocumentAnalysis; extraction: StructuredExtraction } {
  if (extension !== "PDF" || !previewText) {
    return buildFallbackIntelligence(extension);
  }

  const source = `${previewText}\n${metadata.title}\n${metadata.subject}`.toLowerCase();
  const explicitW9Match = /w-9|request for taxpayer identification number/i.test(source);
  const profiles = [
    {
      label: "Tax form",
      patterns: [/irs\b/i, /\bw-9\b/i, /\b1040\b/i, /\b1099\b/i, /taxpayer/i, /withholding/i, /internal revenue/i]
    },
    {
      label: "Employment verification form",
      patterns: [/\bi-9\b/i, /employment eligibility/i, /employer/i, /employee/i, /citizenship/i, /alien/i]
    },
    {
      label: "Healthcare claim or intake form",
      patterns: [/\bcms-1500\b/i, /patient/i, /provider/i, /diagnosis/i, /insurance/i, /subscriber/i, /treatment/i]
    },
    {
      label: "Invoice or billing document",
      patterns: [/invoice/i, /amount due/i, /bill to/i, /subtotal/i, /payment terms/i, /purchase order/i]
    },
    {
      label: "Contract or legal agreement",
      patterns: [/agreement/i, /party/i, /effective date/i, /terms and conditions/i, /governing law/i, /signature/i]
    },
    {
      label: "General form",
      patterns: [/form/i, /signature/i, /name/i, /address/i, /date/i]
    }
  ];

  let bestProfile = { label: "General PDF", score: 0 };

  for (const profile of profiles) {
    const score = countKeywordMatches(source, profile.patterns);
    if (score > bestProfile.score) {
      bestProfile = { label: profile.label, score };
    }
  }

  const signals = detectSignals(source);
  const sensitivity = detectSensitivity(source);
  const documentClass = explicitW9Match ? "Tax form" : bestProfile.label;
  const confidence = explicitW9Match ? 94 : bestProfile.score === 0 ? 42 : Math.min(96, 54 + bestProfile.score * 9);
  const extraction = buildStructuredExtraction(source, documentClass);
  const summary = `Likely ${documentClass.toLowerCase()}. ${sensitivity} handling recommended.${signals.length > 0 ? ` ${signals[0]}.` : ""}`;

  return {
    analysis: {
      documentClass,
      sensitivity,
      confidence,
      summary,
      signals
    },
    extraction
  };
}
