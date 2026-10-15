# MCQ: why everyone scored 100 %, and what changed (2026-10)

**Cause.** In ~95 % of the bank the correct option was the longest one (≈76 vs ≈26 chars); distractors were short, absolute or absurd.
Difficulty labels were uncalibrated and no human had reviewed any item (all 1054 were `APPROVED`).

**Changes**
- `lib/mcqQuality.ts` lints items (longest-correct cue, absolute words, length spread, …); the question bank shows a health panel, per-item badges and a bulk approve for pending items.
- Banks of the five roles used for supervisor selection (project_manager, welding_inspector, site_supervisor, radiography_interpreter, supervision_manager) were rewritten (`supabase/competency/015_*.sql`) and set to `PENDING_REVIEW`; rollback table `comp_mcq_questions_backup_20261014`.
- Supervised-hall integrity (`016_mcq_integrity.sql`): the candidate page logs window blur / tab hidden / copy / context menu / fullscreen exit / reload / offline via `comp_mcq_candidate_log`; staff see `comp_mcq_integrity_summary` and `lib/mcqIntegrity.ts` advice (score ≥ 95 % ⇒ short confirmatory in-person check). Events never block the candidate or change the score.
- Candidate page: question rail, flag-for-review, keyboard (1–4, ←/→, F), fullscreen start, per-candidate option order (server-side, already existing).

**Not done yet:** versioned scoring engine, new item types (numeric, multi-select, ordering, scenario), results-dashboard redesign.

## Scoring v2 and item types (2026-10-15)
- `017_mcq_item_types.sql`: `item_type` (SINGLE / MULTI / NUMERIC / ORDER) + `answer_key` on questions, `answer` + `credit` on responses, `scoring_version` on tests.
  `comp_mcq_item_credit` is the single scoring authority; `lib/mcqScoring.ts` mirrors it for previews/tests.
- Credit: SINGLE 1/0 (unchanged, old results unaffected); MULTI (hits − wrong picks)/keys, floor 0; NUMERIC within tolerance; ORDER exact = 1, otherwise half of the concordant-pair surplus over chance (random order ≈ 0).
- Score = mean credit; "correct" = full credit. New tests are stamped `scoring_version = 2`.
- Candidate RPCs: `comp_mcq_candidate_answer_v2` (type-aware validation); keys are never returned to candidates.
- 10 sample items (2 per role) were added as `PENDING_REVIEW`; the bank editor now authors all four types (type is fixed after creation). Verified: an end-to-end DB run (answer → submit → score, rolled back) and a Playwright run of the candidate page against mocked RPCs.
