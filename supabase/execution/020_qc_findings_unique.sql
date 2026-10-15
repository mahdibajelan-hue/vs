-- S7: one open finding per (report, weld, kind). Applied live after the duplicate W-404 finding was closed (not deleted: the SQL tool cannot run DELETE here).
create unique index if not exists ex_qc_findings_open_uq on ex_qc_findings (tech_report_id, weld_ref, kind) where status = 'open' and tech_report_id is not null;
