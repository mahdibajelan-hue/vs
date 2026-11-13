-- ============================================================================
-- weldqc 005 — the weld passport: who welded each quadrant of each pass, the field-joint coating record (applicator,
-- random inspections), API 1104 imperfection codes on defects, and films kept both as uploaded (TIFF) and as a viewable,
-- enhanced copy. Additive only (new tables / columns); nothing is dropped. Rollback: rollback/005_rollback.sql.
-- ============================================================================

-- ── crew of a weld: one row per pass × quadrant (quadrant 0 = the whole circumference, 1 = 12–3, 2 = 3–6, 3 = 6–9,
--    4 = 9–12 o'clock looking in the direction of the line). Rows recorded here take precedence over the halves
--    (route side / canal side) the welding report gives.
create table if not exists wq_crew (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  weld_id uuid not null references ex_welds (id),
  pass text not null check (pass in ('root', 'hot', 'fill', 'cap')),
  quadrant int not null default 0 check (quadrant between 0 and 4),
  welder_key text not null,
  position text not null default '',
  direction text not null default '' check (direction in ('', 'uphill', 'downhill')),
  process text not null default '',
  started_at timestamptz,
  finished_at timestamptz,
  vt text not null default '' check (vt in ('', 'accept', 'reject')),
  note text not null default '',
  removed_at timestamptz,
  created_by uuid default auth.uid(), created_name text not null default '', created_at timestamptz not null default now()
);
create index if not exists wq_crew_weld on wq_crew (weld_id);
create index if not exists wq_crew_project on wq_crew (project_id);

-- ── field-joint coating of a weld: the applicator (from the register of welders / applicators), the system, and the
--    inspections — routine or random — with their results; the daily-report coating forms stay the evidence of
--    application and are read alongside.
create table if not exists wq_coating (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  weld_id uuid not null references ex_welds (id),
  kind text not null default 'application' check (kind in ('application', 'inspection', 'repair')),
  random_test boolean not null default false,
  applicator_key text not null default '',
  system text not null default '',
  at timestamptz not null default now(),
  holiday_kv numeric, holiday_count int,
  dft_min_um numeric,
  adhesion numeric,
  visual text not null default '' check (visual in ('', 'pass', 'fail')),
  result text not null default '' check (result in ('', 'pass', 'repair', 'fail')),
  defects text not null default '',
  files jsonb not null default '[]'::jsonb,
  note text not null default '',
  removed_at timestamptz,
  created_by uuid default auth.uid(), created_name text not null default '', created_at timestamptz not null default now()
);
create index if not exists wq_coating_weld on wq_coating (weld_id);
create index if not exists wq_coating_project on wq_coating (project_id);

-- ── defects: the API 1104 imperfection code (IP, IPD, ICP, IF, IFD, IC, BT, ESI, ISI, P, CP, HB, C, EU, IU, HL),
--    width (slag), clock position, quadrant, and «darker than the thinnest base metal» (burn-through / concavity)
alter table wq_defects add column if not exists code text not null default '';
alter table wq_defects add column if not exists width_mm numeric;
alter table wq_defects add column if not exists clock numeric check (clock is null or (clock >= 0 and clock <= 12));
alter table wq_defects add column if not exists quadrant int check (quadrant is null or quadrant between 1 and 4);
alter table wq_defects add column if not exists density_over boolean not null default false;
alter table wq_defects add column if not exists ai_action text not null default '' check (ai_action in ('', 'accepted', 'modified'));

-- ── films: the original file (e.g. a 16-bit TIFF scan) and a viewable 8-bit copy; image-quality figures and the last
--    run of the candidate-region assistant (what it found, which were accepted, changed or dismissed)
alter table wq_films add column if not exists display_path text;
alter table wq_films add column if not exists orig_mime text not null default '';
alter table wq_films add column if not exists metrics jsonb not null default '{}'::jsonb;
alter table wq_films add column if not exists ai jsonb;

-- ── access: read by project members; crew and coating written by the welding engineer (edit) or the interpreter
--    (submit); never deleted, withdrawn with removed_at
alter table wq_crew enable row level security;
alter table wq_coating enable row level security;
create policy wq_crew_sel on wq_crew for select to authenticated using (ex_can_view(project_id));
create policy wq_crew_ins on wq_crew for insert to authenticated with check (wq_can(project_id, 'edit') or wq_can(project_id, 'submit'));
create policy wq_crew_upd on wq_crew for update to authenticated using (wq_can(project_id, 'edit') or wq_can(project_id, 'submit')) with check (wq_can(project_id, 'edit') or wq_can(project_id, 'submit'));
create policy wq_coating_sel on wq_coating for select to authenticated using (ex_can_view(project_id));
create policy wq_coating_ins on wq_coating for insert to authenticated with check (wq_can(project_id, 'edit') or wq_can(project_id, 'submit'));
create policy wq_coating_upd on wq_coating for update to authenticated using (wq_can(project_id, 'edit') or wq_can(project_id, 'submit')) with check (wq_can(project_id, 'edit') or wq_can(project_id, 'submit'));
