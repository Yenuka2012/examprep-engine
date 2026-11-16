# EX-006 Owner Full-Mock UI — Stage 2 Integration
Date: 2026-11-16. PR #154 stacked on #153; not a production or encrypted cutover approval.

## Verified trust and privacy boundaries
- Only the separate `EncryptedOwnerApp` bundle is updated. The ordinary GitHub Pages source application, its index.html import graph, source IDB, storage schema, release-isolation gate and old-client barriers stay unchanged.
- No questions or encrypted user data enter the repository, CI, telemetry or network. Tests generate synthetic questions only.
- Published syllabus required. CISM Nov 2026 and CRISC Nov 2025 official-style domain proportions are read from pinned and versioned blueprints, not an older or undocumented general guide.
- The readiness summary reports each required domain quota and eligible distinct source content. Four-option single-choice questions only.
- Once ready, original source banks are left immutable; exactly 150 selected unique items are compiled into an add-only encrypted derived bank. A distinct bank ID beginning `MOCK-` is reserved for these materialized mock artifacts; those derived banks are excluded from subsequent source-pool assembly to prevent double counting.
- Selected exam snapshot is limited to 6 MiB *before* any derived-bank write; vault's 8 MiB per-record enforcement remains active.
- The bank is authenticated and stored by the existing owner runtime BEFORE the full mock starts, preserving `startExam()`'s exact bank equality check. If later exam start fails, any already encrypted derived bank is preserved, not deleted.
- Timer, Web Lock, crash-safe autosave, idempotent completion, original attempt snapshots and result calculations are unchanged. The quiz does not show correct answers or explanations during mock. Any ISACA-like layout is practice only: no actual test-center, proctoring or scaled-score claims.

## Release blockers
- CI green exact head (all JS/TS, WebKit/iPhone/iPad, crypto, PWA, source-isolation gates).
- Real private HTTPS origin, independent owner-backup recovery and physical iPhone/iPad owner acceptance (#132/#144).
- Future scalable multi-bank session manifest can remove permanent derived 150-item bank duplication; no v1 schema or data-format migration in this PR.
