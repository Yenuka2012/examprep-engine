# ExamPrep Engine — Security review (v0.2.0)

## System boundary
- Publicly hosted static React SPA at GitHub Pages.
- Imported question banks and exam attempts stay in browser IndexedDB.
- No server-side identity, authorization, cloud sync, runtime AI keys, or backend.
- Service worker caches built public assets only. It must not cache or upload private question data.

## Threat model
| Threat | Relevant control | Residual risk |
|---|---|---|
| Malicious JSON injection | Ajv strict schema, no rendering as HTML, bounded file sizes | Browser and dependency compromise still possible |
| Dependency hijack | committed npm lockfile, npm ci, audit gate, Dependabot, minimal direct deps | Unknown zero-days and dependency release compromise |
| Unauthorized local data access | No network synchronization, user device/browser security | IndexedDB is **not encrypted** |
| Lost or stolen backup file | AES-256-GCM encrypted exports, PBKDF2-SHA256 with 600k iterations | Weak or reused passphrases can be guessed offline |
| Corrupt backup | Authenticated encryption + strict question validation | Attempt history validation remains basic |
| Stale exams or crashes | IndexedDB active-session migration + durable autosave | Browser storage may be evicted, tab racing not fully prevented |
| XSS | React text escaping, restricted meta CSP, no unsafe HTML rendering | Meta CSP cannot enforce frame-ancestors or all HTTP-header policies |
| CI supply-chain risk | Read-only verify token, privileged deploy job, immutable dependency lockfile | Action tags are release tags, not SHA-pinned yet |

## Implemented controls
- File upload limit of 5 MiB; backup limit of 20 MiB; question limit of 10,000.
- JSON Schema v1.0 validation with Ajv strict mode; rejects unrecognized fields.
- AES-256-GCM encrypted backups with 16-byte random salt and 12-byte random nonce.
- PBKDF2-HMAC-SHA256 key derivation using 600,000 iterations.
- Authentication failure on decryption does not import data.
- Strict TypeScript, unit tests, GitHub Actions npm ci and npm audit.
- PWA caching of app shell only.
- Unfinished exam state persists in IndexedDB; completed exam and session deletion are transactional.

## Outstanding security work (do not treat as completed)
1. Optional encrypted-at-rest question vault with explicit lock/unlock and threat-model review.
2. Full test coverage for backup restoration and session lifecycle.
3. Browser-based end-to-end tests (Chromium/Firefox/WebKit) and accessibility checks.
4. SHA-pinning every GitHub Action after verifying full immutable commit digests.
5. CSP enforcement through server response headers where supported (GitHub Pages limitations).
6. Formal SBOM, SAST, secret scanning configuration, and provenance attestation.
7. Reliable cross-tab concurrency control and backup integrity/version migrations.
8. Secure multi-user service architecture only if future requirements demand it.

## Operational guidance
- Do not publish real private question banks into the public repository.
- Use a strong unique backup passphrase. Store it in a password manager.
- Do not rely solely on browser storage; periodically export and test encrypted backups.
- Browsers and extensions with access to the unlocked profile may access question content.
- Do not represent this as certified to OWASP ASVS, ISO/IEC 27001, or other standards.
