-- حضور و غیاب دستگاه نظارت — vehicle specifications (applied 1405/07/30): model year (Jalali or Gregorian), engine size,
-- gearbox, and whether the car is rented or company-owned.
alter table sv_vehicles add column if not exists model_year int check (model_year is null or model_year between 1300 and 2100),
  add column if not exists engine_cc int check (engine_cc is null or engine_cc between 50 and 20000),
  add column if not exists gearbox text check (gearbox is null or gearbox in ('manual', 'automatic')),
  add column if not exists ownership text not null default 'rented' check (ownership in ('rented', 'company'));
