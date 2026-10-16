-- restores the 032 behaviour of ex_welder_lock / ex_welder_qual_lock (re-apply those definitions from 031/032) and removes the signing functions
drop function if exists ex_person_sign(text, uuid, text); drop function if exists ex_person_reopen(text, uuid); drop function if exists ex_person_signer_ok(uuid, text);
alter table ex_welder_quals drop column if exists wqt_sign_a, drop column if exists wqt_sign_b;
alter table ex_welders drop column if exists card_sign_a, drop column if exists card_sign_b;
