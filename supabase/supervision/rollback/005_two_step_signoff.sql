-- Undo 005: restore the three-step sv_sign / sv_reopen from 004.

create or replace function sv_sign(p_project uuid, p_month text, p_from date, p_to date, p_step text, p_image text, p_title text, p_note text, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_status text; v_need text; v_perm text; v_name text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not sv_can_read(p_project) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_step not in ('prepared', 'reviewed', 'approved') then raise exception 'bad_step'; end if;
  if coalesce(p_image, '') !~ '^data:image/(png|jpeg);base64,' or length(p_image) > 400000 then raise exception 'bad_signature'; end if;
  v_perm := case p_step when 'prepared' then 'submit' when 'reviewed' then 'review' else 'approve' end;
  if not (is_admin_user() or rasta_has_permission(v_uid, 'supervision', v_perm)) then raise exception 'step_not_allowed' using errcode = '42501'; end if;
  select status into v_status from sv_month_signoffs where master_project_id = p_project and month = p_month for update;
  v_status := coalesce(v_status, 'open');
  v_need := case p_step when 'prepared' then 'open' when 'reviewed' then 'prepared' else 'reviewed' end;
  if v_status <> v_need then raise exception 'wrong_order:%', v_status; end if;
  -- four-eyes: one person signs one step (platform admins excepted)
  if not is_admin_user() and exists (select 1 from sv_month_signatures where master_project_id = p_project and month = p_month and revoked_at is null and user_id = v_uid) then
    raise exception 'same_signer';
  end if;
  select coalesce(nullif(full_name, ''), email, '') into v_name from profiles where id = v_uid;
  insert into sv_month_signatures (master_project_id, month, step, user_id, signer_name, signer_title, image, note, snapshot)
  values (p_project, p_month, p_step, v_uid, coalesce(v_name, ''), coalesce(p_title, ''), p_image, coalesce(p_note, ''), coalesce(p_snapshot, '{}'::jsonb));
  insert into sv_month_signoffs (master_project_id, month, status, from_day, to_day, updated_at) values (p_project, p_month, p_step, p_from, p_to, now())
  on conflict (master_project_id, month) do update set status = excluded.status, from_day = excluded.from_day, to_day = excluded.to_day, updated_at = now();
  return jsonb_build_object('status', p_step);
end $$;

-- Back to «open» for corrections: every active signature of the month is revoked (kept, with reason, for the audit trail).
create or replace function sv_reopen(p_project uuid, p_month text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); n int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'reason_required'; end if;
  if not (is_admin_user() or (sv_can_read(p_project) and (rasta_has_permission(v_uid, 'supervision', 'review') or rasta_has_permission(v_uid, 'supervision', 'approve')
          or exists (select 1 from sv_month_signatures where master_project_id = p_project and month = p_month and revoked_at is null and user_id = v_uid)))) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update sv_month_signatures set revoked_at = now(), revoked_by = v_uid, revoke_reason = trim(p_reason)
   where master_project_id = p_project and month = p_month and revoked_at is null;
  get diagnostics n = row_count;
  update sv_month_signoffs set status = 'open', updated_at = now() where master_project_id = p_project and month = p_month;
  return jsonb_build_object('revoked', n);
end $$;

