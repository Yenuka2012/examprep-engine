# ExamPrep Certification Catalog JSON Standard v1.0

Status: ready for the existing TWO-FILE JSON import in the isolated encrypted-owner staging application, not yet a one-click bundle importer.
Verified source date: 2026-11-16. No source data, IndexedDB, exam history, encryption or deployment-gate changes in this documentation PR.

## Existing direct-import formats

- CertificationProfile JSON: exactly id, name, provider, createdAt.
- SyllabusVersion JSON: id, certificationId, version, title, domains, status, revision, createdAt, updatedAt, plus optional sourceUrl and reviewedAt.
- Domains: code, name, weight (integer), objectives (1–20 original concise summaries).
- Version identity: certificationId/version (examples: CISM/2026, CRISC/2025).
- Domain codes D1 through D4 in official syllabus order, with weights totaling 100 percent.
- All timestamps UTC ISO 8601 with 3-digit milliseconds; reviewedAt YYYY-MM-DD.
- All example syllabi are status=draft, revision=1; do not auto-create publishedAt. User reviews and explicitly publishes using authenticated owner UI.
- Existing source question-bank JSON schema v1.0 is unchanged.

## Ready-to-import example files

For CISM:
1. catalog/profiles/cism.certification.json
2. catalog/profiles/cism.2026.syllabus-draft.json

For CRISC:
1. catalog/profiles/crisc.certification.json
2. catalog/profiles/crisc.2025.syllabus-draft.json

Domain names and weights are sourced from ISACA's public official exam-content outline pages; objective text is original study-area summaries, not verbatim objective content, endorsed instruction or full official bullet coverage.

## Import workflow for encrypted owner staging

1. Open the separately hosted, HTTPS encrypted-owner build. Unlock the vault.
2. Select Certifications then Certification JSON; upload the corresponding certification JSON.
3. Select Syllabus JSON; upload the corresponding syllabus draft JSON.
4. Verify source, version, domain names, percentages and objective coverage. Use the existing editor to publish the reviewed draft as an immutable version.
5. Import validated question-bank JSON with matching certification and syllabus_version. Verify resolved domains and question counts. Conduct separate encrypted backup/restore testing before using real data.

The two files are NOT an atomic multi-record package. If the certification succeeds but the syllabus fails, do not reset the vault; preserve the first record and retry only the failed item after inspection. Import is add-only; an existing identity must never be overwritten.

The GitHub Pages CatalogPanel currently supports manual editing and does not implement these JSON file controls. This is not an upload to a remote service; it is local parsing followed by encrypted-owner storage.

## Official references, checked 2026-11-16

CISM exam outline (effective 2026-11-03), weights 18/20/33/29:
https://www.isaca.org/credentialing/cism/cism-exam-content-outline
https://www.isaca.org/about-us/newsroom/press-releases/2026/isaca-updates-cism-exam-content-outline-factoring-in-todays-technologies-security-responsibilities

CRISC exam outline (effective 2025-11-03), weights 26/22/32/20:
https://www.isaca.org/credentialing/crisc/crisc-exam-content-outline
https://www.isaca.org/about-us/newsroom/press-releases/2025/isaca-updates-cdpse-and-crisc-exams-to-reflect-latest-risk-and-privacy-priorities

## Compatibility and security

- Certification IDs must match existing question-bank certification and future blueprint IDs exactly, without unsafe fuzzy name matching.
- Existing published syllabus revisions and historical attempts are immutable.
- If an ID or version is already in the encrypted vault, require explicit conflict inspection and do not silently replace it.
- Generated JSON should never contain actual exam dumps, credentials, backups or paid copyrighted question banks.
- ChatGPT source checking is a research aid; structural schema validity does NOT establish vendor endorsement or authoritative accuracy.
- Source URLs must use HTTPS without embedded credentials.
- No ChatGPT API key or direct model call is needed in the PWA.
- A later optional ONE-FILE envelope format may be specified as examprep.catalog.bundle.v1, but is NOT accepted by the current importer. Avoid presenting it as currently importable.

## Acceptance

Use the existing validateCertification and validateSyllabus pure validators for every file. All four example files must pass current type/field restrictions; each syllabus includes four unique domains and integer weights totaling 100. No source or historical record should be modified by validating metadata.
