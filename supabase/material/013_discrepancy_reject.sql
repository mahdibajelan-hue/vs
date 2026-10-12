-- Discrepancy decision: adds the status 'rejected' (ردشده) next to accepted/resolved/escalated.
-- Deciding (resolved/accepted/rejected/escalated) needs 'decide_discrepancy' (employer / consultant); resolved/accepted/rejected need a written reason.
alter table mtl_discrepancies drop constraint mtl_discrepancies_status_check;
alter table mtl_discrepancies add constraint mtl_discrepancies_status_check check (status in ('open','in_review','resolved','accepted','rejected','escalated','cleared'));
-- mtl_decide_discrepancy(...) re-created with 'rejected' treated as a deciding status that requires a resolution text (see 004 for the base definition).
