-- Contract documents (Word) uploaded per project and cut into searchable clauses. The text only; the .docx file itself is not stored.
create table if not exists fin_contract_docs (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null,
  contract_id uuid references fin_contracts(id) on delete set null,
  title text not null,
  file_name text not null default '',
  file_hash text not null,
  byte_size int not null default 0,
  chunk_count int not null default 0,
  uploaded_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (master_project_id, file_hash)
);
create table if not exists fin_contract_chunks (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references fin_contract_docs(id) on delete cascade,
  ord int not null,
  clause_no text not null default '',
  heading text not null default '',
  path text not null default '',
  body text not null,
  kind text not null default 'clause' check (kind in ('clause','row'))
);
create index if not exists fin_contract_chunks_doc on fin_contract_chunks (doc_id, ord);

alter table fin_contract_docs enable row level security;
alter table fin_contract_chunks enable row level security;
-- contract text is read by the project's people only; written by those who can edit finance data of the project
create policy fin_contract_docs_sel on fin_contract_docs for select to authenticated using (is_admin_user() or rasta_user_can_access_master_project(master_project_id));
create policy fin_contract_docs_ins on fin_contract_docs for insert to authenticated with check (fin_can_write(master_project_id));
create policy fin_contract_docs_upd on fin_contract_docs for update to authenticated using (fin_can_write(master_project_id)) with check (fin_can_write(master_project_id));
create policy fin_contract_docs_del on fin_contract_docs for delete to authenticated using (fin_can_write(master_project_id));
create policy fin_contract_chunks_sel on fin_contract_chunks for select to authenticated using (exists (select 1 from fin_contract_docs d where d.id = doc_id and (is_admin_user() or rasta_user_can_access_master_project(d.master_project_id))));
create policy fin_contract_chunks_ins on fin_contract_chunks for insert to authenticated with check (exists (select 1 from fin_contract_docs d where d.id = doc_id and fin_can_write(d.master_project_id)));
create policy fin_contract_chunks_del on fin_contract_chunks for delete to authenticated using (exists (select 1 from fin_contract_docs d where d.id = doc_id and fin_can_write(d.master_project_id)));
