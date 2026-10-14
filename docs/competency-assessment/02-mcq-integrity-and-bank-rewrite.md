# MCQ: why everyone scored 100 %, and what changed (2026-10)

**Cause.** In ~95 % of the bank the correct option was the longest one (≈76 vs ≈26 chars); distractors were short, absolute or absurd.
Difficulty labels were uncalibrated and no human had reviewed any item (all 1054 were `APPROVED`).

**Changes**
- `lib/mcqQuality.ts` lints items (longest-correct cue, absolute words, length spread, …); the question bank shows a health panel, per-item badges and a bulk approve for pending items.
- Banks of the five roles used for supervisor selection (project_manager, welding_inspector, site_supervisor, radiography_interpreter, supervision_manager) were rewritten (`supabase/competency/015_*.sql`) and set to `PENDING_REVIEW`; rollback table `comp_mcq_questions_backup_20261014`.
- Supervised-hall integrity (`016_mcq_integrity.sql`): the candidate page logs window blur / tab hidden / copy / context menu / fullscreen exit / reload / offline via `comp_mcq_candidate_log`; staff see `comp_mcq_integrity_summary` and `lib/mcqIntegrity.ts` advice (score ≥ 95 % ⇒ short confirmatory in-person check). Events never block the candidate or change the score.
- Candidate page: question rail, flag-for-review, keyboard (1–4, ←/→, F), fullscreen start, per-candidate option order (server-side, already existing).

**Not done yet:** versioned scoring engine, new item types (numeric, multi-select, ordering, scenario), results-dashboard redesign.
