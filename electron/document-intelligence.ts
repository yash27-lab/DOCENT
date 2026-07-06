import { buildTemplateExtraction, type StructuredExtraction } from "./extraction-templates";
import { createEmptyPiiScan, scanForPii, type PiiScan } from "./pii-detection";

export type {
  ExtractionField,
  ExtractionFieldStatus,
  ExtractionFieldValidation,
  StructuredExtraction
} from "./extraction-templates";
export type { PiiFinding, PiiRiskLevel, PiiScan } from "./pii-detection";

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

export type DocumentIntelligence = {
  analysis: DocumentAnalysis;
  extraction: StructuredExtraction;
  pii: PiiScan;
};

const ocrCapableExtensions = new Set(["PDF", "PNG", "JPG", "JPEG", "TIF", "TIFF"]);

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

function describePiiSignal(pii: PiiScan) {
  if (pii.findings.length === 0) {
    return null;
  }

  const categories = pii.findings.map((finding) => `${finding.category} (${finding.count})`).join(", ");
  return `Local PII scan flagged: ${categories}`;
}

function detectSensitivity(source: string, pii: PiiScan): DocumentAnalysis["sensitivity"] {
  if (pii.riskLevel === "High") {
    return "Restricted";
  }

  if (/social security|ssn|taxpayer identification|patient|diagnosis|insurance|passport|date of birth|dob/i.test(source)) {
    return "Restricted";
  }

  if (pii.riskLevel === "Low" || /invoice|payment|employee|vendor|purchase order|contract/i.test(source)) {
    return "Internal";
  }

  return "Standard";
}

function buildFallbackIntelligence(extension: string): DocumentIntelligence {
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
      },
      pii: createEmptyPiiScan()
    };
  }

  if (ocrCapableExtensions.has(extension)) {
    return {
      analysis: {
        documentClass: "Unclassified scanned document",
        sensitivity: "Unknown",
        confidence: 18,
        summary: "The file was inspected locally, but OCR did not recover enough text to classify it with confidence.",
        signals: []
      },
      extraction: {
        template: null,
        summary: "No structured template was detected from the available OCR text.",
        fields: []
      },
      pii: createEmptyPiiScan()
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
    },
    pii: createEmptyPiiScan()
  };
}

const classificationProfiles = [
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

export function buildDocumentIntelligence(
  extension: string,
  previewText: string,
  metadata: DocumentMetadata
): DocumentIntelligence {
  if (!previewText || !ocrCapableExtensions.has(extension)) {
    return buildFallbackIntelligence(extension);
  }

  const source = `${previewText}\n${metadata.title}\n${metadata.subject}`;
  const pii = scanForPii(source);
  const templateResult = buildTemplateExtraction(source);

  let documentClass = extension === "PDF" ? "General PDF" : "General document";
  let confidence = 42;

  if (templateResult) {
    documentClass = templateResult.match.template.documentClass;
    confidence = Math.min(96, 60 + templateResult.match.score * 6);
  } else {
    let bestScore = 0;

    for (const profile of classificationProfiles) {
      const score = countKeywordMatches(source, profile.patterns);
      if (score > bestScore) {
        bestScore = score;
        documentClass = profile.label;
      }
    }

    if (bestScore > 0) {
      confidence = Math.min(96, 54 + bestScore * 9);
    }
  }

  const signals = detectSignals(source);
  const piiSignal = describePiiSignal(pii);

  if (piiSignal) {
    if (pii.riskLevel === "High") {
      signals.unshift(piiSignal);
    } else {
      signals.push(piiSignal);
    }
  }

  const sensitivity = detectSensitivity(source, pii);
  const extraction: StructuredExtraction = templateResult
    ? templateResult.extraction
    : {
        template: null,
        summary: "No structured template was detected from the available text.",
        fields: []
      };
  const summary = `Likely ${documentClass.toLowerCase()}. ${sensitivity} handling recommended.${signals.length > 0 ? ` ${signals[0]}.` : ""}`;

  return {
    analysis: {
      documentClass,
      sensitivity,
      confidence,
      summary,
      signals
    },
    extraction,
    pii
  };
}
