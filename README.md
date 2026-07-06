# DOCENT

DOCENT is a desktop-first document operations workspace built with Electron, React, and TypeScript. It parses regulated forms and business documents entirely on-device, classifies them against known templates, validates the fields it extracts, and flags sensitive personal data before anyone routes the document anywhere else. It is designed to demonstrate a more professional, security-conscious document intake flow than qomplement's current website positioning.

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

Every back-office team that onboards a vendor, hires an employee, processes a health claim, or pays an invoice ends up holding documents packed with regulated personal data: Social Security numbers on a W-9, a taxpayer's income and dependents on a 1040, a new hire's date of birth and citizenship status on an I-9, a patient's diagnosis and insurer ID on a CMS-1500, bank details on an invoice. That data has to be read, keyed into another system, and acted on by a human, and today that almost always means one of two bad paths: someone retypes the values by hand, which is slow and introduces transcription errors into compliance-sensitive fields, or the document gets uploaded to a third-party extraction API before anyone has looked at what is actually in it, which is a real exposure decision made by whoever happened to be doing the filing that day.

This is a concrete, recurring problem, not a hypothetical one:

- Tax, employment, healthcare, and billing documents are structured in practice (they follow known IRS, USCIS, and CMS layouts) but arrive as unstructured PDFs and scans, so teams re-derive the same structure by hand for every document, every time
- The values inside these documents are exactly the categories regulators care about most: SSNs, EINs, dates of birth, diagnosis codes, account and routing numbers, so a transcription error or an unreviewed export is not just an inconvenience, it is a compliance incident
- Most extraction tools optimize for getting text out of a page and stop there; they do not tell an operator whether an extracted value is even shaped like a valid TIN or routing number, and they do not tell them the document contains identifiers that make it Restricted before it gets forwarded
- Security-sensitive organizations (healthcare, legal, financial services, government contractors) cannot accept "upload the document to see what's in it" as the first step of a workflow when the document has not been classified or reviewed yet

## What DOCENT does about it

DOCENT resolves this by moving structure detection, field validation, and PII risk scoring to before the review step instead of after it, and by keeping all of that work on the device instead of a remote service:

- It recognizes five common regulated layouts (IRS W-9, IRS 1040, USCIS I-9, CMS-1500, and generic invoices) from parsed or OCR'd text and maps each one to its known fields instead of returning an undifferentiated text blob
- It checks the shape of every extracted value against what that field should look like (a real TIN pattern, a plausible date, a valid currency amount, a well-formed email or phone number) and flags mismatches as suspect instead of presenting every extraction with equal confidence
- It scans the extracted text itself for Social Security numbers, EINs, credit card numbers (Luhn-checked), bank routing numbers (ABA checksum-checked), emails, phone numbers, and dates of birth, and surfaces only masked examples plus a risk level, so an operator knows a document needs Restricted handling before it leaves the queue
- It keeps every one of those steps, OCR, classification, extraction, validation, and PII scanning, running locally in the Electron main process, so no document or derived field is sent anywhere as a side effect of being inspected

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
