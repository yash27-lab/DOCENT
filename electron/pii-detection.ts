export type PiiCategory =
  | "Social Security number"
  | "Employer identification number"
  | "Credit card number"
  | "Bank routing number"
  | "Email address"
  | "Phone number"
  | "Date of birth";

export type PiiFinding = {
  category: PiiCategory;
  count: number;
  examples: string[];
};

export type PiiRiskLevel = "None" | "Low" | "High";

export type PiiScan = {
  riskLevel: PiiRiskLevel;
  totalMatches: number;
  findings: PiiFinding[];
};

const maxExamplesPerCategory = 3;
const highRiskCategories = new Set<PiiCategory>([
  "Social Security number",
  "Credit card number",
  "Bank routing number",
  "Date of birth"
]);

// IRS campus prefixes that are never assigned to a real EIN.
const invalidEinPrefixes = new Set([
  "00", "07", "08", "09", "17", "18", "19", "28", "29",
  "49", "69", "70", "78", "79", "89", "96", "97"
]);

type RawMatch = {
  category: PiiCategory;
  start: number;
  end: number;
  masked: string;
};

export function passesLuhnCheck(digits: string) {
  if (!/^\d{12,19}$/.test(digits)) {
    return false;
  }

  let sum = 0;
  let doubleNext = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = digits.charCodeAt(index) - 48;

    if (doubleNext) {
      value *= 2;
      if (value > 9) {
        value -= 9;
      }
    }

    sum += value;
    doubleNext = !doubleNext;
  }

  return sum % 10 === 0;
}

export function isValidAbaRoutingNumber(digits: string) {
  if (!/^\d{9}$/.test(digits)) {
    return false;
  }

  // Federal Reserve routing symbols only start with certain two-digit prefixes.
  const prefix = Number(digits.slice(0, 2));
  const prefixValid =
    prefix <= 12 || (prefix >= 21 && prefix <= 32) || (prefix >= 61 && prefix <= 72) || prefix === 80;

  if (!prefixValid) {
    return false;
  }

  let checksum = 0;
  for (let index = 0; index < 9; index += 3) {
    checksum += 3 * (digits.charCodeAt(index) - 48);
    checksum += 7 * (digits.charCodeAt(index + 1) - 48);
    checksum += digits.charCodeAt(index + 2) - 48;
  }

  return checksum % 10 === 0;
}

function isPlausibleSsn(area: string, group: string, serial: string) {
  if (area === "000" || area === "666" || area >= "900") {
    return false;
  }

  return group !== "00" && serial !== "0000";
}

function maskSsn(serial: string) {
  return `***-**-${serial}`;
}

function maskEin(serialTail: string) {
  return `**-***${serialTail}`;
}

function maskCardNumber(digits: string) {
  return `**** ${digits.slice(-4)}`;
}

function maskEmail(value: string) {
  const [localPart, domain] = value.split("@");
  return `${localPart.slice(0, 1)}***@${domain}`;
}

function maskPhone(digits: string) {
  return `(***) ***-${digits.slice(-4)}`;
}

function collectMatches(text: string, pattern: RegExp, toMatch: (match: RegExpExecArray) => RawMatch | null) {
  const matches: RawMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const candidate = toMatch(match);
    if (candidate) {
      matches.push(candidate);
    }

    if (match.index === pattern.lastIndex) {
      pattern.lastIndex += 1;
    }
  }

  return matches;
}

function findCreditCardNumbers(text: string) {
  return collectMatches(text, /(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g, (match) => {
    const digits = match[0].replace(/[ -]/g, "");

    if (digits.length < 13 || digits.length > 19 || digits.startsWith("0") || !passesLuhnCheck(digits)) {
      return null;
    }

    return {
      category: "Credit card number",
      start: match.index,
      end: match.index + match[0].length,
      masked: maskCardNumber(digits)
    };
  });
}

function findRoutingNumbers(text: string) {
  return collectMatches(text, /(?<![\d.-])\d{9}(?![\d.-])/g, (match) => {
    if (!isValidAbaRoutingNumber(match[0])) {
      return null;
    }

    return {
      category: "Bank routing number",
      start: match.index,
      end: match.index + match[0].length,
      masked: `*****${match[0].slice(-4)}`
    };
  });
}

function findSsns(text: string) {
  return collectMatches(text, /(?<![\d-])(\d{3})[- ](\d{2})[- ](\d{4})(?![\d-])/g, (match) => {
    if (!isPlausibleSsn(match[1], match[2], match[3])) {
      return null;
    }

    return {
      category: "Social Security number",
      start: match.index,
      end: match.index + match[0].length,
      masked: maskSsn(match[3])
    };
  });
}

function findEins(text: string) {
  return collectMatches(text, /(?<![\d-])(\d{2})-(\d{7})(?![\d-])/g, (match) => {
    if (invalidEinPrefixes.has(match[1])) {
      return null;
    }

    return {
      category: "Employer identification number",
      start: match.index,
      end: match.index + match[0].length,
      masked: maskEin(match[2].slice(-4))
    };
  });
}

function findPhoneNumbers(text: string) {
  return collectMatches(text, /(?<![\d-])(?:\+1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?![\d-])/g, (match) => {
    const digits = match[0].replace(/\D/g, "");

    if (digits.length !== 10 && !(digits.length === 11 && digits.startsWith("1"))) {
      return null;
    }

    return {
      category: "Phone number",
      start: match.index,
      end: match.index + match[0].length,
      masked: maskPhone(digits)
    };
  });
}

function findEmailAddresses(text: string) {
  return collectMatches(text, /\b[a-z0-9][a-z0-9._%+-]*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z]{2,})+\b/gi, (match) => ({
    category: "Email address",
    start: match.index,
    end: match.index + match[0].length,
    masked: maskEmail(match[0])
  }));
}

function findBirthDates(text: string) {
  const labeledDate =
    /(date of birth|birth ?date|\bd\.?o\.?b\.?\b)[^\n\d]{0,40}(\d{1,2}[\/\- ]\d{1,2}[\/\- ]\d{2,4})/gi;

  return collectMatches(text, labeledDate, (match) => ({
    category: "Date of birth",
    start: match.index,
    end: match.index + match[0].length,
    masked: "**/**/****"
  }));
}

export function createEmptyPiiScan(): PiiScan {
  return {
    riskLevel: "None",
    totalMatches: 0,
    findings: []
  };
}

export function scanForPii(text: string): PiiScan {
  if (!text.trim()) {
    return createEmptyPiiScan();
  }

  // Detector order doubles as claim priority: once a character range is
  // attributed to one category, weaker detectors cannot re-report it.
  const detectors = [
    findCreditCardNumbers,
    findRoutingNumbers,
    findSsns,
    findEins,
    findPhoneNumbers,
    findEmailAddresses,
    findBirthDates
  ];

  const claimedRanges: Array<{ start: number; end: number }> = [];
  const accepted: RawMatch[] = [];

  for (const detect of detectors) {
    for (const match of detect(text)) {
      const overlaps = claimedRanges.some((range) => match.start < range.end && match.end > range.start);
      if (overlaps) {
        continue;
      }

      claimedRanges.push({ start: match.start, end: match.end });
      accepted.push(match);
    }
  }

  const byCategory = new Map<PiiCategory, PiiFinding>();

  for (const match of accepted) {
    const finding = byCategory.get(match.category) ?? {
      category: match.category,
      count: 0,
      examples: []
    };

    finding.count += 1;
    if (finding.examples.length < maxExamplesPerCategory && !finding.examples.includes(match.masked)) {
      finding.examples.push(match.masked);
    }

    byCategory.set(match.category, finding);
  }

  const findings = [...byCategory.values()].sort((a, b) => b.count - a.count);
  const totalMatches = accepted.length;
  const riskLevel: PiiRiskLevel =
    findings.some((finding) => highRiskCategories.has(finding.category))
      ? "High"
      : findings.length > 0
        ? "Low"
        : "None";

  return {
    riskLevel,
    totalMatches,
    findings
  };
}
