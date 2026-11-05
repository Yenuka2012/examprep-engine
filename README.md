# ExamPrep Engine

A free, browser-based, local-first exam preparation application for multiple certifications.

## Available capabilities (v0.2.0 candidate)
- JSON question-bank import with strict schema validation (single- and multiple-choice)
- Timed examinations, question navigation, flags, scoring and answer review
- Persistent local question banks, history, and unfinished exams using IndexedDB
- Domain-level learning analytics
- AES-256-GCM encrypted JSON backup export and restore
- Scoped offline-capable PWA (after first online load)
- CI typechecking, unit/security tests, reproducible npm ci, dependency audit and GitHub Pages deployment

## Security boundaries
The application source is public. Uploaded questions and answers stay in local browser storage, **not encrypted at rest**. Encrypted backups require a strong unique passphrase. This is not an officially endorsed or proctored exam system.

## Deployment
1. Review the [security modernization pull request](https://github.com/Yenuka2012/examprep-engine/pulls) and verify all checks pass.
2. Merge to `main` after validation.
3. Set **Settings → Pages → Source → GitHub Actions**.
4. Open https://Yenuka2012.github.io/examprep-engine/ after a successful Pages deployment.
5. Download the [sample bank](samples/demo-bank.json) and import it through **Question Banks**.

## Development pipeline
GitHub Actions performs the work without a local environment:
```sh
npm ci
npm audit --audit-level=high
npm run typecheck
npm test
npm run build
```

## Data format
`samples/demo-bank.json` is the canonical import example. The schema permits 1–10,000 questions per bank, up to 8 answer options per question. Uploaded JSON must use `schema_version: "1.0"`.

## Operations
- Question banks, exam answers and history are specific to each browser profile.
- There is no cloud synchronization or server-side authentication.
- Export encrypted backups routinely, retain the passphrase safely and periodically test restore.
- Read the [security review](docs/SECURITY-REVIEW.md) and [roadmap](docs/ROADMAP.md).
