# Risk Management (ERM v2) — Operations, Integrations, Test Report

## Where it lives
Launchpad (main page) card «مدیریت ریسک» (area-j). It was removed from the Project Radar navigation. Code: `src/modules/risk/`, DB: `supabase/risk_mgmt/001–007` (also in `supabase/schema.sql` §79).

## Integrations
| Integration | Mechanism | Notes |
|---|---|---|
| Issue ⇄ Risk | `im_convert_risk_to_issue` (idempotent, sets risk `realized`), trigger `rm_on_issue_link`, `rm_risk_links` | two-way, no duplicate issue per risk |
| Mission / visit reports | `ms_transfer_finding` (risk branch), `rm_scan_mission_findings`, `rm_suggestions` | dedupe on source; suggestions need human acceptance (unless confidence ≥ policy `auto_accept_confidence`) |
| External systems | `rm_ingest_risk(external_system, external_id, …)` | idempotent; connectors must be built/configured by the owner of that system |
| Users / projects | `rm_people`, `rm_sync_master_projects`, central access | no parallel user/project masters |
| Notifications | `rm_generate_notifications` → `im_notif_outbox` (scope `risk`, 12 `rk_*` rules) → edge fn `im-notify` | in-app works now; email/SMS/push/messenger only with provider secrets |
| AI | edge fn `im-ai` tasks `risk_extract`, `risk_ask`, `risk_summarize` | needs `GEMINI_API_KEY` or OpenAI-compatible secrets; otherwise built-in rule engine is used. Output is always a proposal |

## Operating the alert engine
* Event cursors start at "now" — nothing floods on first deploy.
* State-based alerts (stale assessment, overdue review, KRI breach…) are generated when `rm_generate_notifications` runs. **The first run will raise many alerts from existing data**; review `select rm_generate_notifications_now()` (admin) in a quiet window.
* Scheduling: call `im-notify` (header `x-cron-secret`, secret `IM_CRON_SECRET`) every ~15 min, or `select cron.schedule('rm-generate-notifications','*/15 * * * *',$$select public.rm_generate_notifications()$$)`. Not scheduled by default.

## Server-enforced rules
Inherent score immutable (admin only) · closing requires reason · assessments append-only (lowering score needs basis) · effect verification requires completed action + note · all field changes audited in `rm_risk_history` · config changes in `rm_config_audit`.
Ordinal scores are never summed; portfolio uses counts/shares/medians/priority ordering; project comparison only within same size band + phase.

## Tests (`npm test`)
`riskErm.test.mjs` (policy, state, effect, KRI, 13 KPIs, comparison, portfolio) and `riskAi.test.mjs` (extraction, answers, import validation). Result at delivery: 12/12 test files pass; `tsc -b`, lint (warnings only), module boundaries and `vite build` pass.

## Known limits
* Live DB guards already apply to the legacy UI on `main` until this branch is merged (e.g. closing without reason now errors).
* Visual screenshot QA in the browser harness was not completed for the risk module.
* External channels, AI provider and external-system connectors require credentials/configuration outside this repo.
