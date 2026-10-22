-- حضور و غیاب دستگاه نظارت — round 2 (applied 1405/07/30):
--  * status «استعلاجی» (sick): excused, neither worked nor counted against the duty days;
--  * a working shift per person (shift_start / shift_end): a «present» day without clock times takes these, and
--    everything past the 8-hour duty day is overtime (a night shift 19:00–07:00 = 8 h + 4 h overtime);
--  * meals for temporary guests (visitors staying a few days), recorded as counts per day.
alter table sv_attendance drop constraint sv_attendance_status_check;
alter table sv_attendance add constraint sv_attendance_status_check check (status in ('present', 'mission', 'rest', 'sick', 'absent'));
alter table sv_people add column if not exists shift_start time, add column if not exists shift_end time;

create table if not exists sv_guest_meals (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects(id) on delete cascade,
  day date not null,
  guest_name text not null check (length(trim(guest_name)) > 0),
  organization text not null default '',
  host text not null default '',
  breakfast int not null default 0 check (breakfast between 0 and 500),
  lunch int not null default 0 check (lunch between 0 and 500),
  dinner int not null default 0 check (dinner between 0 and 500),
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists idx_sv_guest_project_day on sv_guest_meals (master_project_id, day);
alter table sv_guest_meals enable row level security;
create policy sv_guest_meals_read on sv_guest_meals for select using (sv_can_read(master_project_id));
create policy sv_guest_meals_write on sv_guest_meals for all using (sv_can_write(master_project_id)) with check (sv_can_write(master_project_id));
