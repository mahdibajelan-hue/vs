-- Weighted share of a schedule activity ↔ execution activity link (audit M5). When one schedule activity is made of several
-- execution activities, its executed progress is the share-weighted average of theirs (empty share = equal weights, as before).
alter table public.sch_links add column if not exists share numeric check (share is null or share > 0);
