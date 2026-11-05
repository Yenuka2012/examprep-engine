# ExamPrep Engine — Engineering roadmap

## Release v0.2 — M0 security modernization
- Locked maintained React/Vite/TypeScript/Vitest stack and reproducible dependency installation.
- Strict JSON Schema, encrypted full-backup export/import and transactional exams.
- Scoped static-asset offline PWA and testable security review artifacts.

## Release v0.2.1 — M0.1 corrective maintenance (deployed 2026-11-06)
- Failure-aware queued autosave, explicit retry/status and final durable submission barrier.
- Legacy tab-only exam state preserved until committed IndexedDB migration; clean-checkout dev validator generation and gitignore repairs.
- Encrypted-only whole-profile and individual bank exports with fresh-profile restore tests, 64 MiB symmetric size bounds and property-order-insensitive restore matching.
- Same-run Pages deployment gates: unit/build/audit, desktop/mobile Playwright and CodeQL.
- Immutable GitHub Action pins; CycloneDX SBOM, SHA-256 build manifest and release rollback runbook.
- Production GitHub Actions deployment passed on 6 Nov 2026 at `c95bb7e00606`; browser/iOS physical acceptance and intermittent WebKit E2E root-cause follow-up remain tracked separately (#49 / #76). Solo-developer branch rules require tests but no independent human approval.

## Release v0.3 — M1 learning intelligence

### M1.1 — Certification catalog (in development)
- Additive IndexedDB v3 profiles with immutable published syllabus versions, weights and objectives.
- Backwards-compatible encrypted catalog export/restore, draft revision protection, UI and browser tests.
- [Technical design](architecture/M1.1-CATALOG-DESIGN.md); UX-001 #58. This is not yet a production release.

### M1.2+ — Question-bank and adaptive intelligence
- Certification profiles, syllabus versioning, domain weighting and learning objectives.
- Question metadata editor, bank import preview, conflicts/merge and immutable revisions.
- Topic accuracy, first-attempt metrics, repeat exposure metrics and time-per-question.
- Deterministic adaptive selection with fairness/unseen-question quotas.
- Spaced repetition (FSRS or equivalent) with inspectable scheduling inputs.
- Study planner and daily goals, exportable history.

## Release v0.4 — reliability and content quality
- Optional IndexedDB encrypted-at-rest vault with reviewed key lifecycle.
- Resilient long-lived backups/version migrations and recovery from browser storage eviction.
- Offline readiness checks, cache migration, cross-tab locking stress tests and improved state machine.
- Playwright coverage for Firefox in addition to existing Chromium/WebKit, plus physical iOS UAT.
- Signed software provenance, security monitoring and secrets scanning controls.
- Content quality checks: rationales, duplicate semantic content, outdated syllabus mappings.
- Accessibility audits and keyboard-only exam controls.

## Optional cloud edition — not in personal free MVP
- Explicit design decision/threat model before enabling authentication or synchronization.
- Backend row-level security and least-privilege service accounts.
- Private question-bank hosting and multi-user management.
- Secure AI provider integration through server-side proxy only.
