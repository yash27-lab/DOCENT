/// <reference types="vite/client" />

interface DocentMetadata {
  name: string;
  version: string;
  chrome: string;
  electron: string;
  platform: string;
}

type InspectionStatus = "Parsed locally" | "Metadata only" | "Error";

interface PickedDocument {
  name: string;
  path: string;
  extension: string;
  fileSizeBytes: number;
  modifiedAt: string;
  sha256: string;
  parser: string;
  pageCount: number | null;
  previewText: string;
  previewPages: number;
  extractedCharacters: number;
  status: InspectionStatus;
  note: string;
  metadata: {
    title: string;
    author: string;
    creator: string;
    producer: string;
    subject: string;
  };
  analysis: {
    documentClass: string;
    sensitivity: "Restricted" | "Internal" | "Standard" | "Unknown";
    confidence: number;
    summary: string;
    signals: string[];
  };
}

interface InspectionReport {
  generatedAt: string;
  summary: {
    documentsSelected: number;
    parsedLocally: number;
    classified: number;
    metadataOnly: number;
    issues: number;
    restricted: number;
    duplicates: number;
    totalPages: number;
    activeFilter: string | null;
  };
  documents: Array<
    PickedDocument & {
      duplicate: boolean;
      duplicateCount: number;
    }
  >;
}

interface ExportReportResult {
  saved: boolean;
  path?: string;
}

interface Window {
  docent: {
    getMetadata: () => Promise<DocentMetadata>;
    openExternal: (url: string) => Promise<boolean>;
    pickDocuments: () => Promise<PickedDocument[]>;
    inspectDocuments: (paths: string[]) => Promise<PickedDocument[]>;
    revealDocument: (path: string) => Promise<boolean>;
    exportReport: (report: InspectionReport) => Promise<ExportReportResult>;
  };
}
