-- Online MCQ: default difficulty mix 30/45/25 → 15/40/45 (easy/medium/hard).
-- Live data: 7 scored tests, average 88 %, lowest 76.7 %, four at or above 90 % — the test did not separate candidates.
do $patch$
declare v_src text := pg_get_functiondef('public.comp_mcq_generate_test(uuid,integer,integer,boolean)'::regprocedure); v_new text;
begin
  v_new := replace(v_src, 'round(v_n * 0.30)::int, 0, round(v_n * 0.25)::int', 'round(v_n * 0.15)::int, 0, round(v_n * 0.45)::int');
  if v_new = v_src then raise notice 'already patched or pattern not found'; return; end if;
  execute v_new;
end
$patch$;
