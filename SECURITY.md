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
- The renderer uses a restrictive Content Security Policy and does not load remote scripts.
- PDF files are parsed locally in the Electron main process with `pdf-parse`.
- The app computes local SHA-256 fingerprints and shows document metadata and text previews without sending files off-device.

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
- No OCR pipeline beyond basic PDF text extraction
- No document filling or workflow execution engine

## If you are making this public

The current repository is much safer to open-source than a typical SaaS repo because there is no backend secret material in normal operation. Before publishing, still verify:

- no `.env` files are committed
- no local tokens or API keys are in shell history, screenshots, or docs
- no proprietary customer documents are inside `samples/`

## Backend security you will need when you add one

If you later add a public backend, these controls become mandatory:

- Keep all secrets server-side in a real secret manager.
- Require authentication and role-based authorization on every document route.
- Validate file type, size, and content on upload.
- Scan uploaded files before processing.
- Store documents with encryption at rest.
- Use TLS everywhere in transit.
- Add rate limiting and abuse protection to all public endpoints.
- Log security-relevant actions with audit trails.
- Separate public API workers from privileged admin operations.
- Never let the Electron renderer talk directly to private infrastructure with long-lived credentials.

## Dependency note

`npm audit` currently reports an upstream moderate advisory in Electron's packaging dependency chain (`extract-zip` / `yauzl`). That issue is not introduced by app code here, but dependency upgrades should still be monitored before production release.
