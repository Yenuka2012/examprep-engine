# PWA-001 / PWA-002 — Offline integrity and update control

**Status:** proposed; review PR CI and real-device evidence before issue closure.

## Design contract
- Workbox **precaches static application shell assets only** (JavaScript, CSS, HTML, icons and manifest).
- There is no runtime cache of JSON imports, question banks, attempt history, database contents, or backups.
- All private data remains in browser IndexedDB; encryption-at-rest is a separate tracked risk.
- A new service worker is **prompted, never auto-activated by app configuration**.
- The Update button checks exclusive Web Locks ownership and active-session storage before attempting activation.
- Existing exam tabs must finish the examination before a user-approved worker activation.
- All active browser tabs should reload only after an update is explicitly approved.
- An already-active service worker cannot prevent a user or browser from forcibly closing or reloading a tab.
- Cache Storage is not a backup. Eviction may remove both app assets and IndexedDB content; preserve an encrypted file backup.

## Threats and verification
| Test | Expected invariant | Environment |
|---|---|---|
| First installed launch | App shell cached after service worker controls page | Chromium / WebKit |
| Offline revisit | App loads app shell, imported questions remain locally available | Chromium / WebKit |
| Cache inspection | No user question-bank IDs, answers or uploaded JSON in Workbox Cache Storage | Chromium / WebKit |
| Offline exam | Timed examination works without network access; navigation and answers persist | Chromium / WebKit |
| Active exam / update | Activating a waiting worker is blocked until the exam is completed | browser integration, additional worker-upgrade fixture needed |
| Mobile layout | No horizontal overflow at 390px mobile viewport; key actions remain usable | WebKit mobile emulation |
| Mobile backup | Downloaded backup can be restored on a fresh browser profile | WebKit, additional platform/device testing |
| Private browsing and quota | Browser may deny persistent storage or remove local content | Real-device UAT |

## Manual acceptance instructions
1. Launch the app online and import only a **synthetic** question bank.
2. Confirm service worker installation and reload until `navigator.serviceWorker.controller` exists.
3. Switch browser network to offline and reload. Confirm the home dashboard loads.
4. Start an exam and verify answer selection, navigation, timer and reload recovery.
5. Inspect Cache Storage for imported question text or ID; neither should be present.
6. On mobile Safari and Android Chromium, check the import flow, exam navigation, encrypted backup and restore.
7. Publish a subsequent test build in a controlled environment and confirm the Update button never reloads an active exam.
8. Confirm GitHub Pages remains scoped to `/examprep-engine/`.

## Known limitations
- iOS WebKit emulation is not equivalent to testing physical iOS Safari home-screen apps.
- No technical guarantee against browser storage eviction; persistent storage is not universally granted.
- Offline site must have loaded and cached its shell at least once while online.
- This PR is scoped to PWA and mobile resilience. It does not close the other security acceptance and encryption tasks.
