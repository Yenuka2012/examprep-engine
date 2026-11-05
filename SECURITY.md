# Security policy

ExamPrep Engine v0.1.0 is a **personal local-first prototype**, not an authentication service or proctored exam platform.

- GitHub Pages serves public application code. Never commit confidential question banks, credentials, tokens, or real exam content.
- Uploaded question banks are stored locally in browser IndexedDB; this is **not encrypted at rest**.
- Anyone with access to your unlocked browser profile may access question banks and answer keys.
- Only import JSON you have the right to use. Reject files above 5 MiB or containing more than 10,000 questions.
- Exported JSON backups are **unencrypted** in v0.1.0. Store them securely.
- Do not use this application to store secrets or regulated personal information.
- Browser storage can be cleared or evicted; maintain manual backups.
- Avoid adding third-party trackers or rendering imported strings as HTML.
- Report vulnerabilities privately to the repository owner. Do not post sensitive exploit details publicly.

## Planned hardening
Encrypted export/restore, explicit migrations, offline PWA caching, CSP tuning, import stress tests, CI dependency gates, and optional authenticated backend are future milestones. Do not treat them as already delivered.
