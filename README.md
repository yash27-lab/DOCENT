# DOCENT

DOCENT is a desktop-first document operations workspace built with Electron, React, and TypeScript. It inspects selected files locally and is designed to demonstrate a more professional, security-conscious document intake flow than qomplement's current website positioning.

## Latest update

- Added stricter local inspection guardrails for file types, batch size, and oversized PDF handling
- Added queue management actions to reveal local files, remove selected items, and clear the queue safely
- Hardened the local inspection path so invalid or broken files fail individually instead of breaking the whole batch

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
- Show real page counts, document metadata, SHA-256 fingerprints, and extracted preview text
- Infer likely document type and handling sensitivity from parsed text without leaving the device
- Search the queue by filename, metadata, path, or extracted text
- Flag duplicate documents locally through SHA-256 fingerprint matching
- Export a local JSON inspection report for review or audit handoff
- Keep non-PDF files in a metadata-only staging flow
- Present a market review and product critique for qomplement based on public sources

## What it does not do yet

- No backend API
- No cloud upload
- No OCR service
- No field mapping or document filling
- No user accounts, auth, or storage layer

## Future scope

The current repository is intentionally narrow. It proves the desktop intake and local inspection layer first. The most useful next steps are:

- Add structured field extraction for common document classes
- Add OCR for scanned PDFs and image-based documents
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
