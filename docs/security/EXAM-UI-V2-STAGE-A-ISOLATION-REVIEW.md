# Exam UI v2 Stage A — release-isolation review record

**Tracking:** #136; implementation PR #142; design PR #137 (separate draft)  
**Status:** Candidate implementation under review; no production authorization  
**Review date:** 2026-11-13

## 1. Why a release-isolation baseline update is required
`scripts/verify-production-isolation.mjs` is deliberately fail-closed. It pins every ordinary production source blob from the v0.3.2 candidate. Modifying `src/App.tsx` or `src/styles.css` intentionally causes the gate to fail until the **exact changed bytes** have been reviewed and added to the pin list.

The initial #142 CI run reached the production-isolation step after successful dependency audit, TypeScript, unit/security test and production build steps, then stopped because the reviewed v0.3.2 App/CSS pins no longer matched. This is expected evidence that the guard operates, **not** a reason to remove or disable it.

## 2. Stage A change review and attack-surface constraints
- `src/App.tsx`: theme/focus/drawer presentation state; React-rendered question and navigator views; semantic answer fieldset, question-heading focus, keyboard drawer close/Tab wrap; a mobile Submit button uses the **same** `submissionReview` and `completeExam` flow as desktop. No unsafe HTML injection or remote endpoints.
- `src/styles.css`: scoped exam presentation colors, layouts, responsive drawer/bottom controls; CSS only, no imported remote assets.
- `e2e/exam-workspace.spec.ts`, `e2e/mobile.spec.ts`: synthetic browser-only acceptance; no real owner data.
- Unchanged: `src/types.ts`, `src/schema.json`, `src/db.ts`, `src/crypto.ts`, `src/backup.ts`, `src/examLock.ts`, `src/examPersistence.ts`, vault and cutover modules, production build scripts and dependencies.
- No additional persistent state or new IndexedDB schema; theme/focus/drawer states are in-memory and can reset on reload.
- No new permissions, dynamic code evaluation, user-supplied HTML, cloud sync, or provider secrets.
- This PR does **not** implement a new Study Mode, complex item types, adaptive scoring, browser proctoring or encryption cutover.

## 3. Exact candidate pins
- `src/App.tsx` Git blob SHA: `d28afe582882a98366c19476075943c579978f45`
- `src/styles.css` Git blob SHA: `6607c31dc52a296c76e6159f6394d30727a09db1`

No change to the meaning of the gate: all other ordinary source hashes remain frozen; new ordinary `src/` and `public/` files remain rejected; build output is still scanned for synthetic vault markers and the test harness. These pins must be updated again by explicit review if either file changes.

## 4. Release gates and acceptance
- Verify TypeScript/build/unit/security/dependency audit on the final commit.
- Verify gate now passes using exact blob pins above, no exceptions or allowlist disabling.
- Validate GitHub Actions desktop Chromium/WebKit, mobile WebKit, security/barrier and CodeQL gates on the final commit.
- Manually test on real iPhone/iPad Safari/PWA (portrait and landscape): no horizontal scrolling, question readability, drawer open/Escape/close, timer and autosave warnings, Submit review, safe reload/answer recovery.
- Verify offline baseline and existing encrypted backup/restore independently before merging.
- No production deployment/migration or branch-protection override is authorized by this document.

## 5. Risk decisions
- Visual focus mode is not a security boundary and not proctoring; it merely hides non-essential navigation.
- Owner question data in the current production IndexedDB path may remain plaintext until the separate encrypted-only M2 cutover is verified and authorized.
- Browser storage may be evicted; the existing encrypted export workflow is still necessary and unfinished exams remain excluded from logical-v2 backup.
- The broad integration of typed question formats is reserved for Stage B and must not be combined with this UI-only release.
