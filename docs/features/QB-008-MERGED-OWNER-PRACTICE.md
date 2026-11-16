# QB-008 — Encrypted Owner Merged Domain Practice
2026-11-16, PR stacked on #154 and #153. Synthetic tests only.

- All uploaded schema-v1 source batches remain **add-only** and unmodified.
- Domain practice is computed by exact certification + published syllabus + canonical domain code, skipping previously compiled `MOCK-` and `POOL-` bank IDs. Source question ID collisions/ambiguous domain labels fail closed.
- Each exam compiles a bounded, uniquely named immutable derived bank, encrypts it via existing M2.8 owner session, then begins the unchanged authenticated exam slot. The derived bank remains encrypted if a later attempt to start fails; never delete source data as part of rollback.
- Source-only question count, target count, duration and domain are visible before starting. All original single and multiple-choice formats remain supported.
- Practice accuracy, domain explanations and historic snapshots are retained by the current exam runtime. Real private HTTPS host, encrypted recovery and physical device acceptance remain blocked under #144/#132.
- Important known tradeoff: each attempt stores a derived immutable practice bank. Future native multi-source manifest support could avoid repeated storage usage, but requires separately reviewed format migration. Do not weaken 8 MiB record or 64 MiB backup limits.

Acceptance: old-source and vault safety tests, 10-item merged domain test from synthetic multiple-source inputs, 150-item full mock regression, no source IDB access or plaintext fallback.
