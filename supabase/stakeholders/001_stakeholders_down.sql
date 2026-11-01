-- Rollback of 001_stakeholders.sql and 002_inbox.sql (run by hand; removes every stakeholder record).
drop table if exists public.sh_concerns;
drop table if exists public.sh_engagements;
drop table if exists public.sh_stakeholders;
drop function if exists public.sh_can_access(uuid);
drop function if exists public.inbox_my_stakeholder_work();
