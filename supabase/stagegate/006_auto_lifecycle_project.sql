-- هر پروژهٔ مرکزی (master_projects) یک چرخهٔ عمر (sg_projects) دارد؛ پروژهٔ تازه همان لحظه به چرخهٔ عمر وصل می‌شود.
-- (برنامه هم هنگام اولین بازشدن پروژه، اگر اتصال نباشد، آن را می‌سازد — این trigger فقط آن را از همان ابتدا تضمین می‌کند.)
create or replace function sg_auto_lifecycle_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sg_projects where master_project_id = new.id) then
    insert into sg_projects (name, master_project_id, current_phase)
    values (
      new.official_name, new.id,
      case when new.status in ('planning', 'approved') then 'مهندسی' when new.status = 'completed' then 'تکمیل‌شده' else 'اجرا' end
    )
    on conflict (name) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_sg_auto_lifecycle_project on master_projects;
create trigger trg_sg_auto_lifecycle_project after insert on master_projects
for each row execute function sg_auto_lifecycle_project();

-- پروژه‌های موجود بدون چرخهٔ عمر
insert into sg_projects (name, master_project_id, current_phase)
select m.official_name, m.id, case when m.status in ('planning', 'approved') then 'مهندسی' when m.status = 'completed' then 'تکمیل‌شده' else 'اجرا' end
from master_projects m
where not exists (select 1 from sg_projects s where s.master_project_id = m.id)
on conflict (name) do nothing;
