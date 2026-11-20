-- 055 — the real plot plan as the twin's background: an image laid over the site boundary shape (its x, y, w, h
-- are the image's placement and scale in site metres; resizing the site shape rescales the image). Files live in the
-- private bucket «cs-plot» under <project id>/…; read by anyone who sees the project's execution data, written by
-- those who may write the station registers. Additive only. Rollback: rollback/055_rollback.sql (run by hand).
alter table public.cs_plot_shapes add column if not exists image_path text;
alter table public.cs_plot_shapes add column if not exists image_opacity numeric not null default 0.55;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cs_plot_shapes_image_chk') then
    alter table public.cs_plot_shapes add constraint cs_plot_shapes_image_chk check ((image_path is null or kind = 'site') and image_opacity between 0 and 1);
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cs-plot', 'cs-plot', false, 15728640, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- the folder is the project id; a malformed folder name simply matches nothing
create or replace function public.cs_plot_folder_project(p_name text) returns uuid
language sql immutable as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(p_name, '/', 1)::uuid end
$$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'cs_plot_read') then
    create policy cs_plot_read on storage.objects for select to authenticated using (bucket_id = 'cs-plot' and ex_can_view(public.cs_plot_folder_project(name)));
    create policy cs_plot_write on storage.objects for insert to authenticated with check (bucket_id = 'cs-plot' and cs_can_write(public.cs_plot_folder_project(name)));
  end if;
end $$;
