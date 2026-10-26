-- فضای ذخیرهٔ مدارک چرخهٔ عمر (Stage-Gate): بارگذاری مدرک برای خروجی‌ها و معیارهای گیت. کد از getPublicUrl استفاده می‌کند، پس bucket عمومی است.
insert into storage.buckets (id, name, public, file_size_limit) values ('lifecycle-evidence', 'lifecycle-evidence', true, 52428800) on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'lifecycle_evidence_read') then
    create policy lifecycle_evidence_read on storage.objects for select to authenticated using (bucket_id = 'lifecycle-evidence');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'lifecycle_evidence_write') then
    create policy lifecycle_evidence_write on storage.objects for insert to authenticated with check (bucket_id = 'lifecycle-evidence');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'lifecycle_evidence_update') then
    create policy lifecycle_evidence_update on storage.objects for update to authenticated using (bucket_id = 'lifecycle-evidence') with check (bucket_id = 'lifecycle-evidence');
  end if;
end $$;
