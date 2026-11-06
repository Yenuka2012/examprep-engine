# ExamPrep Engine

A free, browser-based, local-first exam preparation application for multiple certifications.

## Available capabilities (v0.2.1 deployed; M1.1 catalog in development)
- JSON question-bank import with strict schema validation (single- and multiple-choice)
- Timed examinations, question navigation, flags, scoring and answer review
- Persistent local question banks, history, and unfinished exams using IndexedDB
- Origin-wide Web Locks single-writer exam protection, serialized autosave, explicit save status, and final durable save before submission
- Domain-level learning analytics
- **Encrypted-only exports:** whole-profile backups and individual question banks are AES-256-GCM password-protected JSON envelopes; legacy plaintext restore warns and does not overwrite existing data
- Scoped offline-capable PWA (after first online load)
- CI typechecking, unit/security tests, reproducible npm ci, dependency audit, Chromium/WebKit Playwright, CodeQL, SBOM and asset hashes
- GitHub Pages deployment requires passing verify, browser and CodeQL gates on the same workflow run

## Security boundaries
The application source is public. Uploaded questions and answers stay in local browser storage, **not encrypted at rest**; local browser/extension compromise and storage eviction remain risks. Encrypted backups require a strong unique passphrase. Unfinished exam sessions are not included in backup v1. This is not an officially endorsed or proctored exam system.

## Deployment
1. For the currently deployed M0.1, [PR #74](https://github.com/Yenuka2012/examprep-engine/pull/74) passed its checks and was merged. For **M1.1**, review [PR #77](https://github.com/Yenuka2012/examprep-engine/pull/77) and verify every required check on the final head commit, following the solo-maintainer protected-PR policy.
2. Configure and enforce main branch protection and required checks following the [M0.1 runbook](docs/releases/M0.1-RELEASE-GATES.md).
3. Merge only after owner security acceptance. The deployment workflow publishes `main` if all its own checks pass.
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

## M1.1 development branch
Certification profile and syllabus catalog functionality is being developed in a feature branch. It will create an additive IndexedDB v3 schema and **logical backup v2 with mandatory catalog arrays**, wrapped in the unchanged encrypted backup envelope. The current M0.1 reader rejects logical backup v2 rather than silently discarding metadata. **A v3 browser database cannot be safely downgraded by redeploying the old v2 application.** [Review the design](docs/architecture/M1.1-CATALOG-DESIGN.md). Do not confuse this feature branch with the deployed v0.2.1 release.

## Operations
- Question banks, exam answers and history are specific to each browser profile.
- There is no cloud synchronization or server-side authentication.
- Export encrypted backups routinely, retain the passphrase safely and periodically test restore. Current export/restore files are capped at 64 MiB; an oversized full-history backup is not supported, so keep the existing browser profile and use individual encrypted bank exports until a larger format is available.
- Browser storage can be cleared by the user or operating system. Never treat the active browser database as the only durable copy.
- Read the [security review](docs/SECURITY-REVIEW.md), [release-gate runbook](docs/releases/M0.1-RELEASE-GATES.md) and [roadmap](docs/ROADMAP.md).
