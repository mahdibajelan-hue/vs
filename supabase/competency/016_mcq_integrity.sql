-- MCQ exam integrity log (supervised hall). The candidate page reports focus loss / copy / fullscreen-exit etc.;
-- staff read an aggregated summary next to the result. Events never block the candidate — they inform the reviewer.
create table if not exists comp_mcq_integrity_events (
  id bigint generated always as identity primary key,
  test_id uuid not null references comp_mcq_tests(id) on delete cascade,
  kind text not null check (kind in ('BLUR','HIDDEN','COPY','PASTE','CONTEXT','FULLSCREEN_EXIT','RELOAD','OFFLINE')),
  at timestamptz not null default now(),
  duration_ms integer
);
create index if not exists comp_mcq_integrity_events_test_idx on comp_mcq_integrity_events(test_id, at);
alter table comp_mcq_integrity_events enable row level security;

create or replace function comp_mcq_candidate_log(p_token uuid, p_kind text, p_duration_ms integer default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_t comp_mcq_tests%rowtype; v_n integer;
begin
  select * into v_t from comp_mcq_tests where candidate_token = p_token;
  if not found or v_t.status <> 'IN_PROGRESS' then return; end if;
  select count(*) into v_n from comp_mcq_integrity_events where test_id = v_t.id;
  if v_n >= 300 then return; end if;
  insert into comp_mcq_integrity_events(test_id, kind, duration_ms)
  values (v_t.id, p_kind, least(greatest(coalesce(p_duration_ms,0),0), 86400000));
end $$;
grant execute on function comp_mcq_candidate_log(uuid,text,integer) to anon, authenticated;

create or replace function comp_mcq_integrity_summary(p_assessment_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if auth.uid() is null or not comp_can_access_assessment(p_assessment_id) then raise exception 'forbidden'; end if;
  select id into v_id from comp_mcq_tests where assessment_id = p_assessment_id;
  if v_id is null then return null; end if;
  return jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(kind, c) from (select kind, count(*) c from comp_mcq_integrity_events where test_id = v_id group by kind) s), '{}'::jsonb),
    'awayMs', coalesce((select sum(duration_ms) from comp_mcq_integrity_events where test_id = v_id and kind in ('BLUR','HIDDEN')), 0),
    'total', (select count(*) from comp_mcq_integrity_events where test_id = v_id));
end $$;
grant execute on function comp_mcq_integrity_summary(uuid) to authenticated;
