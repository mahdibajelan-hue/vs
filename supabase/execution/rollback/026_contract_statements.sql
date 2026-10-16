-- R-C only while empty; with data: rename to _retired_* and ask for approval (R-D).
drop function if exists ex_statement_reopen(uuid), ex_statement_finalize(uuid), ex_statement_accept(uuid), ex_statement_set(uuid, text, numeric), ex_statement_refresh(uuid, jsonb), ex_statement_create(uuid, date, date, jsonb), ex_statement_prev(uuid);
drop table if exists ex_statement_rows;
drop table if exists ex_statements;
