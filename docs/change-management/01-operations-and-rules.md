# Change Management (v2) — data structure, sample rules, operations, tests

## Where it lives
Launchpad card «مدیریت تغییرات» (area-k, number 11); removed from Project Radar's navigation. Code `src/modules/changeManagement/`, SQL `supabase/change_mgmt/001–005` (also `supabase/schema.sql` §80). Module key `change` (row in `rasta_modules`).

## Data
| Table | Role |
|---|---|
| `chg_change_requests` (existing + new columns) | the request: type, cost/days (signed), contract, snapshots of base/cumulative, `rule_set_id` + `route_snapshot` (basis, applied rules, reason), status, approval/execution/result fields |
| `chg_history` (existing) | audit trail; **written only by `cm_*` RPCs** |
| `chg_stage_reviews`, `chg_documents` (existing) | legacy fixed-stage reviews (read-only history) and attachments |
| `cm_rule_sets` / `cm_routes` / `cm_route_steps` / `cm_rules` | versioned approval matrix: one ACTIVE set; only DRAFT sets can be edited |
| `cm_authority_limits` | personal limits per role (cumulative %, amount, days) checked when approving |
| `cm_rule_audit` | before/after of every rule/route/step/limit change with user and time |
| `cm_request_steps` | the instance of the route for each request attempt: entered/due/decided times, opinion, resolution number |
| `cm_exceptions` | emergency exception (justification, evidence, separate authorisation) |
| `cm_links` (+ mirrored rows in `rm_risk_links` / `im_issue_links`) | two-way links to risks and issues |

Existing requests are kept; legacy statuses are mapped (reviews → evaluating / awaiting_approval, implementation → implementing, verification → implemented). The production table was empty at migration time.

## Rule engine (authoritative on the server: `cm_resolve_core`; mirrored in `lib/changeRules.ts` for previews)
* **Base** comes from system data (contract → project → typed value as a last, flagged resort). **Cumulative** % = (previously approved |amounts| of the same contract + this change) / original amount; the same for days and % of contract duration. Pending requests of the same contract are shown separately.
* Rules have a dimension (`cost`, `time`, `type`), change-type filter, basis (current / cumulative), pct/amount/days/days-% bounds (**lower bound exclusive, upper inclusive**), contract type / project / unit filters, required opinions, priority, validity dates, escalation settings.
* Cost and time are resolved independently. Same-priority matches must be route-compatible (one route's roles ⊇ the other); higher priority wins. Across dimensions: a route covering all others is chosen, else steps are merged (opinions → approvals → resolutions, no duplicate roles).
* **Never guessed**: no rule, conflicting rules, missing base amount/type, or no active rule set ⇒ `route_status = blocked`, the request stays in evaluation with the reasons shown; an administrator fixes the rules and the evaluation is completed again.
* Changing rules never alters earlier requests (snapshot). New versions: clone → edit → validate (`cm_validate_rule_set`) → activate.

## Workflow and security
`draft → submitted → evaluating → awaiting_approval → approved → implementing → implemented → closed`, plus `rejected`, `returned`, `cancelled` (reason required). A guard trigger refuses direct writes to status/route/approved amounts/closing fields; content fields lock after submission. RPCs: `cm_submit`, `cm_start_evaluation`, `cm_complete_evaluation`, `cm_decide_step`, `cm_start_implementation`, `cm_record_result`, `cm_close`, `cm_cancel`, `cm_request_exception`, `cm_decide_exception`, `cm_link`, `cm_remove_link`, `cm_create_risk`, `cm_create_issue`, `cm_create_from_source`, rule-set RPCs.
Enforced: the requester never approves their own request; a step is decided only by a holder of the step's role in that project (administrators may act and are flagged «مدیر سامانه»); approval beyond the role's personal limit is refused; opinion steps cannot reject; resolution number required where configured; approved amount/days cannot exceed the request; implementation before approval only with an authorised exception (flagged, normal approval still required to close); actual cost/days above the approved value ⇒ «مغایر با مصوبه» with a mandatory note. Read access: administrators, scope users and anyone with a role in the project.

## Sample rules (editable, NOT binding)
C-10: cumulative ≤ 10 % → executive route · C-25: > 10 % and ≤ 25 % → CEO + board · T-NEW: new work → CEO + board with technical opinion · D-30 / D-30P: cumulative extension ≤ 30 days / > 30 days. Above 25 % no rule exists on purpose, so the system stops and asks for a decision. Role names (e.g. «مدیر ارشد پروژه» as «مجری طرح») are an assumption to be mapped by the administrator.

## Tests
`node scripts/run-tests.mjs change` — `changeRules.test.mjs` (current/cumulative %, boundaries, cost/time combination, merged routes, conflicts, priority, validity, filters, blocked cases, authority limits, rule-set validation) and `changeKpi.test.mjs` (cumulative per contract, small changes cannot bypass limits, dwell times, overdue/stalled, who may do what). The SQL engine was also run against the live database with 9 scenarios plus an end-to-end workflow (self-approval refused, role required, direct writes refused, locked fields, cumulative route change, blocked request) inside rolled-back transactions.

## Limits / needs the administrator
* Rule values, role mapping and personal limits are samples and must be aligned with the real delegation matrix.
* Notifications are in-app only (bell: pending decisions, overdue, escalation, returned/approved/rejected, blocked routes). Email/SMS/push are not sent for this module; the escalation after N days is shown in the bell of the holders of the escalation role, it does not auto-reassign.
* Risk/issue suggestions are rule-based and require a click; there is no automatic creation. No AI is used.
* The «تاریخ پایان» effect of approved extensions is informational (it does not edit master data). Amounts are not summed across currencies.
* Attachments of the legacy form (`chg_documents`) are kept but not exposed in the new UI.
