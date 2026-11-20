-- Rollback of 055_cs_plot_image.sql — run by hand only. The uploaded images stay in the bucket until removed in Storage.
drop policy if exists cs_plot_read on storage.objects;
drop policy if exists cs_plot_write on storage.objects;
drop function if exists public.cs_plot_folder_project(text);
alter table public.cs_plot_shapes drop constraint if exists cs_plot_shapes_image_chk;
alter table public.cs_plot_shapes drop column if exists image_opacity;
alter table public.cs_plot_shapes drop column if exists image_path;
