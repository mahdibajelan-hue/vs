-- Removes the one-off helpers used to clone the 48-inch demo project (Kuhdasht–Sarakhs) into the
-- second demo project (42-inch Sarakhs–Mashhad, id 6b25ebd9-e2f7-4385-90e7-c954a0880232).
-- The cloned data itself stays; only the helper map, tweak table, view and functions go.
-- They are private (RLS on with no policies, execute revoked from anon/authenticated), so running
-- this is housekeeping, not a security fix. Run once in the Supabase SQL editor.

drop function if exists public.demo_clone_copy(text, text);
drop function if exists public.demo_clone_pass();
drop function if exists public.demo_clone_remap(jsonb, jsonb);
drop view if exists public.demo_clone_tables;
drop table if exists public.demo_clone_tweak;
drop table if exists public.demo_clone_map;
