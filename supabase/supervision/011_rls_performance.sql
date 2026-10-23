-- 011 — speed: RLS checks once per request instead of once per row; write policies no longer evaluated on reads;
--       covering indexes for foreign keys. Rollback: rollback/011_rls_performance.sql
--
-- Measured (60 people, one year of attendance, under RLS): a month (1,965 rows) 34 ms, a year (22,065 rows) 94 ms.
-- Before: ~1.4 ms per row (a month of 60 people ≈ 2.7 s), because every SELECT also evaluated the FOR ALL write
-- policy (sv_is_head + sv_day_locked) and sv_can_read ran the full access check for each row.
--
-- Live note (1405-08-01): the database tool used to apply this holds DROP statements for a confirmation, so on the live
-- project the old FOR ALL policies were neutralised (USING false / WITH CHECK false) and renamed *_retired instead of
-- dropped. They grant nothing and cost nothing; drop them from the dashboard when convenient. This file drops them.

-- ── 1. access checks remembered for the transaction (one PostgREST request = one transaction) ────────────────
create or replace function sv_can_read(p_project uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
-- RLS calls this once per row; the answer is the same for the whole request, so it is kept for the transaction
declare k text := 'svc.r' || replace(p_project::text, '-', '') || replace(coalesce(auth.uid()::text, 'x'), '-', ''); v text := current_setting(k, true); r boolean;
begin
  if v <> '' then return v = 't'; end if;
  r := auth.uid() is not null and rasta_user_can_access_master_project(p_project);
  perform set_config(k, case when r then 't' else 'f' end, true);
  return r;
end $$;

create or replace function sv_can_write(p_project uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare k text := 'svc.w' || replace(p_project::text, '-', '') || replace(coalesce(auth.uid()::text, 'x'), '-', ''); v text := current_setting(k, true); r boolean;
begin
  if v <> '' then return v = 't'; end if;
  r := auth.uid() is not null and (is_admin_user() or (rasta_user_can_access_master_project(p_project)
    and (rasta_has_permission(auth.uid(), 'supervision', 'edit') or rasta_has_permission(auth.uid(), 'supervision', 'create'))));
  perform set_config(k, case when r then 't' else 'f' end, true);
  return r;
end $$;

create or replace function sv_is_head(p_project uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
-- the project's head of supervision (or a platform admin) records attendance by hand; until a head is named,
-- anyone allowed to edit the module may
declare k text := 'svc.h' || replace(p_project::text, '-', '') || replace(coalesce(auth.uid()::text, 'x'), '-', ''); v text := current_setting(k, true); r boolean;
begin
  if v <> '' then return v = 't'; end if;
  r := is_admin_user()
      or exists (select 1 from sv_people where master_project_id = p_project and is_head and active and user_id = auth.uid())
      or (not exists (select 1 from sv_people where master_project_id = p_project and is_head and active) and sv_can_write(p_project));
  perform set_config(k, case when r then 't' else 'f' end, true);
  return r;
end $$;

-- ── 2. FOR ALL write policies → one policy per command, so SELECT only checks the read policy ─────────────────
do $$
declare r record;
begin
  for r in select tablename, policyname, qual, with_check from pg_policies where tablename like 'sv\_%' and cmd = 'ALL' and policyname not like '%\_retired' loop
    execute format('create policy %I on %I for insert with check (%s)', r.tablename || '_ins', r.tablename, r.with_check);
    execute format('create policy %I on %I for update using (%s) with check (%s)', r.tablename || '_upd', r.tablename, r.qual, r.with_check);
    execute format('create policy %I on %I for delete using (%s)', r.tablename || '_del', r.tablename, r.qual);
    execute format('drop policy %I on %I', r.policyname, r.tablename);
  end loop;
  for r in select tablename, policyname from pg_policies where tablename like 'sv\_%' and policyname like '%\_retired' loop
    execute format('drop policy %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- own rows: auth.uid() once per statement, not per row
alter policy sv_meal_ratings_read on sv_meal_ratings using (user_id = (select auth.uid()) or sv_can_read(master_project_id));
alter policy sv_self_punches_read on sv_self_punches using (user_id = (select auth.uid()) or sv_can_read(master_project_id));

-- ── 3. covering indexes for foreign keys / lookups ──────────────────────────────────────────────────────────────
create index if not exists idx_sv_sites_project on sv_sites (master_project_id);
create index if not exists idx_sv_self_punches_person on sv_self_punches (person_id, day);
create index if not exists idx_sv_self_punches_site on sv_self_punches (site_id);
create index if not exists idx_sv_vehicles_person on sv_vehicles (person_id);
create index if not exists idx_sv_meal_ratings_person on sv_meal_ratings (person_id);
create index if not exists idx_sv_people_user on sv_people (user_id) where user_id is not null;
create index if not exists idx_master_project_team_user on master_project_team (user_id) where user_id is not null;
create index if not exists idx_master_project_team_parent on master_project_team (parent_id);
create index if not exists idx_master_project_team_org on master_project_team (organization_id);

-- ── 4. a rating belongs to the dish it was given for ──────────────────────────────────────────────────────────
-- Re-planning a menu cell (e.g. «پیشنهاد هفته» again) kept its id, so earlier ratings silently moved to the new dish.
-- The dish is now stored with the rating and only ratings of the cell's current dish count (history is kept).
alter table sv_meal_ratings add column if not exists dish text not null default '';
update sv_meal_ratings r set dish = m.main from sv_menu m where m.id = r.menu_id and r.dish = '';

create or replace function sv_rate_meal(p_menu uuid, p_score int, p_comment text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); m sv_menu%rowtype; v_person uuid; v_today date := (now() at time zone 'Asia/Tehran')::date;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_score not between 1 and 5 then raise exception 'bad_score'; end if;
  select * into m from sv_menu where id = p_menu;
  if not found then raise exception 'no_menu'; end if;
  select id into v_person from sv_people where master_project_id = m.master_project_id and user_id = v_uid and active;
  if v_person is null then raise exception 'not_linked' using errcode = '42501'; end if;
  -- a meal is rated on its day or within the next two days, never in advance
  if m.day > v_today or m.day < v_today - 2 then raise exception 'out_of_window'; end if;
  -- the dish is kept with the rating: if the menu cell is changed later, the old ratings do not count for the new dish
  insert into sv_meal_ratings (menu_id, master_project_id, person_id, user_id, score, comment, dish)
  values (m.id, m.master_project_id, v_person, v_uid, p_score, left(coalesce(p_comment, ''), 200), m.main)
  on conflict (menu_id, user_id) do update set score = excluded.score, comment = excluded.comment, dish = excluded.dish, at = now();
  return (select jsonb_build_object('avg', round(avg(score)::numeric, 2), 'n', count(*)) from sv_meal_ratings where menu_id = m.id and dish = m.main);
end $$;

create or replace function sv_my_menu(p_person uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_project uuid;
begin
  select master_project_id into v_project from sv_people where id = p_person and user_id = auth.uid();
  if v_project is null then raise exception 'not_linked' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'day', m.day, 'meal', m.meal, 'main', m.main, 'side', m.side, 'dessert', m.dessert, 'fruit', m.fruit,
           'mine', (select score from sv_meal_ratings r where r.menu_id = m.id and r.user_id = auth.uid() and r.dish = m.main)) order by m.day, array_position(array['breakfast','lunch','dinner'], m.meal))
    from sv_menu m where m.master_project_id = v_project and m.day between p_from and p_to), '[]'::jsonb);
end $$;

create or replace function my_supervision_notifications() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb := '[]'::jsonb; u uuid := auth.uid(); r record;
begin
  if u is null then return v; end if;
  -- a dish (as it was when rated): average ≤ 2.5 from at least 3 ratings in the last 30 days
  for r in
    with mine as (
      select distinct p.master_project_id as pid from sv_people p where p.user_id = u and p.is_head and p.active
      union select t.project_id from master_project_team t where t.user_id = u and t.position_key = 'project_manager'
    ), dish as (
      select m.master_project_id pid, x.dish dish, avg(x.score) a, count(*) n, max(m.day) last_day
        from sv_meal_ratings x join sv_menu m on m.id = x.menu_id
       where m.master_project_id in (select pid from mine) and x.dish <> '' and m.day >= (now() at time zone 'Asia/Tehran')::date - 30
       group by 1, 2 having count(*) >= 3 and avg(x.score) <= 2.5
    ) select d.*, coalesce(mp.short_name, mp.official_name) pname from dish d join master_projects mp on mp.id = d.pid order by d.a limit 20
  loop
    v := v || jsonb_build_object('id', 'sv-dish-' || md5(r.pid::text || r.dish), 'source', 'supervision', 'module', 'supervision', 'severity', 'warn',
      'title', 'رضایت پایین از غذای «' || r.dish || '»',
      'body', r.pname || ': میانگین ' || translate(to_char(r.a, 'FM0.0'), '0123456789.', '۰۱۲۳۴۵۶۷۸۹٫') || ' از ۵ در ' || translate(r.n::text, '0123456789', '۰۱۲۳۴۵۶۷۸۹') || ' نظر؛ غذا را از منو بردارید یا با تیم آشپز بررسی کنید.', 'at', r.last_day);
  end loop;
  -- the kitchen as a whole: average ≤ 3 from at least 10 ratings in two weeks
  for r in
    with mine as (
      select distinct p.master_project_id as pid from sv_people p where p.user_id = u and p.is_head and p.active
      union select t.project_id from master_project_team t where t.user_id = u and t.position_key = 'project_manager'
    ) select m.master_project_id pid, nullif(m.cook_team, '') team, avg(x.score) a, count(*) n, coalesce(mp.short_name, mp.official_name) pname
        from sv_meal_ratings x join sv_menu m on m.id = x.menu_id join master_projects mp on mp.id = m.master_project_id
       where m.master_project_id in (select pid from mine) and m.day >= (now() at time zone 'Asia/Tehran')::date - 14
       group by 1, 2, 5 having count(*) >= 10 and avg(x.score) <= 3.0
  loop
    v := v || jsonb_build_object('id', 'sv-cook-' || md5(r.pid::text || coalesce(r.team, '')), 'source', 'supervision', 'module', 'supervision', 'severity', 'warn',
      'title', 'رضایت کلی پایین از غذای کارگاه' || coalesce(' — تیم آشپز «' || r.team || '»', ''),
      'body', r.pname || ': میانگین دو هفتهٔ اخیر ' || translate(to_char(r.a, 'FM0.0'), '0123456789.', '۰۱۲۳۴۵۶۷۸۹٫') || ' از ۵ (' || translate(r.n::text, '0123456789', '۰۱۲۳۴۵۶۷۸۹') || ' نظر)؛ تغییر منو یا تیم آشپز را بررسی کنید.', 'at', now());
  end loop;
  return v;
end $$;
