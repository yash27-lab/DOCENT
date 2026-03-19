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
type QueueItem = WorkspaceDocument;

function createDefaultReviewRecord(): ReviewRecord {
  return {
    status: "Pending",
    notes: "",
    reviewedAt: null
  };
}

function toQueueItem(document: PickedDocument, existingReview?: ReviewRecord): QueueItem {
  return {
    ...document,
    id: document.path,
    review: existingReview ?? createDefaultReviewRecord()
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

function formatDate(value: string | null) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function buildSearchText(item: QueueItem) {
  return [
    item.name,
    item.extension,
    item.path,
    item.parser,
    item.note,
    item.previewText,
    item.metadata.title,
    item.metadata.author,
    item.metadata.creator,
    item.metadata.producer,
    item.metadata.subject,
    item.analysis.documentClass,
    item.analysis.sensitivity,
    item.analysis.summary,
    item.analysis.signals.join(" "),
    item.extraction.template ?? "",
    item.extraction.summary,
    item.extraction.fields.map((field) => `${field.label} ${field.value} ${field.status}`).join(" "),
    item.review.status,
    item.review.notes
  ]
    .join(" ")
    .toLowerCase();
}

function buildWorkspaceState(queue: QueueItem[], filterValue: string): WorkspaceState {
  return {
    version: 1,
    filterValue,
    documents: queue,
    savedAt: new Date().toISOString()
  };
}

function buildInspectionReport(
  queue: QueueItem[],
  duplicateFingerprintCounts: Map<string, number>,
  activeFilter: string
): InspectionReport {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      documentsSelected: queue.length,
      parsedLocally: queue.filter((item) => item.status === "Parsed locally").length,
      classified: queue.filter((item) => item.analysis.confidence >= 60).length,
      metadataOnly: queue.filter((item) => item.status === "Metadata only").length,
      issues: queue.filter((item) => item.status === "Error").length,
      restricted: queue.filter((item) => item.analysis.sensitivity === "Restricted").length,
      duplicates: queue.filter((item) => (duplicateFingerprintCounts.get(item.sha256) ?? 0) > 1).length,
      totalPages: queue.reduce((total, item) => total + (item.pageCount ?? 0), 0),
      activeFilter: activeFilter.trim() || null,
      pendingReview: queue.filter((item) => item.review.status === "Pending").length,
      approved: queue.filter((item) => item.review.status === "Approved").length,
      needsReview: queue.filter((item) => item.review.status === "Needs review").length,
      rejected: queue.filter((item) => item.review.status === "Rejected").length
    },
    documents: queue.map((item) => ({
      ...item,
      duplicate: (duplicateFingerprintCounts.get(item.sha256) ?? 0) > 1,
      duplicateCount: duplicateFingerprintCounts.get(item.sha256) ?? 1
    }))
  };
}

export default function App() {
  const [activeView, setActiveView] = useState<View>("operations");
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue.map((item) => item as QueueItem));
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [meta, setMeta] = useState<string>("Secure desktop shell");
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [filterValue, setFilterValue] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [workspaceReady, setWorkspaceReady] = useState(false);

  const normalizedFilter = filterValue.trim().toLowerCase();
  const duplicateFingerprintCounts = queue.reduce((counts, item) => {
    counts.set(item.sha256, (counts.get(item.sha256) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const filteredQueue = queue.filter((item) => buildSearchText(item).includes(normalizedFilter));

  useEffect(() => {
    let cancelled = false;

    void window.docent.getMetadata().then((result) => {
      if (cancelled) {
        return;
      }

      setMeta(
        `${result.name} ${result.version}  •  Electron ${result.electron}  •  Chrome ${result.chrome}  •  ${result.platform}`
      );
    });

    void window.docent.loadWorkspace().then((workspace) => {
      if (cancelled) {
        return;
      }

      if (workspace?.documents.length) {
        setQueue(workspace.documents);
        setFilterValue(workspace.filterValue);
        setStatusMessage(`Restored ${workspace.documents.length} document(s) from the local workspace.`);
      }

      setWorkspaceReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (filteredQueue.length === 0) {
      setSelectedDocumentId(null);
      return;
    }

    setSelectedDocumentId((current) =>
      current && filteredQueue.some((item) => item.id === current) ? current : filteredQueue[0].id
    );
  }, [queue, normalizedFilter]);

  useEffect(() => {
    if (!workspaceReady) {
      return;
    }

    const timer = window.setTimeout(() => {
      void window.docent.saveWorkspace(buildWorkspaceState(queue, filterValue));
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [queue, filterValue, workspaceReady]);

  async function handlePickDocuments() {
    setIsRunning(true);
    setStatusMessage("");
    const picked = await window.docent.pickDocuments();
    setIsRunning(false);

    if (picked.length === 0) {
      return;
    }

    const reviewByPath = new Map(queue.map((item) => [item.path, item.review]));
    const staged = picked.map((document) => toQueueItem(document, reviewByPath.get(document.path)));
    setQueue((current) => [...staged, ...current]);
    setSelectedDocumentId(staged[0].id);
    setActiveView("operations");
  }

  async function handleReinspect() {
    if (queue.length === 0) {
      return;
    }

    setIsRunning(true);
    setStatusMessage("");
    const reviewByPath = new Map(queue.map((item) => [item.path, item.review]));
    const inspected = await window.docent.inspectDocuments(queue.map((item) => item.path));
    setQueue(inspected.map((document) => toQueueItem(document, reviewByPath.get(document.path))));
    setIsRunning(false);
  }

  async function handleExportReport() {
    if (queue.length === 0) {
      return;
    }

    setIsExporting(true);
    const result = await window.docent.exportReport(buildInspectionReport(queue, duplicateFingerprintCounts, filterValue));
    setIsExporting(false);

    if (!result.saved) {
      setStatusMessage("Export canceled.");
      return;
    }

    setStatusMessage(result.path ? `Inspection report saved to ${result.path}` : "Inspection report saved.");
  }

  async function handleRevealSelected() {
    if (!selectedDocument) {
      return;
    }

    const revealed = await window.docent.revealDocument(selectedDocument.path);
    setStatusMessage(revealed ? "Opened the selected file in Finder." : "Unable to reveal the selected file.");
  }

  function handleRemoveSelected() {
    if (!selectedDocument) {
      return;
    }

    const removedName = selectedDocument.name;
    setQueue((current) => current.filter((item) => item.id !== selectedDocument.id));
    setStatusMessage(`Removed ${removedName} from the staging queue.`);
  }

  function handleClearQueue() {
    if (queue.length === 0) {
      return;
    }

    setQueue([]);
    setFilterValue("");
    setSelectedDocumentId(null);
    setStatusMessage("Cleared the staging queue.");
  }

  function handleReviewStatusChange(nextStatus: ReviewStatus) {
    if (!selectedDocument) {
      return;
    }

    setQueue((current) =>
      current.map((item) =>
        item.id === selectedDocument.id
          ? {
              ...item,
              review: {
                ...item.review,
                status: nextStatus,
                reviewedAt: nextStatus === "Pending" ? null : new Date().toISOString()
              }
            }
          : item
      )
    );
  }

  function handleReviewNotesChange(notes: string) {
    if (!selectedDocument) {
      return;
    }

    setQueue((current) =>
      current.map((item) =>
        item.id === selectedDocument.id
          ? {
              ...item,
              review: {
                ...item.review,
                notes
              }
            }
          : item
      )
    );
  }

  function openSource(url: string) {
    void window.docent.openExternal(url);
  }

  const selectedDocument = filteredQueue.find((item) => item.id === selectedDocumentId) ?? null;
  const parsedCount = queue.filter((item) => item.status === "Parsed locally").length;
  const classifiedCount = queue.filter((item) => item.analysis.confidence >= 60).length;
  const issueCount = queue.filter((item) => item.status === "Error").length;
  const restrictedCount = queue.filter((item) => item.analysis.sensitivity === "Restricted").length;
  const totalPages = queue.reduce((total, item) => total + (item.pageCount ?? 0), 0);
  const duplicateCount = queue.filter((item) => (duplicateFingerprintCounts.get(item.sha256) ?? 0) > 1).length;
  const pendingReviewCount = queue.filter((item) => item.review.status === "Pending").length;
  const approvedCount = queue.filter((item) => item.review.status === "Approved").length;
  const selectedDuplicateCount = selectedDocument ? duplicateFingerprintCounts.get(selectedDocument.sha256) ?? 1 : 0;

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
            <h3>Inspection, review, and workspace restore now run locally</h3>
            <p>
              Selected PDFs are parsed locally in the Electron main process. DOCENT now restores the last workspace,
              tracks review state and notes, and surfaces the first structured template workflow for W-9 documents.
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

          <article className="metric-card">
            <div className="metric-value">{duplicateCount}</div>
            <div className="metric-label">Duplicate fingerprints</div>
          </article>
        </section>

        {activeView === "operations" && (
          <section className="content-grid">
            <article className="panel panel-large">
              <div className="panel-header">
                <div>
                  <div className="panel-label">Staging Queue</div>
                  <h3>Local document inspection, review, and extraction</h3>
                </div>
                <div className={isRunning ? "status-pill status-pill-live" : "status-pill"}>
                  {isRunning ? "Inspecting locally" : issueCount > 0 ? `${issueCount} issue(s)` : "Ready"}
                </div>
              </div>

              <div className="panel-toolbar">
                <label className="search-shell">
                  <span className="search-label">Search queue</span>
                  <input
                    className="search-input"
                    onChange={(event) => setFilterValue(event.target.value)}
                    placeholder="Filter by name, review status, extraction, metadata, or text"
                    type="text"
                    value={filterValue}
                  />
                </label>

                <div className="toolbar-actions">
                  <div className="toolbar-meta">
                    {filteredQueue.length} result{filteredQueue.length === 1 ? "" : "s"}
                  </div>
                  <button className="utility-button" disabled={queue.length === 0 || isExporting} onClick={handleExportReport} type="button">
                    {isExporting ? "Saving report" : "Export JSON report"}
                  </button>
                  <button className="utility-button utility-button-danger" disabled={queue.length === 0} onClick={handleClearQueue} type="button">
                    Clear queue
                  </button>
                </div>
              </div>

              <div className="summary-strip">
                <div className="summary-chip">
                  <span>Classified documents</span>
                  <strong>{classifiedCount}</strong>
                </div>
                <div className="summary-chip">
                  <span>Restricted handling</span>
                  <strong>{restrictedCount}</strong>
                </div>
                <div className="summary-chip">
                  <span>Pending review</span>
                  <strong>{pendingReviewCount}</strong>
                </div>
                <div className="summary-chip">
                  <span>Approved</span>
                  <strong>{approvedCount}</strong>
                </div>
              </div>

              {statusMessage ? <p className="inline-note">{statusMessage}</p> : null}

              <div className="table">
                <div className="table-head">
                  <span>Document</span>
                  <span>Pages</span>
                  <span>Parser</span>
                  <span>Extracted</span>
                  <span>Status</span>
                </div>
                {filteredQueue.length === 0 ? (
                  <div className="empty-state">
                    <strong>{queue.length === 0 ? "No staged documents" : "No matching documents"}</strong>
                    <p>
                      {queue.length === 0
                        ? "Select documents to inspect them locally. PDFs will show review controls and structured extraction where available."
                        : "Adjust the filter to see matching documents or export the full inspection report."}
                    </p>
                  </div>
                ) : (
                  filteredQueue.map((item) => {
                    const duplicateFingerprintCount = duplicateFingerprintCounts.get(item.sha256) ?? 1;

                    return (
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
                          <small className="table-classification">
                            {item.analysis.documentClass}  •  {item.analysis.sensitivity}
                          </small>
                          <small className="table-review">Review: {item.review.status}</small>
                          {duplicateFingerprintCount > 1 ? <small className="table-flag">Duplicate fingerprint in queue</small> : null}
                        </span>
                        <span>{item.pageCount ?? "n/a"}</span>
                        <span>{item.parser}</span>
                        <span>{item.extractedCharacters ? `${item.extractedCharacters} chars` : "n/a"}</span>
                        <span className={`status-tag status-${item.status.replace(/\s+/g, "-").toLowerCase()}`}>{item.status}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </article>

            <article className="panel">
              <div className="panel-label">Document Detail</div>
              <h3>{selectedDocument ? selectedDocument.name : "No document selected"}</h3>
              {selectedDocument ? (
                <div className="stack">
                  <div className="detail-actions">
                    <button className="utility-button" onClick={handleRevealSelected} type="button">
                      Reveal in Finder
                    </button>
                    <button className="utility-button utility-button-danger" onClick={handleRemoveSelected} type="button">
                      Remove from queue
                    </button>
                  </div>

                  <div className="review-card">
                    <span>Review workflow</span>
                    <div className="review-grid">
                      <label className="review-field">
                        <span>Status</span>
                        <select
                          className="review-select"
                          onChange={(event) => handleReviewStatusChange(event.target.value as ReviewStatus)}
                          value={selectedDocument.review.status}
                        >
                          <option value="Pending">Pending</option>
                          <option value="Needs review">Needs review</option>
                          <option value="Approved">Approved</option>
                          <option value="Rejected">Rejected</option>
                        </select>
                      </label>
                      <div className="review-field">
                        <span>Reviewed</span>
                        <strong>{formatDate(selectedDocument.review.reviewedAt)}</strong>
                      </div>
                    </div>
                    <label className="review-notes">
                      <span>Operator notes</span>
                      <textarea
                        onChange={(event) => handleReviewNotesChange(event.target.value)}
                        placeholder="Add review notes, handoff comments, or follow-up actions"
                        value={selectedDocument.review.notes}
                      />
                    </label>
                  </div>

                  <div className="brief-row">
                    <strong>Status</strong>
                    <p>{selectedDocument.note}</p>
                    {selectedDuplicateCount > 1 ? (
                      <p className="supporting-note">
                        This fingerprint appears in {selectedDuplicateCount} staged files. The queue can now flag local duplicates before any downstream handling.
                      </p>
                    ) : null}
                  </div>

                  <div className="analysis-card">
                    <span>Local intelligence summary</span>
                    <strong>{selectedDocument.analysis.summary}</strong>
                    <div className="analysis-grid">
                      <div className="detail-item">
                        <span>Document class</span>
                        <strong>{selectedDocument.analysis.documentClass}</strong>
                      </div>
                      <div className="detail-item">
                        <span>Sensitivity</span>
                        <strong>{selectedDocument.analysis.sensitivity}</strong>
                      </div>
                      <div className="detail-item">
                        <span>Confidence</span>
                        <strong>{selectedDocument.analysis.confidence}%</strong>
                      </div>
                    </div>
                  </div>

                  {selectedDocument.extraction.template || selectedDocument.extraction.fields.length > 0 ? (
                    <div className="analysis-card">
                      <span>Structured extraction</span>
                      <strong>{selectedDocument.extraction.summary}</strong>
                      <div className="extraction-template">
                        <span>Template</span>
                        <strong>{selectedDocument.extraction.template ?? "Detected schema"}</strong>
                      </div>
                      <div className="extraction-list">
                        {selectedDocument.extraction.fields.map((field) => (
                          <div className="extraction-item" key={field.key}>
                            <strong>{field.label}</strong>
                            <p>{field.value || field.status}</p>
                            <small>
                              {field.status}  •  {field.confidence}%
                            </small>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

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
                    <div className="detail-item">
                      <span>Duplicate Count</span>
                      <strong>{selectedDuplicateCount}</strong>
                    </div>
                  </div>

                  {selectedDocument.analysis.signals.length > 0 ? (
                    <div className="detail-item">
                      <span>Detected signals</span>
                      <ul className="signal-list">
                        {selectedDocument.analysis.signals.map((signal) => (
                          <li key={signal}>{signal}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

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
                <p className="lead">
                  {queue.length === 0
                    ? "Select documents to inspect them locally. PDFs will show extracted text, review controls, and structured extraction details here."
                    : "Select a visible document from the filtered queue to inspect its metadata, review state, and extraction detail."}
                </p>
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
                <li>Likely document type, handling sensitivity, and processing signals are inferred locally from parsed text.</li>
                <li>Workspace state, review notes, and review decisions persist locally in the app data folder.</li>
                <li>The first structured extraction workflow now targets W-9 detection and schema mapping.</li>
                <li>Inspection is limited to allowlisted file extensions, capped batch sizes, and guarded PDF parse size limits.</li>
                <li>A native JSON report can be exported locally for review or audit handoff.</li>
                <li>No backend, cloud upload, or external processing service is used in the current flow.</li>
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
