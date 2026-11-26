-- Release the signed-download client before making the bucket private.
begin;

alter policy lifecycle_evidence_read on storage.objects to authenticated using (
  bucket_id = 'lifecycle-evidence' and (
    (select public.is_admin_user()) or (
      (select public.my_module_any(array['stagegate','lifecycle'])) and (
        exists (select 1 from public.my_projects() p(id) where p.id::text = split_part(storage.objects.name, '/', 1))
        or exists (
          select 1 from public.sg_project_phase_items i
          join public.sg_projects s on s.name = i.project_name
          where s.master_project_id in (select public.my_projects())
            and right(i.evidence_file_url, length(storage.objects.name) + length('/storage/v1/object/public/lifecycle-evidence/'))
                = '/storage/v1/object/public/lifecycle-evidence/' || storage.objects.name
        )
      )
    )
  )
);

alter policy lifecycle_evidence_write on storage.objects to authenticated with check (
  bucket_id = 'lifecycle-evidence'
  and exists (select 1 from public.my_projects() p(id) where p.id::text = split_part(storage.objects.name, '/', 1))
  and (
    (select public.is_admin_user())
    or (select public.rasta_has_permission(auth.uid(), 'stagegate', 'edit'))
    or (select public.rasta_has_permission(auth.uid(), 'stagegate', 'configure'))
  )
);

-- Each replacement uploads a new object. Existing evidence cannot be overwritten.
drop policy if exists lifecycle_evidence_update on storage.objects;
update storage.buckets set public = false where id = 'lifecycle-evidence';

commit;
