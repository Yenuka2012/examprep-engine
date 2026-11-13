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

### M1.1 — Certification catalog (deployed in v0.3.0)
- Additive IndexedDB v3 profiles with immutable published syllabus versions, weights and objectives.
- Logical backup v2 (with a backwards-compatible decrypting reader for v1), draft revision protection, UI and browser tests. An older v0.2.1 reader intentionally rejects new logical v2 backups, preventing catalog data loss.
- [Technical design](architecture/M1.1-CATALOG-DESIGN.md); UX-001 #58. Deployed in v0.3.0; related physical iOS and backup acceptance is tracked under #83/#78.

### M1.2+ — Question-bank and adaptive intelligence
- Certification profiles, syllabus versioning, domain weighting and learning objectives.
- Question metadata editor, bank import preview, conflicts/merge and immutable revisions.
- Topic accuracy, first-attempt metrics, repeat exposure metrics and time-per-question.
- Deterministic adaptive selection with fairness/unseen-question quotas.
- Spaced repetition (FSRS or equivalent) with inspectable scheduling inputs.
- Study planner and daily goals, exportable history.

## Approved release v0.3.2 — Minimal-impact examination UX and learning insights (release candidate)

**Decision confirmed 8 November 2026:** include recommendations **1–7, 10 and 12** (nine enhancements). Canonical scope and acceptance: [#113](https://github.com/Yenuka2012/examprep-engine/issues/113). Implemented in draft PRs #115 and #116, consolidated in the v0.3.2 release candidate. No production merge or deployment authorization is implied.

**v0.3.2-A — Exam interaction (original features 1, 2, 3, 10)**
- Pre-submission summary of answered, unanswered and flagged questions before explicit confirmation.
- Navigator filters for all, answered, unanswered and flagged items, without changing saved answers.
- Non-blocking, accessible 5-minute/1-minute examination timer alerts, without changing expiry/submission logic.
- Optional quick exam presets (question count/duration) using existing validated configuration.

**v0.3.2-B — Discovery and learning insights (original features 4, 5, 6, 12)**
- Client-side question-bank search/filter by certification/provider, title and domain.
- Historical attempt filters by certification, score and completion date.
- Weak-domain identification from existing completed-attempt data, with sample sizes and insufficient-data handling.
- Improved results breakdown: correct, incorrect, unanswered, domain insights and targeted revision suggestions, without changing scoring.

**v0.3.2-C — Recovery safety guidance (original feature 7)**
- Read-only backup/recovery checklist clarifying that unfinished exams are excluded from encrypted logical-v2 exports. Do not invoke backup/restore automatically.

**Architectural guardrails:** React UI and derived-data logic only where feasible; no production IndexedDB schema, exam autosave/locking, grading, encrypted backup format, PWA/service-worker or vault-cryptography changes; no paid components. Retain both Pages and private Ubuntu VM hosting, single owner and responsive iPhone/iPad design. Full strict TS, Vitest, all Playwright/security suites, CodeQL and Pages isolation checks before any eventual deployment. Issues #78/#83 and #100 remain independent security/recovery blockers.

**Out of scope for this release:** features 8, 9, 11 and 13–16. Keep them deferred and do not merge the M2 experimental vault drafts into this UX release.

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
