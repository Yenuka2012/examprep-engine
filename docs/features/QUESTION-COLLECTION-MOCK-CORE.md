# QB-008 / EX-006 — Pure question collection and full-mock selection core

Status: **implementation proposed in draft PR, no integration, data migration or deployment authorization**.
Issues: #151, #152, #144. Baseline: source v0.3.2. Date 2026-11-16.

## Scope

- \`questionCollections.ts\`: project immutable validated JSON v1.0 source banks onto a **published certification + syllabus version + domain-code** view, independent of bank_id.
- \`examBlueprints.ts\`: versioned, checked source links and duration/weight metadata for CISM (Nov 2026) and CRISC (2025 outline).
- \`mockExamAssembler.ts\`: deterministic largest-remainder quotas; eligible four-option single-choice filtering; full-syllabus readiness checks; unbiased Web Crypto shuffle; strict v1 bank validation; 7 MiB safety threshold on derived banks.
- Unit tests use **synthetic question texts only**, never private question content.

## Actual/mock quotas

CISM new content outline 2026-11-03:
- Governance 18% -> 27
- Risk Management 20% -> 30
- Program 33% -> 50
- Incident Management 29% -> 43

CRISC current 2025 content outline:
- Governance 26% -> 39
- Assessment 22% -> 33
- Response and Reporting 32% -> 48
- Technology and Security 20% -> 30

Each totals 150 items. Counts are calculated practice allocation approximations based on weights, **not a guarantee of actual exam section item counts**.

Sources:
- https://www.isaca.org/about-us/newsroom/press-releases/2026/isaca-updates-cism-exam-content-outline-factoring-in-todays-technologies-security-responsibilities
- https://www.isaca.org/credentialing/crisc/crisc-exam-content-outline
- https://www.isaca.org/credentialing/cism/cism-exam-content-outline
- https://support.isaca.org/s/article/Exams-How-is-my-Certification-exam-scored-brief-version

## Invariants and future integration gates

1. These modules are **side-effect-free**, and import **no** React, Dexie, encrypted vault, Web Locks, service worker, storage or network.
2. They do not replace/overwrite source banks and do not mutate attempt or active session snapshots.
3. All questions must belong to a **published, exact-version matching syllabus**; no cross-version mixing or guessing missing domain codes.
4. Reimporting an identical question is idempotent. Conflicting ID/content and suspicious identical stems/options remain explicit unresolved issues (Full Mock disabled).
5. A full 150-item mock is **unavailable** unless every domain has enough unique eligible four-option single-answer items. No domain substitution, repetitions or silent reduction in length.
6. \`compileFullMock()\` is **not** yet wired into either Pages or owner vault. In particular, encrypted \`startExam()\` currently requires a durable preexisting authenticated bank identical to \`session.bank\`. A future reviewed bridge must atomically/add-only persist and confirm the derived bank **before** beginning the encrypted session, and preserve both keys, recovery, source old-client freeze and vault-size limits.
7. Never convert raw accuracy to an official ISACA scaled score or claim ISACA authentication/proctoring.
8. Questions and keys remain entirely local and encrypted only on the owner destination; no bank contents in GitHub or CI.
9. Protect source freeze and exact blob hash checks if/when integration modifies production App or CSS; no bypass.

## Release plan

- Pure core: this PR.
- Separate import preview/collection UI: reviewed PR #151.
- Separate encrypted-owner compiled-bank persistence+exam UI: reviewed PR #152. Requires real origin, physical iOS and recovery checks.
- Ship only after all P0/P1 safety checks and owner acceptance. Defer features rather than weaken the v1.0 security critical path.
