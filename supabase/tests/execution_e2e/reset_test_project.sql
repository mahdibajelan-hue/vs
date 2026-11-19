-- removes ONLY the test project's rows from the isolated test database (run as its superuser; never on a live database)
set session_replication_role = replica;   -- guards off; so child rows are removed explicitly (no cascade in this mode)
create temp table t_rep as select id from ex_reports where project_id = '7e570000-0000-4000-8000-0000000000e2';
delete from ex_report_lines where report_id in (select id from t_rep);
delete from ex_report_resources where report_id in (select id from t_rep);
delete from ex_report_stoppages where report_id in (select id from t_rep);
delete from ex_report_signatures where report_id in (select id from t_rep);
delete from ex_report_versions where report_id in (select id from t_rep);
delete from ex_report_history where report_id in (select id from t_rep);
delete from ex_reports where id in (select id from t_rep);
delete from ex_measurements where project_id = '7e570000-0000-4000-8000-0000000000e2';
delete from ex_statement_rows where project_id = '7e570000-0000-4000-8000-0000000000e2';
delete from ex_statements where project_id = '7e570000-0000-4000-8000-0000000000e2';
