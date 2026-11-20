#!/usr/bin/env python3
"""Writes supabase/seed/demo_hamedan_cs_cleanup.sql: removes the Hamedan demo project and everything the seed added.
Run BY HAND only (SQL editor). It touches nothing but rows of this project and the six demo supplier organisations."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import *
from m_master import RM_P, IM_P
p = q(P)
T = [  # child tables first; every condition names this project's own ids
 f"delete from ex_report_stoppages where report_id in (select id from ex_reports where project_id={p})",
 f"delete from ex_report_resources where report_id in (select id from ex_reports where project_id={p})",
 f"delete from ex_report_lines where report_id in (select id from ex_reports where project_id={p})",
 f"delete from ex_reports where project_id={p}", f"delete from ex_baseline_lines where baseline_id in (select id from ex_baselines where project_id={p})",
 f"delete from ex_baselines where project_id={p}", f"delete from ex_activities where project_id={p}", f"delete from ex_price_books where project_id={p}",
 f"delete from ex_project_roles where project_id={p}", f"delete from ex_settings where project_id={p}", f"delete from ex_entry_timings where project_id={p}",
 f"delete from ex_eng_doc_cycles where project_id={p}", f"delete from ex_eng_docs where project_id={p}",
 f"delete from cs_inspections where project_id={p}", f"delete from cs_history where project_id={p}", f"delete from cs_welds where project_id={p}", f"delete from cs_spools where project_id={p}",
 f"delete from cs_lines where project_id={p}", f"delete from cs_equipment where project_id={p}", f"delete from cs_test_packs where project_id={p}", f"delete from cs_qc_settings where project_id={p}", f"delete from cs_plot_shapes where project_id={p}",
 f"delete from mtl_txns where master_project_id={p}", f"delete from mtl_warehouse_lines where receipt_id in (select id from mtl_warehouse_receipts where master_project_id={p})",
 f"delete from mtl_warehouse_receipts where master_project_id={p}", f"delete from mtl_shipment_lines where shipment_id in (select id from mtl_shipments where master_project_id={p})",
 f"delete from mtl_shipments where master_project_id={p}", f"delete from mtl_manufacturing where po_line_id in (select l.id from mtl_po_lines l join mtl_purchase_orders o on o.id=l.po_id where o.master_project_id={p})",
 f"delete from mtl_po_lines where po_id in (select id from mtl_purchase_orders where master_project_id={p})", f"delete from mtl_purchase_orders where master_project_id={p}",
 f"delete from mtl_procurement_lines where request_id in (select id from mtl_procurement_requests where master_project_id={p})", f"delete from mtl_procurement_requests where master_project_id={p}",
 f"delete from mtl_item_stages where item_id in (select i.id from mtl_package_items i join mtl_packages k on k.id=i.package_id where k.master_project_id={p})",
 f"delete from mtl_package_items where package_id in (select id from mtl_packages where master_project_id={p})", f"delete from mtl_packages where master_project_id={p}",
 f"delete from mtl_discrepancies where master_project_id={p}", f"delete from mtl_materials where master_project_id={p}", f"delete from mtl_mto_revisions where master_project_id={p}", f"delete from mtl_lookups where master_project_id={p}",
 f"update sch_versions set status='draft', is_baseline=false, review_status='none' where project_id={p}", f"delete from sch_relations where project_id={p}", f"delete from sch_activities where project_id={p}", f"delete from sch_calendars where project_id={p}", f"delete from sch_milestones where project_id={p}",
 f"delete from sch_delay_events where project_id={p}", f"delete from sch_risk_events where project_id={p}", f"delete from sch_versions where project_id={p}", f"delete from sch_contract where project_id={p}",
 f"delete from rasta_actions where master_project_id={p}", f"delete from rasta_decisions where master_project_id={p}",
 f"delete from rm_kris where project_id={q(RM_P)}", f"delete from rm_risks where project_id={q(RM_P)}", f"delete from rm_projects where id={q(RM_P)}",
 f"delete from im_decisions where project_id={q(IM_P)}", f"delete from im_lessons where project_id={q(IM_P)}", f"delete from im_issues where project_id={q(IM_P)}", f"delete from im_projects where id={q(IM_P)}",
 f"delete from chg_change_requests where master_project_id={p}", f"delete from pssr_signers where master_project_id={p}", f"delete from pssr_systems where master_project_id={p}",
 f"delete from fin_payments where certificate_id in (select c.id from fin_payment_certificates c join fin_contracts k on k.id=c.contract_id where k.master_project_id={p})",
 f"delete from fin_payment_certificates where contract_id in (select id from fin_contracts where master_project_id={p})", f"delete from fin_guarantees where contract_id in (select id from fin_contracts where master_project_id={p})",
 f"delete from fin_claims where contract_id in (select id from fin_contracts where master_project_id={p})", f"delete from fin_cashflow_plans where master_project_id={p}",
 f"delete from fin_contract_amendments where contract_id in (select id from fin_contracts where master_project_id={p})", f"delete from fin_contracts where master_project_id={p}",
 f"delete from fin_annual_budgets where master_project_id={p}", f"delete from fin_budget_lines where master_project_id={p}", f"delete from fin_budgets where master_project_id={p}",
 f"delete from sh_concerns where master_project_id={p}", f"delete from sh_engagements where master_project_id={p}", f"delete from sh_stakeholders where master_project_id={p}",
 f"delete from sv_vehicle_days where master_project_id={p}", f"delete from sv_vehicles where master_project_id={p}", f"delete from sv_attendance where master_project_id={p}", f"delete from sv_people where master_project_id={p}", f"delete from sv_sites where master_project_id={p}", f"delete from ms_missions where master_project_id={p}",
 f"delete from rasta_project_mappings where master_project_id={p}", f"delete from sg_projects where master_project_id={p}",
 f"delete from master_project_team where project_id={p}", f"delete from master_project_parties where project_id={p}", f"delete from master_projects where id={p}",
 f"delete from ex_audit where project_id={p}", f"delete from mtl_audit where master_project_id={p}", f"delete from fin_audit where master_project_id={p}", f"delete from fin_sync_log where master_project_id={p}",
 "delete from organizations where id in (" + ",".join(q(i) for i, _ in SUP.values()) + ")",
]
EXTRA_FILE = os.path.join(os.path.dirname(__file__), 'cleanup_extra.sql')
with open(os.path.join(os.path.dirname(__file__), '..', 'demo_hamedan_cs_cleanup.sql'), 'w') as f:
    f.write("-- Removes the Hamedan compressor-station DEMO project and every row its seed added. Run BY HAND (SQL editor) only.\n-- It touches only rows of this project (id " + P + ") and the six demo supplier organisations the seed created.\nbegin;\nselect set_config('ex.rpc', '1', true), set_config('mtl.rpc', '1', true), set_config('sch.rpc', '1', true), set_config('app.cm_rpc', '1', true);\n")
    if os.path.exists(EXTRA_FILE): f.write(open(EXTRA_FILE).read())
    f.write(";\n".join(T) + ";\ncommit;\n")
