-- MDL-style register fields for engineering documents: document type (REP/DWG/…), phase (DP1 detail design / PP1 procurement engineering),
-- target issue purpose (IFA/IFI/POI) and the price share the weight was derived from. All optional — existing rows keep working.
alter table ex_eng_docs add column if not exists category text not null default '';
alter table ex_eng_docs add column if not exists phase text not null default '';
alter table ex_eng_docs add column if not exists target_issue text not null default '';
alter table ex_eng_docs add column if not exists price numeric not null default 0;
