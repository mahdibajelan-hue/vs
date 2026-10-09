# Change Management — current state and target

## Current state (found in the repository / live DB)
* UI: `src/modules/changeManagement/` — a 1 758-line `ChangeManagementPage` opened as a panel from **Project Radar** (`ProjectRadarPage.tsx`, `changeMgmtOpen`), `ChangeReportsPage`, print report, store `useChangeStore`, `changeCalc`.
* DB: `chg_change_requests` (48 cols: contract amount/duration, proposed & approved cost/days, risks json, implementation actions json, actual cost/delay …), `chg_stage_reviews` (fixed 5 stages: engineering → planning → contract → PM → CCB), `chg_documents`, `chg_history`. 0 rows at audit time.
* Flow: fixed 12-state pipeline; **every request goes through the same 5 reviewers regardless of amount/time**; approval decided client-side by writing `status` directly (RLS = "may write in project"), so nothing server-side stops a user skipping a stage or approving without authority.
* Access: `chg_can_write_project` (admin or one of 7 project roles); SELECT open to every authenticated user.
* Cumulative change of a contract and % of original amount: only the single request's own % was computed.

## Gaps vs. the mission
no rule engine / authority matrix · no cumulative % · no cost/time independent routes · no versioning of rules · no blocked-on-ambiguity · status writable from the client · read access not scoped · no independent module (lives under radar) · no link with risk/issue modules.

## Target (what is implemented)
* Standalone module «مدیریت تغییرات» on the main launchpad (removed from radar). Same shared PM design system as Issue/Risk modules.
* Data kept: all `chg_*` tables/columns stay; new `cm_*` tables + extra columns on `chg_change_requests` (migration files in `supabase/change_mgmt/`).
* **Rule engine as data**: `cm_rule_sets` (versioned, one active) → `cm_routes` → `cm_route_steps`, `cm_rules` (conditions + route), `cm_authority_limits`, `cm_rule_audit`. Server function `cm_resolve` is the single authority; the TypeScript mirror (`lib/changeRules.ts`) is only for previews and is test-checked against the same cases.
* % basis: current change %, **cumulative % (previous approved + this one)** and days/% of contract duration; cost and time routes resolved independently, then combined (superset route or merged steps). Missing/ambiguous/conflicting rules ⇒ route status `blocked` (never guessed) and the request waits for an administrator.
* Each request stores `rule_set_id` + `route_snapshot` (basis, applied rules, reason) so later rule edits never alter past requests.
* Status: draft → submitted → evaluating → awaiting_approval → approved → implementing → implemented → closed, plus rejected / returned / cancelled (reason required). Transitions only through RPCs (`cm_submit`, `cm_complete_evaluation`, `cm_decide_step`, `cm_start_implementation`, `cm_record_result`, `cm_close`, `cm_cancel`); a guard trigger refuses direct writes to status/route/approved amounts.
* Step timing (`entered_at`, `decided_at`) for dwell-time reports; reminders/escalations through the shared notification outbox.
* Emergency exception: separate request + justification + a different authorised approver; execution flagged, normal approval still required.
* Integration: `cm_links` (+ mirrored rows in `rm_risk_links` / `im_issue_links`), risk/issue creation via the idempotent `rm_ingest_risk` / `im_ingest_issue` (external_system `change_mgmt`), AI/rule suggestions need user confirmation.
