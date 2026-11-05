# M0 stabilization — validation plan, gate matrix and evidence policy

**Scope:** Initial seven sprint tasks [#21](https://github.com/Yenuka2012/examprep-engine/issues/21), [#22](https://github.com/Yenuka2012/examprep-engine/issues/22), [#32](https://github.com/Yenuka2012/examprep-engine/issues/32), [#38](https://github.com/Yenuka2012/examprep-engine/issues/38), [#39](https://github.com/Yenuka2012/examprep-engine/issues/39), [#43](https://github.com/Yenuka2012/examprep-engine/issues/43), [#44](https://github.com/Yenuka2012/examprep-engine/issues/44). Continued P0 tasks EX-003/BACK-003/PWA-001/002/OPS-003/006 must remain open until verified.

| Test ID | Requirement | Method | Expected invariant | Issue |
|---|---|---|---|---|
| T-IMP-01 | Valid sample bank | Unit/browser | Valid import preserves expected question counts/keys | QB-001 |
| T-IMP-02 | Invalid or extra JSON fields | Unit | Reject without database mutation | QB-001 |
| T-IMP-03 | Question/option ID duplication | Unit | Reject deterministic collisions | QB-001 |
| T-IMP-04 | Missing answer references | Unit | Reject incorrect answer key | QB-001 |
| T-IMP-05 | HTML-like payload | Unit/browser | Render only literal text; no script execution or network egress | QB-001 |
| T-IMP-06 | 5 MiB / 10k limit | Unit/browser | Reject oversized input and pathological data gracefully | QB-001 |
| T-EX-01 | Single-choice exact scoring | Unit | Correct one choice accepted; empty/wrong/multi invalid | EX-001 |
| T-EX-02 | Multiple-choice scoring | Unit | Order independent, exact set only; extras/missing invalid | EX-001 |
| T-EX-03 | Frozen scoring snapshot | Unit/browser | Bank edits do not alter completed attempt answer keys | EX-001/QB-003 |
| T-EX-04 | Mid-exam hard reload | Browser E2E | All saved answers and flags persist; timer not reset | EX-002 |
| T-EX-05 | Close/reopen tab | Browser E2E | Recovery is deterministic; expired session submits once | EX-002 |
| T-EX-06 | Two concurrent tabs | Browser E2E | Single writer; no double submit or overwritten answers | EX-003 |
| T-BACK-01 | Encrypted round trip | Unit/browser | Decrypted backup matches exported bytes logically | BACK-001 |
| T-BACK-02 | Wrong password / damaged ciphertext | Unit/browser | Auth fails; data unchanged | BACK-001 |
| T-BACK-03 | Forged score / invalid snapshot | Unit | Reject before transaction; previously stored history preserved | BACK-002 |
| T-BACK-04 | Duplicate IDs / answer references | Unit | Reject unexpected records, no partial writes | BACK-002 |
| T-BACK-05 | Legacy storage migration / eviction | Browser | Known versions migrate without deletion; restore feasible after eviction | BACK-003 |
| T-PWA-01 | Offline first visit after install | Browser | Public shell loads, no private bank content in cache | PWA-001 |
| T-PWA-02 | Release update while local exam active | Browser | No data loss, no uncontrolled automatic reset | PWA-001/EX-002 |
| T-OPS-01 | Integrity of artifact and dependencies | CI/PR | npm ci, audit, typecheck, unit, build, CodeQL clean | OPS-001/003 |
| T-OPS-02 | Deployment and rollback | CI/browser | HTTPS website matches expected commit and rollback safe | OPS-006 |

## Validation tiers
1. **T0 static:** lockfile integrity, npm audit, CodeQL, least privilege checks, no secrets/private question banks in source/build.
2. **T1 unit:** pure score, validator, crypto and restore functions, including destructive and malformed cases.
3. **T2 integration:** Dexie IndexedDB transactions, restore failure, idempotent submission and session-write queue.
4. **T3 end-to-end:** real Chromium and WebKit browser import, active exam, reload, restore, two-tab, PWA and mobile tests.
5. **T4 manual UAT:** owner verifies desktop and iOS behavior, export, restore, abnormal storage and release update.
6. **T5 release:** reviewed PR, all blocking gates green, rollback procedure, owner acceptance of residual risks.

## CI evidence collection
- Capture immutable commit SHA and GitHub Actions run URLs for each PR.
- Unit tests are necessary, **not proof** of correct browser lifecycle, service-worker caching or UI accessibility.
- Do not close EX-002, BACK-003, PWA-001/002 or SEC-001 based on unit tests alone.
- Fail or hold merge when a required gate fails; handle false positives through documented, expiry-based exception.
- No security test should import actual confidential/licensed question banks into public build artifacts.

## Definition of done
A task closes when acceptance criteria are checked with evidence linked from the issue. Passing compilation alone does not close design review, restore, live browser or owner sign-off tasks.
