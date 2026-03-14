export const analystNotes = {
  auditDate: "March 14, 2026",
  verdict:
    "The problem is real. Manual document-to-form and document-to-spreadsheet work is expensive, slow, and error-prone. Qomplement has enough public API, workflow, and example surface area to show they are solving an actual workflow problem, not just publishing a landing page.",
  opportunity:
    "The better wedge is not louder AI language. It is a security-heavy desktop control plane with human approval gates, local-first ingestion, field-level lineage, and clearer operational ownership."
};

export const sourceLedger = [
  {
    label: "Marketing site",
    date: "March 14, 2026",
    url: "https://qomplement.com/",
    evidence: "Public site positions the product around filling PDFs and Excel with AI agents."
  },
  {
    label: "API overview",
    date: "March 1, 2026",
    url: "https://docs.qomplement.com/api/overview/",
    evidence: "Docs publish extract, fill PDF, fill Excel, jobs, usage, webhooks, and SDK references."
  },
  {
    label: "Workflow docs",
    date: "March 1, 2026",
    url: "https://docs.qomplement.com/workflows/overview/",
    evidence: "Public docs describe trigger-process-transform-act pipelines with webhook, email, database, and action nodes."
  },
  {
    label: "PDF forms example",
    date: "February 25, 2026",
    url: "https://docs.qomplement.com/examples/pdf-forms-at-scale/",
    evidence: "Public example describes filling the same PDF form at scale from source documents using workflows."
  },
  {
    label: "Live models endpoint",
    date: "March 14, 2026",
    url: "https://developer-api.qomplement.com/v1/models",
    evidence: "The live endpoint returns extract and fill model identifiers, which supports product reality."
  },
  {
    label: "Security page",
    date: "March 2026",
    url: "https://qomplement.com/security",
    evidence: "Security page lists infrastructure providers, enterprise controls, and certifications as in progress."
  }
];

export const marketStrengths = [
  "Real operational breadth. They expose API, workflows, webhooks, SDKs, templates, PDF fill, Excel fill, and examples publicly.",
  "Clear enterprise use case. Document extraction and document-to-template filling is a real workflow for finance, logistics, healthcare, insurance, and legal teams.",
  "Public docs reduce hand-waving. The docs show concrete primitives instead of only landing-page claims."
];

export const marketGaps = [
  "Trust signal mismatch. The main site is thinner than the docs and undersells the actual product surface.",
  "Copy residue from an older debt-collection positioning appears in the bundle and privacy language, which weakens credibility.",
  "Security claims are broad but the main site does not give buyers a precise control model, architecture diagram, or review workflow.",
  "The differentiator is vague. 'AI agents for document filling' is not enough when OCR and extraction are already crowded markets.",
  "Platform pricing is still opaque compared with the API plans, which slows technical buyers trying to self-qualify."
];

export const betterProductMoves = [
  "Desktop-first local intake with policy gates before any cloud processing.",
  "Field-level lineage showing where every filled value came from and why it was accepted.",
  "Mandatory human review for low-confidence or regulated outputs.",
  "Tamper-evident audit exports for compliance, internal controls, and customer assurance.",
  "Clear deployment modes: local only, private cloud, or managed cloud with zero-retention options."
];

export const securityArchitecture = [
  {
    title: "Renderer sandbox",
    detail: "Context isolation, renderer sandboxing, and no Node.js access from the UI."
  },
  {
    title: "Minimal IPC bridge",
    detail: "Only metadata lookup, external-link brokering, and document selection are exposed to the renderer."
  },
  {
    title: "Navigation control",
    detail: "In-app navigation is locked to the local app surface. External URLs are denied by default and explicitly brokered."
  },
  {
    title: "Permission denial",
    detail: "Camera, microphone, notifications, and other browser permissions are denied at the session layer."
  },
  {
    title: "Local-first intake",
    detail: "Document selection is initiated in the main process. Renderer code never receives direct filesystem primitives."
  },
  {
    title: "Strict content policy",
    detail: "No remote scripts, no iframe embeds, and no untrusted HTML rendering in the interface."
  }
];

export const pipelineBlueprint = [
  {
    phase: "Intake",
    summary: "Local folders, email drops, webhook submissions, and manual imports enter a controlled staging queue.",
    outcomes: ["File fingerprinting", "Sensitivity labeling", "Owner assignment"]
  },
  {
    phase: "Interpret",
    summary: "Documents are parsed into typed records with schema proposals, table extraction, and confidence tracking.",
    outcomes: ["Schema draft", "Field confidence", "Exception flags"]
  },
  {
    phase: "Govern",
    summary: "Policy thresholds, approvals, and redaction gates decide what can move forward without human intervention.",
    outcomes: ["Approver routing", "PII redaction", "Escalation paths"]
  },
  {
    phase: "Deliver",
    summary: "Approved outputs are written into PDFs, Excel templates, APIs, or internal systems with full lineage.",
    outcomes: ["PDF fill", "Excel population", "API export"]
  }
];

export const initialQueue = [];

export const commandBrief = [
  {
    title: "Why this beats a generic browser app",
    detail: "DOCENT is designed around controlled local intake, governed release, and operator accountability rather than a pure upload-and-hope flow."
  },
  {
    title: "What stays cloud-optional",
    detail: "Source documents, routing decisions, and operator review can stay on-device until a policy permits export."
  },
  {
    title: "What buyers can understand quickly",
    detail: "The product is framed as document operations software, not just another OCR wrapper with AI branding."
  }
];
