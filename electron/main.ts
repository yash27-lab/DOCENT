import { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } from "electron";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const rendererIndexPath = path.join(__dirname, "../../dist/index.html");

let mainWindow: BrowserWindow | null = null;

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const previewPages = 2;
const previewCharacters = 5000;

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
  };
  documents: Array<
    DocumentInspection & {
      duplicate: boolean;
      duplicateCount: number;
    }
  >;
};

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

function normalizeText(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function countKeywordMatches(source: string, patterns: RegExp[]) {
  return patterns.reduce((total, pattern) => total + (pattern.test(source) ? 1 : 0), 0);
}

function analyzeDocument(
  extension: string,
  previewText: string,
  metadata: DocumentInspection["metadata"]
): DocumentInspection["analysis"] {
  if (extension !== "PDF" || !previewText) {
    return {
      documentClass: extension === "PDF" ? "Unclassified PDF" : "Unparsed file",
      sensitivity: extension === "PDF" ? "Standard" : "Unknown",
      confidence: extension === "PDF" ? 24 : 0,
      summary: extension === "PDF"
        ? "PDF parsed locally, but there was not enough extracted text to classify it with confidence."
        : "No content analysis is available for this file type yet.",
      signals: []
    };
  }

  const source = `${previewText}\n${metadata.title}\n${metadata.subject}`.toLowerCase();
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

  const sensitivity: DocumentInspection["analysis"]["sensitivity"] = /social security|ssn|taxpayer identification|patient|diagnosis|insurance|passport|date of birth|dob/i.test(source)
    ? "Restricted"
    : /invoice|payment|employee|vendor|purchase order|contract/i.test(source)
      ? "Internal"
      : "Standard";

  const confidence = bestProfile.score === 0 ? 42 : Math.min(96, 54 + bestProfile.score * 9);
  const summary = `Likely ${bestProfile.label.toLowerCase()}. ${sensitivity} handling recommended.${signals.length > 0 ? ` ${signals[0]}.` : ""}`;

  return {
    documentClass: bestProfile.label,
    sensitivity,
    confidence,
    summary,
    signals
  };
}

async function inspectDocument(filePath: string): Promise<DocumentInspection> {
  const fileStats = await stat(filePath);
  const extension = path.extname(filePath).replace(".", "").toUpperCase() || "FILE";
  const name = path.basename(filePath);
  const fileBuffer = await readFile(filePath);
  const sha256 = createHash("sha256").update(fileBuffer).digest("hex");

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
    }
  };

  if (extension !== "PDF") {
    return base;
  }

  const parser = new PDFParse({ data: fileBuffer });

  try {
    const info = await parser.getInfo({ parsePageInfo: false });
    const result = await parser.getText({ first: Math.min(info.total, previewPages) });
    const previewText = normalizeText(result.text).slice(0, previewCharacters);

    return {
      ...base,
      parser: "pdf-parse 2.4.5",
      pageCount: info.total,
      previewText,
      previewPages: Math.min(info.total, previewPages),
      extractedCharacters: result.text.length,
      status: "Parsed locally",
      note: `Parsed locally. Preview generated from the first ${Math.min(info.total, previewPages)} page(s).`,
      metadata: {
        title: String(info.info?.Title ?? ""),
        author: String(info.info?.Author ?? ""),
        creator: String(info.info?.Creator ?? ""),
        producer: String(info.info?.Producer ?? ""),
        subject: String(info.info?.Subject ?? "")
      },
      analysis: analyzeDocument(extension, previewText, {
        title: String(info.info?.Title ?? ""),
        author: String(info.info?.Author ?? ""),
        creator: String(info.info?.Creator ?? ""),
        producer: String(info.info?.Producer ?? ""),
        subject: String(info.info?.Subject ?? "")
      })
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF parse error";

    return {
      ...base,
      parser: "pdf-parse 2.4.5",
      status: "Error",
      note: `Local PDF parse failed: ${message}`
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function inspectDocuments(filePaths: string[]) {
  const results: DocumentInspection[] = [];

  for (const filePath of filePaths) {
    results.push(await inspectDocument(filePath));
  }

  return results;
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
        extensions: ["pdf", "doc", "docx", "xls", "xlsx", "csv", "png", "jpg", "jpeg", "tif", "tiff"]
      }
    ]
  });

  if (result.canceled) {
    return [];
  }

  return inspectDocuments(result.filePaths);
});

ipcMain.handle("documents:inspect", async (_event, filePaths: string[]) => inspectDocuments(filePaths));

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
