# ADR-003 — Portable dual-host deployment, private Ubuntu VM, device support

**Status:** Proposed, review required. **Date:** 2026-11-07. **Baseline:** v0.3.0 main `bcea4dc48612641458c0de3a97b3e519470664c3`. **Tracking:** #82, #83 and vault ADR-002 / PR #81.

## Decision

Maintain **one TypeScript/React/Vite offline-first examination engine** with **two supported hosting models**, built from the same audited source and locked dependencies:

- **H1 GitHub Pages**: free public static web application under `https://yenuka2012.github.io/examprep-engine/`; local-only encrypted browser vault after ADR-002 is safely implemented. The public app shell is visible to everyone and client vault unlock is **not authentication**. No backend, user registration, Supabase or external synchronization.
- **H2 Ubuntu VM**: dedicated self-hosted Ubuntu Server LTS on an isolated home-server network/VLAN. **Level A** serves the same static PWA over HTTPS through Caddy, accessible only on trusted LAN or via authenticated WireGuard VPN. **Level B (separate, optional)** introduces real server-authenticated sessions, backend APIs, authorization, PostgreSQL and carefully designed encrypted synchronization only if the single owner needs them.

One owner uses two UI workspaces, **Manage Content** and **Exam Practice**. A workspace switch is not privilege isolation or RBAC. Do not create multi-user identity flows.

## Trust boundaries and security invariants

| Boundary | H1 Pages | H2 Ubuntu Level A | H2 Ubuntu Level B (future) |
| --- | --- | --- | --- |
| Asset availability | Public static HTML/CSS/JS | LAN/VPN-only origin | LAN/VPN-only origin |
| App data | Encrypted IndexedDB per browser-origin/profile | Encrypted IndexedDB per browser-origin/profile | Explicitly designed API storage, with encryption/authorization assessed separately |
| User access | Local **cryptographic vault unlock**, not verified identity | VPN/network access plus cryptographic vault unlock | Independently verified server authentication/authorization plus vault controls |
| Backup | Portable authenticated encrypted export and tested clean-profile restore | Same format, independent local/VM backups | Separate server backup/recovery and end-to-end content confidentiality design |
| Runtime credentials | **No secrets in frontend** | **No secrets in static frontend** | Backend-only secrets, least-privilege server credentials |

- Public `github.io` paths share an **origin**; `/examprep-engine/` alone does not isolate IndexedDB/Web Locks/Cache Storage from other apps on `yenuka2012.github.io`. Adopt an exclusive HTTPS origin before treating local data as isolated from other origin applications. Stage migration and PR previews on a **distinct origin**, not a sibling path.
- A hostile same-origin script, compromised PWA update, malicious extension or compromised unlocked device can access decrypted data. CSP, integrity/reviewed code, controlled deployment, vault lock and endpoint hygiene reduce risk but cannot make a compromised unlocked browser trustworthy.
- No questions, answer keys, master secrets, recovery keys, decrypted exam results or private question-bank exports in git, public CI logs/artifacts, URLs, telemetry, service-worker caches, browser Web Storage or unencrypted indexes.
- Do not publish home IP, private infrastructure addresses, VPN keys or configuration secrets in this **public** repository. Private device/network design remains a separately protected asset. Do not expose the Ubuntu app, database or administrative ports to the internet.
- Zero mandatory paid dependencies. WireGuard, Caddy, PostgreSQL, Ubuntu and the current application dependencies have open/free deployment routes; confirm exact license and version compatibility before production approval.

## Deployment-portability design

1. Parameterize public base URL, router basename, manifest id/start_url/scope, icon URLs, offline navigation fallback and service-worker cache identity through a **build target** (e.g., `build:pages`, `build:ubuntu`). H1 uses `/examprep-engine/`; H2 uses `/`. Never edit code manually between targets.
2. Extract application domain contracts (`QuestionRepository`, `AttemptRepository`, `CertificationRepository`, `ExamSessionRepository`, `VaultRepository`) behind an encrypted IndexedDB adapter. Domain logic and UI must not depend on URL or backend availability. Do not refactor storage or data schema destructively.
3. Keep local-first, offline behavior, encrypted backup format and exam scoring consistent across hosts. Browser profile **and origin** isolation means H1 and H2 do not share active data; transfer requires explicit encrypted export/restore, with no implied cloud sync.
4. Model H2 Level B as a new, independently reviewed remote adapter with server-side authorization, session controls, CSRF assessment, API validation and migration strategy; not a simple change of a frontend flag.
5. Preserve strict schema versioning and compatible forward recovery. Existing v0.3.0 Dexie schema v3 / native IndexedDB v30 and logical-v2 encrypted backups cannot safely be downgraded to v0.2.1. Encrypted-at-rest migration from plaintext must be opt-in, journaled, read-back verified, and deletion of plaintext gated by separately verified recovery.
6. Service worker may cache *public static assets only*; no cached plaintext question or exam content; no aggressive activation while an exam or encrypted migration is active. Avoid cross-build cache collisions on either origin.

## H2 VM infrastructure baseline

- Use a supported Ubuntu Server LTS with timely unattended security patches, least-privilege deployment user, SSH key access (no password/root login), host firewall deny-by-default and management restricted to trusted management interfaces/VPN.
- Dedicated application/server VLAN, default-deny inter-VLAN rules with only explicit trusted paths, WireGuard peer authentication and revocation, no direct public app/API/database forwarding.
- Caddy HTTPS at a **stable** trusted private hostname or domain; browsers must trust the issuing CA. Use HSTS only with an understood private PKI lifecycle and usable recovery; prefer HTTPS from day one because PWA/crypto/service-worker behavior depends on secure contexts.
- Static Level A requires no persistent server database. Optional containers must be non-root/rootless where practicable, with read-only filesystem, pinned image digests, resource limits and restricted outbound egress; bare Caddy static serving is acceptable and simpler.
- VM and network monitoring: certificate renewal/expiration, update status, HTTPS health, disk space, backup status, host firewall/VPN logs; logs must not capture private question content or passphrases.
- Retain reproducible VM config/restore instructions. Application profile data must be backed up **from clients** using portable encrypted backups; VM snapshots do not back up browser vaults.

## Supported devices and acceptance matrix

**Required:** macOS desktop (Safari and Firefox/Chromium where available), Windows/Linux desktop browsers (Chromium and Firefox), **iPhone iOS Safari**, and **iPad iPadOS Safari**, both regular browser tabs and **installed Home Screen PWA** where supported. iPad is a first-class supported form factor, not assumed covered by iPhone emulation.

| Area | Desktop/Mac | iPhone | iPad |
| --- | --- | --- | --- |
| Vault enrollment, lock/unlock, recovery | Required | Required | Required |
| Bank import, exam navigation/timer, final durable submission | Required | Required | Required |
| Encrypted export/import using platform file controls | Required | Required | Required |
| Reload, interrupted exam, offline reopen after install | Required | Required | Required |
| Safari/WebKit storage persistence and background resume | macOS Safari | iOS Safari | iPadOS Safari |
| Responsive layout | keyboard, pointer, resizing | portrait/landscape where supported | **portrait, landscape, Split View/multitasking, touch and external keyboard** |
| WebAuthn PRF (optional) | verified per browser/authenticator | verified independently | **verified independently**, with passphrase fallback |

CI must include Playwright Chromium/WebKit/Firefox where reproducible; physical iPhone and iPad Safari/PWA checks are mandatory release evidence for compatibility-sensitive changes. Device and OS versions are captured in acceptance records; do not claim hardware sign-off from emulators.

## Deployment pipeline and release gates

- Maintain protected PRs and same-SHA `verify`, browser tests, CodeQL actions and JS/TS, dependency audit, SBOM and asset hashes. Separate staging, Pages production and Ubuntu packaging jobs; no direct pushes or bypasses to main.
- H1: only after passing all required checks, publish immutable reviewed assets with GitHub Pages Actions.
- H2: build verified artifact independently, record its commit/hash/SBOM, deploy to the private Ubuntu server by a pull-based/manual controlled process. No GitHub-hosted runner with an unrestricted inbound path or permanent privileged home-network secret. If automated later, use narrowly scoped ephemeral runner/credentials and explicit security review.
- Test both host base paths, PWA scope, CSP/headers, offline, secure-context behavior, encrypted migration/restore and error rollback. Avoid falsely claiming GitHub Pages can set arbitrary HTTP response headers.
- **No GitHub release or destructive migration** until v0.3.0 outstanding device, backup and failed standalone WebKit E2E evidence is reconciled (#83).

## Decision consequences

The single-owner encrypted-vault design is secure against disclosure of a *locked copied browser database* under its stated cryptographic assumptions, not against malicious content executing while unlocked. Ubuntu Level A adds access/network isolation, not centralized identity or automatic sync. H2 Level B is deliberately postponed to avoid excessive attack surface, operations burden and software complexity.

## Staged delivery / acceptance

- **M2.0** approve ADR-002 vault and ADR-003 portable dual-host architecture; reconcile release issue #83.
- **M2.1** implement config/build portability and storage contracts with identical unit/E2E behavior across H1/H2.
- **M2.2–M2.4** implement encrypted vault, robust non-destructive migration, owner UI and clean-profile restore.
- **M2.5** H1 release after security and physical iPhone/iPad acceptance.
- **M2.6** H2 Level A VM hardening and HTTPS/VPN static PWA deploy, with private-host acceptance.
- **M2.7** verify cross-host export/restore, offline behavior, backup and incident response.
- **M3 optional** server-side authentication, remote API and PostgreSQL only under a separate ADR and owner authorization.

**No runtime changes or production authorization occur by approving this design record.**
