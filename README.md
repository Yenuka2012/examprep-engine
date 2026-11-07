# ExamPrep Engine

A free, browser-based, local-first exam preparation application for multiple certifications.

## Available capabilities (v0.3.0 deployed; owner physical-device acceptance pending)
- JSON question-bank import with strict schema validation (single- and multiple-choice)
- Timed examinations, question navigation, flags, scoring and answer review
- Persistent local question banks, history, unfinished exams, certification profiles and versioned syllabus catalogs using IndexedDB (Dexie schema v3)
- Origin-wide Web Locks single-writer exam protection, serialized autosave, explicit save status, and final durable save before submission
- Domain-level learning analytics
- **Encrypted-only exports:** whole-profile backups and individual question banks are AES-256-GCM password-protected JSON envelopes; legacy plaintext-v1 restore warns and merge-only recovery does not overwrite conflicting records
- Scoped offline-capable PWA (after first online load)
- CI typechecking, unit/security tests, reproducible npm ci, dependency audit, Chromium/WebKit Playwright, CodeQL, SBOM and asset hashes
- GitHub Pages deployment requires passing verify, browser and CodeQL gates on the same workflow run

## Security boundaries
The application source is public. Uploaded questions and answers stay in local browser storage, **not encrypted at rest**; local browser/extension compromise and storage eviction remain risks. Encrypted backups require a strong unique passphrase. Unfinished exam sessions are **not included in the current logical-v2 backup**. Finish an exam before relying on a full export. This is not an officially endorsed or proctored exam system.

## Deployment
1. [M1.1 PR #77](https://github.com/Yenuka2012/examprep-engine/pull/77) was merged into protected `main` in v0.3.0. The [v0.3.0 production workflow](https://github.com/Yenuka2012/examprep-engine/actions/runs/42223723849) deployed successfully. **Physical iPhone/iPad Safari/PWA and clean-profile logical-v2 backup acceptance are still tracked in [#83](https://github.com/Yenuka2012/examprep-engine/issues/83).**
2. Keep branch protection and all required checks configured using the [release-gate runbook](docs/releases/M0.1-RELEASE-GATES.md).
3. Merges must pass security reviews and the same-commit verify, browser E2E and CodeQL checks. The workflow publishes `main` after its checks pass.
4. Ensure **Settings → Pages → Source → GitHub Actions** is selected.
5. Open https://Yenuka2012.github.io/examprep-engine/ after a successful Pages deployment and perform the runbook's browser/iOS acceptance tests.
6. Download the [synthetic sample bank](samples/demo-bank.json) and import it through **Question Banks**.

## Development pipeline
GitHub Actions performs the work without a local environment:
```sh
npm ci
npm audit --audit-level=high
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## Data format
`samples/demo-bank.json` is the canonical import example. The schema permits 1–10,000 questions per bank, up to 8 answer options per question. Uploaded JSON must use `schema_version: "1.0"`.

## M1.1 production status and compatibility
The certification/syllabus catalog was merged in v0.3.0. The additive Dexie v3 schema stores certification profiles and immutable published syllabus versions without rewriting historical attempts. Full-profile encrypted exports use **logical backup version 2** with mandatory `certifications` and `syllabi` arrays inside the unchanged `examprep-encrypted-backup-v1` AES-256-GCM envelope. The application accepts legacy logical-v1 backups after strict validation; plaintext logical-v2 files are rejected.

**Do not roll back to v0.2.1 on an upgraded profile.** Dexie v3 maps to native IndexedDB version 30; the older v2 application expects 20 and cannot open an upgraded database. Preserve the browser profile, use compatible v3 recovery builds, and verify encrypted backup restore in a fresh profile before any future migration. See [architecture](docs/architecture/M1.1-CATALOG-DESIGN.md) and [release acceptance](docs/releases/M1.1-PRODUCTION-ACCEPTANCE.md).

The open M2 design/hosting/vault PRs are **prototypes, not deployed production encryption**. They will retain one free/open-source static PWA codebase for public GitHub Pages and a private Ubuntu VM, and provide single-owner Manage Content and Exam Practice modes. GitHub Pages **cannot provide server-side login**; its browser-vault unlock is local cryptographic access control, not remote authentication. iPad support is in scope, with physical iPadOS acceptance pending.

## Operations
- Question banks, exam answers and history are specific to each browser profile.
- There is no cloud synchronization or server-side authentication.
- Export encrypted backups routinely, retain the passphrase safely and periodically test restore. Current export/restore files are capped at 64 MiB; an oversized full-history backup is not supported, so keep the existing browser profile and use individual encrypted bank exports until a larger format is available.
- Browser storage can be cleared by the user or operating system. Never treat the active browser database as the only durable copy.
- Read the [security review](docs/SECURITY-REVIEW.md), [release-gate runbook](docs/releases/M0.1-RELEASE-GATES.md) and [roadmap](docs/ROADMAP.md).
