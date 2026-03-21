/// <reference types="vite/client" />

interface DocentMetadata {
  name: string;
  version: string;
  chrome: string;
  electron: string;
  platform: string;
}

type InspectionStatus = "Parsed locally" | "Metadata only" | "Error";
type ReviewStatus = "Pending" | "Approved" | "Needs review" | "Rejected";

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
  ocr: {
    status: "Not run" | "Completed" | "Skipped" | "Failed";
    source: string | null;
    engine: string | null;
    confidence: number | null;
    durationMs: number | null;
    pagesProcessed: number;
    pageLimit: number | null;
    preprocessing: "Scan cleanup" | "None";
    extractedCharacters: number;
    textPreview: string;
    note: string;
  };
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
  extraction: {
    template: string | null;
    summary: string;
    fields: Array<{
      key: string;
      label: string;
      value: string;
      confidence: number;
      status: "Extracted" | "Detected label" | "Missing";
    }>;
  };
}

interface ReviewRecord {
  status: ReviewStatus;
  notes: string;
  reviewedAt: string | null;
}

interface WorkspaceDocument extends PickedDocument {
  id: string;
  review: ReviewRecord;
}

interface WorkspaceState {
  version: 1;
  filterValue: string;
  documents: WorkspaceDocument[];
  savedAt: string;
}

interface InspectionReport {
  generatedAt: string;
  summary: {
    documentsSelected: number;
    parsedLocally: number;
    ocrCompleted: number;
    classified: number;
    metadataOnly: number;
    issues: number;
    restricted: number;
    duplicates: number;
    totalPages: number;
    activeFilter: string | null;
    pendingReview?: number;
    approved?: number;
    needsReview?: number;
    rejected?: number;
  };
  documents: Array<
    WorkspaceDocument & {
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
    loadWorkspace: () => Promise<WorkspaceState | null>;
    saveWorkspace: (state: WorkspaceState) => Promise<boolean>;
  };
}
