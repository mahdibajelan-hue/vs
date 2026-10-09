-- Issue Management v2 — evidence bucket. Object path convention: <issue_id>/<uuid>-<filename>
-- (apply each statement separately on Supabase MCP; storage.objects DDL can exceed the 60 s limit when batched).
insert into storage.buckets (id, name, public, file_size_limit) values ('issue-evidence', 'issue-evidence', false, 20971520) on conflict (id) do nothing;

drop policy if exists im_evidence_read on storage.objects;
create policy im_evidence_read on storage.objects for select to authenticated
  using (bucket_id = 'issue-evidence' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and im_can_see_issue(((storage.foldername(name))[1])::uuid));
drop policy if exists im_evidence_write on storage.objects;
create policy im_evidence_write on storage.objects for insert to authenticated
  with check (bucket_id = 'issue-evidence' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and im_can_write_issue(((storage.foldername(name))[1])::uuid));
drop policy if exists im_evidence_delete on storage.objects;
create policy im_evidence_delete on storage.objects for delete to authenticated
  using (bucket_id = 'issue-evidence' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' and im_can_write_issue(((storage.foldername(name))[1])::uuid));
