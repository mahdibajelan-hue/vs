drop policy if exists sp_drawings_read on storage.objects;
drop policy if exists sp_drawings_write on storage.objects;
drop table if exists sp_welds;
drop table if exists sp_lines;
drop table if exists sp_drawings;
drop table if exists sp_logs;
drop table if exists sp_items;
drop table if exists sp_stations;
-- the bucket «sp-drawings» and its files are removed from the Supabase dashboard (Storage) if needed
