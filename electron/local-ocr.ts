import path from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createWorker, OEM, PSM } from "tesseract.js";

const ocrEngineLabel = "tesseract.js 7.0.0";
const englishLanguageDataUrl = "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz";
const ocrPreviewCharacters = 5000;
const minPdfTextSignalCharacters = 120;
const maxImageOcrBytes = 10 * 1024 * 1024;
const maxImagePixels = 14_000_000;
const pdfOcrTargetWidth = 1800;
const maxPdfOcrPages = 3;
const contrastFactor = 1.45;
const lowThreshold = 92;
const highThreshold = 188;
const directImageOcrExtensions = new Set(["PNG", "JPG", "JPEG"]);

type OcrWorker = Awaited<ReturnType<typeof createWorker>>;

export type OcrStatus = "Not run" | "Completed" | "Skipped" | "Failed";

export type OcrResult = {
  status: OcrStatus;
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

export type PdfOcrResult = OcrResult & {
  totalPages: number | null;
};

let workerPromise: Promise<OcrWorker> | null = null;
let workerStorageRoot: string | null = null;

function normalizeText(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function countSignalCharacters(text: string) {
  return (text.match(/[a-z0-9]/gi) ?? []).length;
}

function getTextPreview(text: string) {
  return normalizeText(text).slice(0, ocrPreviewCharacters);
}

function clampColor(value: number) {
  return Math.max(0, Math.min(255, value));
}

function applyScanCleanup(canvas: { width: number; height: number; getContext: (contextType: "2d") => any }) {
  const context = canvas.getContext("2d");
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const grayscale = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const contrasted = clampColor((grayscale - 128) * contrastFactor + 128);
    const normalized = contrasted <= lowThreshold ? 0 : contrasted >= highThreshold ? 255 : contrasted;
    data[index] = normalized;
    data[index + 1] = normalized;
    data[index + 2] = normalized;
  }

  context.putImageData(imageData, 0, 0);
}

function joinRecognizedPages(pages: Array<{ pageNumber: number; text: string }>) {
  return pages
    .map((page) => `Page ${page.pageNumber}\n${page.text}`)
    .join("\n\n")
    .trim();
}

function getAverageConfidence(confidences: number[]) {
  if (confidences.length === 0) {
    return null;
  }

  return Math.round(confidences.reduce((total, value) => total + value, 0) / confidences.length);
}

function buildOcrResult(result: Partial<OcrResult> = {}): OcrResult {
  return {
    status: result.status ?? "Not run",
    source: result.source ?? null,
    engine: result.engine ?? null,
    confidence: result.confidence ?? null,
    durationMs: result.durationMs ?? null,
    pagesProcessed: result.pagesProcessed ?? 0,
    pageLimit: result.pageLimit ?? null,
    preprocessing: result.preprocessing ?? "None",
    extractedCharacters: result.extractedCharacters ?? 0,
    textPreview: result.textPreview ?? "",
    note: result.note ?? "OCR not run."
  };
}

function buildPdfOcrResult(result: Partial<PdfOcrResult> = {}): PdfOcrResult {
  return {
    ...buildOcrResult(result),
    totalPages: result.totalPages ?? null
  };
}

function getCacheRoot(storageRoot: string) {
  return path.join(storageRoot, "tesseract-cache");
}

function getLanguageRoot(storageRoot: string) {
  return path.join(storageRoot, "tessdata");
}

async function fileExists(targetPath: string) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureEnglishLanguageData(storageRoot: string) {
  const languageRoot = getLanguageRoot(storageRoot);
  const languageFilePath = path.join(languageRoot, "eng.traineddata.gz");

  if (await fileExists(languageFilePath)) {
    return languageRoot;
  }

  await mkdir(languageRoot, { recursive: true });
  const response = await fetch(englishLanguageDataUrl);

  if (!response.ok) {
    throw new Error(`Language data download failed with status ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await writeFile(languageFilePath, Buffer.from(arrayBuffer));
  return languageRoot;
}

async function importPdfJs() {
  return Function("specifier", "return import(specifier)")("pdfjs-dist/legacy/build/pdf.mjs") as Promise<{
    getDocument: (source: { data: Uint8Array }) => { promise: Promise<{ numPages: number; getPage: (page: number) => Promise<any>; cleanup: () => void; destroy: () => Promise<void> }> };
  }>;
}

async function getWorker(storageRoot: string) {
  const cacheRoot = getCacheRoot(storageRoot);
  if (workerPromise && workerStorageRoot === cacheRoot) {
    return workerPromise;
  }

  workerStorageRoot = cacheRoot;
  workerPromise = (async () => {
    await mkdir(cacheRoot, { recursive: true });
    const languageRoot = await ensureEnglishLanguageData(storageRoot);

    const worker = await createWorker("eng", OEM.LSTM_ONLY, {
      langPath: languageRoot,
      cachePath: cacheRoot,
      logger: () => undefined,
      errorHandler: (error) => {
        console.error(`[ocr] ${String(error)}`);
      }
    });

    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1"
    });

    return worker;
  })().catch((error) => {
    workerPromise = null;
    workerStorageRoot = null;
    throw error;
  });

  return workerPromise;
}

async function recognizeBuffer(
  buffer: Buffer,
  storageRoot: string,
  source: string,
  successNote: string,
  context: Partial<Pick<OcrResult, "pagesProcessed" | "pageLimit" | "preprocessing">> = {}
) {
  const startedAt = Date.now();

  try {
    const worker = await getWorker(storageRoot);
    const result = await worker.recognize(buffer);
    const text = normalizeText(result.data.text);
    const confidence =
      typeof result.data.confidence === "number" && Number.isFinite(result.data.confidence)
        ? Math.max(0, Math.min(100, Math.round(result.data.confidence)))
        : null;

    return buildOcrResult({
      status: "Completed",
      source,
      engine: ocrEngineLabel,
      confidence,
      durationMs: Date.now() - startedAt,
      pagesProcessed: context.pagesProcessed ?? 0,
      pageLimit: context.pageLimit ?? null,
      preprocessing: context.preprocessing ?? "None",
      extractedCharacters: text.length,
      textPreview: getTextPreview(text),
      note: text ? successNote : `${successNote} No usable text was recovered.`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OCR failure";

    return buildOcrResult({
      status: "Failed",
      source,
      engine: ocrEngineLabel,
      durationMs: Date.now() - startedAt,
      pagesProcessed: context.pagesProcessed ?? 0,
      pageLimit: context.pageLimit ?? null,
      preprocessing: context.preprocessing ?? "None",
      note: `Local OCR failed: ${message}`
    });
  }
}

async function rasterizeImage(filePath: string) {
  const image = await loadImage(filePath);
  const totalPixels = image.width * image.height;
  const scale = totalPixels > maxImagePixels ? Math.sqrt(maxImagePixels / totalPixels) : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  applyScanCleanup(canvas);
  return canvas.toBuffer("image/png");
}

export function createDefaultOcrResult(note = "OCR not run."): OcrResult {
  return buildOcrResult({ note });
}

export function sanitizeOcrResult(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return createDefaultOcrResult();
  }

  const record = value as Record<string, unknown>;
  const status =
    record.status === "Completed" || record.status === "Skipped" || record.status === "Failed" || record.status === "Not run"
      ? record.status
      : "Not run";
  const asNullableNumber = (input: unknown) => (typeof input === "number" && Number.isFinite(input) ? input : null);

  return buildOcrResult({
    status,
    source: typeof record.source === "string" ? record.source.slice(0, 120) : null,
    engine: typeof record.engine === "string" ? record.engine.slice(0, 120) : null,
    confidence: asNullableNumber(record.confidence),
    durationMs: asNullableNumber(record.durationMs),
    pagesProcessed: typeof record.pagesProcessed === "number" && Number.isFinite(record.pagesProcessed) ? Math.max(0, record.pagesProcessed) : 0,
    pageLimit: asNullableNumber(record.pageLimit),
    preprocessing: record.preprocessing === "Scan cleanup" ? "Scan cleanup" : "None",
    extractedCharacters: typeof record.extractedCharacters === "number" && Number.isFinite(record.extractedCharacters) ? Math.max(0, record.extractedCharacters) : 0,
    textPreview: typeof record.textPreview === "string" ? record.textPreview.slice(0, ocrPreviewCharacters) : "",
    note: typeof record.note === "string" ? record.note.slice(0, 1000) : "OCR not run."
  });
}

export function isDirectImageOcrExtension(extension: string) {
  return directImageOcrExtensions.has(extension);
}

export function shouldRunPdfOcr(previewText: string) {
  return countSignalCharacters(previewText) < minPdfTextSignalCharacters;
}

export function getPdfOcrPageBudget(totalPages: number) {
  return Math.max(1, Math.min(Math.max(1, totalPages), maxPdfOcrPages));
}

export async function ocrImageFile(filePath: string, fileSizeBytes: number, storageRoot: string) {
  if (fileSizeBytes > maxImageOcrBytes) {
    return buildOcrResult({
      status: "Skipped",
      source: "Image OCR",
      engine: ocrEngineLabel,
      pageLimit: 1,
      preprocessing: "Scan cleanup",
      note: `Local OCR skipped because the image exceeds the ${Math.round(maxImageOcrBytes / (1024 * 1024))} MB image limit.`
    });
  }

  try {
    const buffer = await rasterizeImage(filePath);
    return recognizeBuffer(buffer, storageRoot, "Image OCR", "Image OCR completed locally after scan cleanup.", {
      pagesProcessed: 1,
      pageLimit: 1,
      preprocessing: "Scan cleanup"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown image decode failure";
    return buildOcrResult({
      status: "Failed",
      source: "Image OCR",
      engine: ocrEngineLabel,
      pageLimit: 1,
      preprocessing: "Scan cleanup",
      note: `Image OCR failed before recognition: ${message}`
    });
  }
}

export async function ocrPdfPages(filePath: string, storageRoot: string): Promise<PdfOcrResult> {
  let document: { numPages: number; getPage: (page: number) => Promise<any>; cleanup: () => void; destroy: () => Promise<void> } | null = null;
  const startedAt = Date.now();

  try {
    const pdfjs = await importPdfJs();
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await readFile(filePath)) });
    document = await loadingTask.promise;
    const pageBudget = getPdfOcrPageBudget(document.numPages);
    const recognizedPages: Array<{ pageNumber: number; text: string }> = [];
    const confidences: number[] = [];
    let completedPages = 0;

    for (let pageNumber = 1; pageNumber <= pageBudget; pageNumber += 1) {
      const page = await document.getPage(pageNumber);

      try {
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.max(1.8, pdfOcrTargetWidth / Math.max(baseViewport.width, 1));
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context as never, viewport }).promise;
        applyScanCleanup(canvas);

        const recognized = await recognizeBuffer(
          canvas.toBuffer("image/png"),
          storageRoot,
          "PDF OCR fallback",
          `OCR fallback completed locally on ${pageBudget} page(s) out of ${document.numPages}.`,
          {
            pagesProcessed: pageNumber,
            pageLimit: pageBudget,
            preprocessing: "Scan cleanup"
          }
        );

        if (recognized.status !== "Completed") {
          if (recognizedPages.length === 0) {
            return buildPdfOcrResult({
              ...recognized,
              totalPages: document.numPages,
              pagesProcessed: completedPages,
              pageLimit: pageBudget,
              preprocessing: "Scan cleanup",
              durationMs: Date.now() - startedAt
            });
          }

          break;
        }

        completedPages += 1;

        if (recognized.textPreview) {
          recognizedPages.push({ pageNumber, text: recognized.textPreview });
        }

        if (recognized.confidence !== null) {
          confidences.push(recognized.confidence);
        }
      } finally {
        page.cleanup();
      }
    }

    const combinedText = joinRecognizedPages(recognizedPages);

    return buildPdfOcrResult({
      status: "Completed",
      source: "PDF OCR fallback",
      engine: ocrEngineLabel,
      confidence: getAverageConfidence(confidences),
      durationMs: Date.now() - startedAt,
      pagesProcessed: completedPages,
      pageLimit: pageBudget,
      preprocessing: "Scan cleanup",
      extractedCharacters: combinedText.length,
      textPreview: getTextPreview(combinedText),
      note: `OCR fallback completed locally on ${completedPages} page(s) out of ${document.numPages}. Scan cleanup was applied before recognition.`,
      totalPages: document.numPages
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PDF OCR failure";
    return buildPdfOcrResult({
      status: "Failed",
      source: "PDF OCR fallback",
      engine: ocrEngineLabel,
      durationMs: Date.now() - startedAt,
      pageLimit: document ? getPdfOcrPageBudget(document.numPages) : maxPdfOcrPages,
      preprocessing: "Scan cleanup",
      note: `PDF OCR fallback failed: ${message}`,
      totalPages: document?.numPages ?? null
    });
  } finally {
    if (document) {
      document.cleanup();
      await document.destroy().catch(() => undefined);
    }
  }
}

export async function shutdownOcrWorker() {
  if (!workerPromise) {
    return;
  }

  const worker = await workerPromise.catch(() => null);
  workerPromise = null;
  workerStorageRoot = null;

  if (!worker) {
    return;
  }

  await worker.terminate().catch(() => undefined);
}
