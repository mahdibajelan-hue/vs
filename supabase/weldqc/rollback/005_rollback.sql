-- rollback of weldqc/005 — run by hand only
drop table if exists wq_crew;
drop table if exists wq_coating;
alter table wq_defects drop column if exists code, drop column if exists width_mm, drop column if exists clock, drop column if exists quadrant, drop column if exists density_over, drop column if exists ai_action;
alter table wq_films drop column if exists display_path, drop column if exists orig_mime, drop column if exists metrics, drop column if exists ai;
