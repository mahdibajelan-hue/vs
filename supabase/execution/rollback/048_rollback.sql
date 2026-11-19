-- Rollback of 048 (report builder register). Run by hand; removes the issued-document register and templates with their rows.
drop function if exists public.ex_doc_sign(uuid, text);
drop function if exists public.ex_doc_issue(uuid, uuid, text, text, date, date, jsonb, jsonb, text, text);
drop table if exists public.ex_issued_docs;
drop table if exists public.ex_report_templates;
