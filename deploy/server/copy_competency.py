#!/usr/bin/env python3
"""Builds the SQL that brings this server's competency data (comp_* and personality_* tables) into the cloud database.

Called by copy-competency-to-cloud.sh, which passes the connections in the environment. It reads the table structure
of both databases, then writes one SQL file that, run on the cloud in one transaction:
  - adds the user accounts made only on this server (account, login, profile, module access, signature)
  - puts each competency table's rows of this server into a temporary table and compares them with the cloud's:
      new here             -> added
      changed here         -> the cloud row is replaced, unless the cloud's copy was edited later (updated_at)
      the same             -> left alone
    rows that exist only in the cloud are never touched or removed
  - prints what it found, then ends with ROLLBACK (check) or COMMIT (--apply).
The file holds the rows themselves, so the caller keeps it in a private folder and deletes it at the end.

Environment: DB (container), SRC_CONN + PGPASSWORD (cloud), OUT (the SQL file), APPLY (1 = commit)
"""
import json
import os
import re
import subprocess
import sys

DB = os.environ.get("DB", "supabase-db")
OUT = os.environ["OUT"]
APPLY = os.environ.get("APPLY") == "1"
MODULE = re.compile(r"^(comp|personality)_")
SKIP = re.compile(r"_backup_\d+$")  # one-off copies of a table, not module data
USER_TABLES = [("public", "profiles"), ("public", "rasta_user_module_access"), ("public", "user_signatures")]


def here_cmd(*args):
    return ["docker", "exec", DB, "psql", "-h", "localhost", "-U", "supabase_admin", "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1", *args]


def cloud_cmd(*args):
    return ["docker", "exec", "-e", "PGPASSWORD=" + os.environ["PGPASSWORD"], DB, "psql", os.environ["SRC_CONN"], "-X", "-q", "-v", "ON_ERROR_STOP=1", *args]


CATALOG = r"""
select coalesce(json_agg(json_build_object(
  's', n.nspname, 't', c.relname,
  'cols', (select json_agg(json_build_object('n', a.attname, 'gen', a.attgenerated <> '', 'ident', a.attidentity <> '') order by a.attnum)
           from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
  'pk', (select json_agg(a.attname order by array_position(p.conkey, a.attnum)) from pg_constraint p
         join pg_attribute a on a.attrelid = p.conrelid and a.attnum = any(p.conkey) where p.conrelid = c.oid and p.contype = 'p'))), '[]')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and ((n.nspname = 'public' and (c.relname ~ '^(comp|personality)_' or c.relname in ('profiles', 'rasta_user_module_access', 'user_signatures')))
                        or (n.nspname = 'auth' and c.relname in ('users', 'identities')))
"""


def catalog(cmd):
    out = subprocess.run(cmd("-tA", "-c", CATALOG), check=True, capture_output=True, text=True).stdout
    return {(t["s"], t["t"]): t for t in json.loads(out)}


def q(name):
    return '"' + name.replace('"', '""') + '"'


def lit(s):
    return "'" + s.replace("'", "''") + "'"


here, cloud = catalog(here_cmd), catalog(cloud_cmd)
notes = []


def shared_cols(key):
    """columns both sides can write (generated columns are computed, never copied)"""
    h = {c["n"]: c for c in here[key]["cols"] if not c["gen"]}
    cl = {c["n"]: c for c in cloud[key]["cols"] if not c["gen"]}
    only_here = [n for n in h if n not in cl]
    if only_here:
        notes.append(f"{key[0]}.{key[1]}: column(s) only on this server, not copied: {', '.join(only_here)}")
    return [n for n in h if n in cl], cl


def stage(f, key, cols, where=""):
    """a temporary table on the cloud with this server's rows (the data follows inline, as in a pg_dump file)"""
    s, t = key
    tmp = f"s_{s}_{t}"
    collist = ", ".join(q(c) for c in cols)
    f.write(f"create temp table {q(tmp)} as select {collist} from {q(s)}.{q(t)} with no data;\n")
    f.write(f"copy {q(tmp)} ({collist}) from stdin;\n")
    f.flush()
    sel = f"select {collist} from {q(s)}.{q(t)}{where}"
    subprocess.run(here_cmd("-c", f"\\copy ({sel}) to stdout"), check=True, stdout=f)
    f.write("\\.\n")
    return tmp


def row(alias, cols):
    return "row(" + ", ".join(f"{alias}.{q(c)}" for c in cols) + ")::text"


with open(OUT, "w") as f:
    f.write("set client_min_messages = warning;\nbegin;\nset local session_replication_role = replica;\n")
    f.write("create temp table _rep (tbl text, here int, added int, updated int, cloud_newer int, same int);\n")

    # 1. accounts made only on this server
    for key in [("auth", "users"), ("auth", "identities")] + USER_TABLES:
        if key not in here or key not in cloud:
            notes.append(f"{key[0]}.{key[1]}: missing on one side, skipped")
    ucols, _ = shared_cols(("auth", "users"))
    stage(f, ("auth", "users"), ucols)
    f.write("create temp table _new_users as select id, email from s_auth_users s where not exists (select 1 from auth.users u where u.id = s.id);\n")
    f.write("""do $$ declare e text; begin
  select string_agg(n.email, ', ') into e from _new_users n join auth.users u on lower(u.email) = lower(n.email);
  if e is not null then raise exception 'These people already have a cloud account under another id: %%. Nothing was changed.', e; end if;
end $$;\n""".replace("%%", "%"))
    cl = ", ".join(q(c) for c in ucols)
    f.write(f"insert into auth.users ({cl}) select {cl} from s_auth_users where id in (select id from _new_users);\n")
    f.write("insert into _rep select 'accounts (auth.users)', (select count(*) from s_auth_users), (select count(*) from _new_users), 0, 0, (select count(*) from s_auth_users) - (select count(*) from _new_users);\n")
    for key, ucol in [(("auth", "identities"), "user_id")] + [(k, "id" if k[1] == "profiles" else "user_id") for k in USER_TABLES]:
        if key not in here or key not in cloud:
            continue
        cols, _ = shared_cols(key)
        tmp = stage(f, key, cols)
        cl = ", ".join(q(c) for c in cols)
        f.write(f"insert into {q(key[0])}.{q(key[1])} ({cl}) select {cl} from {q(tmp)} where {q(ucol)} in (select id from _new_users) on conflict do nothing;\n")

    # 2. the competency tables
    for key in sorted(k for k in here if k[0] == "public" and MODULE.match(k[1]) and not SKIP.search(k[1])):
        if key not in cloud:
            notes.append(f"{key[1]}: table only on this server, not copied")
            continue
        pk = cloud[key]["pk"] or []
        if not pk:
            notes.append(f"{key[1]}: no primary key, not copied")
            continue
        cols, clcols = shared_cols(key)
        if any(p not in cols for p in pk):
            notes.append(f"{key[1]}: key columns differ, not copied")
            continue
        tmp, tq = stage(f, key, cols), f"public.{q(key[1])}"
        cl = ", ".join(q(c) for c in cols)
        ident_pk = len(pk) == 1 and clcols[pk[0]]["ident"]
        if ident_pk:
            # a number the database hands out (1, 2, 3 …): the same number can mean different rows on the two sides,
            # so rows are matched by their content and new ones get the cloud's next number
            rest = [c for c in cols if c != pk[0]]
            rl = ", ".join(q(c) for c in rest)
            same = f"exists (select 1 from {tq} t where {row('t', rest)} = {row('s', rest)})"
            f.write(f"insert into _rep select {lit(key[1])}, count(*), count(*) filter (where not {same}), 0, 0, count(*) filter (where {same}) from {q(tmp)} s;\n")
            f.write(f"insert into {tq} ({rl}) select {rl} from {q(tmp)} s where not {same};\n")
            continue
        on = " and ".join(f"t.{q(p)} = s.{q(p)}" for p in pk)
        differ = f"{row('s', cols)} is distinct from {row('t', cols)}"
        newer = "(t.updated_at is null or s.updated_at is null or s.updated_at >= t.updated_at)" if "updated_at" in cols else "true"
        f.write(f"""insert into _rep select {lit(key[1])}, count(*), count(*) filter (where t.ctid is null),
  count(*) filter (where t.ctid is not null and {differ} and {newer}), count(*) filter (where t.ctid is not null and {differ} and not {newer}),
  count(*) filter (where t.ctid is not null and not {differ}) from {q(tmp)} s left join {tq} t on {on};\n""")
        upd = [c for c in cols if c not in pk]
        excl = newer.replace("s.", "excluded.")
        conflict = (f"do update set " + ", ".join(f"{q(c)} = excluded.{q(c)}" for c in upd)
                    + f" where {row('t', cols)} is distinct from {row('excluded', cols)} and {excl}") if upd else "do nothing"
        f.write(f"insert into {tq} as t ({cl}) select {cl} from {q(tmp)} on conflict ({', '.join(q(p) for p in pk)}) {conflict};\n")

    f.write("\\pset footer off\n\\echo\n\\echo '    Rows of this server compared with the cloud (added = new, updated = changed here, cloud newer = kept as in the cloud):'\n")
    f.write("select tbl as \"table\", here as \"on this server\", added, updated, cloud_newer as \"cloud newer\", same from _rep where here > 0 order by tbl = 'accounts (auth.users)' desc, tbl;\n")
    f.write("select coalesce(sum(added), 0) as \"rows added\", coalesce(sum(updated), 0) as \"rows updated\" from _rep;\n")
    f.write("\\echo '    New accounts (people who exist only on this server):'\nselect coalesce(string_agg(email, ', '), '(none)') as accounts from _new_users;\n")
    f.write("commit;\n" if APPLY else "rollback;\n")

for n in notes:
    print("    ! " + n)
