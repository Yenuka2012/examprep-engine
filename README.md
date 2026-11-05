# ExamPrep Engine
Personal, local-first examination engine for JSON question banks.

## Current status
v0.1.0 development release: question-bank import, validation, browser persistence, timed exams, answer review, domain analytics and manual JSON backup/restore.

### Security and limitations
- Browser local data is **not encrypted at rest**.
- Backup exports are **not encrypted**.
- No cloud synchronization, login, production-grade authorization, PWA offline caching, or AI API integration.
- Public source code on GitHub Pages does not contain imported question banks.
- This is a personal study tool, not an officially certified examination system.
- The sample questions are illustrative and not official certification exam questions.

## GitHub Pages setup
1. Merge the development pull request into main.
2. Under Settings → Pages, set Source to **GitHub Actions**.
3. Open Actions and inspect the **Test, build and deploy Pages** workflow.
4. Site URL: https://Yenuka2012.github.io/examprep-engine/

## JSON question bank format
Use `samples/demo-bank.json` as the reference. Each question needs a unique `id`, `type` (`single_choice` or `multiple_choice`), `domain`, `question`, `options`, `correct_answers`, and `explanation`.
Import JSON through **Question Banks** inside the app. Imported question banks stay in the local browser profile.

## Recovery
Export a JSON backup periodically. Restore backups through Question Banks. Store exported backups securely; they are unencrypted.

## Development
`npm install`, `npm run typecheck`, `npm test`, `npm run build`.
GitHub Actions runs the build automatically; a local terminal is not required for deployment.

## Planned v0.2
Encrypted backups, JSON schema hardening, PWA offline caching, question revisioning, study planner, richer analytics, E2E browser tests, and stronger CI security gates.
