-- Keep the uploaded Word file so a document can be re-read when the reader improves, and record which reader version produced its clauses.
alter table fin_contract_docs add column if not exists parser_version int not null default 1;
alter table fin_contract_docs add column if not exists storage_path text;
alter table fin_contract_docs add column if not exists stats jsonb not null default '{}'::jsonb;
create policy fin_contract_chunks_upd on fin_contract_chunks for update to authenticated
  using (exists (select 1 from fin_contract_docs d where d.id = doc_id and fin_can_write(d.master_project_id)))
  with check (exists (select 1 from fin_contract_docs d where d.id = doc_id and fin_can_write(d.master_project_id)));

-- private bucket; the first path segment is the master project id
insert into storage.buckets (id, name, public, file_size_limit) values ('contract-texts', 'contract-texts', false, 26214400) on conflict (id) do nothing;
create or replace function fin_contract_file_project(p_name text) returns uuid language sql immutable as $f$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(p_name, '/', 1)::uuid end
$f$;
create policy contract_texts_read on storage.objects for select to authenticated
  using (bucket_id = 'contract-texts' and (is_admin_user() or rasta_user_can_access_master_project(fin_contract_file_project(name))));
create policy contract_texts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'contract-texts' and fin_can_write(fin_contract_file_project(name)));
create policy contract_texts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'contract-texts' and fin_can_write(fin_contract_file_project(name)));
