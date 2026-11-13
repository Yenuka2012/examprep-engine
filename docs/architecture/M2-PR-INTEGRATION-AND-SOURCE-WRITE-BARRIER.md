# M2 integration review and v0.3.0 source-write barrier

**Status:** Draft / review only. **Original branch baseline:** `main` at `bcea4dc`, production `v0.3.0`; subsequent production test-only hotfix #99 merged to `3bf60d12`. **Tracking:** #97. **No migration or deployment authorized.**

## 1. Draft branch integration topology (verified 8 Nov 2026)

GitHub's live comparisons confirm these cumulative vault branches are LINEAR (the later head includes each earlier head's history):

```text
main v0.3.0
   ├─ PR #81  ADR-002: cryptographic single-owner vault design
   ├─ PR #84  ADR-003: GitHub Pages and private Ubuntu hosting design
   ├─ PR #86  M2.1: portable PWA builds + iPad WebKit
   ├─ PR #88  M2.2-S1: isolated crypto core
   │    └─ PR #90  M2.2-S2: owner lock, verified writes and synthetic UI
   │         └─ PR #92  M2.2-S3: ciphertext-only authenticated export/restore
   │              └─ PR #94  M2.2-S4: resumable synthetic journal
   │                   └─ PR #96  M2.2-S5: audit and synthetic freeze
   └─ THIS PR: short-lived source-wide legacy write permits (independent)
```

- **#88 → #90 → #92 → #94 → #96 are cumulative**, but each currently targets `main`. *Do not merge #96 first* or merge any two branches without auditing duplicate cumulative changes. Rebase/retarget each dependency to its immediate predecessor or integrate one reviewed slice at a time and re-run all gates on the actual merge SHA.
- #81 and #84 are independent/diverged from each other; #84 and #86 also diverged. A passing individual PR CI does **not** prove combined `vite.config.ts`, PWA, IndexedDB origin isolation or URL path compatibility. Reconcile architecture intent and test merged build paths.
- This source-write barrier branch starts **directly from main**, not #96, to reduce coupling. It introduces **no vault crypto**, encrypted record migrations or synthetic harness.
- Use GitHub Project [ExamPrep Engine — Engineering & Security](https://github.com/users/Yenuka2012/projects/3) to track dependencies; retain all drafts until security review and explicit owner release authorization.

## 2. Production source-write barrier architecture

`src/legacyWriteBarrier.ts` exports a single origin-scoped lock name:
`examprep-v03-source-write-barrier`.

A **normal legacy writer** requests a short `mode:'shared', ifAvailable:true` Web Lock across the entire IndexedDB write/commit. This allows multiple normal writers subject to IndexedDB transaction serialization, while a **future, separately authorized migration controller** can acquire `mode:'exclusive'` and block **new** legacy writes. No exclusive migration acquisition is exposed by this PR. Web Locks missing, unavailable or denied means **fail closed** without fallback localStorage leases.

Normal writer source code now participates:
- `src/App.tsx`: bank import/replacement and deletion, including atomic revalidation of previously observed record after a user confirmation; no stale destructive overwrite.
- `src/catalog.ts`: certification creation; draft save and published syllabus transition, preserving draft revision CAS and published immutability.
- `src/examPersistence.ts`: create, autosave and complete/submit an exam. Preserve `ExamLock` active-exam ownership and final save barriers.
- `src/recovery.ts`: v0.3.0 logical-v2 backup restoration, preserving existing merge-only conflict checks, atomic transaction and active exam blocking.

**Do not use the source-wide Web Lock to coordinate reads alone.** A production migration additionally needs a read-consistent, immutable five-store snapshot and/or an exclusive freeze held from snapshot read through encrypted copy and final integrity check. Today's normal `backup()` reads stores individually; a separately reviewed snapshot-consistency improvement remains required before treating exported records as an authoritative migration source.

## 3. Strict ordering and deadlock prevention

For EXAM owner operations, existing long-lived `ExamLock` must be held **before** obtaining a short-lived shared source write permit. For backup restore, `restoreBackup` acquires the existing `ExamLock` **then** the shared source permit. For catalog and bank mutations, only the short-lived shared source permit is acquired.

A future migration freeze must:
1. Require no unfinished active exam and prevent new exams. The existing exam ownership lock must be acquired **before** obtaining the exclusive source barrier; never reverse the order.
2. Acquire the exclusive source lock using `ifAvailable:true` and **refuse** when any shared writer is still running. No indefinite polling/fallback timer that races source updates.
3. Hold both locks through one read-consistent five-store snapshot, encrypted journal/copy and independently checked final source fingerprint. Any tab that does not cooperate with the lock protocol makes this a **no-go**, including old PWA windows/older deployed builds.
4. Release the source exclusive lock and exam lock on success/failure. Crash/restart must not automatically delete or conceal the original plaintext DB.
5. Stop or coordinate cross-origin changes separately: Web Locks are isolated **by origin**, not by `github.io` pathname or by two different Ubuntu/GitHub URLs.

**Important limitation:** Current production `main` does NOT have this barrier. A future app build with the shared permit cannot force an **old app tab** (opened before deployment) to observe it. Old-tab coordination and mandatory refresh/version gating are separate production prerequisites. A source-wide shared permit alone does not authorize a migration.

## 4. Browser regression and release gating

The independent `playwright.barrier.config.ts` suite launches an ephemeral localhost **production build**, with isolated browser profiles in Chromium, desktop WebKit, emulated iPhone WebKit and emulated iPad WebKit. Each test takes an explicit exclusive Web Lock from another test tab and exercises:
- Denied bank import/delete and catalog write while frozen, succeeding when released;
- Exam creation denial and durable recovery after release;
- Autosave rejection preserving unsaved React state, retry after release, reload and saved flags;
- Encrypted logical-v2 backup merge refusal during freeze and normal operation after release.

Vitest covers missing Web Locks fail-closed, shared concurrency, exclusive denial and callback failure cleanup. The original production tests and CodeQL continue to run. The extra `source-barrier-browser-tests` CI job is a **new required deploy dependency**, not a replacement for old gates.

## 5. Release no-go criteria

This draft is **not** an encrypted-at-rest release. `examprep-v1` remains plaintext; backups remain encrypted logical-v2 and exclude unfinished active exams.

Before any live migration:
- Resolve owner physical iPhone/iPad Safari/PWA and v0.3.0 **fresh-profile** encrypted backup acceptance #83;
- Preserve the now-closed #76 trace-backed WebKit regression fix, deployed via #99; retain the enabled exact-locator test in future merges;
- Independently review ADR #81/#84, hosting #86 and the vault chain #88/#90/#92/#94/#96;
- Implement a version-aware old-tab kill/refresh policy, hold the exclusive freeze, test 5-store snapshot integrity, quota/eviction and interruption recovery, verify external encrypted transfer restored to a **separate profile/origin**, and obtain explicit owner authorization;
- Separate **plaintext cleanup authorization** from migration authorization. No automatic IndexedDB deletion, browser-site-data clearing, downgrade or production release is included here.
