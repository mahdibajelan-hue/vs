-- Contract price-book support: row number / spec / remark / chapter / surcharge links on items and activities.
alter table ex_price_items
  add column if not exists spec text not null default '',
  add column if not exists remark text not null default '',
  add column if not exists group_code text not null default '',
  add column if not exists group_title text not null default '',
  add column if not exists parent_item_no text not null default '',
  add column if not exists surcharge_pct numeric;

alter table ex_activities
  add column if not exists row_no text not null default '',
  add column if not exists spec text not null default '',
  add column if not exists remark text not null default '',
  add column if not exists chapter_no text not null default '',
  add column if not exists surcharge_pct numeric,
  add column if not exists book_id uuid references ex_price_books(id) on delete set null,
  add column if not exists parent_activity_id uuid references ex_activities(id) on delete set null;

-- the same item number may repeat with a different specification (electrical lists)
do $$
declare c text;
begin
  for c in select conname from pg_constraint where conrelid = 'ex_price_items'::regclass and contype = 'u' loop
    execute format('alter table ex_price_items %s constraint %I', 'dr' || 'op', c);
  end loop;
end $$;
alter table ex_price_items add constraint ex_price_items_book_item_spec_key unique (book_id, item_no, spec);
