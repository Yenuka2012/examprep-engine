# ExamPrep Engine — Engineering roadmap

## Release v0.2: security modernization
- Current maintained stable React/Vite/TypeScript/Vitest stack.
- Deterministic, auditable dependency installation.
- Strict JSON Schema and adversarial input tests.
- Authenticated encrypted backup exports/imports.
- Durable exam autosave and transactionally recorded submissions.
- Scoped static-asset offline PWA.
- Formal security controls and residual-risk documentation.

## Release v0.3: learning intelligence
- Certification profiles, syllabus versioning, domain weighting and learning objectives.
- Question metadata editor, bank import preview, conflicts/merge and immutable revisions.
- Topic accuracy, first-attempt metrics, repeat exposure metrics and time-per-question.
- Deterministic adaptive selection with configurable fairness and unseen-question quotas.
- Spaced repetition (FSRS or equivalent) with inspectable scheduling inputs.
- Study planner and daily goals, exportable history.

## Release v0.4: reliability and content quality
- IndexedDB encryption-at-rest vault (opt-in) and robust backup migration/versioning.
- Offline readiness checks, cache migration, cross-tab locking.
- Playwright end-to-end coverage on Chromium, Firefox, WebKit.
- SAST, SBOM, software provenance and full GitHub Actions commit SHA pinning.
- Content quality checks: rationales, duplicate semantic content, outdated syllabus mappings.
- Accessibility audits and rich keyboard-only exam controls.

## Optional cloud edition — not in personal free MVP
- Explicit choice and threat model before enabling authentication and synchronization.
- Backend RLS and least-privilege service accounts.
- Private question-bank hosting and multi-user management.
- Secure AI provider integration through server-side proxy only.
