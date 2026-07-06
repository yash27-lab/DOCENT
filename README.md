# DOCENT

DOCENT is a desktop-first document operations workspace built with Electron, React, and TypeScript. It inspects selected files locally and is designed to demonstrate a more professional, security-conscious document intake flow than qomplement's current website positioning.

## Latest update

- Expanded structured extraction from a single W-9 workflow into a declarative template registry covering IRS W-9, IRS 1040, USCIS I-9, CMS-1500, and generic invoices
- Added field-level format validation, so extracted TINs, dates, currency amounts, emails, and phone numbers are checked and flagged as valid or suspect in the review UI
- Added a local PII exposure scanner that detects Social Security numbers, EINs, credit card numbers (Luhn-verified), bank routing numbers (ABA checksum-verified), emails, phone numbers, and labeled dates of birth, and reports them with masked examples and a risk level
- Escalated document sensitivity automatically when high-risk PII is detected in locally extracted text
- Added review-status filter chips, queue sorting, and arrow-key navigation to the staging queue
- Added a CSV queue summary export alongside the JSON inspection report, with spreadsheet formula injection neutralized
- Made workspace persistence atomic so a crash mid-save cannot corrupt the stored workspace
- Serialized concurrent inspection runs in the main process so overlapping intake cannot interleave OCR progress
- Extended the test suite to 31 tests covering PII detection, template extraction, field validation, and document intelligence

Earlier milestones: drag-and-drop intake with queue upsert by path, live inspection progress, bounded multi-page OCR fallback with scan cleanup, OCR trace details in the review UI, local workspace persistence, and the review workflow with status tracking and notes.

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
- Drag documents from Finder directly into the staging queue for local inspection
- Parse PDF files locally on-device
- Run bounded multi-page OCR locally when PDF text extraction is weak
- Run local OCR directly on PNG and JPEG files with scan cleanup before recognition
- Show live inspection progress while DOCENT parses files and steps through OCR pages
- Show real page counts, document metadata, SHA-256 fingerprints, and extracted preview text
- Surface OCR status, source, confidence, runtime, preprocessing mode, processed pages, and recovered text in the operator workspace
- Infer likely document type and handling sensitivity from parsed text without leaving the device
- Scan extracted text locally for PII, including checksum-verified card and routing numbers, and surface masked findings with a per-document risk level
- Persist the local workspace, including review decisions and notes, in the app data directory with atomic writes
- Track document review state across `Pending`, `Needs review`, `Approved`, and `Rejected`
- Detect IRS W-9, IRS 1040, USCIS I-9, CMS-1500, and invoice layouts through a declarative template registry and surface structured extraction with per-field format validation
- Search the queue by filename, metadata, path, extracted text, or PII category, filter it by review status, and sort it by name, size, or page count
- Navigate the staging queue with arrow keys for faster review passes
- Flag duplicate documents locally through SHA-256 fingerprint matching
- Export a local JSON inspection report or a CSV queue summary for review or audit handoff
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

- Grow the template registry with more document classes and multi-page layout awareness
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
