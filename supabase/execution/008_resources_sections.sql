-- Daily-report resource rows follow the contractor's paper sheet: grouped by work section;
-- manpower: total / active / leave / stopped / native / non-native; machinery: total / active / inactive (idle_qty) / stopped / repair.
alter table ex_report_resources
  add column if not exists section text not null default '',
  add column if not exists total_qty numeric not null default 0,
  add column if not exists leave_qty numeric not null default 0,
  add column if not exists stopped_qty numeric not null default 0,
  add column if not exists native_qty numeric not null default 0,
  add column if not exists nonnative_qty numeric not null default 0,
  add column if not exists repair_qty numeric not null default 0;
do $$ begin perform set_config('ex.rpc', '1', true); update ex_report_resources set total_qty = active_qty + idle_qty where total_qty = 0; end $$;
-- weather, ground, site status, «شرح عملیات», «موانع و مشکلات» and the next-day plan live in ex_reports.data (jsonb): tempMin, tempMax, humidity, siteStatus, groundStatus, ops[], obstacles[], nextDay{date,hours,condition,rows[]}.
