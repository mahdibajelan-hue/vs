-- Temporary helper for loading the Hamedan demo seed (too large to paste into the SQL editor in one piece):
-- an admin uploads the seed's statements in numbered parts through the API; the database owner then runs them in order
-- in one transaction. Only admins may insert; nobody may read through the API. Remove by hand when done:
--   drop table if exists public.demo_seed_staging;
create table if not exists public.demo_seed_staging (
  id integer primary key,
  part text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.demo_seed_staging enable row level security;
revoke all on public.demo_seed_staging from anon;
grant insert on public.demo_seed_staging to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'demo_seed_staging' and policyname = 'demo_seed_staging_admin_insert') then
    create policy demo_seed_staging_admin_insert on public.demo_seed_staging for insert to authenticated with check (is_admin_user());
  end if;
end $$;
