-- 010 — supervisors are defined in master data (پروژه ← ساختار و تیم ← نظارت کارگاهی) and copied into sv_people;
--       منوی غذا (weekly menu with dessert and fruit), one-face meal ratings, low-satisfaction alarms.
-- Applied live on 1405-08-01. Rollback: rollback/010_team_supervisors_and_menu.sql

-- ── 1. supervision fields on the project team ───────────────────────────────
alter table master_project_team
  add column if not exists national_id text not null default '',
  add column if not exists shift_start time,
  add column if not exists shift_end time,
  add column if not exists overtime_cap int check (overtime_cap is null or overtime_cap between 0 and 200),
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists card_no text not null default '';

alter table sv_people add column if not exists team_member_id uuid unique references master_project_team(id) on delete set null;

-- ── 2. team → sv_people ─────────────────────────────────────────────────────
create or replace function sv_team_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_title text; v_side text; v_user uuid := new.user_id;
begin
  if new.position_key not in ('supervision_head', 'site_supervisor', 'employer_rep') then
    -- moved out of site supervision: keep the history, stop attendance
    if tg_op = 'UPDATE' then update sv_people set active = false, is_head = false where team_member_id = new.id; end if;
    return null;
  end if;
  v_name := coalesce(nullif(trim(new.person_name), ''), (select nullif(full_name, '') from profiles where id = new.user_id), (select email from profiles where id = new.user_id), 'بدون نام');
  v_title := coalesce(nullif(trim(new.position_title), ''), case new.position_key when 'supervision_head' then 'سرپرست نظارت کارگاهی' when 'site_supervisor' then 'ناظر کارگاهی' else 'نمایندهٔ کارفرما' end);
  v_side := case when new.position_key = 'employer_rep' then 'employer' else 'supervision' end;
  -- one account per person in a project: a second team row with the same account keeps attendance without the phone link
  if v_user is not null and exists (select 1 from sv_people where master_project_id = new.project_id and user_id = v_user and team_member_id is distinct from new.id) then v_user := null; end if;
  update sv_people set full_name = v_name, role_title = v_title, side = v_side, user_id = v_user, is_head = (new.position_key = 'supervision_head'),
         mobile = coalesce(new.phone, ''), national_id = coalesce(new.national_id, ''), shift_start = new.shift_start, shift_end = new.shift_end,
         overtime_cap = new.overtime_cap, start_date = new.start_date, end_date = new.end_date, card_no = coalesce(new.card_no, ''), active = true
   where team_member_id = new.id;
  if not found then
    insert into sv_people (master_project_id, team_member_id, full_name, role_title, side, user_id, is_head, mobile, national_id, shift_start, shift_end, overtime_cap, start_date, end_date, card_no, active)
    values (new.project_id, new.id, v_name, v_title, v_side, v_user, new.position_key = 'supervision_head', coalesce(new.phone, ''), coalesce(new.national_id, ''), new.shift_start, new.shift_end, new.overtime_cap, new.start_date, new.end_date, coalesce(new.card_no, ''), true);
  end if;
  return null;
end $$;

create or replace function sv_team_unsync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update sv_people set active = false, is_head = false where team_member_id = old.id;
  return old;
end $$;

create or replace trigger sv_team_sync after insert or update on master_project_team for each row execute function sv_team_sync();
create or replace trigger sv_team_unsync before delete on master_project_team for each row execute function sv_team_unsync();

-- backfill: every existing supervisor gets a team row (head → supervision_head, employer side → employer_rep, others → site_supervisor)
do $$
declare p record; v_team uuid; v_parent uuid;
begin
  for p in select * from sv_people where team_member_id is null order by is_head desc, full_name loop
    v_parent := coalesce((select id from master_project_team where project_id = p.master_project_id and position_key = 'supervision_head' limit 1),
                         (select id from master_project_team where project_id = p.master_project_id and position_key = 'project_manager' limit 1));
    insert into master_project_team (project_id, user_id, person_name, position_key, position_title, parent_id, phone, national_id, shift_start, shift_end, overtime_cap, start_date, end_date, card_no)
    values (p.master_project_id, p.user_id, p.full_name, case when p.is_head then 'supervision_head' when p.side = 'employer' then 'employer_rep' else 'site_supervisor' end,
            p.role_title, case when p.is_head then (select id from master_project_team where project_id = p.master_project_id and position_key = 'project_manager' limit 1) else v_parent end,
            p.mobile, p.national_id, p.shift_start, p.shift_end, p.overtime_cap, p.start_date, p.end_date, p.card_no)
    returning id into v_team;
    -- the insert trigger created a twin; drop it and attach the original (its attendance history stays)
    delete from sv_people where team_member_id = v_team and id <> p.id;
    update sv_people set team_member_id = v_team, active = p.active where id = p.id;
  end loop;
end $$;

-- ── 3. menu and ratings ─────────────────────────────────────────────────────
create table if not exists sv_menu (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects(id) on delete cascade,
  day date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner')),
  main text not null default '',
  side text not null default '',
  dessert text not null default '',
  fruit text not null default '',
  cook_team text not null default '',
  note text not null default '',
  updated_at timestamptz not null default now(),
  unique (master_project_id, day, meal)
);
create index if not exists idx_sv_menu_day on sv_menu (master_project_id, day);

create table if not exists sv_meal_ratings (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references sv_menu(id) on delete cascade,
  master_project_id uuid not null references master_projects(id) on delete cascade,
  person_id uuid references sv_people(id) on delete set null,
  user_id uuid not null,
  score int not null check (score between 1 and 5),
  comment text not null default '',
  at timestamptz not null default now(),
  unique (menu_id, user_id)
);
create index if not exists idx_sv_meal_ratings on sv_meal_ratings (master_project_id, menu_id);

alter table sv_settings add column if not exists cook_team text not null default '';

alter table sv_menu enable row level security;
alter table sv_meal_ratings enable row level security;
drop policy if exists sv_menu_read on sv_menu;
create policy sv_menu_read on sv_menu for select using (sv_can_read(master_project_id));
drop policy if exists sv_menu_write on sv_menu;
create policy sv_menu_write on sv_menu for all using (sv_is_head(master_project_id) or sv_can_write(master_project_id)) with check (sv_is_head(master_project_id) or sv_can_write(master_project_id));
-- ratings are written only through sv_rate_meal
drop policy if exists sv_meal_ratings_read on sv_meal_ratings;
create policy sv_meal_ratings_read on sv_meal_ratings for select using (sv_can_read(master_project_id) or user_id = auth.uid());

-- ── 4. RPCs ─────────────────────────────────────────────────────────────────
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
  insert into sv_meal_ratings (menu_id, master_project_id, person_id, user_id, score, comment)
  values (m.id, m.master_project_id, v_person, v_uid, p_score, left(coalesce(p_comment, ''), 200))
  on conflict (menu_id, user_id) do update set score = excluded.score, comment = excluded.comment, at = now();
  return (select jsonb_build_object('avg', round(avg(score)::numeric, 2), 'n', count(*)) from sv_meal_ratings where menu_id = m.id);
end $$;

create or replace function sv_my_menu(p_person uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_project uuid;
begin
  select master_project_id into v_project from sv_people where id = p_person and user_id = auth.uid();
  if v_project is null then raise exception 'not_linked' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'day', m.day, 'meal', m.meal, 'main', m.main, 'side', m.side, 'dessert', m.dessert, 'fruit', m.fruit,
           'mine', (select score from sv_meal_ratings r where r.menu_id = m.id and r.user_id = auth.uid())) order by m.day, array_position(array['breakfast','lunch','dinner'], m.meal))
    from sv_menu m where m.master_project_id = v_project and m.day between p_from and p_to), '[]'::jsonb);
end $$;

-- the head of supervision and the project manager hear about meals the supervisors do not like (the bell)
create or replace function my_supervision_notifications() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb := '[]'::jsonb; u uuid := auth.uid(); r record;
begin
  if u is null then return v; end if;
  -- a dish: average ≤ 2.5 from at least 3 ratings in the last 30 days
  for r in
    with mine as (
      select distinct p.master_project_id as pid from sv_people p where p.user_id = u and p.is_head and p.active
      union select t.project_id from master_project_team t where t.user_id = u and t.position_key = 'project_manager'
    ), dish as (
      select m.master_project_id pid, m.main dish, avg(x.score) a, count(*) n, max(m.day) last_day
        from sv_meal_ratings x join sv_menu m on m.id = x.menu_id
       where m.master_project_id in (select pid from mine) and m.main <> '' and m.day >= (now() at time zone 'Asia/Tehran')::date - 30
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

grant execute on function sv_rate_meal(uuid, int, text), sv_my_menu(uuid, date, date), my_supervision_notifications() to authenticated;
