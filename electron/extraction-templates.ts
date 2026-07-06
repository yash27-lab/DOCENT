export type ExtractionFieldStatus = "Extracted" | "Detected label" | "Missing";

export type ExtractionFieldValidation = "Valid" | "Suspect" | "Not checked";

export type ExtractionField = {
  key: string;
  label: string;
  value: string;
  confidence: number;
  status: ExtractionFieldStatus;
  validation: ExtractionFieldValidation;
};

export type StructuredExtraction = {
  template: string | null;
  summary: string;
  fields: ExtractionField[];
};

type FieldRule = {
  key: string;
  label: string;
  valuePatterns: RegExp[];
  labelPatterns: RegExp[];
  guardPattern?: RegExp;
  validator?: (value: string) => boolean;
};

export type DocumentTemplate = {
  id: string;
  name: string;
  documentClass: string;
  anchorPatterns: RegExp[];
  supportPatterns: RegExp[];
  minScore: number;
  fields: FieldRule[];
};

export type TemplateMatch = {
  template: DocumentTemplate;
  score: number;
};

const anchorWeight = 3;
const maxFieldValueLength = 200;

export function isValidTin(value: string) {
  const trimmed = value.trim();
  return /^\d{3}-\d{2}-\d{4}$/.test(trimmed) || /^\d{2}-\d{7}$/.test(trimmed) || /^\d{9}$/.test(trimmed);
}

export function isValidCurrencyAmount(value: string) {
  const trimmed = value.trim();
  return /^\$?\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?$/.test(trimmed) || /^\$?\s?\d+(?:\.\d{2})?$/.test(trimmed);
}

export function isPlausibleDate(value: string) {
  const trimmed = value.trim();

  const numeric = trimmed.match(/^(\d{1,2})[\/\- ](\d{1,2})[\/\- ](\d{2}|\d{4})$/);
  if (numeric) {
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    return month >= 1 && month <= 12 && day >= 1 && day <= 31;
  }

  const monthName =
    /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.? \d{1,2},? (?:19|20)\d{2}$/i;
  const dayFirst =
    /^\d{1,2} (?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?),? (?:19|20)\d{2}$/i;

  return monthName.test(trimmed) || dayFirst.test(trimmed);
}

export function isValidZipCode(value: string) {
  return /^\d{5}(?:-\d{4})?$/.test(value.trim());
}

function isValidPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value.trim());
}

function isValidTaxYear(value: string) {
  const year = Number(value.trim());
  return Number.isInteger(year) && year >= 1990 && year <= 2100;
}

function isKnownFilingStatus(value: string) {
  return /^(?:single|married filing jointly|married filing separately|head of household|qualifying (?:surviving spouse|widow(?:er)?))\b/i.test(
    value.trim()
  );
}

function isPlausibleIcd10Code(value: string) {
  return /^[a-tv-z]\d{2}(?:\.\d{1,4})?$/i.test(value.trim());
}

const w9Template: DocumentTemplate = {
  id: "irs-w9",
  name: "IRS W-9",
  documentClass: "Tax form",
  anchorPatterns: [/form w-9/i, /request for taxpayer identification number and certification/i],
  supportPatterns: [/federal tax classification/i, /backup withholding/i, /exempt payee/i, /taxpayer identification number/i],
  minScore: 3,
  fields: [
    {
      key: "name",
      label: "Name",
      valuePatterns: [/name \(as shown on your income tax return\)\s*[:\-]?\s*([^\n]{2,80})/i],
      labelPatterns: [/name \(as shown on your income tax return\)/i],
      guardPattern: /business name|federal tax classification|address/i
    },
    {
      key: "businessName",
      label: "Business name / disregarded entity name",
      valuePatterns: [/business name(?:\/disregarded entity name)?(?:, if different from above)?\s*[:\-]?\s*([^\n]{2,80})/i],
      labelPatterns: [/business name(?:\/disregarded entity name)?/i],
      guardPattern: /federal tax classification|exemptions|address/i
    },
    {
      key: "federalTaxClassification",
      label: "Federal tax classification",
      valuePatterns: [/federal tax classification\s*[:\-]?\s*([^\n]{2,80})/i],
      labelPatterns: [/federal tax classification/i],
      guardPattern: /llc|other|exemptions|address/i
    },
    {
      key: "address",
      label: "Address",
      valuePatterns: [/address \(number, street, and apt\. or suite no\.\)\s*[:\-]?\s*([^\n]{2,80})/i],
      labelPatterns: [/address \(number, street, and apt\. or suite no\.\)/i],
      guardPattern: /city, state|requester/i
    },
    {
      key: "cityStateZip",
      label: "City, state, and ZIP code",
      valuePatterns: [/city, state, and zip code\s*[:\-]?\s*([^\n]{2,80})/i],
      labelPatterns: [/city, state, and zip code/i],
      guardPattern: /list account|requester/i
    },
    {
      key: "tinNumber",
      label: "Taxpayer identification number",
      valuePatterns: [/taxpayer identification number[^\n]*?[:\-]?\s*(\d{3}-\d{2}-\d{4}|\d{2}-\d{7}|\d{9})/i],
      labelPatterns: [/taxpayer identification number|social security number|employer identification number/i],
      validator: isValidTin
    }
  ]
};

const irs1040Template: DocumentTemplate = {
  id: "irs-1040",
  name: "IRS 1040",
  documentClass: "Tax form",
  anchorPatterns: [/form 1040\b/i, /u\.?s\.? individual income tax return/i],
  supportPatterns: [/filing status/i, /standard deduction/i, /adjusted gross income/i, /taxable income/i, /dependents/i, /internal revenue service/i],
  minScore: 4,
  fields: [
    {
      key: "taxYear",
      label: "Tax year",
      valuePatterns: [/(?:tax year|for the year)\s*[:\-]?\s*((?:19|20)\d{2})/i, /form 1040[^\n]{0,40}?\b((?:19|20)\d{2})\b/i],
      labelPatterns: [/tax year|form 1040/i],
      validator: isValidTaxYear
    },
    {
      key: "filingStatus",
      label: "Filing status",
      valuePatterns: [
        /filing status\s*[:.\-]?\s*((?:single|married filing jointly|married filing separately|head of household|qualifying (?:surviving spouse|widow(?:er)?))[^\n]{0,30})/i
      ],
      labelPatterns: [/filing status/i],
      validator: isKnownFilingStatus
    },
    {
      key: "firstName",
      label: "First name and middle initial",
      valuePatterns: [/your first name and middle initial\s*[:\-]?\s*([^\n]{2,60})/i],
      labelPatterns: [/your first name and middle initial/i],
      guardPattern: /last name/i
    },
    {
      key: "lastName",
      label: "Last name",
      valuePatterns: [/last name\s*[:\-]?\s*([^\n]{2,40})/i],
      labelPatterns: [/last name/i],
      guardPattern: /your social security number/i
    },
    {
      key: "ssn",
      label: "Social Security number",
      valuePatterns: [/your social security number\s*[:\-]?\s*(\d{3}-?\d{2}-?\d{4})/i],
      labelPatterns: [/your social security number/i],
      validator: isValidTin
    },
    {
      key: "homeAddress",
      label: "Home address",
      valuePatterns: [/home address \(number and street\)[^\n]*?[:\-]?\s*([^\n]{2,80})/i],
      labelPatterns: [/home address \(number and street\)/i],
      guardPattern: /city, town|apt\. no/i
    }
  ]
};

const uscisI9Template: DocumentTemplate = {
  id: "uscis-i9",
  name: "USCIS I-9",
  documentClass: "Employment verification form",
  anchorPatterns: [/form i-9/i, /employment eligibility verification/i],
  supportPatterns: [
    /department of homeland security/i,
    /u\.?s\.? citizenship and immigration services/i,
    /citizen of the united states/i,
    /alien registration number/i,
    /employee information and attestation/i
  ],
  minScore: 4,
  fields: [
    {
      key: "lastName",
      label: "Last name (family name)",
      valuePatterns: [/last name \(family name\)\s*[:\-]?\s*([^\n]{2,40})/i],
      labelPatterns: [/last name \(family name\)/i],
      guardPattern: /first name/i
    },
    {
      key: "firstName",
      label: "First name (given name)",
      valuePatterns: [/first name \(given name\)\s*[:\-]?\s*([^\n]{2,40})/i],
      labelPatterns: [/first name \(given name\)/i],
      guardPattern: /middle initial/i
    },
    {
      key: "address",
      label: "Address (street number and name)",
      valuePatterns: [/address \(street number and name\)\s*[:\-]?\s*([^\n]{2,80})/i],
      labelPatterns: [/address \(street number and name\)/i],
      guardPattern: /apt\. number|city or town/i
    },
    {
      key: "dateOfBirth",
      label: "Date of birth",
      valuePatterns: [/date of birth \(mm\/dd\/yyyy\)\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i],
      labelPatterns: [/date of birth \(mm\/dd\/yyyy\)/i],
      validator: isPlausibleDate
    },
    {
      key: "ssn",
      label: "U.S. Social Security number",
      valuePatterns: [/(?:u\.s\. )?social security number\s*[:\-]?\s*(\d{3}-?\d{2}-?\d{4})/i],
      labelPatterns: [/social security number/i],
      validator: isValidTin
    },
    {
      key: "email",
      label: "Employee's email address",
      valuePatterns: [/employee'?s e-?mail address\s*[:\-]?\s*([^\s@]+@[^\s@]+\.[a-z]{2,})/i],
      labelPatterns: [/employee'?s e-?mail address/i],
      validator: isValidEmailAddress
    },
    {
      key: "phone",
      label: "Employee's telephone number",
      valuePatterns: [/employee'?s telephone number\s*[:\-]?\s*(\(?\d{3}\)?[ .\-]?\d{3}[ .\-]?\d{4})/i],
      labelPatterns: [/employee'?s telephone number/i],
      validator: isValidPhoneNumber
    }
  ]
};

const cms1500Template: DocumentTemplate = {
  id: "cms-1500",
  name: "CMS-1500",
  documentClass: "Healthcare claim or intake form",
  anchorPatterns: [/cms-1500/i, /health insurance claim form/i],
  supportPatterns: [
    /medicare/i,
    /medicaid/i,
    /insured'?s i\.?d\.? number/i,
    /diagnosis or nature of illness/i,
    /federal tax i\.?d\.? number/i,
    /total charge/i
  ],
  minScore: 4,
  fields: [
    {
      key: "patientName",
      label: "Patient's name",
      valuePatterns: [/patient'?s name \(last name, first name, middle initial\)\s*[:\-]?\s*([^\n]{2,80})/i],
      labelPatterns: [/patient'?s name/i],
      guardPattern: /birth date|insured/i
    },
    {
      key: "patientBirthDate",
      label: "Patient's birth date",
      valuePatterns: [/patient'?s birth date\s*[:\-]?\s*(\d{1,2}[ \/\-]\d{1,2}[ \/\-]\d{2,4})/i],
      labelPatterns: [/patient'?s birth date/i],
      validator: isPlausibleDate
    },
    {
      key: "insuredName",
      label: "Insured's name",
      valuePatterns: [/insured'?s name \(last name, first name, middle initial\)\s*[:\-]?\s*([^\n]{2,80})/i],
      labelPatterns: [/insured'?s name/i],
      guardPattern: /patient|address/i
    },
    {
      key: "insuredId",
      label: "Insured's ID number",
      valuePatterns: [/insured'?s i\.?d\.? number\s*[:\-]?\s*([a-z0-9][a-z0-9\-]{3,19})/i],
      labelPatterns: [/insured'?s i\.?d\.? number/i]
    },
    {
      key: "diagnosisCode",
      label: "Diagnosis code",
      valuePatterns: [/diagnosis[^\n]*?\b([a-tv-z]\d{2}(?:\.\d{1,4})?)\b/i],
      labelPatterns: [/diagnosis or nature of illness/i],
      validator: isPlausibleIcd10Code
    },
    {
      key: "totalCharge",
      label: "Total charge",
      valuePatterns: [/total charge\s*[:$]?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/i],
      labelPatterns: [/total charge/i],
      validator: isValidCurrencyAmount
    }
  ]
};

const invoiceTemplate: DocumentTemplate = {
  id: "generic-invoice",
  name: "Invoice",
  documentClass: "Invoice or billing document",
  anchorPatterns: [/invoice (?:number|no\.?|#)/i, /tax invoice/i],
  supportPatterns: [/\binvoice\b/i, /amount due/i, /bill to/i, /remit to/i, /payment terms/i, /due date/i, /subtotal/i, /purchase order/i],
  minScore: 5,
  fields: [
    {
      key: "invoiceNumber",
      label: "Invoice number",
      valuePatterns: [/invoice (?:number|no\.?|#)\s*[:#]?\s*([a-z0-9][a-z0-9\-\/]{1,24})/i],
      labelPatterns: [/invoice (?:number|no\.?|#)/i]
    },
    {
      key: "invoiceDate",
      label: "Invoice date",
      valuePatterns: [/invoice date\s*[:\-]?\s*([^\n]{4,24})/i],
      labelPatterns: [/invoice date/i],
      validator: isPlausibleDate
    },
    {
      key: "dueDate",
      label: "Due date",
      valuePatterns: [/due date\s*[:\-]?\s*([^\n]{4,24})/i],
      labelPatterns: [/due date/i],
      validator: isPlausibleDate
    },
    {
      key: "paymentTerms",
      label: "Payment terms",
      valuePatterns: [/payment terms\s*[:\-]?\s*([^\n]{2,40})/i],
      labelPatterns: [/payment terms/i],
      validator: (value) => /net\s*\d{1,3}|due (?:on|upon) receipt/i.test(value)
    },
    {
      key: "billTo",
      label: "Bill to",
      valuePatterns: [/bill to\s*[:\-]?\s*([^\n]{2,80})/i],
      labelPatterns: [/bill to/i],
      guardPattern: /ship to|remit to/i
    },
    {
      key: "amountDue",
      label: "Amount due",
      valuePatterns: [/(?:amount due|balance due|total due)\s*[:\-]?\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/i],
      labelPatterns: [/amount due|balance due|total due/i],
      validator: isValidCurrencyAmount
    }
  ]
};

export const documentTemplates: DocumentTemplate[] = [
  w9Template,
  irs1040Template,
  uscisI9Template,
  cms1500Template,
  invoiceTemplate
];

function countMatches(source: string, patterns: RegExp[]) {
  return patterns.reduce((total, pattern) => total + (pattern.test(source) ? 1 : 0), 0);
}

export function scoreTemplate(template: DocumentTemplate, source: string) {
  const anchorHits = countMatches(source, template.anchorPatterns);
  const supportHits = countMatches(source, template.supportPatterns);
  return { anchorHits, score: anchorHits * anchorWeight + supportHits };
}

export function detectTemplate(source: string): TemplateMatch | null {
  let best: TemplateMatch | null = null;

  for (const template of documentTemplates) {
    const { anchorHits, score } = scoreTemplate(template, source);
    const qualifies = anchorHits > 0 || score >= template.minScore;

    if (!qualifies || score < template.minScore) {
      continue;
    }

    if (!best || score > best.score) {
      best = { template, score };
    }
  }

  return best;
}

function extractFieldValue(rule: FieldRule, source: string) {
  for (const pattern of rule.valuePatterns) {
    const match = source.match(pattern);
    const value = match?.[1]?.replace(/\s+/g, " ").trim().slice(0, maxFieldValueLength) ?? "";

    if (!value) {
      continue;
    }

    if (rule.guardPattern?.test(value)) {
      continue;
    }

    return value;
  }

  return "";
}

export function extractWithTemplate(template: DocumentTemplate, source: string): StructuredExtraction {
  const fields: ExtractionField[] = template.fields.map((rule) => {
    const value = extractFieldValue(rule, source);
    const labelDetected = rule.labelPatterns.some((pattern) => pattern.test(source));

    if (value) {
      const validation: ExtractionFieldValidation = rule.validator
        ? rule.validator(value)
          ? "Valid"
          : "Suspect"
        : "Not checked";

      return {
        key: rule.key,
        label: rule.label,
        value,
        confidence: validation === "Valid" ? 84 : validation === "Suspect" ? 40 : 68,
        status: "Extracted",
        validation
      };
    }

    return {
      key: rule.key,
      label: rule.label,
      value: "",
      confidence: labelDetected ? 36 : 0,
      status: labelDetected ? "Detected label" : "Missing",
      validation: "Not checked"
    };
  });

  const extractedCount = fields.filter((field) => field.status === "Extracted").length;
  const validatedCount = fields.filter((field) => field.validation === "Valid").length;
  const detectedCount = fields.filter((field) => field.status === "Detected label").length;

  const summary =
    extractedCount > 0
      ? `${template.name} template detected. ${extractedCount} of ${fields.length} field value(s) extracted locally, ${validatedCount} validated, and ${detectedCount} additional schema marker(s) confirmed.`
      : `${template.name} template detected. ${detectedCount} schema marker(s) confirmed locally; value extraction stays conservative when field values are not clearly present.`;

  return {
    template: template.name,
    summary,
    fields
  };
}

export function buildTemplateExtraction(source: string): { extraction: StructuredExtraction; match: TemplateMatch } | null {
  const match = detectTemplate(source);

  if (!match) {
    return null;
  }

  return {
    extraction: extractWithTemplate(match.template, source),
    match
  };
}
