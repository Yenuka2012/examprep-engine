# ADR-002 — ExamPrep Engine single-owner encrypted vault on GitHub Pages

**Status: proposed design, NOT implemented or deployed.**
**Date:** 2026-11-07
**Base:** v0.3.0, main `bcea4dc48612641458c0de3a97b3e519470664c3`
**Owner:** sole authorized learner and administrator
**Tracks:** [BACK-004 #46](https://github.com/Yenuka2012/examprep-engine/issues/46), [BACK-005 #47](https://github.com/Yenuka2012/examprep-engine/issues/47), [SEC-004 #24](https://github.com/Yenuka2012/examprep-engine/issues/24), [BACK-003 #45](https://github.com/Yenuka2012/examprep-engine/issues/45)

## 1. Decision and scope

Build a **single-owner, offline-capable, encrypted local vault** with two workspace modes:
- **Manage content:** certification vendors, certification profiles, syllabus revisions, question banks, import, backups and local settings.
- **Exam practice:** choose a certification, take timed examinations, see personal results and learning analytics.

There are **no independent student accounts, public registration, multi-user identity database, Supabase tenancy, remote exam API or cloud synchronization**. The same owner uses both workspaces. Mode selection is UI organization, **not security-enforced RBAC**; privileged actions can require re-unlock to mitigate accidental operation.

Retain free GitHub Pages hosting and the existing React/TypeScript/PWA stack. Do not create a backend solely to simulate a personal login.

## 2. Mandatory security disclosure

GitHub Pages is **public static hosting**. Anyone who knows the URL can load/download the HTML, JS, CSS and public application shell. A client-only sign-in page cannot prevent this, establish a centrally verified identity, implement secure server-side sessions or prevent a local device owner from running modified JavaScript. Accordingly, call the gate **Unlock private vault**, not server-authenticated login.

**Security goal:** Without the correct locally held master secret or validated backup recovery secret, an attacker copying locked browser storage should not be able to decrypt the private question banks, answer keys, history, catalog and active examination state. Public web assets may be seen by anyone. During an unlocked session, compromised same-origin code, extensions or the endpoint can read decrypted content.

On `https://yenuka2012.github.io/examprep-engine/`, all other Pages applications served under `https://yenuka2012.github.io` share the same browser **origin**, regardless of repository path. For stronger origin isolation, favor a dedicated `github.io` username hostname or an owned custom domain. Do not assume the `/examprep-engine/` path isolates IndexedDB from other projects.

**Privacy invariants:** No private exam questions or passphrases in source, assets, CI output, logs, URLs, analytics, telemetry, localStorage, sessionStorage, service-worker caches, or shared public files. Never claim the system protects data against a compromised unlocked device.

## 3. Desired owner journeys

1. **Initial setup:** Verify the existing encrypted v0.3.0 backup has been exported and restored to a separate browser profile. Owner creates a **strong, unique master passphrase** (prefer a password-manager-generated secret or 6+ randomly selected Diceware-style words). Explain that no server-side password reset exists.
2. **Vault enrollment:** Generate a cryptographically random 256-bit data-encryption key (DEK), a versioned KDF salt and a wrapped DEK; write only KDF parameters, authenticated wrapped key and encrypted data to IndexedDB.
3. **Unlock:** Derive a key-encryption key from the entered passphrase, authenticate and unwrap the DEK. Wrong secrets fail closed with generic feedback. Never persist the passphrase.
4. **Workspace:** Display Manage Content and Exam Practice modes only after successful unwrap. Workspaces use the same vault and owner.
5. **Lock:** Explicit Lock, inactivity and lifecycle timeouts flush safely persisted encrypted examination changes then discard key references and decrypted UI state; new operations require unlock. In-memory zeroization in JavaScript is best effort, not a hard guarantee.
6. **Backup/recovery:** Export an authenticated encrypted, versioned portable backup of the entire logical vault; test restore to a fresh browser profile. Provide a separately generated recovery method, also protected with a distinct secret or printed recovery key, with clear one-time disclosure and loss warnings.
7. **Mac/iPhone/iPad/iPad:** Each browser origin/profile/device has its own vault records. iPadOS Safari (browser and installed Home Screen PWA) must be tested independently from iPhone Safari; iPad portrait/landscape, split-view, touch, external keyboard, encrypted export/import, file picker, offline reopen, device suspension and storage eviction are first-class acceptance cases. Without remote sync, encrypted export/restore is the ONLY supported transfer. Do not imply synchronized cross-device exam progress.

## 4. Cryptographic architecture (review before implementation)

- Encrypt all private data **at rest** before writing to IndexedDB. The existing `examprep-v1` Dexie v3 database is plaintext and must not remain the authoritative long-term store after migration.
- Generate a fresh random **AES-256-GCM DEK** via Web Crypto. Use a distinct random 96-bit nonce for every encrypted record version, and authenticated additional data (AAD) containing schema version, opaque record ID, record class and vault ID; never reuse nonce/key combinations. Do not leave names, correct answers, results, question text or sensitive metadata as plaintext searchable indexes.
- Derive a **key-encryption key** from the master passphrase with an audited, benchmarked Argon2id implementation when compatible with Safari/iOS CSP and memory limits (OWASP minimum 19 MiB, t=2, p=1; prefer stronger benchmarked settings). If Argon2id cannot be validated on all target devices, use native Web Crypto **PBKDF2-HMAC-SHA-256 with at least 600,000 iterations**, a fresh per-vault salt, and explicitly record its KDF version. This is a portability fallback, not an invented Argon2id support guarantee.
- Wrap the DEK using AES-KW or authenticated AES-GCM under the KEK with versioned metadata; separate a recovery-wrap secret from the regular passphrase. The wrong key must not unlock a vault or produce an accepted plaintext.
- Encrypt records using stable envelope types and validated, bounded serializers; disallow unknown future schema versions, truncated ciphertext and tampered AAD.
- Use only audited dependencies and pinned immutable CI actions. Any WASM KDF requires bundle/CSP/supply-chain review before acceptance.
- Browser crypto keys should be nonextractable where supported, but this does not protect them against hostile JS operating while the vault is unlocked.
- **No offline retry limit can prevent offline password guessing once ciphertext is copied**. Use secret entropy and a work-factor KDF; UI throttling is only a convenience and DoS mitigation.
- AES-GCM detects unauthorized ciphertext alteration but cannot by itself prevent a whole-database replay/rollback or deliberate deletion without a trusted external monotonic state.

## 5. WebAuthn/passkey design boundary

WebAuthn credentials without a server can provide an optional **PRF-backed encryption-key unlock** when authenticators and browsers support the `prf` extension. Verify actual `prf` output and user verification on macOS Safari/Firefox and iPhone/iPad Safari before offering enrollment; do not assume device-wide compatibility or silently fall back to a weaker method.

A client-only WebAuthn assertion **is not independently verified server authentication**, so a biometric/passkey prompt by itself is not an access-control boundary. The PRF must supply real cryptographic key material to unwrap the DEK; ordinary WebAuthn UI without such material is insufficient. Always preserve a separately tested strong-passphrase/recovery path.

## 6. PWA/session behavior

- Locked state is the default on fresh load, refresh, tab restore and after inactivity; never load decrypted content until vault unlock succeeds.
- No decrypted exam snapshots, full banks or key material in service-worker caches, localStorage or sessionStorage.
- Default inactivity lock policy: initially 5 minutes; require testing for iPhone background suspension and Mac/iPad browser tab lifecycle. Evaluate `visibilitychange` and `pageshow` timestamp checks, not timers alone.
- Before lock, queue and commit final encrypted exam state; on failure, visibly preserve the unlocked session or fail closed with an actionable backup/recovery path. Do not silently discard answers.
- Cross-tab Web Locks for vault writes, active exam ownership and secure migration; when one tab locks, other tabs must revalidate state. A UI mode is not authorization.
- Keep PWA update `skipWaiting=false`, block schema/key-format upgrade while a saved exam remains, and maintain a backward-compatible emergency reader. Avoid static rollback to v0.2.1 for Dexie v3 profiles.

## 7. Non-destructive legacy migration

**No automatic migration or plaintext deletion on page load.** Use a separate new encrypted vault store/database.

1. Export full logical-v2 encrypted backup from v0.3.0 and **verify restore** in an isolated browser profile; confirm there is no unfinished exam or safely preserve it under an explicitly tested migration path.
2. Create and unlock new vault; persist key wraps and encrypted records transactionally or with a resumable migration journal.
3. Read each legacy record, validate original schema and relation integrity; encrypt and write into the new store. Keep same record IDs logically, but do not expose them in plaintext storage indexes.
4. Read back/decrypt every new encrypted record, compare canonical values/counts/references and verify a fresh encrypted-vault export/restore from a separate profile.
5. Only after validated migration, explicit user approval and recovery backup verification, remove legacy plaintext IndexedDB records. Warn that clearing site data before completing migration can cause permanent loss.
6. Document how to detect interrupted migrations, resume safely, handle duplicate IDs, roll forward with compatible schema, and never silently overwrite data.

Because `github.io` is a public shared-origin namespace, migrating the existing production browser database must undergo physical Mac/iPhone/iPad/iPad verification on an **isolated staging origin**, with strictly synthetic data, before any production migration is offered.

## 8. Explicit exclusions

- No Supabase, Cognito, OAuth token, server session cookie or external user accounts in this single-owner design.
- No true admin/student RBAC (same sole owner), no user management, no centralized multi-device sync.
- No claim that a public GitHub Pages shell is private or that unauthenticated visitors cannot load the UI.
- No client-only login based on a hard-coded user/password hash or comparing passwords in public JS.
- No promise that browser storage survives eviction; backups remain mandatory.
- No disabling developer tools, blocking copy/paste/password managers or relying on cosmetic anti-inspection tricks.

## 9. Mandatory automated and manual acceptance gates

- Encrypted-at-rest scan: locked IndexedDB, Cache Storage and Web Storage contain no recognizable private question text, correct answers or exam results.
- Wrong passphrase, tampered ciphertext, corrupted salt/KDF/nonce/AAD and invalid backup formats fail closed without affecting existing records.
- Repeated independent encryption must use distinct nonces and ciphertext; no nonce collisions under normal operation.
- Atomic crash/interrupted migration: recover without losing original data; mismatch blocks deletion.
- Cross-tab lock contention, background auto-lock, reload after unlock, power interruption, failed autosave and browser storage eviction tests.
- Locked application never exposes privileged UI data; all admin/practice operations require an active unlocked vault.
- WebKit iPhone/iPad/macOS, Chromium and Firefox browser coverage; iPadOS Safari (normal tab and Home Screen PWA) in portrait/landscape and split-view, touch/keyboard, vault lifecycle, backup/import and background lock tests; test with and without PRF availability.
- Verify encrypted full-vault export and restore in a separate clean profile, including catalogs, completed attempts and active-exam policy.
- Full npm audit, TypeScript/unit/E2E, CodeQL and protected Pages deployment unchanged; no weakened CSP or test skip.
- No production merge or destructive storage migration without owner acceptance and tested recovery.

## 10. Sequencing

**M2-S1:** Approve this threat model and select final crypto KDF/host-origin policy.  
**M2-S2:** Build vault envelope, KDF, storage repository adapters and adversarial unit tests.  
**M2-S3:** Implement owner setup/unlock/lock screen and Manage Content/Exam Practice navigation.  
**M2-S4:** Non-destructive migration, fresh-profile recovery, iPhone/iPad Safari and cross-tab tests.  
**M2-S5:** Optional PRF-backed passkey unlock only where support is verified; release through protected CI.

## Sources

- GitHub Pages public visibility: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- GitHub Pages static hosting: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- OWASP HTML5 client storage: https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html
- OWASP password KDF guidance: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- MDN Web Crypto API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
- MDN WebAuthn PRF extension: https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions
