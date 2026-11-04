-- rollback of access/003 (run by hand only). Rows already written for new users stay; open them in the User Center.
drop trigger if exists trg_close_modules_for_new_user on public.profiles;
drop function if exists public.rasta_close_modules_for_new_user();
-- the four registered modules can stay; to unregister them:
-- delete from rasta_permissions where module_key in ('pssr','testing','stationpiping','stakeholders');
-- delete from rasta_modules where key in ('pssr','testing','stationpiping','stakeholders');
