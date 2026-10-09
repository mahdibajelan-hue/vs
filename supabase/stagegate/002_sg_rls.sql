-- RLS: any signed-in user (same convention as the plc_* tables).
alter table sg_lifecycle_phases enable row level security;
drop policy if exists "sg_lifecycle_phases_all" on sg_lifecycle_phases;
create policy "sg_lifecycle_phases_all" on sg_lifecycle_phases for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_lifecycle_objectives enable row level security;
drop policy if exists "sg_lifecycle_objectives_all" on sg_lifecycle_objectives;
create policy "sg_lifecycle_objectives_all" on sg_lifecycle_objectives for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_lifecycle_outputs enable row level security;
drop policy if exists "sg_lifecycle_outputs_all" on sg_lifecycle_outputs;
create policy "sg_lifecycle_outputs_all" on sg_lifecycle_outputs for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_lifecycle_criteria enable row level security;
drop policy if exists "sg_lifecycle_criteria_all" on sg_lifecycle_criteria;
create policy "sg_lifecycle_criteria_all" on sg_lifecycle_criteria for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_lifecycle_phase_durations enable row level security;
drop policy if exists "sg_lifecycle_phase_durations_all" on sg_lifecycle_phase_durations;
create policy "sg_lifecycle_phase_durations_all" on sg_lifecycle_phase_durations for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_lifecycle_strategy_phase_dependencies enable row level security;
drop policy if exists "sg_lifecycle_strategy_phase_dependencies_all" on sg_lifecycle_strategy_phase_dependencies;
create policy "sg_lifecycle_strategy_phase_dependencies_all" on sg_lifecycle_strategy_phase_dependencies for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_lifecycle_master_schedule_versions enable row level security;
drop policy if exists "sg_lifecycle_master_schedule_versions_all" on sg_lifecycle_master_schedule_versions;
create policy "sg_lifecycle_master_schedule_versions_all" on sg_lifecycle_master_schedule_versions for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_lifecycle_master_schedule enable row level security;
drop policy if exists "sg_lifecycle_master_schedule_all" on sg_lifecycle_master_schedule;
create policy "sg_lifecycle_master_schedule_all" on sg_lifecycle_master_schedule for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_lifecycle_schedule_items enable row level security;
drop policy if exists "sg_lifecycle_schedule_items_all" on sg_lifecycle_schedule_items;
create policy "sg_lifecycle_schedule_items_all" on sg_lifecycle_schedule_items for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_lifecycle_schedule_dependencies enable row level security;
drop policy if exists "sg_lifecycle_schedule_dependencies_all" on sg_lifecycle_schedule_dependencies;
create policy "sg_lifecycle_schedule_dependencies_all" on sg_lifecycle_schedule_dependencies for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_lifecycle_schedule_baselines enable row level security;
drop policy if exists "sg_lifecycle_schedule_baselines_all" on sg_lifecycle_schedule_baselines;
create policy "sg_lifecycle_schedule_baselines_all" on sg_lifecycle_schedule_baselines for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_lifecycle_schedule_baseline_items enable row level security;
drop policy if exists "sg_lifecycle_schedule_baseline_items_all" on sg_lifecycle_schedule_baseline_items;
create policy "sg_lifecycle_schedule_baseline_items_all" on sg_lifecycle_schedule_baseline_items for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_lifecycle_schedule_success_templates enable row level security;
drop policy if exists "sg_lifecycle_schedule_success_templates_all" on sg_lifecycle_schedule_success_templates;
create policy "sg_lifecycle_schedule_success_templates_all" on sg_lifecycle_schedule_success_templates for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_lifecycle_schedule_success_template_items enable row level security;
drop policy if exists "sg_lifecycle_schedule_success_template_items_all" on sg_lifecycle_schedule_success_template_items;
create policy "sg_lifecycle_schedule_success_template_items_all" on sg_lifecycle_schedule_success_template_items for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_lifecycle_schedule_success_template_phases enable row level security;
drop policy if exists "sg_lifecycle_schedule_success_template_phases_all" on sg_lifecycle_schedule_success_template_phases;
create policy "sg_lifecycle_schedule_success_template_phases_all" on sg_lifecycle_schedule_success_template_phases for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_project_lifecycle_phases enable row level security;
drop policy if exists "sg_project_lifecycle_phases_all" on sg_project_lifecycle_phases;
create policy "sg_project_lifecycle_phases_all" on sg_project_lifecycle_phases for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_project_phase_items enable row level security;
drop policy if exists "sg_project_phase_items_all" on sg_project_phase_items;
create policy "sg_project_phase_items_all" on sg_project_phase_items for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_lifecycle_gate_decisions enable row level security;
drop policy if exists "sg_lifecycle_gate_decisions_all" on sg_lifecycle_gate_decisions;
create policy "sg_lifecycle_gate_decisions_all" on sg_lifecycle_gate_decisions for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_lifecycle_progress_history enable row level security;
drop policy if exists "sg_lifecycle_progress_history_all" on sg_lifecycle_progress_history;
create policy "sg_lifecycle_progress_history_all" on sg_lifecycle_progress_history for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_lifecycle_audit_log enable row level security;
drop policy if exists "sg_lifecycle_audit_log_all" on sg_lifecycle_audit_log;
create policy "sg_lifecycle_audit_log_all" on sg_lifecycle_audit_log for all using (auth.uid() is not null) with check (auth.uid() is not null);
alter table sg_projects enable row level security;
drop policy if exists "sg_projects_all" on sg_projects;
create policy "sg_projects_all" on sg_projects for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- Slim copy of the source app's client_reports (latest per project) — feeds the G6 (EPC) engine and the identity bar.
create table if not exists sg_client_reports (id bigint generated by default as identity primary key, project_name text not null, created_at timestamptz not null default now(), contract_type text, contract_type_other text, contractor_name text, consultant_name text, contract_end_date date, progress_planned numeric, progress_physical numeric, progress_engineering numeric, progress_procurement numeric, progress_construction numeric, forecast_completion_date date, progress_engineering_planned numeric, progress_procurement_planned numeric, progress_construction_planned numeric, progress_engineering_weight numeric, progress_procurement_weight numeric, progress_construction_weight numeric);
alter table sg_client_reports enable row level security;
drop policy if exists sg_client_reports_all on sg_client_reports;
create policy sg_client_reports_all on sg_client_reports for all using (auth.uid() is not null) with check (auth.uid() is not null);
create index if not exists idx_sg_cr_project on sg_client_reports (project_name, created_at);

-- RBAC registration of the module.
insert into rasta_modules (key, label_fa) values ('stagegate', 'چرخه عمر Stage-Gate') on conflict (key) do nothing;
insert into rasta_permissions (module_key, action)
select 'stagegate', a.action from (values ('view'),('create'),('edit'),('delete'),('submit'),('review'),('approve'),('reject'),('export'),('configure')) as a(action)
on conflict (module_key, action) do nothing;
insert into rasta_role_permissions (role_id, permission_id)
select r.id, p.id from rasta_roles r cross join rasta_permissions p where r.name = 'دسترسی کامل' and p.module_key = 'stagegate' on conflict do nothing;
