# EX-002 / EX-003 — Browser acceptance test plan

**Target:** PR #64, secure single-writer exams.  
**Status:** Evidence pending — unit tests alone do not close either issue.

## Mandatory acceptance scenarios

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| E2E-01 | Fresh exam startup | Import synthetic bank, start, answer Q1, flag Q2 | Exam persists, no unexpected overwrite |
| E2E-02 | Hard reload | With active exam, reload owning tab | Question index, selected answers and flags restored; original deadline unchanged |
| E2E-03 | Competing tab | Keep owner tab open, open site in a second tab | Second tab shows read-only notice; cannot save or submit |
| E2E-04 | Controlled takeover | Close owner tab, use Resume here in second tab | Second tab becomes sole writer and reloads latest durable state |
| E2E-05 | Simultaneous takeover | Release owner and click Resume on two tabs | At most one tab gets exclusive lock |
| E2E-06 | Existing saved exam | With saved unfinished exam, open a second tab before starting another | Existing session returned; no replacement of original questions |
| E2E-07 | Expired timer | Leave tab closed past deadline, reopen | At most one completed attempt, correct frozen answer snapshot |
| E2E-08 | Rapid answer edits | Quickly select/flag/navigate, then reload | Last *durably completed* autosave restored; no state corruption |
| E2E-09 | Unsupported lock | Test browser environment where navigator.locks is unavailable | Editing/start fails closed with explanatory UI; existing state not modified |
| E2E-10 | Quota/permission error | Deny IndexedDB access or exhaust storage | Error displayed and existing saved exam is not silently deleted |
| E2E-11 | Two-tab finish race | Finish in owning tab while second tab is blocked | One attempt recorded; no duplicate or stale overwrite |
| E2E-12 | Mobile Safari / WebKit | Repeat start/reload/secondary tab/takeover | Same invariants hold; fallback if API unsupported |

## Evidence required per test
- Browser/version, OS, viewport, commit SHA, execution date and exact result.
- For failures: anonymized reproduction steps, console error without private questions, linked Issue.
- Use only synthetic question banks; never upload private or licensed content into public artifacts.
- Explicit QA signoff for Chromium, Firefox and WebKit/Safari.
- No release or issue closure until all P0 invariants are verified.

## Developer notes
- `src/examLock.ts` uses Web Locks exclusive origin-wide coordination. No time-based lease stealing.
- `src/examPersistence.ts` rejects stale session writes and transactionally submits/deletes the active attempt.
- A blocked tab may retry after the owner tab releases the lock.
- No assumption is made that a compiled frontend has passed real-browser testing.
- The current first-release implementation still stores question banks and active exam data unencrypted in IndexedDB.
