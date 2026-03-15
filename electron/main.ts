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
};

type InspectionReport = {
  generatedAt: string;
  summary: {
    documentsSelected: number;
    parsedLocally: number;
    metadataOnly: number;
    issues: number;
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
      }
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
