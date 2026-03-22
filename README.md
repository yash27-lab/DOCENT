# DOCENT

DOCENT is a desktop-first document operations workspace built with Electron, React, and TypeScript. It inspects selected files locally and is designed to demonstrate a more professional, security-conscious document intake flow than qomplement's current website positioning.

## Latest update

- Added live inspection progress in the desktop UI, including current file and OCR page progress
- Added bounded multi-page OCR fallback for weak-text PDFs with a hard three-page cap
- Added local scan cleanup before OCR to improve recognition on scanned PDFs and image documents
- Added richer OCR trace details to the review UI, including processed pages, preprocessing mode, duration, confidence, and recovered text
- Added OCR-safe cache handling so language data stays in the app-data directory instead of the repo
- Added local workspace persistence so staged documents, filters, review state, and notes survive restart
- Added a review workflow with status tracking, notes, and exported review metadata
- Added the first structured extraction workflow for W-9 detection and schema mapping
- Added tests for the local document intelligence module and a `npm test` command

## Problem

Document-heavy teams still lose time on work that should be structured but usually is not. Internal operations, finance, healthcare, legal support, logistics, and back-office teams routinely receive PDFs, scans, spreadsheets, and forms that must be reviewed, interpreted, re-entered, approved, and delivered into another system. The file is only one part of the workflow. The real operational burden is the handoff between intake, validation, decision-making, and downstream execution.

This is a real problem because:

- Important business data often arrives inside unstructured or semi-structured documents
- Teams still manually copy values between files, portals, and internal systems
- Errors in document handling create compliance, financial, and operational risk
- Most tools focus on extraction alone, while real teams also need review, trust, and controlled execution
- Security-sensitive organizations do not want every document workflow to begin with immediate cloud upload

## Why this project exists

DOCENT is built around a simple thesis: document automation is not only an OCR problem. It is an operational control problem. Teams need a secure and professional workspace where documents can be staged, inspected, validated, and eventually routed into a governed workflow. That is the gap this project is trying to address.

## What it does today

- Select documents through the native Electron file picker
- Parse PDF files locally on-device
- Run bounded multi-page OCR locally when PDF text extraction is weak
- Run local OCR directly on PNG and JPEG files with scan cleanup before recognition
- Show live inspection progress while DOCENT parses files and steps through OCR pages
- Show real page counts, document metadata, SHA-256 fingerprints, and extracted preview text
- Surface OCR status, source, confidence, runtime, preprocessing mode, processed pages, and recovered text in the operator workspace
- Infer likely document type and handling sensitivity from parsed text without leaving the device
- Persist the local workspace, including review decisions and notes, in the app data directory
- Track document review state across `Pending`, `Needs review`, `Approved`, and `Rejected`
- Detect W-9 templates locally and surface a first structured extraction panel
- Search the queue by filename, metadata, path, or extracted text
- Flag duplicate documents locally through SHA-256 fingerprint matching
- Export a local JSON inspection report for review or audit handoff
- Keep non-PDF files in a metadata-only staging flow
- Present a market review and product critique for qomplement based on public sources

## What it does not do yet

- No backend API
- No cloud upload
- No high-throughput OCR queue for large batches
- No field mapping or document filling
- No user accounts, auth, or storage layer

## Future scope

The current repository is intentionally narrow. It proves the desktop intake and local inspection layer first. The most useful next steps are:

- Add structured field extraction for common document classes
- Expand OCR coverage to TIFF, larger scan sets, and smarter per-document OCR scheduling
- Expand the local classification heuristics into document-specific extraction workflows
- Add side-by-side review and correction before export
- Add templates for invoices, tax forms, onboarding packets, and internal forms
- Add export adapters for CRMs, ERPs, ticketing systems, and internal APIs
- Add a backend job system only when there is a clear need for remote processing, audit trails, and team collaboration
- Add role-based access controls, secure storage, and full audit logging if the product evolves into a networked platform

## Run locally

```bash
npm install
npm run dev
```

## Build and launch

```bash
npm run build
npm start
```

## Test

```bash
npm test
```

## OCR note

OCR recognition runs locally. On first OCR use, the Tesseract English language data may be downloaded once and then cached in the app-data directory for reuse. Weak-text PDFs are currently OCR'd with a hard cap of three pages, and image OCR applies local scan cleanup before recognition. Document contents are not uploaded for OCR processing.

## Test documents

Public sample forms are included in [samples/README.md](./samples/README.md).

## Security posture

- Renderer sandbox is enabled
- `contextIsolation` is enabled
- `nodeIntegration` is disabled
- Navigation and permission requests are denied by default
- External links are brokered through the main process only
- The preload bridge is minimal
- PDF inspection happens locally in the Electron main process

See [SECURITY.md](./SECURITY.md) for the current security boundary of the desktop application.

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
