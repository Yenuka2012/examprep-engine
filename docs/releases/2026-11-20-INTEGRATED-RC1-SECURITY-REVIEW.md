# ExamPrep — Integrated release candidate 20 November 2026

This integration branch is **NOT** an approved deployment. Base main: `d5bc05faeb4441c33979782f5a625cb1b6677718`.

Combined reviewed components:
- UI modernization #149 and #150: `65048ddf75aeaa50d9b71101d4bef4ecba7537e3`
- Question collection / full mock / merged domain practice #153, #154, #155: `1e747935637df8e6a352fa72bdce1551f08564ac`
- CISM 2026 and CRISC 2025 catalog JSON and generation guidance #156: `2451f72b9dd8dc4896e0785da7e2f95529864af7`

## Release-isolation source-hash reconciliation
The sole overlapping runtime approval file was `scripts/verify-production-isolation.mjs`. Preserve the collection/blueprint-specific exact-source approvals introduced by #153. Update only the approved UI production source pins from #150:
- `src/App.tsx`: `4cd044ac6281d131e79b394173f24d5d5ede7cfa`
- `src/styles.css`: `c421b8572e8f2a7d0e063a44533a29e6f866c5b1`
- Combined isolation manifest blob: `eee6bfd84896bde40b97ca6e8533dbf951c1301c`

Every other frozen source blob, package version lock, forbidden marker scan, old-client barrier, encryption protection and browser vault-isolation requirement remains unchanged. Do not weaken checks for green status.

## Release gates
- Exact RC head: `npm ci`, typecheck, Vitest, production build/source isolation and audit.
- Browser security/recovery tests on Chromium, desktop WebKit and emulated iPhone/iPad.
- Separate M2 encrypted-owner staging tests, 150-item mock, question pool, duplicate bank protection, multi-tab locks, backup/recovery, old mixed-client and source-write barrier.
- CodeQL and pinned dependency scrutiny.
- Real original browser encrypted full backup restored in *independent clean browser profile*. Compare banks, certifications, syllabi, attempts and representative results; no real passwords in GitHub.
- Distinct trusted HTTPS/VPN Ubuntu owner host, physical iPhone/iPad acceptance, offline/background timer tests, independent encrypted-owner restore, and non-destructive migration evidence.

**No go-live / main merge / original profile deletion until explicitly accepted.** A GitHub Pages push to main could deploy immediately. Do not mistake the browser-local vault for server authentication.

## Feature limitations
Question batches merge logically by exact certification + published syllabus version + domain. Full mocks use strict ISACA-style 150 questions, simulated 240-minute duration and raw practice accuracy, not an official score. Current catalog import remains two independent JSON files in encrypted-owner; one-file bundle issue #157 deferred.
