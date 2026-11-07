# M2 Cutover — Actual old build and durable storage-fence decision

**Status: SECURITY BLOCKED; draft research and tests only.** Issue #100.
No live browser migration, vault enrollment, IndexedDB version bump, plaintext
cleanup, destructive operation, or production deployment is authorized.

## Verified source facts

- Latest main at the start of this work: 7c7cd3cdf7f2fa31eebf4dfcc9e6c52454573009.
- Actual pre-barrier v0.3.0: bcea4dc48612641458c0de3a97b3e519470664c3.
- Production Dexie v3 is native IndexedDB **version 30**, not raw version 3.
- Legacy DB name: examprep-v1. Five stores: banks, attempts,
  activeSessions, certifications, syllabusVersions.
- The historical bundle lacks withLegacyWritePermit. In contrast, updated
  clients participate in the shared source lock. Existing owner examination
  lock precedes the source writer permit.
- The new native-version check applies to **updated cooperating clients only**.
  It can make these clients read-only and show update-required, but cannot
  change the behavior of an already deployed older JavaScript bundle.

## Architectural security finding

An IndexedDB schema/version bump is **NOT** a storage-level ACL or a
reliable revocation of old JavaScript. The browser sends versionchange to
open connections, and an upgrade can be blocked. If a request is merely
blocked, it might later continue and commit unexpectedly. A cancelled
upgrade must arrange for transaction abort if onupgradeneeded arrives later.

A higher native version may stop some old explicitly pinned IDB open calls
with VersionError, but Dexie 4 supports dynamic adaptation to a newer DB
and a native versionless indexedDB.open(name) opens the current schema.
Old code can still write existing stores. No combination of Web Locks,
BroadcastChannel, service-worker updates, an app marker, or a version
bump can guarantee prevention of all previously deployed old clients.

## Recommended isolation sequence

1. Keep source immutable to **cooperating** code using the existing
   ExamLock-then-source-lock ordering; block if unfinished exams exist.
2. Require original v0.3+ logical-v2 encrypted backup restored independently
   in a clean profile, including catalog and attempts (issues #83 and #78).
3. Obtain separate owner authorization before even non-destructive copy.
   Choose a **distinct encrypted vault DB name** and never overwrite source.
4. Snapshot and fingerprint source within one readonly transaction, stream
   to an encrypted journal/destination, authenticate and read back all types,
   then recheck full source invariant. If old writers alter source: abort
   and reconcile, without touching original records.
5. Until obsolete bundles are demonstrably retired, do not treat a same-origin
   source as permanently frozen. Consider a **separate HTTPS origin** for
   the final encrypted-only app if old-client write revocation is mandatory.
   This requires authenticated encrypted transfer and a separate user
   decision; same-origin /different-path deployments share IndexedDB.
6. Keep cleanup of plaintext records as a later independent approval,
   **never** an automatic consequence of a successful copy or backup.

Different browser profiles and devices have independently scoped IndexedDB.
Offline installed PWAs and suspended Safari tabs cannot be enumerated or
revoked from a Pages origin. The future private Ubuntu host uses another
HTTPS origin and must transfer only via verified encrypted export/restore.
An owner vault unlock is not server authentication.

## Adversarial test protocol

The CI job archives and builds the actual pre-barrier commit with its
historical lockfile. It builds the candidate from this PR under a distinct
test-only /examprep-candidate/ path. A local static test server serves both
on **one ephemeral localhost origin** to preserve the old-vs-new storage
conflict without ever opening the owner's production data.

Test projects: Chromium, desktop WebKit, emulated iPhone WebKit and emulated
iPad WebKit. Scenarios: historical app write under candidate exclusive lock,
native versionless write at version 40, blocked native upgrade followed by
late abort, and offline reopening of actual old PWA with stale writer.

A test-only native version 40 database is created in a disposable browser
profile; no application code performs any production upgrade. The
candidate automatically refuses writes when it detects a newer schema;
an explicit update-required banner is informational for the new client.

Physical iPhone and iPad Home Screen PWA/background acceptance, owner
backup/clean restore, production-recovery verification and approval remain
unfulfilled. Do not close issue #100 until the outstanding gates pass.

## Rollback / failure handling

- No schema bump on production. No destructive downgrade is supported.
- When a current client sees versionchange, close its DB and deny new
  writes. Do not silently reload and lose unsaved answer state.
- Preserve original data and failed-autosave warning; no forced update.
- Do not clear IndexedDB/CacheStorage/site data or reset service workers.
- Keep draft vault and dual-host PRs #81/#84/#86/#88/#90/#92/#94/#96 separate.
- Do not merge a failing or unreviewed PR. The GitHub Pages production
  build remains at its existing /examprep-engine/ base and scope.

References: Dexie VersionError https://dexie.org/docs/DexieErrors/Dexie.VersionError
and IndexedDB versionchange guidance at
https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB .
