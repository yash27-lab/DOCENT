# Security Notes

This repository currently ships a desktop Electron client only. There is no backend, database, auth server, or cloud upload service in this codebase yet.

## Security already implemented

- Renderer sandbox is enabled.
- `contextIsolation` is enabled.
- `nodeIntegration` is disabled in the renderer.
- `webSecurity` is enabled.
- `webviewTag` is disabled.
- `allowRunningInsecureContent` is disabled.
- Browser permission checks and permission requests are denied by default.
- Renderer navigation is restricted to the local app surface.
- External links are denied by default and only opened through the main process for `https:` and `mailto:`.
- The preload bridge is minimal and exposes only:
  - app metadata
  - external-link brokering
  - document picking
  - local document reinspection
  - local file reveal for already-selected documents
- The renderer uses a restrictive Content Security Policy and does not load remote scripts.
- PDF files are parsed locally in the Electron main process with `pdf-parse`.
- Weak-text PDFs can trigger bounded multi-page OCR locally, and PNG or JPEG files can run direct local OCR in the main process.
- Scan cleanup is applied locally before OCR to improve recognition without sending files to an external service.
- The app computes local SHA-256 fingerprints and shows document metadata and text previews without sending files off-device.
- Inspection requests are constrained to allowlisted local file extensions and capped batch sizes.
- Oversized PDFs fall back to metadata-only handling instead of unbounded local parsing.
- OCR language data is cached under the app data directory rather than the repository workspace.
- Broken or inaccessible files fail per-document instead of aborting the full inspection batch.
- Workspace state is persisted locally through the main process instead of exposing direct filesystem writes to the renderer.
- Review notes and review status remain local to the device unless the user explicitly exports a report.

Relevant code:

- `electron/main.ts`
- `electron/preload.ts`
- `index.html`
- `src/App.tsx`

## What is not present yet

- No backend API
- No user authentication
- No database
- No file upload service
- No cloud storage
- No secrets or environment credentials are required for the current app
- No OCR queue for large batches or advanced scan normalization stack yet
- No document filling or workflow execution engine
- No encrypted-at-rest workspace storage yet

## Dependency note

`npm audit` currently reports an upstream moderate advisory in Electron's packaging dependency chain (`extract-zip` / `yauzl`). That issue is not introduced by app code here, but dependency upgrades should still be monitored before production release.
