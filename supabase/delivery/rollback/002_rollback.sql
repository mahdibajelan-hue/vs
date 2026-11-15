-- rollback of delivery 002. Run by hand.
drop function if exists ds_apply_to_lifecycle(uuid, text);
alter table ds_studies drop column if exists lifecycle_strategy;
alter table ds_studies drop column if exists lifecycle_applied_at;
alter table ds_studies drop column if exists lifecycle_applied_name;
