-- New accounts start with every module closed; an admin opens what each person needs (User Center → Modules).
-- Existing accounts keep what they have today (no rows are written for them).
-- PSSR, testing, stations and stakeholders were always open in the app because they were not registered as modules;
-- they are registered here (with the standard ten permissions) so they can be opened and closed like the rest.
insert into rasta_modules (key, label_fa, is_active) values
  ('pssr', 'آمادگی راه‌اندازی (PSSR)', true),
  ('testing', 'آزمایش‌ها (هیدروتست و پوشش)', true),
  ('stationpiping', 'ایستگاه‌ها (پایپینگ و جوشکاری)', true),
  ('stakeholders', 'مدیریت ذینفعان', true)
on conflict (key) do nothing;
insert into rasta_permissions (module_key, action)
select m.k, a.a from (values ('pssr'), ('testing'), ('stationpiping'), ('stakeholders')) m(k)
cross join (values ('view'), ('create'), ('edit'), ('delete'), ('submit'), ('review'), ('approve'), ('reject'), ('export'), ('configure')) a(a)
where not exists (select 1 from rasta_permissions p where p.module_key = m.k and p.action = a.a);

-- a new profile: a «closed» row for every active module (an admin, or a module opened later, removes it)
create or replace function public.rasta_close_modules_for_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  insert into rasta_user_module_access (user_id, module_key, has_access)
  select new.id, m.key, false from rasta_modules m where m.is_active
  on conflict (user_id, module_key) do nothing;
  return new;
end
$function$;
create trigger trg_close_modules_for_new_user after insert on public.profiles for each row execute function rasta_close_modules_for_new_user();
