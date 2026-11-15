-- Run by hand only. Removes the site photos (rows; the files stay in the bucket «ex-photos» until removed in Storage).
begin;
drop policy if exists ex_photos_obj_read on storage.objects;
drop policy if exists ex_photos_obj_write on storage.objects;
drop table if exists ex_photo_picks;
drop table if exists ex_photos;
commit;
