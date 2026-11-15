# UX-007 — P0 compact exam workspace security review (2026-11-15)

Base: main d5bc05faeb4441c33979782f5a625cb1b6677718. Tracking: #147; prior Stage A review #136.

## User-visible scope
- Active exam hides an unrelated import-success toast without suppressing actionable errors or storage compatibility alerts.
- Successful autosave appears only in the persistent action status. Saving and failure still display actionable notices; the existing retry handler remains unchanged.
- Sidebar product version matches the current 0.3.2 package.
- Compact exam spacing, clear hover-versus-selected borders and focus-within outline. No changes to navigation, scoring, timer, submission, IndexedDB, vault or Web Locks.

## Released-source change control
- src/App.tsx approved Git blob: c0ee8cbf2649d8bf0f4f46b5fafbf2ea3741fba4
- src/styles.css approved Git blob: 583004cbf45ac6ef4b57c7eefe4980ae4207d8c5
- Update only these exact pins in scripts/verify-production-isolation.mjs. Keep every other frozen blob, the source allowlist and vault-marker scans unchanged.

## Acceptance gates
- npm ci --no-fund, npm run typecheck, npm test, npm run build, npm run audit
- node scripts/verify-production-isolation.mjs against the built Pages dist
- npm run test:e2e (desktop Chromium/WebKit and mobile WebKit), CodeQL and applicable security/cutover gates on exact PR head
- Manual responsive/physical iPhone and iPad review, and verify active exam survives reload and local save failure
- No merge/deploy or encryption migration without later approval and verified gates.

## Residual risk
This PR does not change storage encryption status. Production source remains distinct from the isolated experimental encrypted-owner build.
