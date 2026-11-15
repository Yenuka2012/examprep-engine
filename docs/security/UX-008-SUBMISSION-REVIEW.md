# UX-008 — P1 submission review + large navigator security review (2026-11-15)

Base PR: #149 at 2d7e1b506c9514d38ba6fc6a6a7110a7ca2b7c31; tracking #148; see overarching exam UI #136.

## Change scope
- The native exam submission confirm is replaced with a React modal displaying answered, unanswered, and flagged counts from existing derived examOverview; cancel/Escape does not call completion.
- The modal traps keyboard Tab/Shift+Tab within its actions and restores focus to visible submit trigger (or mobile submit fallback). An explicit confirm uses the **unchanged** completeExam(session), durable save queue, lock and attempt lifecycle.
- On timer expiry and session completion, the review dialog unmounts. Confirm is disabled at the expired deadline; existing automatic expiration submission is unchanged.
- The filtered five-column navigator scrolls within 51vh/480px at 150+ questions; labels and flags remain unchanged.

## Exact approved application UI pins
- src/App.tsx: 4cd044ac6281d131e79b394173f24d5d5ede7cfa
- src/styles.css: c421b8572e8f2a7d0e063a44533a29e6f866c5b1
Only those existing pins are updated in the production source freeze; all other pins and forbidden production asset/vault marker checks stay intact.

## Required validation
- npm ci --no-fund; npm run typecheck; npm test; npm run build; npm run audit; production isolation verification
- GitHub Actions CodeQL, Chromium/WebKit e2e, mobile WebKit, mixed-client and older-client barrier tests on exact merged head
- Manual iPhone/iPad and desktop focus/zoom test, very long question stem and 150-question scroll
- Review cancellation and Esc preserve answers and current index; confirming submission finalizes once; auto expiration still finalizes once; locked/failed storage remains fail-closed
- Verify no security implications from a focus-mode modal. Do not merge/deploy until gate approvals.

## Explicit exclusions
No changes to data schemas, IndexedDB, backup, cryptographic modules, lock ownership, scoring, deadlines, or the experimental vault. This modal is not a proctoring/security boundary. No external library added.
