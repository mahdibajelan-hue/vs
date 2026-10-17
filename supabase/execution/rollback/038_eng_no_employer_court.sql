-- restore ex_doc_transition from 014 (employer approval step) and drop comments
drop table if exists ex_doc_comments;
drop function if exists ex_doc_comment_add(uuid, text);
