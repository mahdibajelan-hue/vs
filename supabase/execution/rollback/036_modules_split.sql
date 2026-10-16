-- restores the 030 / 033 helper definitions (ex_can_view, ex_person_signer_ok, ex_person_reopen) and the ex_can_register based policies from those files; then:
drop function if exists mtl_pipe_receive(uuid, date, jsonb, text); drop function if exists ex_personnel_set_signers(uuid, jsonb); drop function if exists ex_personnel_caps(uuid);
alter table ex_pipes drop column if exists receipt_id;
