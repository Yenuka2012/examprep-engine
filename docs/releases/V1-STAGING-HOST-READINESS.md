# v1.0 encrypted-owner HTTPS staging — remote host-readiness gate

**Status:** Engineering audit implemented. **Actual private VM, DNS/TLS trust,
VPN/firewall verification and physical Safari acceptance remain unverified.**
This is not a release authorization, encrypted migration or plaintext cleanup.

## What the audit does

The read-only `scripts/verify-owner-staging-host.mjs` performs bounded HTTPS
GET/HEAD requests against an **explicit exact origin**. It fails closed on:

- HTTP, a path under `yenuka2012.github.io`, credentials in URL, or loopback.
- HTTP redirects, unexpected response origins or non-200 static assets.
- Missing HTTP security headers: HSTS >= one year, `nosniff`, CSP including
  `frame-ancestors 'none'`, frame denial, no-referrer, same-origin CORP and
  restrictive camera/geolocation permissions; wildcard CORS is rejected.
- Missing `no-cache` / `no-store` on mutable HTML, manifest and worker.
- Missing encrypted owner mount, unbundled production JS, stale/wrong manifest,
  missing compiled service worker, absent icon, or invalid JS MIME/cache.
- Publicly reachable test harnesses, plaintext converter, alternative
  production entry or unexpected route (expected status: **404**).

It **does not** access IndexedDB, browser profiles, content, credentials, keys,
backups or user data. It never performs POST, mutation, migration or deletion.
A PASS is observable HTTP/TLS evidence only, **not** proof of firewall/VPN
configuration, DNS ownership, valid trust on iPhone/iPad, offline exam
continuity, security of the host OS or owner recovery.

The separate CI command

```bash
node --test scripts/verify-owner-staging-host.test.mjs
```

uses synthetic `Response` fixtures; it **does not contact a private host**.

## Host setup and operator prerequisites

1. Provision a separate Ubuntu VM on the owner-controlled, isolated server
   network. Confirm only authorized access over the intended LAN/VPN; avoid
   public administration ports, enforce default-deny ingress and patch the OS.
2. Configure a **different HTTPS browser origin** from
   `https://yenuka2012.github.io`. A different URL path on that origin
   is never sufficient. A sample private `exam.home.arpa` hostname is
   illustrative only, not a real provisioned service.
3. Configure a trusted TLS chain on **every physical owner device**. For an
   internal hostname this can require a securely deployed internal CA. Never
   disable TLS certificate verification to make an audit pass.
4. Adapt and independently review `ops/nginx-owner-staging.conf` to the
   verified hostname, certificate paths, VPN/firewall and security headers.
   No GitHub Actions workflow installs or enables that configuration.
5. From a trusted checkout, with the exact expected origin (no trailing slash):

```bash
npm ci --no-fund
npm run typecheck
npm test
npm run verify:vault-runtime
VITE_OWNER_STAGING_ORIGIN=https://YOUR-VERIFIED-HOST npm run build:owner-staging
npm run verify:owner-pwa
find dist-owner-staging -type f -exec sha256sum {} \; | LC_ALL=C sort
```

6. Transfer **only** the static files in `dist-owner-staging/` to the
   VPN-restricted Nginx document root. Do not transfer private owner question
   banks, passwords, plaintext datasets, encrypted backups or browser keys.
   Verify artifact hashes after transfer and perform `nginx -t` before a
   reviewed configuration change. Keep Pages source storage untouched.
7. From a **separate trusted machine on the intended VPN/LAN**, run:

```bash
node scripts/verify-owner-staging-host.mjs https://YOUR-VERIFIED-HOST
```

   Expected: a JSON result with `result: "PASS"`. Treat any failure as a
   deployment blocker; inspect it and repair the host before rerunning.
   Do not use `curl -k`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, request
   headers that bypass VPN, or a public fallback host.

## Release decision evidence (sanitized)

- [ ] Private VM OS patch/hardening, network isolation and VPN access reviewed
- [ ] Owner-controlled DNS and TLS chain verified on desktop, iPhone **and** iPad
- [ ] Nginx HTTP-header/route audit PASS from the intended network
- [ ] Static owner artifact hash list reviewed and rollback copy retained
- [ ] Encrypted master and recovery unlock tested on the real HTTPS origin
- [ ] Physical Safari/PWA lock, offline reopen, autosave, resume, exam finish,
      background/foreground, rotation and iPad multitasking pass
- [ ] Original browser logical-v2 encrypted backup restored in an **independent
      clean profile**, record counts and historical sample scores match
- [ ] Old legacy writers quiesced; active source exams completed, original
      browser/profile and encrypted backup preserved
- [ ] Separate explicit owner approval for any real-data cutover; **no**
      automatic plaintext deletion or migration

Track outcome in [fast-track release #144](https://github.com/Yenuka2012/examprep-engine/issues/144),
[host acceptance #132](https://github.com/Yenuka2012/examprep-engine/issues/132),
[source-writer safety #100](https://github.com/Yenuka2012/examprep-engine/issues/100),
and [backup/device acceptance #78 / #83](https://github.com/Yenuka2012/examprep-engine/issues/83).
Report pass/fail, device/browser versions, deployment commit and public-policy
metadata only. Never paste private host addresses, keys, backup files or
question banks into a public issue.
