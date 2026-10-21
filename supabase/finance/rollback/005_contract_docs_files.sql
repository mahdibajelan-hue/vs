drop policy if exists contract_texts_read on storage.objects;
drop policy if exists contract_texts_insert on storage.objects;
drop policy if exists contract_texts_delete on storage.objects;
drop function if exists fin_contract_file_project(text);
drop policy if exists fin_contract_chunks_upd on fin_contract_chunks;
alter table fin_contract_docs drop column if exists stats, drop column if exists storage_path, drop column if exists parser_version;
-- the bucket is kept (it may hold files); delete it by hand if wanted
