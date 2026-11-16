-- perf 003 — RUN BY HAND (it drops policies). Supabase advisor «multiple permissive policies»: 15 tables carry both the
-- admin-only merged_insert/update/delete_public policies and an ALL policy for the project role, so every query evaluates
-- both. Each role rule is folded into the matching merged policy (same OR, so the same rows are allowed) and the ALL
-- policy is dropped. Reading is unchanged: merged_select_public already lets any signed-in user read these tables.
-- Check after running: select tablename, policyname, cmd from pg_policies where tablename like 'mtl_%' or tablename like 'fin_pay%';
begin;
-- mtl_allocations
alter policy merged_insert_public on mtl_allocations with check (is_admin_user() or mtl_allows(master_project_id, 'post_txn'));
alter policy merged_update_public on mtl_allocations using (is_admin_user() or mtl_allows(master_project_id, 'post_txn')) with check (is_admin_user() or mtl_allows(master_project_id, 'post_txn'));
alter policy merged_delete_public on mtl_allocations using (is_admin_user() or mtl_allows(master_project_id, 'post_txn'));
drop policy mtl_allocations_role_w on mtl_allocations;
-- mtl_manufacturing
alter policy merged_insert_public on mtl_manufacturing with check (is_admin_user() or mtl_allows((select p.master_project_id from mtl_po_lines l join mtl_purchase_orders p on p.id = l.po_id where l.id = mtl_manufacturing.po_line_id), 'edit_packages'));
alter policy merged_update_public on mtl_manufacturing using (is_admin_user() or mtl_allows((select p.master_project_id from mtl_po_lines l join mtl_purchase_orders p on p.id = l.po_id where l.id = mtl_manufacturing.po_line_id), 'edit_packages')) with check (is_admin_user() or mtl_allows((select p.master_project_id from mtl_po_lines l join mtl_purchase_orders p on p.id = l.po_id where l.id = mtl_manufacturing.po_line_id), 'edit_packages'));
alter policy merged_delete_public on mtl_manufacturing using (is_admin_user() or mtl_allows((select p.master_project_id from mtl_po_lines l join mtl_purchase_orders p on p.id = l.po_id where l.id = mtl_manufacturing.po_line_id), 'edit_packages'));
drop policy mtl_manufacturing_role_w on mtl_manufacturing;
-- mtl_materials
alter policy merged_insert_public on mtl_materials with check (is_admin_user() or mtl_allows(master_project_id, 'edit_items'));
alter policy merged_update_public on mtl_materials using (is_admin_user() or mtl_allows(master_project_id, 'edit_items')) with check (is_admin_user() or mtl_allows(master_project_id, 'edit_items'));
alter policy merged_delete_public on mtl_materials using (is_admin_user() or mtl_allows(master_project_id, 'edit_items'));
drop policy mtl_materials_role_w on mtl_materials;
-- mtl_mto_revisions
alter policy merged_insert_public on mtl_mto_revisions with check (is_admin_user() or mtl_allows(master_project_id, 'edit_items'));
alter policy merged_update_public on mtl_mto_revisions using (is_admin_user() or mtl_allows(master_project_id, 'edit_items')) with check (is_admin_user() or mtl_allows(master_project_id, 'edit_items'));
alter policy merged_delete_public on mtl_mto_revisions using (is_admin_user() or mtl_allows(master_project_id, 'edit_items'));
drop policy mtl_mto_revisions_role_w on mtl_mto_revisions;
-- mtl_po_lines
alter policy merged_insert_public on mtl_po_lines with check (is_admin_user() or mtl_allows((select mtl_purchase_orders.master_project_id from mtl_purchase_orders where mtl_purchase_orders.id = mtl_po_lines.po_id), 'edit_packages'));
alter policy merged_update_public on mtl_po_lines using (is_admin_user() or mtl_allows((select mtl_purchase_orders.master_project_id from mtl_purchase_orders where mtl_purchase_orders.id = mtl_po_lines.po_id), 'edit_packages')) with check (is_admin_user() or mtl_allows((select mtl_purchase_orders.master_project_id from mtl_purchase_orders where mtl_purchase_orders.id = mtl_po_lines.po_id), 'edit_packages'));
alter policy merged_delete_public on mtl_po_lines using (is_admin_user() or mtl_allows((select mtl_purchase_orders.master_project_id from mtl_purchase_orders where mtl_purchase_orders.id = mtl_po_lines.po_id), 'edit_packages'));
drop policy mtl_po_lines_role_w on mtl_po_lines;
-- mtl_procurement_lines
alter policy merged_insert_public on mtl_procurement_lines with check (is_admin_user() or mtl_allows((select mtl_procurement_requests.master_project_id from mtl_procurement_requests where mtl_procurement_requests.id = mtl_procurement_lines.request_id), 'edit_packages'));
alter policy merged_update_public on mtl_procurement_lines using (is_admin_user() or mtl_allows((select mtl_procurement_requests.master_project_id from mtl_procurement_requests where mtl_procurement_requests.id = mtl_procurement_lines.request_id), 'edit_packages')) with check (is_admin_user() or mtl_allows((select mtl_procurement_requests.master_project_id from mtl_procurement_requests where mtl_procurement_requests.id = mtl_procurement_lines.request_id), 'edit_packages'));
alter policy merged_delete_public on mtl_procurement_lines using (is_admin_user() or mtl_allows((select mtl_procurement_requests.master_project_id from mtl_procurement_requests where mtl_procurement_requests.id = mtl_procurement_lines.request_id), 'edit_packages'));
drop policy mtl_procurement_lines_role_w on mtl_procurement_lines;
-- mtl_procurement_requests
alter policy merged_insert_public on mtl_procurement_requests with check (is_admin_user() or mtl_allows(master_project_id, 'edit_packages'));
alter policy merged_update_public on mtl_procurement_requests using (is_admin_user() or mtl_allows(master_project_id, 'edit_packages')) with check (is_admin_user() or mtl_allows(master_project_id, 'edit_packages'));
alter policy merged_delete_public on mtl_procurement_requests using (is_admin_user() or mtl_allows(master_project_id, 'edit_packages'));
drop policy mtl_procurement_requests_role_w on mtl_procurement_requests;
-- mtl_purchase_orders
alter policy merged_insert_public on mtl_purchase_orders with check (is_admin_user() or mtl_allows(master_project_id, 'edit_packages'));
alter policy merged_update_public on mtl_purchase_orders using (is_admin_user() or mtl_allows(master_project_id, 'edit_packages')) with check (is_admin_user() or mtl_allows(master_project_id, 'edit_packages'));
alter policy merged_delete_public on mtl_purchase_orders using (is_admin_user() or mtl_allows(master_project_id, 'edit_packages'));
drop policy mtl_purchase_orders_role_w on mtl_purchase_orders;
-- mtl_release_lines
alter policy merged_insert_public on mtl_release_lines with check (is_admin_user() or mtl_allows((select mtl_release_notes.master_project_id from mtl_release_notes where mtl_release_notes.id = mtl_release_lines.release_id), 'edit_packages'));
alter policy merged_update_public on mtl_release_lines using (is_admin_user() or mtl_allows((select mtl_release_notes.master_project_id from mtl_release_notes where mtl_release_notes.id = mtl_release_lines.release_id), 'edit_packages')) with check (is_admin_user() or mtl_allows((select mtl_release_notes.master_project_id from mtl_release_notes where mtl_release_notes.id = mtl_release_lines.release_id), 'edit_packages'));
alter policy merged_delete_public on mtl_release_lines using (is_admin_user() or mtl_allows((select mtl_release_notes.master_project_id from mtl_release_notes where mtl_release_notes.id = mtl_release_lines.release_id), 'edit_packages'));
drop policy mtl_release_lines_role_w on mtl_release_lines;
-- mtl_release_notes
alter policy merged_insert_public on mtl_release_notes with check (is_admin_user() or mtl_allows(master_project_id, 'edit_packages'));
alter policy merged_update_public on mtl_release_notes using (is_admin_user() or mtl_allows(master_project_id, 'edit_packages')) with check (is_admin_user() or mtl_allows(master_project_id, 'edit_packages'));
alter policy merged_delete_public on mtl_release_notes using (is_admin_user() or mtl_allows(master_project_id, 'edit_packages'));
drop policy mtl_release_notes_role_w on mtl_release_notes;
-- mtl_shipment_lines
alter policy merged_insert_public on mtl_shipment_lines with check (is_admin_user() or mtl_allows((select mtl_shipments.master_project_id from mtl_shipments where mtl_shipments.id = mtl_shipment_lines.shipment_id), 'edit_packages'));
alter policy merged_update_public on mtl_shipment_lines using (is_admin_user() or mtl_allows((select mtl_shipments.master_project_id from mtl_shipments where mtl_shipments.id = mtl_shipment_lines.shipment_id), 'edit_packages')) with check (is_admin_user() or mtl_allows((select mtl_shipments.master_project_id from mtl_shipments where mtl_shipments.id = mtl_shipment_lines.shipment_id), 'edit_packages'));
alter policy merged_delete_public on mtl_shipment_lines using (is_admin_user() or mtl_allows((select mtl_shipments.master_project_id from mtl_shipments where mtl_shipments.id = mtl_shipment_lines.shipment_id), 'edit_packages'));
drop policy mtl_shipment_lines_role_w on mtl_shipment_lines;
-- mtl_shipments
alter policy merged_insert_public on mtl_shipments with check (is_admin_user() or mtl_allows(master_project_id, 'edit_packages'));
alter policy merged_update_public on mtl_shipments using (is_admin_user() or mtl_allows(master_project_id, 'edit_packages')) with check (is_admin_user() or mtl_allows(master_project_id, 'edit_packages'));
alter policy merged_delete_public on mtl_shipments using (is_admin_user() or mtl_allows(master_project_id, 'edit_packages'));
drop policy mtl_shipments_role_w on mtl_shipments;
-- mtl_warehouse_lines
alter policy merged_insert_public on mtl_warehouse_lines with check (is_admin_user() or (mtl_allows((select mtl_warehouse_receipts.master_project_id from mtl_warehouse_receipts where mtl_warehouse_receipts.id = mtl_warehouse_lines.receipt_id), 'post_txn') or mtl_allows((select mtl_warehouse_receipts.master_project_id from mtl_warehouse_receipts where mtl_warehouse_receipts.id = mtl_warehouse_lines.receipt_id), 'inspect')));
alter policy merged_update_public on mtl_warehouse_lines using (is_admin_user() or (mtl_allows((select mtl_warehouse_receipts.master_project_id from mtl_warehouse_receipts where mtl_warehouse_receipts.id = mtl_warehouse_lines.receipt_id), 'post_txn') or mtl_allows((select mtl_warehouse_receipts.master_project_id from mtl_warehouse_receipts where mtl_warehouse_receipts.id = mtl_warehouse_lines.receipt_id), 'inspect'))) with check (is_admin_user() or (mtl_allows((select mtl_warehouse_receipts.master_project_id from mtl_warehouse_receipts where mtl_warehouse_receipts.id = mtl_warehouse_lines.receipt_id), 'post_txn') or mtl_allows((select mtl_warehouse_receipts.master_project_id from mtl_warehouse_receipts where mtl_warehouse_receipts.id = mtl_warehouse_lines.receipt_id), 'inspect')));
alter policy merged_delete_public on mtl_warehouse_lines using (is_admin_user() or (mtl_allows((select mtl_warehouse_receipts.master_project_id from mtl_warehouse_receipts where mtl_warehouse_receipts.id = mtl_warehouse_lines.receipt_id), 'post_txn') or mtl_allows((select mtl_warehouse_receipts.master_project_id from mtl_warehouse_receipts where mtl_warehouse_receipts.id = mtl_warehouse_lines.receipt_id), 'inspect')));
drop policy mtl_warehouse_lines_role_w on mtl_warehouse_lines;
-- mtl_warehouse_receipts
alter policy merged_insert_public on mtl_warehouse_receipts with check (is_admin_user() or mtl_allows(master_project_id, 'post_txn'));
alter policy merged_update_public on mtl_warehouse_receipts using (is_admin_user() or mtl_allows(master_project_id, 'post_txn')) with check (is_admin_user() or mtl_allows(master_project_id, 'post_txn'));
alter policy merged_delete_public on mtl_warehouse_receipts using (is_admin_user() or mtl_allows(master_project_id, 'post_txn'));
drop policy mtl_warehouse_receipts_role_w on mtl_warehouse_receipts;
-- fin_payments
alter policy merged_insert_public on fin_payments with check (is_admin_user() or pst_can_approve(pst_certificate_project(certificate_id)));
alter policy merged_update_public on fin_payments using (is_admin_user() or pst_can_approve(pst_certificate_project(certificate_id))) with check (is_admin_user() or pst_can_approve(pst_certificate_project(certificate_id)));
alter policy merged_delete_public on fin_payments using (is_admin_user() or pst_can_approve(pst_certificate_project(certificate_id)));
drop policy fin_payments_write_pst_approver on fin_payments;
-- fin_payment_certificates: the approver's update rule joins the admin's
alter policy merged_update_public on fin_payment_certificates using (is_admin_user() or pst_can_approve(pst_contract_project(contract_id))) with check (is_admin_user() or pst_can_approve(pst_contract_project(contract_id)));
drop policy fin_payment_certificates_update_pst_approver on fin_payment_certificates;
commit;
