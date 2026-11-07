# ADR-004 — Encrypted-only destination boundary and zero legacy fallback

**Status:** PROPOSED, M2.3 synthetic-only. Tracking issue #104 and prerequisite
#100. **Not production-integrated, not a cutover authority.** As of 8 November
2026, protected production baseline after PR #102 is
`dccdd5e97290dd85b21f9016686025d43086844f`.
The real `examprep-v1` IndexedDB remains plaintext at rest.

## Decision

Build a separate destination boundary that **never depends upon a legacy source
adapter** once the owner has unlocked the real authenticated encrypted vault.
The browser never silently switches from encrypted-only mode to a plaintext
source if ciphertext is absent, authentication fails, the owner Web Lock is
lost, or encrypted journaling is incomplete.

The current implementation, `src/cutover/encryptedOnlyDestination.ts`,
is a pure injected **synthetic** seam for design and adversarial tests.
It does not import Dexie, `src/db.ts`, the production application, the
experimental vault or a migration journal. It never opens/changes/deletes
browser storage. It does not validate credentials or perform AES-GCM;
it relies on the future reviewed and tested `OwnerVaultSession`
port from draft #90/#92, which performs authenticated decryption behind
an exclusive owner Web Lock.

## Destination session phases

| Phase | Permitted operations | Denied operations |
| --- | --- | --- |
| LOCKED | Attach an independently verified vault session | Reads, plaintext fallback, migration |
| ENCRYPTED_ONLY | Read authenticated vault records by opaque UUID | Unverified session, legacy IDB access, key-check/journal content |
| RECOVERY_REQUIRED | Report terminal failure; preserve the original encrypted vault | Reattach, silent fallback, overwrite, clearing storage |

**A marker in localStorage/IndexedDB, a boolean flag, or a caller-supplied
session-like object is not itself a cryptographic proof of readiness.** This
module is not exposed to production. Its future adapter MUST bind actual
vault header/verifier identity and authenticated inventory (S2/S3), validate
the encrypted migration journal (S4), and provide a safe explicit owner
recovery flow. Use no synthetic state to authorize migration.

## Threat model and invariants

1. A real historical v0.3.0 tab/installed PWA can write the old DB even while
   updated clients hold the source Web Lock (verified in protected production
   PR #102, across Chromium/WebKit and emulated iPhone/iPad). Native IndexedDB
   version changes do not confer write revocation.
2. The encrypted destination DB has a different name,
   `examprep-secure-vault-v1`. A stale client may continue to
   modify its old plaintext DB. The encrypted-only runtime never queries or
   merges that legacy database after a future explicitly approved cutover.
3. After an in-flight encrypted read begins, user lock, browser background
   lock, or any failed concurrent authentication invalidates its generation.
   A late-resolving decrypted value is never returned across that boundary.
   UI components MUST clear any already-rendered decrypted state on lock.
4. Missing encrypted record returns `undefined` with no fallback.
   Cryptographic/session failure changes the session to
   `RECOVERY_REQUIRED` and blocks further reads without exposing
   sensitive exception details.
5. Internal `key-check` and `migration-journal`
   record types must never be served as content records. Only the five expected
   encrypted content classes are returned. This code does not promise the
   decryption verifier validates each content schema; the next adapter must.
6. Different HTTPS origins, browser profiles, standalone PWA installations,
   physical iPhone/iPad and the Ubuntu VM do not share browser storage,
   Web Locks or a service-worker controller. Hosting portability uses verified
   authenticated encrypted backup/restore; there is NO automatic sync.
7. GitHub Pages serves a public JavaScript app shell. Unlocking a browser
   vault is cryptographic local authorization, NOT server authentication.

## Required implementation gates before integration

- Review/merge the dual-host architecture and portable build drafts #84/#86
  in an appropriate order. Keep one React/TypeScript/PWA codebase.
- Review, rebase, harden and integrate vault crypto/owner lock/recovery
  PRs #88/#90/#92, then synthetic journal/readiness #94/#96. Do not merge
  stacked PRs blindly or add competing ad hoc crypto.
- Complete genuine owner post-v0.3 logical-v2 encrypted backup export and
  clean-profile full restore (#83/#78), plus physical iPhone AND iPad Safari
  and standalone PWA tests. Logical-v2 backup excludes active sessions.
- Acquire original `ExamLock` **before** exclusive
  source-write lock for any future source audit. Verify zero unfinished exams,
  stable complete source fingerprint, durable encrypted journal, immutable
  checkpoint/resume, and independently restored ciphertext-only backup.
- Owner must separately authorize non-destructive live migration **before**
  any copy. A second later explicit authorization is mandatory before
  removing plaintext. Never clear IndexedDB, caches, or downgrade schema as
  a "rollback".
- Establish locked/unlocked/idle/background/cross-tab error behavior on
  physical Safari; test exception handling and no decrypted-state retention
  in React. The current synthetic seam does not itself prove hardware safety.

## CI and operations

New `*.test.ts` tests run under existing `npm test`
in protected CI with strict TypeScript, audit, source-lock and genuine
historical-build browser suites, CodeQL JS/TS and Actions. Neither this
module nor its synthetic fixtures are imported in the app entrypoint;
production application behavior and emitted Pages asset bundle must not change.

**No migration, cleanup, vault enrollment, data inspection or production
release is authorized by this ADR.** Issue #104 and #100 remain open until
the full audited application integration and user recovery evidence.
