# ExamPrep Engine — Browser-first setup

This repository implements v0.1.0 on a development branch.
It is a React + TypeScript + Vite local-first exam application.

## Deployment
1. Review and merge the pull request into main.
2. Open Settings > Pages > Build and deployment > Source > GitHub Actions.
3. GitHub Actions installs dependencies, runs tests, builds and deploys.
4. Visit https://Yenuka2012.github.io/examprep-engine/.

## Use
Open Question Banks and upload a JSON file matching samples/demo-bank.json.
Choose a bank, select question count and time limit, and launch a practice exam.
Exam responses and completed results are retained in your browser IndexedDB.
Export a JSON backup periodically. Do not expect synchronization between devices.

## Security caveats
No login, server-side controls, encrypted-at-rest data, or encrypted backups.
Question banks imported through the application are not uploaded to GitHub.

## Next milestones
- Encrypted export, restore with validation, hardened input parsing
- PWA/offline caching
- Stronger import conflict/version handling
- More granular progress analytics and learning schedules
- Browser and mobile end-to-end testing
