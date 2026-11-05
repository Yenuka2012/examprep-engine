# Security policy

ExamPrep Engine v0.2.0 is a personal, local-first examination tool.

## Supported release
Only the latest merged and validated release on `main` is supported.

## Data protection
- The application and source code are public on GitHub Pages.
- Question banks imported through the app are browser-local and **not encrypted at rest**.
- Completed exams and unfinished session data are also stored in browser IndexedDB.
- Backup exports are protected using AES-256-GCM with a passphrase-derived key.
- Backup files cannot be recovered if the passphrase is forgotten.
- Do not commit private study content, exam dumps, credentials, API tokens or personal secrets.
- A malicious extension, compromised endpoint or unlocked browser profile can read local question data.
- Browser storage can be evicted; export and securely retain encrypted backups.

## Upload security
- Imported questions must conform to the strict versioned JSON schema.
- Invalid question types, answer keys, IDs, unexpected fields and oversized inputs are rejected.
- Imported questions must not be trusted as HTML or executable content.

## Reporting
Report vulnerabilities privately to the repository owner. Do not disclose sensitive exploit details publicly.

See [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md) for security controls, trust boundaries and remaining work.
