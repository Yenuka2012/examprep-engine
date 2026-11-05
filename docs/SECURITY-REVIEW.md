# ExamPrep Engine — Security review (v0.2.1 corrective candidate)

## System boundary
- Public static React SPA hosted on GitHub Pages; no server-side identity, authorization, backend, cloud sync, runtime AI keys or third-party analytics.
- Imported question banks, answer keys, completed attempts and unfinished exam state stay in browser IndexedDB.
- Service worker caches public static assets only. Imported question content must never be cached in the service worker or uploaded.
- Browser profile/local operating system access is a trusted boundary; IndexedDB remains **plaintext at rest**.

## Threat model
| Threat | Control in v0.2.1 candidate | Residual risk |
|---|---|---|
| Malicious bank JSON | Ajv strict schema, semantic references, size limits and React escaped text | Browser/dependency compromise; denial-of-service edge cases |
| Dependency hijack | Locked exact npm dependencies, npm ci/audit, Dependabot, SHA-pinned GitHub Actions | Novel vulnerabilities, compromised upstream distribution |
| Unauthorized local access | No sync; local browser profile controls | Browser storage is **not encrypted** and extensions may access it |
| Lost backup file | AES-256-GCM encrypted bank/full exports; PBKDF2-SHA256 600k; random salt/nonce | Offline guessing of weak/reused passphrases |
| Corrupt/malicious backup | Authenticated decryption; validated frozen snapshots/scores; merge-only atomic restore | Unfinished sessions excluded from backup v1 |
| Stale exams/crash/two tabs | Web Locks exclusive owner; IndexedDB session migration; queued autosave, failed-write indicator, final durable flush | Browser storage eviction; abrupt OS/browser kill may interrupt any asynchronous write |
| XSS/anti-framing | React text escaping and meta CSP; no unsafe HTML rendering | GitHub Pages does not permit all security response headers |
| Unreviewed deployment | Verified same-run build/audit/tests/CodeQL gates, immutable Action commit pins | Main branch protections and independent human review **must be enforced in repository settings** |

## Implemented controls
- Question bank import limit 5 MiB, symmetric encrypted backup export/restore cap 64 MiB, bank question limit 10,000; oversized full histories still need a future chunked export format.
- JSON Schema 1.0 validated by Ajv strict mode; rejects unknown fields and duplicate/missing references.
- AES-256-GCM encrypted exports: 16-byte random salt, 12-byte random IV, PBKDF2-HMAC-SHA-256 with 600,000 iterations.
- All normal bank-export UI routes now encrypted; legacy plaintext exports can only be restored after a warning.
- Web Locks fail closed on unsupported browsers; queued exam writes recheck current ownership when executing.
- Autosave queue serializes writes and survives failures by allowing explicit retry. Final submit waits for the exact submitted state to persist or aborts.
- Legacy sessionStorage is cleared only after a matching IndexedDB migration commits.
- Validated restore merges without silently overwriting conflicting bank/attempt IDs; canonical JSON comparison avoids false conflicts caused solely by property order.
- Unit tests, Chromium and desktop/mobile WebKit browser tests, CodeQL JavaScript/TypeScript and GitHub Actions analysis; clean-checkout dev bootstraps the generated CSP-safe validator.
- CI deploy requires same-run verify, browser-tests, codeql-gate; Actions pinned to verified full commit SHAs.
- CycloneDX SBOM and SHA-256 asset hash artifacts generated during verify. These are **not signed provenance**.
- PWA caching limited to public app shell.

## Outstanding security work — not certified complete
1. Owner-enforced GitHub branch ruleset, required checks, independent PR approval, manual public HTTPS and physical iOS smoke tests.
2. Optional encrypted-at-rest vault with a fully reviewed key lifecycle; do not imply IndexedDB is currently private from browser-profile compromise.
3. Offline active-exam recovery from storage eviction: backup v1 excludes unfinished sessions, and browser storage persistence is advisory.
4. Browser Firefox coverage, accessibility audit, larger fault-injection/multi-tab stress suite and repeatable mobile Safari manual checks.
5. HTTP header-level CSP and anti-framing controls where infrastructure supports them (GitHub Pages limitations persist).
6. Credential/secret scanning policy, signed release provenance/attestations, dependency alert triage and release-risk acceptance.
7. Full exam state-machine separation and immutable bank-revision/attempt version management.
8. A separate server-side security design if accounts, cloud sync, authorization or AI integration are later authorized.

## Operational guidance
- Do not publish private/licensed question banks in source control, public issues or CI fixtures.
- Use a strong unique export passphrase and keep it in a password manager.
- Validate recovery periodically in a separate browser profile; no backend stores your data.
- Browser crashes, extensions, OS profile compromise and Safari/iOS storage pressure remain meaningful risks.
- This project is not certified against OWASP ASVS, ISO/IEC 27001 or other external standards.
