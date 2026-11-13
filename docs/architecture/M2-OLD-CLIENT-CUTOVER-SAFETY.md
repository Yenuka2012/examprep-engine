# M2 — Old-client cutover safety and non-destructive readiness

**Status:** Non-destructive audit only. Production Dexie `examprep-v1` remains **plaintext**.  
**Tracking:** issue #100, dependent on owner acceptance #83, backup protection #78, and the unmerged vault designs/PRs #81/#84/#86/#88/#90/#92/#94/#96.

## 1. Threat model: obsolete browser tabs and installed PWAs

An older ExamPrep build (before production commit `33fee4f2d5bd`) does not call `withLegacyWritePermit` and can mutate the same-origin `examprep-v1` IndexedDB despite an exclusive `examprep-v03-source-write-barrier` Web Lock acquired by newer code. A Web Lock is **advisory coordination among cooperating clients**, not an IndexedDB ACL or write-denial facility. The existing `ExamLock` is also cooperative. `BroadcastChannel`, `clients.matchAll()` and Service Worker update registration cannot prove that all older browser tabs or installed PWA contexts are closed, especially when offline/suspended.

**Origins and devices:** Web Locks, IndexedDB, CacheStorage and Service Workers are separated by browser origin and storage partition/profile. `/examprep-engine/` is a GitHub Pages *path*, not an isolated origin. A future private Ubuntu VM on a different HTTPS hostname holds completely separate browser storage; exporting/importing an independently authenticated encrypted backup is needed for portability. A separate iPhone/iPad device does not share the same origin's IndexedDB with a desktop, and does not participate in desktop Web Locks. No automatic sync or actual server login is present on Pages.

## 2. This implementation

`src/cutoverSafety.ts` exposes a **read-only** `inspectLegacyCutoverSafety()` diagnostic. It:

1. Requires native browser Web Locks and obtains the **existing exam owner exclusive lock first**; rejects attempts where it is already owned or unsupported.
2. Acquires `examprep-v03-source-write-barrier` in exclusive mode with `ifAvailable:true`. Refuses a conflict with a cooperating writer; does not queue behind it.
3. Uses a **single IndexedDB readonly transaction** to count the five existing v0.3.0 stores: banks, attempts, activeSessions, certifications, syllabusVersions. Only aggregate counts leave the transaction; no bank ID, question, answer, score, or private content is logged or exported.
4. Rejects an unfinished active examination, and always retains the blockers `OLD_CLIENTS_NOT_FENCED`, `RECOVERY_NOT_ATTESTED`, `PHYSICAL_DEVICE_ACCEPTANCE_REQUIRED` and `NO_MIGRATION_IMPLEMENTED`.
5. Releases both lock reservations and makes **no mutation, migration, enrollment, backup import, upgrade or cleanup**. UI outcome is always `BLOCKED`; there is no application action that starts migration, deletes the old database, or dismisses a blocker.

This is **not** an old-tab detection system or an assertion that backup/device signoff was checked. The audit explicitly cannot attest to old-tab closure, other origins, offline PWA windows, or real backup restoration.

The owner dashboard includes a `Check migration safety (read-only)` button and a plain-language explanation of each blocker. Physical iPhone/iPad acceptance remains a separate manual check.

## 3. Test scope and accurate claims

Unit tests deny migration for missing Web Locks, denied exam ownership, exclusive writer conflict, an unfinished session, failed DB inspection and unexpected API errors. The owner report never returns a migration-ready/authorized status.

`e2e-barrier/cutover-audit.spec.ts` runs in ephemeral **Chromium, desktop WebKit, iPhone WebKit and iPad WebKit emulation**. It verifies the blocked UI and aggregate-only report. A negative test simulates a **pre-barrier raw IndexedDB writer** from another same-origin tab while an exclusive Web Lock is held, and confirms that the write still succeeds. This deliberately proves the limit of Web Locks; it is **not** a test of an actual historical deployed JS/PWA bundle. A separate old-build-versus-new-build CI test, cache-update/offline-reopen scenarios and real device testing are necessary before closing #100.

### Mandatory future old-build regression

For a later, dedicated cutover integration PR:

- Build the exact historical production commit before the legacy barrier, and the cutover candidate with the same dependencies and base-path behavior. Serve both bundles on the **same origin** and distinct page routes, with test-specific asset mapping. Verify the old bundle can still use its direct IDB write path while the new client owns only a Web Lock.
- Introduce a **reviewed durable storage-level migration fence**, with an explicit versionchange/close policy for old IDB connections and deterministic fail-closed behavior for stale cached clients; never treat a Web Lock as sufficient. Assess that an IndexedDB schema bump can block *opening older schema versions* yet may fail when an old connection remains open, trigger `blocked` upgrade, or require a safe owner-directed close/reload. Do not assume an IDB version bump alone revokes all existing transactions. Validate error/crash/timeout/quota cases across Safari variants and browsers.
- Test service-worker waiting/activation and `skipWaiting:false` behavior, stale caches, offline PWAs, background suspension, standalone Home Screen iPhone/iPad and old tabs opened across the upgrade. A user-visible version/update-required state and recovery path must preserve unsaved exam progress.
- Require the legacy exam lock and global source exclusive lock **in that order** for any future cutover, and verify a clean source snapshot under source quiescence. Include a durable, authenticated cutover journal and re-open checks; never release lock until copy/read-back verification.
- Complete the owner's **post-v0.3.0 full logical-v2 encrypted backup** fresh-profile restore (#83) and separately verify the new vault encrypted backup, including all record classes. A logical-v2 backup intentionally excludes unfinished exam sessions: an active session is a hard blocker.
- Require clear owner authorization for a **non-destructive** copy, a subsequent clean-profile restore and invariant comparison, and **separate later owner authorization for plaintext cleanup**. Never delete `examprep-v1` based only on a green unit test, “ready” flag, old-tab absence guess or a timer.

## 4. Release gate

It is permissible to deploy the **read-only audit and diagnostics** independently after same-commit typecheck/Vitest, npm audit, browser E2E (including source-barrier and cutover tests), CodeQL JS/TS and Actions, protected PR merge and same-merge-SHA Pages deployment. No actual encrypted-at-rest functionality or migration is released.

**Issue #100 must remain open** until a durable old-client fence, real mixed-bundle regression, physical device validation and owner recovery evidence are complete.
