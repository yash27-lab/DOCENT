import { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } from "electron";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import { buildDocumentIntelligence, type DocumentAnalysis, type DocumentMetadata, type StructuredExtraction } from "./document-intelligence";

const rendererIndexPath = path.join(__dirname, "../../dist/index.html");

let mainWindow: BrowserWindow | null = null;

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const previewPages = 2;
const previewCharacters = 5000;
const maxInspectionFiles = 24;
const maxWorkspaceDocuments = 200;
const maxPdfParseBytes = 15 * 1024 * 1024;
const supportedDocumentExtensions = new Set(["PDF", "DOC", "DOCX", "XLS", "XLSX", "CSV", "PNG", "JPG", "JPEG", "TIF", "TIFF"]);

type ReviewStatus = "Pending" | "Approved" | "Needs review" | "Rejected";

type ReviewState = {
  status: ReviewStatus;
  notes: string;
  reviewedAt: string | null;
};

type DocumentInspection = {
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
  status: "Parsed locally" | "Metadata only" | "Error";
  note: string;
  metadata: DocumentMetadata;
  analysis: DocumentAnalysis;
  extraction: StructuredExtraction;
};

type WorkspaceDocument = DocumentInspection & {
  id: string;
  review: ReviewState;
};

type WorkspaceState = {
  version: 1;
  filterValue: string;
  documents: WorkspaceDocument[];
  savedAt: string;
};

type InspectionReport = {
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
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = "", maxLength = 2000) {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.slice(0, maxLength);
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown, fallback: number | null = null) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown, maxItems = 16, maxLength = 180) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .slice(0, maxItems)
    .map((entry) => entry.slice(0, maxLength));
}

function createDefaultReviewState(): ReviewState {
  return {
    status: "Pending",
    notes: "",
    reviewedAt: null
  };
}

function sanitizeReviewStatus(value: unknown): ReviewStatus {
  if (value === "Approved" || value === "Needs review" || value === "Rejected") {
    return value;
  }

  return "Pending";
}

function sanitizeReviewState(value: unknown): ReviewState {
  if (!isRecord(value)) {
    return createDefaultReviewState();
  }

  return {
    status: sanitizeReviewStatus(value.status),
    notes: asString(value.notes, "", 5000),
    reviewedAt: typeof value.reviewedAt === "string" ? value.reviewedAt : null
  };
}

function sanitizeMetadata(value: unknown): DocumentMetadata {
  if (!isRecord(value)) {
    return {
      title: "",
      author: "",
      creator: "",
      producer: "",
      subject: ""
    };
  }

  return {
    title: asString(value.title),
    author: asString(value.author),
    creator: asString(value.creator),
    producer: asString(value.producer),
    subject: asString(value.subject)
  };
}

function sanitizeAnalysis(value: unknown): DocumentAnalysis {
  if (!isRecord(value)) {
    return {
      documentClass: "Unavailable",
      sensitivity: "Unknown",
      confidence: 0,
      summary: "No local analysis was available for this document.",
      signals: []
    };
  }

  const sensitivity =
    value.sensitivity === "Restricted" || value.sensitivity === "Internal" || value.sensitivity === "Standard"
      ? value.sensitivity
      : "Unknown";

  return {
    documentClass: asString(value.documentClass, "Unavailable", 120),
    sensitivity,
    confidence: Math.max(0, Math.min(100, asNumber(value.confidence, 0))),
    summary: asString(value.summary, "No local analysis was available for this document.", 600),
    signals: asStringArray(value.signals)
  };
}

function sanitizeExtraction(value: unknown): StructuredExtraction {
  if (!isRecord(value)) {
    return {
      template: null,
      summary: "No structured extraction was available for this document.",
      fields: []
    };
  }

  const fields: StructuredExtraction["fields"] = Array.isArray(value.fields)
    ? value.fields
        .filter((entry): entry is Record<string, unknown> => isRecord(entry))
        .slice(0, 24)
        .map((field) => ({
          key: asString(field.key, "field", 80),
          label: asString(field.label, "Field", 120),
          value: asString(field.value, "", 200),
          confidence: Math.max(0, Math.min(100, asNumber(field.confidence, 0))),
          status: (
            field.status === "Extracted" || field.status === "Detected label" || field.status === "Missing"
              ? field.status
              : "Missing"
          ) as "Extracted" | "Detected label" | "Missing"
        }))
    : [];

  return {
    template: typeof value.template === "string" ? value.template.slice(0, 120) : null,
    summary: asString(value.summary, "No structured extraction was available for this document.", 600),
    fields
  };
}

function getWorkspaceStatePath() {
  return path.join(app.getPath("userData"), "docent-workspace.json");
}

function isSafeExternalUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

function isAllowedNavigation(targetUrl: string) {
  if (devServerUrl && targetUrl.startsWith(devServerUrl)) {
    return true;
  }

  return targetUrl.startsWith("file://");
}

function normalizeText(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function getExtension(filePath: string) {
  return path.extname(filePath).replace(".", "").toUpperCase() || "FILE";
}

function buildErrorInspection(filePath: string, note: string): DocumentInspection {
  return {
    name: path.basename(filePath),
    path: filePath,
    extension: getExtension(filePath),
    fileSizeBytes: 0,
    modifiedAt: "",
    sha256: "",
    parser: "Filesystem only",
    pageCount: null,
    previewText: "",
    previewPages: 0,
    extractedCharacters: 0,
    status: "Error",
    note,
    metadata: {
      title: "",
      author: "",
      creator: "",
      producer: "",
      subject: ""
    },
    analysis: {
      documentClass: "Unavailable",
      sensitivity: "Unknown",
      confidence: 0,
      summary: note,
      signals: []
    },
    extraction: {
      template: null,
      summary: note,
      fields: []
    }
  };
}

async function hashFile(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
  });
}

function sanitizeInspectablePaths(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  const uniquePaths = new Set<string>();

  for (const entry of input) {
    if (typeof entry !== "string") {
      continue;
    }

    const trimmed = entry.trim();
    if (!trimmed || !path.isAbsolute(trimmed)) {
      continue;
    }

    if (!supportedDocumentExtensions.has(getExtension(trimmed))) {
      continue;
    }

    uniquePaths.add(trimmed);

    if (uniquePaths.size >= maxInspectionFiles) {
      break;
    }
  }

  return [...uniquePaths];
}

function sanitizeWorkspaceDocument(value: unknown): WorkspaceDocument | null {
  if (!isRecord(value)) {
    return null;
  }

  const filePath = asString(value.path);
  if (!filePath || !path.isAbsolute(filePath) || !supportedDocumentExtensions.has(getExtension(filePath))) {
    return null;
  }

  return {
    id: asString(value.id, filePath, 400),
    name: asString(value.name, path.basename(filePath), 240),
    path: filePath,
    extension: getExtension(filePath),
    fileSizeBytes: Math.max(0, asNumber(value.fileSizeBytes, 0)),
    modifiedAt: asString(value.modifiedAt, "", 80),
    sha256: asString(value.sha256, "", 128),
    parser: asString(value.parser, "Filesystem only", 120),
    pageCount: asNullableNumber(value.pageCount),
    previewText: asString(value.previewText, "", previewCharacters),
    previewPages: Math.max(0, asNumber(value.previewPages, 0)),
    extractedCharacters: Math.max(0, asNumber(value.extractedCharacters, 0)),
    status:
      value.status === "Parsed locally" || value.status === "Metadata only" || value.status === "Error"
        ? value.status
        : "Metadata only",
    note: asString(value.note, "", 1000),
    metadata: sanitizeMetadata(value.metadata),
    analysis: sanitizeAnalysis(value.analysis),
    extraction: sanitizeExtraction(value.extraction),
    review: sanitizeReviewState(value.review)
  };
}

function sanitizeWorkspaceState(input: unknown): WorkspaceState | null {
  if (!isRecord(input)) {
    return null;
  }

  const documents = Array.isArray(input.documents)
    ? input.documents
        .map((document) => sanitizeWorkspaceDocument(document))
        .filter((document): document is WorkspaceDocument => document !== null)
        .slice(0, maxWorkspaceDocuments)
    : [];

  return {
    version: 1,
    filterValue: asString(input.filterValue, "", 240),
    documents,
    savedAt: new Date().toISOString()
  };
}

async function readWorkspaceState() {
  try {
    const raw = await readFile(getWorkspaceStatePath(), "utf8");
    return sanitizeWorkspaceState(JSON.parse(raw));
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return null;
    }

    return null;
  }
}

async function writeWorkspaceState(state: WorkspaceState) {
  const workspaceStatePath = getWorkspaceStatePath();
  await mkdir(path.dirname(workspaceStatePath), { recursive: true });
  await writeFile(workspaceStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function inspectDocument(filePath: string): Promise<DocumentInspection> {
  const fileStats = await stat(filePath);
  const extension = getExtension(filePath);
  const name = path.basename(filePath);
  const sha256 = await hashFile(filePath);

  const base: DocumentInspection = {
    name,
    path: filePath,
    extension,
    fileSizeBytes: fileStats.size,
    modifiedAt: fileStats.mtime.toISOString(),
    sha256,
    parser: "Filesystem only",
    pageCount: null,
    previewText: "",
    previewPages: 0,
    extractedCharacters: 0,
    status: "Metadata only",
    note: "Local parsing is currently implemented for PDF files only.",
    metadata: {
      title: "",
      author: "",
      creator: "",
      producer: "",
      subject: ""
    },
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

  if (extension !== "PDF") {
    return base;
  }

  if (fileStats.size > maxPdfParseBytes) {
    return {
      ...base,
      note: `PDF exceeds the local parse limit of ${formatBytes(maxPdfParseBytes)}. Metadata only was captured.`,
      analysis: {
        documentClass: "PDF over parse limit",
        sensitivity: "Unknown",
        confidence: 0,
        summary: "The file is too large for safe local parsing in the current desktop flow.",
        signals: ["File size exceeded local parse limit"]
      },
      extraction: {
        template: null,
        summary: "Structured extraction is skipped when a file exceeds the local parse limit.",
        fields: []
      }
    };
  }

  const fileBuffer = await readFile(filePath);
  const parser = new PDFParse({ data: fileBuffer });

  try {
    const info = await parser.getInfo({ parsePageInfo: false });
    const result = await parser.getText({ first: Math.min(info.total, previewPages) });
    const previewText = normalizeText(result.text).slice(0, previewCharacters);
    const metadata: DocumentMetadata = {
      title: String(info.info?.Title ?? ""),
      author: String(info.info?.Author ?? ""),
      creator: String(info.info?.Creator ?? ""),
      producer: String(info.info?.Producer ?? ""),
      subject: String(info.info?.Subject ?? "")
    };
    const intelligence = buildDocumentIntelligence(extension, previewText, metadata);

    return {
      ...base,
      parser: "pdf-parse 2.4.5",
      pageCount: info.total,
      previewText,
      previewPages: Math.min(info.total, previewPages),
      extractedCharacters: result.text.length,
      status: "Parsed locally",
      note: `Parsed locally. Preview generated from the first ${Math.min(info.total, previewPages)} page(s).`,
      metadata,
      analysis: intelligence.analysis,
      extraction: intelligence.extraction
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF parse error";

    return {
      ...base,
      parser: "pdf-parse 2.4.5",
      status: "Error",
      note: `Local PDF parse failed: ${message}`,
      analysis: {
        documentClass: "PDF parse failure",
        sensitivity: "Unknown",
        confidence: 0,
        summary: `Local PDF parse failed: ${message}`,
        signals: []
      },
      extraction: {
        template: null,
        summary: "Structured extraction was skipped because the PDF could not be parsed locally.",
        fields: []
      }
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function inspectDocuments(filePaths: string[]) {
  const results: DocumentInspection[] = [];

  for (const filePath of filePaths) {
    try {
      const fileStats = await stat(filePath);
      if (!fileStats.isFile()) {
        results.push(buildErrorInspection(filePath, "Inspection failed: path is not a regular file."));
        continue;
      }

      results.push(await inspectDocument(filePath));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown inspection failure";
      results.push(buildErrorInspection(filePath, `Inspection failed: ${message}`));
    }
  }

  return results;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#f1f4f8",
    title: "DOCENT",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`[load-fail] ${errorCode} ${errorDescription} ${validatedUrl}`);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[renderer-gone] reason=${details.reason} exitCode=${details.exitCode}`);
  });

  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(rendererIndexPath);
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });

  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("app:get-metadata", () => ({
  name: app.getName(),
  version: app.getVersion(),
  chrome: process.versions.chrome,
  electron: process.versions.electron,
  platform: process.platform
}));

ipcMain.handle("app:open-external", async (_event, url: string) => {
  if (!isSafeExternalUrl(url)) {
    return false;
  }

  await shell.openExternal(url);
  return true;
});

ipcMain.handle("documents:pick", async () => {
  const targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;
  if (!targetWindow) {
    return [];
  }

  const result = await dialog.showOpenDialog(targetWindow, {
    title: "Select source documents",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Supported documents",
        extensions: [...supportedDocumentExtensions].map((extension) => extension.toLowerCase())
      }
    ]
  });

  if (result.canceled) {
    return [];
  }

  return inspectDocuments(sanitizeInspectablePaths(result.filePaths));
});

ipcMain.handle("documents:inspect", async (_event, filePaths: unknown) => inspectDocuments(sanitizeInspectablePaths(filePaths)));

ipcMain.handle("documents:reveal", async (_event, filePath: unknown) => {
  if (typeof filePath !== "string") {
    return false;
  }

  const trimmed = filePath.trim();
  if (!trimmed || !path.isAbsolute(trimmed) || !supportedDocumentExtensions.has(getExtension(trimmed))) {
    return false;
  }

  try {
    const fileStats = await stat(trimmed);
    if (!fileStats.isFile()) {
      return false;
    }
  } catch {
    return false;
  }

  shell.showItemInFolder(trimmed);
  return true;
});

ipcMain.handle("documents:export-report", async (_event, report: InspectionReport) => {
  const targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;
  if (!targetWindow) {
    return { saved: false };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const result = await dialog.showSaveDialog(targetWindow, {
    title: "Export inspection report",
    defaultPath: path.join(app.getPath("documents"), `docent-inspection-report-${timestamp}.json`),
    filters: [{ name: "JSON", extensions: ["json"] }]
  });

  if (result.canceled || !result.filePath) {
    return { saved: false };
  }

  await writeFile(result.filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return {
    saved: true,
    path: result.filePath
  };
});

ipcMain.handle("workspace:load", async () => readWorkspaceState());

ipcMain.handle("workspace:save", async (_event, state: unknown) => {
  const sanitized = sanitizeWorkspaceState(state);
  if (!sanitized) {
    return false;
  }

  await writeWorkspaceState(sanitized);
  return true;
});
