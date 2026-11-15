-- rollback of weldqc 008 (CAPA / RCA). Run by hand; it removes every CAPA case, its meeting, actions and history.
drop trigger if exists wq_ncr_capa_gate on ex_ncr;
drop function if exists wq_ncr_capa_gate();
drop function if exists wq_capa_verify(uuid, text, text, jsonb);
drop function if exists wq_capa_advance(uuid, text, text, int);
drop function if exists wq_capa_action(uuid, text, jsonb);
drop function if exists wq_capa_sign(uuid);
drop function if exists wq_capa_attendee(uuid, text, jsonb);
drop function if exists wq_capa_save(uuid, jsonb);
drop function if exists wq_capa_open(uuid, jsonb);
drop function if exists wq_capa_unsign(uuid, int);
drop function if exists wq_capa_ready(wq_capa);
drop function if exists wq_capa_log(uuid, uuid, text, text);
drop function if exists wq_capa_me();
drop function if exists wq_capa_can(uuid);
drop table if exists wq_capa_events;
drop table if exists wq_capa_actions;
drop table if exists wq_capa_attendees;
drop table if exists wq_capa;
