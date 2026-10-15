-- lightweight QC findings (defect / non-conformity / observation) raised from technical forms
create table if not exists ex_qc_findings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  tech_report_id uuid references ex_reports(id) on delete set null,
  line_id uuid references ex_report_lines(id) on delete set null,
  kind text not null default 'defect' check (kind in ('defect','nonconformity','observation')),
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  status text not null default 'open' check (status in ('open','closed')),
  weld_ref text not null default '',
  note text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists idx_ex_qc_findings_proj on ex_qc_findings (project_id, status);
alter table ex_qc_findings enable row level security;
create policy ex_qc_findings_sel on ex_qc_findings for select to authenticated using (true);
create policy ex_qc_findings_w on ex_qc_findings for all to authenticated using (ex_allows(project_id, 'record') or ex_allows(project_id, 'raise') or ex_can_configure(project_id)) with check (ex_allows(project_id, 'record') or ex_allows(project_id, 'raise') or ex_can_configure(project_id));
