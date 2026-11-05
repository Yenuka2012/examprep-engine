# SEC-002 — Prioritized STRIDE threat and risk register

**Version:** 1.0, 2026-11-06  
**Scope:** ExamPrep Engine local-first static PWA, public GitHub repository and Pages delivery.  
**Status:** DRAFT FOR OWNER RISK ACCEPTANCE. No penetration test or security compliance certification has been performed.

## Scoring method
Likelihood (L) and impact (I) are integers 1–5 based on the current personal-use context, not CVSS. Risk score = L × I. **High:** 15–25, **Medium:** 6–14, **Low:** 1–5. Recalculate when hosting, data sensitivity or access model changes.

| Threat | STRIDE | Scenario | L | I | Score | Existing control / remaining requirement | Owner issue |
|---|---|---|---:|---:|---:|---|---|
| TM-01 | T/I | Compromised build/dependency executes malicious same-origin JS | 3 | 5 | 15 H | Lockfile + CI audit/CodeQL; independent PR review, SHA pinning and provenance | OPS-001/002/003 |
| TM-02 | T/I | Hostile JSON attempts script injection or prototype-like keys | 2 | 4 | 8 M | Ajv + React text escaping; abuse corpus and browser render tests | QB-001 |
| TM-03 | I | Browser-profile/extension reads plaintext local question banks | 4 | 4 | 16 H | Physical/browser controls; optional lockable encrypted vault design | BACK-004/005 |
| TM-04 | I | Stolen encrypted backup guessed offline | 2 | 4 | 8 M | AES-256-GCM, strong unique passphrase; auth/tamper regression | BACK-001 |
| TM-05 | T | Two tabs write or submit same exam concurrently | 4 | 4 | 16 H | Durable DB but no single writer; add lease, recovery, idempotency | EX-003 |
| TM-06 | T | Restored backup fabricates exam scores or invalid snapshots | 2 | 4 | 8 M | Score revalidation and transactions; E2E rollback tests | BACK-002 |
| TM-07 | D | Complex or large JSON blocks browser thread | 3 | 3 | 9 M | 5 MiB / 10k limits; performance adversarial tests and worker evaluation | QB-001 |
| TM-08 | D | Browser data eviction/quota/corruption erases history | 3 | 5 | 15 H | Encrypted manual backup; recovery/migration validation and warnings | BACK-003 |
| TM-09 | T/D | Old service worker app shell with changed DB schema | 3 | 4 | 12 M | PWA scope + Dexie versions; upgrade/downgrade testing | PWA-001/003 |
| TM-10 | S | User mistakes public study site for private cloud account | 2 | 3 | 6 M | Explicit local-only privacy notice and source provenance | UX-004 |
| TM-11 | R | User manipulates local non-proctored score and presents as certified | 5 | 1 | 5 L | Results are for personal learning only, not attested evidence | UX-002 |
| TM-12 | E/T | Unreviewed workflow PR changes token permissions or deployment | 3 | 5 | 15 H | Least-privilege jobs + required reviews and immutable action refs | OPS-002/003 |
| TM-13 | I | Proprietary question bank committed in public repo/issue | 3 | 5 | 15 H | Synthetic samples, upload warnings, provenance and secret scanning | UX-005 |
| TM-14 | T | Bank reimport silently alters content under reused bank ID | 4 | 3 | 12 M | Frozen past snapshots; immutable revisions and conflict preview | QB-003/004 |
| TM-15 | D | Active exam excluded from portable backup and device fails | 3 | 3 | 9 M | Clear disclosure, active session recovery policy for v2 | BACK-003 |
| TM-16 | I/S | Header-only CSP defenses absent on GitHub Pages | 3 | 3 | 9 M | Meta CSP + safe React sinks; explicit hosting boundary review | SEC-004 |

Legend: S=Spoofing, T=Tampering, R=Repudiation, I=Information disclosure, D=Denial of service, E=Elevation of privilege.

## Threat treatment priorities

### P0 — controls required before reliance on real important question banks
- Prevent concurrency-related exam loss, TM-05 → [EX-003](https://github.com/Yenuka2012/examprep-engine/issues/40).
- Prove backup success, authentic restoration, migration and eviction recovery, TM-04/06/08 → [BACK-001](https://github.com/Yenuka2012/examprep-engine/issues/43), [BACK-002](https://github.com/Yenuka2012/examprep-engine/issues/44), [BACK-003](https://github.com/Yenuka2012/examprep-engine/issues/45).
- Validate import limits and browser behaviors, TM-02/07 → [QB-001](https://github.com/Yenuka2012/examprep-engine/issues/32).
- Protect main and verify release/rollback, TM-01/12 → [OPS-001](https://github.com/Yenuka2012/examprep-engine/issues/26), [OPS-003](https://github.com/Yenuka2012/examprep-engine/issues/28), [OPS-006](https://github.com/Yenuka2012/examprep-engine/issues/31).
- Verify browser/mobile/PWA behavior, TM-09 → [PWA-001](https://github.com/Yenuka2012/examprep-engine/issues/48), [PWA-002](https://github.com/Yenuka2012/examprep-engine/issues/49).

### Risk acceptance required (not implicitly approved)
- TM-03: Local browser database plaintext. Strong device security and limited personal use are compensating controls; an opt-in encrypted vault is not complete. **Do not imply this is secure from a compromised browser or endpoint.**
- TM-10/11: No identity assurance, anti-cheat attestations, or certified scores.
- TM-15: Backup v1 does not include an unfinished examination session.
- TM-16: GitHub Pages hosting cannot guarantee custom header-only policies.

### Exit criteria for SEC-002
- [ ] Owner reviews applicability, likelihood and impact.
- [ ] Every high risk has a linked issue and explicit treatment or time-limited exception.
- [ ] P0 failures are evidenced with reproducible tests where possible.
- [ ] Residual privacy and storage risks are acknowledged without claiming complete security.
- [ ] Reassessment triggers include AI/API integration, user accounts, licensed content, or paid multi-user service.

**Important:** This is a scenario register. It is not a finding that the exploit has been demonstrated.
