import { useEffect, useState } from "react";
import {
  analystNotes,
  betterProductMoves,
  initialQueue,
  marketGaps,
  marketStrengths,
  pipelineBlueprint,
  securityArchitecture,
  sourceLedger
} from "./content";

type View = "operations" | "workflow" | "security" | "market";
type QueueStatus = "Parsed locally" | "Metadata only" | "Error";

type QueueItem = {
  id: string;
  name: string;
  path: string;
  extension: string;
  pageCount: number | null;
  previewText: string;
  previewPages: number;
  extractedCharacters: number;
  fileSizeBytes: number;
  modifiedAt: string;
  sha256: string;
  parser: string;
  note: string;
  metadata: PickedDocument["metadata"];
  status: QueueStatus;
};

function toQueueItem(document: PickedDocument): QueueItem {
  return {
    id: document.path,
    name: document.name,
    path: document.path,
    extension: document.extension || "FILE",
    pageCount: document.pageCount,
    previewText: document.previewText,
    previewPages: document.previewPages,
    extractedCharacters: document.extractedCharacters,
    fileSizeBytes: document.fileSizeBytes,
    modifiedAt: document.modifiedAt,
    sha256: document.sha256,
    parser: document.parser,
    note: document.note,
    metadata: document.metadata,
    status: document.status
  };
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

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export default function App() {
  const [activeView, setActiveView] = useState<View>("operations");
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue.map((item) => item as QueueItem));
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [meta, setMeta] = useState<string>("Secure desktop shell");
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    void window.docent.getMetadata().then((result) => {
      setMeta(
        `${result.name} ${result.version}  •  Electron ${result.electron}  •  Chrome ${result.chrome}  •  ${result.platform}`
      );
    });
  }, []);

  useEffect(() => {
    if (queue.length === 0) {
      setSelectedDocumentId(null);
      return;
    }

    setSelectedDocumentId((current) => (current && queue.some((item) => item.id === current) ? current : queue[0].id));
  }, [queue]);

  async function handlePickDocuments() {
    setIsRunning(true);
    const picked = await window.docent.pickDocuments();
    setIsRunning(false);

    if (picked.length === 0) {
      return;
    }

    const staged = picked.map(toQueueItem);
    setQueue((current) => [...staged, ...current]);
    setSelectedDocumentId(staged[0].id);
    setActiveView("operations");
  }

  async function handleReinspect() {
    if (queue.length === 0) {
      return;
    }

    setIsRunning(true);
    const inspected = await window.docent.inspectDocuments(queue.map((item) => item.path));
    setQueue(inspected.map(toQueueItem));
    setIsRunning(false);
  }

  function openSource(url: string) {
    void window.docent.openExternal(url);
  }

  const selectedDocument = queue.find((item) => item.id === selectedDocumentId) ?? null;
  const parsedCount = queue.filter((item) => item.status === "Parsed locally").length;
  const issueCount = queue.filter((item) => item.status === "Error").length;
  const totalPages = queue.reduce((total, item) => total + (item.pageCount ?? 0), 0);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">D</div>
          <div>
            <div className="eyebrow">Desktop Control Plane</div>
            <h1>DOCENT</h1>
          </div>
        </div>

        <nav className="nav">
          {[
            ["operations", "Operations"],
            ["workflow", "Workflow"],
            ["security", "Security"],
            ["market", "Market Review"]
          ].map(([key, label]) => (
            <button
              key={key}
              className={activeView === key ? "nav-item nav-item-active" : "nav-item"}
              onClick={() => setActiveView(key as View)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-panel">
          <div className="panel-label">Positioning</div>
          <p>
            Secure document operations for teams that need intake, interpretation, approval, and delivery in one governed desktop workflow.
          </p>
        </div>

        <div className="sidebar-actions">
          <button className="primary-button" onClick={handlePickDocuments} type="button">
            Select Documents
          </button>
          <button className="secondary-button" onClick={handleReinspect} type="button">
            Re-run Local Inspection
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">Operator Workspace</div>
            <h2>Professional execution for document-heavy teams</h2>
          </div>
          <div className="runtime-pill">{meta}</div>
        </header>

        <section className="hero-grid">
          <article className="hero-card hero-card-primary">
            <div className="panel-label">Local Parsing</div>
            <h3>PDF inspection now runs on-device</h3>
            <p>
              Selected PDF files are parsed locally in the Electron main process. The app extracts real page counts,
              metadata, SHA-256 fingerprints, and preview text from the first two pages without sending files anywhere.
            </p>
            <div className="hero-actions">
              <button className="link-button" onClick={handlePickDocuments} type="button">
                Pick real PDFs
              </button>
              <button className="link-button" onClick={() => setActiveView("security")} type="button">
                Inspect security posture
              </button>
            </div>
          </article>

          <article className="metric-card">
            <div className="metric-value">{queue.length}</div>
            <div className="metric-label">Documents selected</div>
          </article>

          <article className="metric-card">
            <div className="metric-value">{parsedCount}</div>
            <div className="metric-label">Parsed locally</div>
          </article>

          <article className="metric-card">
            <div className="metric-value">{totalPages}</div>
            <div className="metric-label">Pages identified</div>
          </article>
        </section>

        {activeView === "operations" && (
          <section className="content-grid">
            <article className="panel panel-large">
              <div className="panel-header">
                <div>
                  <div className="panel-label">Staging Queue</div>
                  <h3>Local document inspection results</h3>
                </div>
                <div className={isRunning ? "status-pill status-pill-live" : "status-pill"}>
                  {isRunning ? "Inspecting locally" : issueCount > 0 ? `${issueCount} issue(s)` : "Ready"}
                </div>
              </div>
              <div className="table">
                <div className="table-head">
                  <span>Document</span>
                  <span>Pages</span>
                  <span>Parser</span>
                  <span>Extracted</span>
                  <span>Status</span>
                </div>
                {queue.length === 0 ? (
                  <div className="empty-state">
                    <strong>No staged documents</strong>
                    <p>Select documents to inspect them locally. PDFs will show real metadata and extracted preview text.</p>
                  </div>
                ) : (
                  queue.map((item) => (
                    <button
                      className={selectedDocumentId === item.id ? "table-row table-row-active" : "table-row"}
                      key={item.id}
                      onClick={() => setSelectedDocumentId(item.id)}
                      type="button"
                    >
                      <span>
                        <strong>{item.name}</strong>
                        <small>
                          {item.extension}  •  {formatBytes(item.fileSizeBytes)}
                        </small>
                      </span>
                      <span>{item.pageCount ?? "n/a"}</span>
                      <span>{item.parser}</span>
                      <span>{item.extractedCharacters ? `${item.extractedCharacters} chars` : "n/a"}</span>
                      <span className={`status-tag status-${item.status.replace(/\s+/g, "-").toLowerCase()}`}>{item.status}</span>
                    </button>
                  ))
                )}
              </div>
            </article>

            <article className="panel">
              <div className="panel-label">Document Detail</div>
              <h3>{selectedDocument ? selectedDocument.name : "No document selected"}</h3>
              {selectedDocument ? (
                <div className="stack">
                  <div className="brief-row">
                    <strong>Status</strong>
                    <p>{selectedDocument.note}</p>
                  </div>

                  <div className="detail-grid">
                    <div className="detail-item">
                      <span>Path</span>
                      <strong>{selectedDocument.path}</strong>
                    </div>
                    <div className="detail-item">
                      <span>Modified</span>
                      <strong>{formatDate(selectedDocument.modifiedAt)}</strong>
                    </div>
                    <div className="detail-item">
                      <span>Fingerprint</span>
                      <strong className="code-line">{selectedDocument.sha256}</strong>
                    </div>
                  </div>

                  <div className="metadata-grid">
                    {[
                      ["Title", selectedDocument.metadata.title],
                      ["Author", selectedDocument.metadata.author],
                      ["Creator", selectedDocument.metadata.creator],
                      ["Producer", selectedDocument.metadata.producer],
                      ["Subject", selectedDocument.metadata.subject]
                    ].map(([label, value]) => (
                      <div className="detail-item" key={label}>
                        <span>{label}</span>
                        <strong>{value || "Not available"}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="preview-card">
                    <span>Extracted preview</span>
                    <pre>{selectedDocument.previewText || "No local text preview available for this file type."}</pre>
                  </div>
                </div>
              ) : (
                <p className="lead">Select documents to inspect them locally. PDFs will show extracted text and metadata here.</p>
              )}
            </article>
          </section>
        )}

        {activeView === "workflow" && (
          <section className="content-grid">
            <article className="panel panel-large">
              <div className="panel-label">Pipeline Blueprint</div>
              <h3>Document system design</h3>
              <div className="pipeline-grid">
                {pipelineBlueprint.map((phase) => (
                  <div className="pipeline-card" key={phase.phase}>
                    <div className="phase-marker">{phase.phase.slice(0, 2).toUpperCase()}</div>
                    <h4>{phase.phase}</h4>
                    <p>{phase.summary}</p>
                    <ul className="list">
                      {phase.outcomes.map((outcome) => (
                        <li key={outcome}>{outcome}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-label">Product Upgrades</div>
              <h3>Where this can go next</h3>
              <ul className="list">
                {betterProductMoves.map((move) => (
                  <li key={move}>{move}</li>
                ))}
              </ul>
            </article>
          </section>
        )}

        {activeView === "security" && (
          <section className="content-grid">
            <article className="panel panel-large">
              <div className="panel-label">Runtime Controls</div>
              <h3>Secure-by-default Electron posture</h3>
              <div className="security-grid">
                {securityArchitecture.map((item) => (
                  <div className="security-card" key={item.title}>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-label">Current Boundary</div>
              <h3>What is real today</h3>
              <ul className="list">
                <li>Files are selected locally through Electron, not through browser upload controls.</li>
                <li>PDF metadata and preview text are parsed locally on the device.</li>
                <li>No backend, cloud upload, or external processing service is used in the current flow.</li>
                <li>Non-PDF files are admitted, but only filesystem metadata is shown until more parsers are added.</li>
              </ul>
            </article>
          </section>
        )}

        {activeView === "market" && (
          <section className="content-grid">
            <article className="panel panel-large">
              <div className="panel-label">Reality Check</div>
              <h3>Is qomplement solving a real problem?</h3>
              <p className="lead">{analystNotes.verdict}</p>
              <div className="split-grid">
                <div>
                  <h4>What looks real</h4>
                  <ul className="list">
                    {marketStrengths.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>What is missing or weak</h4>
                  <ul className="list">
                    {marketGaps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>

            <article className="panel">
              <div className="panel-label">Source Ledger</div>
              <h3>Evidence used in this audit</h3>
              <div className="stack">
                {sourceLedger.map((source) => (
                  <button className="source-card" key={source.url} onClick={() => openSource(source.url)} type="button">
                    <span>{source.label}</span>
                    <small>{source.date}</small>
                    <p>{source.evidence}</p>
                  </button>
                ))}
              </div>
            </article>
          </section>
        )}

        <footer className="footer">
          <div className="panel-label">Audit Date</div>
          <p>{analystNotes.auditDate}</p>
        </footer>
      </main>
    </div>
  );
}
