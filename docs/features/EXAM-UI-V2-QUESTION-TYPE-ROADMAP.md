# ExamPrep Engine — Exam UI v2 and Professional Question-Type Architecture
**Status:** Design proposal only; no code implementation, schema migration, production merge or release authorization  
**Date:** 2026-11-12  
**Tracking:** [#136](https://github.com/Yenuka2012/examprep-engine/issues/136)  
**Constraints:** Single owner; GitHub Pages static PWA and privately hosted Ubuntu static PWA remain supported; free/open-source tooling; encrypted-only cutover separately gated.

## 1. Baseline and observed gaps (main, 2026-11-12)
- `src/types.ts`: `Question.type` accepts `single_choice|multiple_choice`; `ExamSession.answers` / `Attempt.answers` use `Record<string,string[]>`.
- `src/schema.json`: bank schema `1.0`; questions require options, correct_answers and explanation.
- `src/logic.ts`: exact-set binary correctness. No typed response, ordering, mapping, partial credit or lab evidence.
- `src/App.tsx`: timer, progress, choices, flagging, filtered navigator, autosave status, pre-submission confirmation and results.
- Existing M2 encrypted-only migration/cutover is distinct: no assumption that current production IndexedDB is encrypted at rest. Preserve single-writer, crash-safe save, anti-downgrade and recovery properties.

## 2. UI decisions
1. **Visual baseline:** accessible high-contrast light exam canvas (previous visual sample #7), navy navigation and blue accents, optional dark/teal focus theme (#6). Avoid relying on color alone.
2. **Desktop >= 1200px:** compact certification/header/timer; left rail collapsible; central question and exhibits; right status palette; sticky footer Previous/Flag/Clear/Next; submission separate and guarded.
3. **Tablet 768–1199px:** collapse left rail; question takes primary width; navigator as side drawer; bottom actions and timer always visible.
4. **Mobile < 768px:** one question per viewport, readable line length, large controls, bottom Previous/Next, drawer for navigator, visible timer and save status, no horizontal page overflow; safe-area support for iOS PWA.
5. **Accessibility:** WCAG 2.2 AA target, keyboard-first interactions, semantic radio/checkbox/listbox, accessible drag/drop **and equivalent arrow-button movement**, touch targets >=44 CSS px, screen-reader status announcements, reduced motion, configurable font size and contrast.
6. **Exam Simulation:** no answer/rationale disclosure during an active attempt; explicit confirmation with answered/unanswered/flag counts; timed expiry follows profile rules. Disable notes/references unless profile explicitly permits them.
7. **Study Mode:** optional immediate feedback, rationale, references, bookmark, notes and retry controls; does not claim official scoring.
8. **Review Mode:** immutable question/answer snapshots, rubric explanations, domain/skill breakdown, exposure metrics and error reasons; never silently rewrite historical scores.
9. **Focus mode:** hides non-exam navigation without asserting proctoring or anti-cheat capabilities.
10. **UI states:** loading, idle, active, saving, saved, save failed, read-only other-tab, unsupported renderer, vault locked, timeout, submitted, review and safe recovery.

## 3. Canonical taxonomy (format versus delivery)
| Item family | Examples / required response | UI component | Priority |
|---|---|---|---|
| Single choice | One selected option; BEST/MOST judgement stems | Radio choice card | P0 existing |
| Multiple response | Exact N or 'select all' selection | Checkbox choice card with optional required count | P0 existing |
| Binary / true-false | Binary MCQ | Shared single-choice renderer | P0 |
| Scenario stem | Long workplace situation, then choice or other response | Long stem/exhibit container | P0 |
| Matching | Prompt-to-answer pairs (one-to-one or many-to-one defined by rubric) | Accessible mapping columns and selectors | P1 |
| Ordering / build list | Ordered sequence (may select a subset before order) | List with reorder arrows and optional drag | P1 |
| Classification / drag to zones | Assign cards to categories / zones | Multi-bin mapping with keyboard fallback | P1 |
| Fill-in / cloze | Text or numeric blanks; exact or tolerant | Input/blank groups | P1 |
| Dropdown in stem | One or multiple blanks with fixed options | Inline/select form | P1 |
| Numeric / calculation | Number, units and tolerance | Numeric answer field | P1 |
| Matrix / multiple-response grid | Rows with categorical selections | Responsive row-form groups | P1 |
| Hotspot / hot area | Pick one or several regions in image/diagram | Image + named regions/list alternative | P1 |
| Active screen | Select controls in simulated screenshot | Region-based active image | P2 |
| Case study / common stimulus | Multiple linked questions, background, requirements, exhibits | Case tabbed reader + item runner | P2 |
| Exhibit / document interpretation | Log, terminal output, architecture diagram, table, chart | Safe static/media exhibit panel | P2 |
| Multi-part question | Dependencies, weighted subitems | Group container with part navigation | P2 |
| Practical simulation / PBQ | Config panels, sequence of operations, troubleshooting | Deterministic simulated task UI | P2 |
| CLI/code response | Commands, configuration fragments, scripts | Sandboxed mock terminal / static evaluator | P3 |
| Real hands-on lab | Kubernetes, Linux, cloud or security tool environment | Separate private Ubuntu lab runner; explicit isolation | P3 |
| Essay/oral/audio/video | Free-form or media response | Deferred authoring/evaluation; not automatic grading | Deferred |

**Orthogonal delivery behaviors:** linear/reviewable, section-locked, timed, adaptive, open-book, pause/break rules and lab task sets. **Orthogonal scoring:** binary, partial-credit, weighted rubric, tolerance and evaluator-based. Not all providers or certifications use every type; selected exams may keep subset only.

## 4. Verified provider direction (sources as of 2026-11-12)
- **ISACA CISM/CRISC:** 150 MCQs, 240 min; scenario and BEST/MOST emphasis. CISM content outline changed effective 2026-11-03. Prioritize high-quality judgement stems before more complex widgets. https://www.isaca.org/credentialing/cism/cism-exam-content-outline and https://www.isaca.org/credentialing/crisc/crisc-exam-content-outline and 2026 candidate guide.
- **ISC2 CISSP:** CAT with MCQ and advanced item types; 100–150 items and 3 hours in published CISSP outline. Model adaptive delivery as separate simulated delivery profile; **do not advertise a psychometrically equivalent CAT**. https://www.isc2.org/certifications/cissp/cissp-certification-exam-outline and https://www.isc2.org/certifications/computerized-adaptive-testing
- **AWS Security Specialty SCS-C03:** officially lists multiple choice, multiple response, ordering, matching. https://docs.aws.amazon.com/aws-certification/latest/security-specialty-03/security-specialty-03.html
- **Microsoft role-based:** official sandbox demonstrates active screen, build-list, case studies, drag/drop, hot area, multiple choice and labs; rules may prevent returning to completed sections or earlier questions after a break. Actual item types vary. https://learn.microsoft.com/en-us/credentials/support/exam-duration-exam-experience
- **PMI PMP 2026:** 180 questions/240 minutes; single/multiple response, drag/drop, case study and practicum/graphic-based work. 2026 profile must replace any outdated assumptions. https://www.pmi.org/certifications/project-management-pmp/new-exam
- **Linux Foundation CKA:** command-line performance exam, not emulatable faithfully with static JavaScript only. https://training.linuxfoundation.org/certification/certified-Kubernetes-administrator-cka/
- **GIAC CyberLive:** VM-based hands-on assessments; real back-end/lab isolation necessary for equivalent practice. https://www.giac.org/cyberlive
- **CompTIA:** performance-based items (PBQs) and knowledge questions; before publishing a specific exam preset, verify the current objectives and exact provider format. Do not assume every exam uses every PBQ subtype.

## 5. Proposed versioned domain architecture
### 5.1 Preserve v1 unchanged
- Keep current bank schema `1.0` reader, importer/exporter, attempt/session snapshots and score logic intact.
- Never reinterpret stored legacy `string[]` answers or recompute previous exam scores using a new grader.
- Create a separate bank schema `2.0` and discriminated `QuestionV2` union by stable `kind`; do not just widen the v1 `type` enum without validation/grading changes.

### 5.2 Example v2 shapes (illustrative contracts, not deployed)
```ts
type ResponseV2 =
  | {kind:'single_choice'; optionId:string|null}
  | {kind:'multiple_choice'; optionIds:string[]}
  | {kind:'ordering'; orderedIds:string[]}
  | {kind:'matching'; pairs:Record<string,string>}
  | {kind:'classification'; bins:Record<string,string[]>}
  | {kind:'text_entry'; values:Record<string,string>}
  | {kind:'numeric'; value:number|null; unit?:string}
  | {kind:'hotspot'; regionIds:string[]}
  | {kind:'task'; evidence:unknown; evaluationState:'pending'|'graded'|'manual'};
type ScoreV2={earned:number;possible:number;status:'graded'|'ungraded'|'manual';
  rubricVersion:string;reasonCodes:string[]};
```
Use a strict discriminated schema for both items and responses; validate foreign keys, ordering uniqueness, media hashes, maximum sizes and permission boundaries. The `task.evidence` payload must be item-specific and validated—not arbitrary serialized runtime state.

### 5.3 Scoring / completion
- Pluggable pure scorer per `kind`, versioned deterministic rubric, numerical tolerances and explicitly configured partial credit.
- Response recorded vs complete vs flagged are distinct; multiple-answer minimum counts must not overstate completion.
- Score percentages reflect **earned/possible** where graded; ungraded/manual items excluded from denominator with transparent reporting.
- Provider official scaled scores and psychometric pass/fail are **not inferred** from raw practice percentages.
- Each frozen attempt stores item revision, scoring policy revision, response snapshot and evaluated result; question bank modifications do not mutate active exam or historical attempt data.
- Adaptive engine is an optional **transparent practice algorithm** using tagged calibrated questions, not a clone of a protected certification CAT algorithm.

## 6. Product modules / implementation order
### Phase A — Low-impact exam shell (P0)
Theme, responsive breakpoints, question drawer, accessible keyboard/touch controls, focus mode, save-status prominence, end-exam review, strict mode rules. Reuse current single/multiple-choice components, no storage version changes. Verify existing v0.3.2/recovery blockers first.

### Phase B — Structured question types (P1)
New `2.0` schema + authoring preview/import validator; matching, ordering, category placement, dropdown/cloze, numeric, matrix and hotspots. Feature-gated engine and evaluation. Keep v1 renderer as separate code path.

### Phase C — Rich cases and simulations (P2)
Case containers, exhibit pane (safe images/logs/PDF-derived excerpts), linked items, stage locks and certification profiles; simulated config-based PBQs. Avoid embedding unsanitized HTML/JS from question-bank imports.

### Phase D — Practical labs and simulated CAT (P3)
Standalone isolated lab service only on private Ubuntu architecture (no arbitrary OS commands executed in public GitHub Pages); time limits, disposable lab identities, allowlisted lab templates, resource quotas, no public lab secrets or write credentials. Synthetic practice CAT algorithm clearly labeled.

### Phase E — Question authoring and intelligence
Content editor, taxonomy classification, per-certification blueprints, syllabus effective dates, reviewer provenance/license metadata, semantic de-duplication, coverage, time-per-item and recall signals.

## 7. Certification profile fields
`provider`, `certificationId`, `examCode`, `effectiveFrom`, `syllabusVersion`, `itemKindsAllowed`, `domainWeights`, `timeLimit`, `questionCountRange`, `navigationRule`, `sectionBreakPolicy`, `feedbackPolicy`, `scoringMode`, `sourceUrls`, `verifiedAt`. Profile IDs and revisions are immutable per frozen exam, no silent auto-update.

## 8. Security, privacy and portability gates
- No new runtime dependencies unless audited; no remote question API or paid service needed for P0–P2.
- CSP, safe text-only rendering / sanitization, MIME-checked media, size ceilings, no active SVG scripting, DOM injection, unsandboxed iframes or user-supplied executable code.
- Encryption-at-rest cutover must be complete and independently approved before v2 personal content migration. Separate origin tests; stale clients can't write after change.
- Keep old-client schema fence, serialized autosave, Web Locks ownership, idempotent finish, recovery, read-only failure modes, bounded import size, encrypted backup/restore roundtrip.
- Static GitHub Pages/Ubuntu build support preserved; practical labs only through separately provisioned private Ubuntu backend, not silently added to static hosting.
- Accessibility QA: keyboard-only matching/ordering/hotspot alternatives, voiceover and WebKit on iPhone/iPad, 200% zoom, reduced-motion, timer warnings and contrast.
- CI gates: TypeScript, JSON Schema negative cases, property/fuzz tests, per-kind golden scoring, browser/mobile E2E, CodeQL, dependency audit, same-commit Pages gate, no deployment before owner release authorization.

## 9. Detailed acceptance
1. An unchanged v1 bank imports and its legacy score/backup semantics remain byte-for-byte valid.
2. New `2.0` tests cover every P1 item type and reject invalid/untrusted payloads.
3. Simulated timed mode never reveals correct answers or explanations before submission.
4. Exam state survives refresh, app restart and offline usage, including mid-way on a complex item.
5. Two-tab write conflict fails closed and does not corrupt a question or session.
6. Responsive navigator and choices work on desktop, iPad and iPhone Safari PWA, in light/dark mode and with assistive tech.
7. Official-style profiles stay transparent and citations/effective dates are documented; no reproduction of copyrighted exam items.
8. Historical attempts remain immutable and independently recoverable before any changes are released.
9. Encrypted backup restore is tested with both old and new formats before migration release.
10. All change sets isolated behind a review PR; no direct main merge, production migration or Pages release from this design PR.

## 10. Dependencies / existing issues
[#136](https://github.com/Yenuka2012/examprep-engine/issues/136) design owner; [#60](https://github.com/Yenuka2012/examprep-engine/issues/60) mobile exam UX; [#59](https://github.com/Yenuka2012/examprep-engine/issues/59) exam profile rules; [#41](https://github.com/Yenuka2012/examprep-engine/issues/41) exam state machine; [#32](https://github.com/Yenuka2012/examprep-engine/issues/32) schema validation. Keep M2 encrypted-only release approval and old-client barrier (#100) separate and blocking for any production migration.

**Decision:** Adopt an extensible professional-assessment taxonomy and accessible responsive shell, but implement **incrementally**. First ship low-impact exam shell, then versioned structured items, then cases/simulations, then isolated labs. Never touch active owner vault data as part of this planning update.
