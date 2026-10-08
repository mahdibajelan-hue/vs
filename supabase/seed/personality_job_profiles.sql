-- Default behavioral job profiles («نیم‌رخ رفتاری پیش‌فرض») for every job role in
-- comp_job_role_config that doesn't have one yet — same shape as the four hand-seeded profiles
-- (welding_inspector, hse_specialist, project_control_specialist, project_manager): 6–8 behavioral
-- dimensions per role with a weight, a minimum threshold (0–100) and a critical flag.
--
-- Without a profile, the results page's «ترکیب شایستگی‌های شغلی» (role alignment) has nothing to
-- compare the candidate's behavioral fingerprint against, so it stayed empty for 18 of 22 roles.
-- These are starting points for the module admin to tune in the personality settings page.
--
-- Idempotent: a role that already has any profile is skipped; re-running changes nothing.
-- Finally, links personality assessments that have no job profile yet to their role's active one.

begin;

with spec(job_role, dim_key, weight, min_threshold, is_critical) as (
  values
  ('mechanical_piping_inspector','DETAIL_ORIENTATION',15,75,true), ('mechanical_piping_inspector','RULE_ORIENTATION',12,70,true),
  ('mechanical_piping_inspector','SAFETY_ORIENTATION',12,70,true), ('mechanical_piping_inspector','INTEGRITY_ORIENTATION',12,70,true),
  ('mechanical_piping_inspector','DOCUMENTATION_DISCIPLINE',10,65,false), ('mechanical_piping_inspector','ANALYTICAL_THINKING',10,60,false),

  ('pipeline_inspector','DETAIL_ORIENTATION',15,75,true), ('pipeline_inspector','SAFETY_ORIENTATION',15,75,true),
  ('pipeline_inspector','INTEGRITY_ORIENTATION',12,70,true), ('pipeline_inspector','RULE_ORIENTATION',12,70,false),
  ('pipeline_inspector','PERSISTENCE',10,60,false), ('pipeline_inspector','DOCUMENTATION_DISCIPLINE',10,65,false),

  ('coating_cp_inspector','DETAIL_ORIENTATION',15,75,true), ('coating_cp_inspector','RULE_ORIENTATION',12,70,true),
  ('coating_cp_inspector','INTEGRITY_ORIENTATION',12,70,false), ('coating_cp_inspector','ANALYTICAL_THINKING',10,65,false),
  ('coating_cp_inspector','DOCUMENTATION_DISCIPLINE',10,65,false), ('coating_cp_inspector','SAFETY_ORIENTATION',10,65,false),

  ('radiography_interpreter','DETAIL_ORIENTATION',18,80,true), ('radiography_interpreter','ANALYTICAL_THINKING',15,75,true),
  ('radiography_interpreter','INTEGRITY_ORIENTATION',12,70,true), ('radiography_interpreter','DECISION_QUALITY',12,70,false),
  ('radiography_interpreter','RULE_ORIENTATION',10,65,false), ('radiography_interpreter','DOCUMENTATION_DISCIPLINE',10,65,false),

  ('civil_engineer','ANALYTICAL_THINKING',15,70,true), ('civil_engineer','SAFETY_ORIENTATION',12,70,true),
  ('civil_engineer','DETAIL_ORIENTATION',12,70,false), ('civil_engineer','PROBLEM_OWNERSHIP',10,65,false),
  ('civil_engineer','TEAMWORK',10,60,false), ('civil_engineer','DOCUMENTATION_DISCIPLINE',8,60,false),
  ('civil_engineer','COMMUNICATION',8,55,false),

  ('contracts_specialist','COMMERCIAL_AWARENESS',18,75,true), ('contracts_specialist','DETAIL_ORIENTATION',15,75,true),
  ('contracts_specialist','INTEGRITY_ORIENTATION',12,70,true), ('contracts_specialist','DOCUMENTATION_DISCIPLINE',12,70,false),
  ('contracts_specialist','ANALYTICAL_THINKING',10,65,false), ('contracts_specialist','COMMUNICATION',10,60,false),
  ('contracts_specialist','CONFLICT_MANAGEMENT',8,55,false),

  ('site_supervisor','SAFETY_ORIENTATION',15,75,true), ('site_supervisor','LEADERSHIP',12,65,true),
  ('site_supervisor','OWNERSHIP',12,70,false), ('site_supervisor','COMMUNICATION',10,60,false),
  ('site_supervisor','CONFLICT_MANAGEMENT',10,60,false), ('site_supervisor','DISCIPLINE',10,65,false),
  ('site_supervisor','PROBLEM_OWNERSHIP',10,65,false), ('site_supervisor','TEAMWORK',8,60,false),

  ('inspection_body_supervisor','INTEGRITY_ORIENTATION',15,75,true), ('inspection_body_supervisor','RULE_ORIENTATION',12,70,true),
  ('inspection_body_supervisor','ESCALATION_JUDGMENT',10,65,true), ('inspection_body_supervisor','LEADERSHIP',12,65,false),
  ('inspection_body_supervisor','DETAIL_ORIENTATION',12,70,false), ('inspection_body_supervisor','COMMUNICATION',10,60,false),
  ('inspection_body_supervisor','DOCUMENTATION_DISCIPLINE',10,65,false),

  ('project_director','LEADERSHIP',15,75,true), ('project_director','DECISION_QUALITY',12,70,true),
  ('project_director','ACCOUNTABILITY',12,70,true), ('project_director','STAKEHOLDER_ORIENTATION',12,70,false),
  ('project_director','COMMERCIAL_AWARENESS',10,65,false), ('project_director','RISK_AWARENESS',10,65,false),
  ('project_director','CONFLICT_MANAGEMENT',10,65,false), ('project_director','COMMUNICATION',10,65,false),

  ('project_control_manager','ANALYTICAL_THINKING',15,75,true), ('project_control_manager','ACCOUNTABILITY',12,70,true),
  ('project_control_manager','LEADERSHIP',12,65,false), ('project_control_manager','DETAIL_ORIENTATION',10,70,false),
  ('project_control_manager','COMMUNICATION',10,65,false), ('project_control_manager','DECISION_QUALITY',10,65,false),
  ('project_control_manager','DISCIPLINE',10,65,false),

  ('planning_engineer','ANALYTICAL_THINKING',18,75,true), ('planning_engineer','DETAIL_ORIENTATION',12,70,false),
  ('planning_engineer','DISCIPLINE',12,70,false), ('planning_engineer','PROBLEM_OWNERSHIP',10,65,false),
  ('planning_engineer','COMMUNICATION',10,60,false), ('planning_engineer','LEARNING_AGILITY',8,55,false),

  ('supervision_manager','LEADERSHIP',15,70,true), ('supervision_manager','INTEGRITY_ORIENTATION',12,70,true),
  ('supervision_manager','ESCALATION_JUDGMENT',10,65,true), ('supervision_manager','RULE_ORIENTATION',12,70,false),
  ('supervision_manager','DECISION_QUALITY',12,65,false), ('supervision_manager','COMMUNICATION',10,65,false),
  ('supervision_manager','CONFLICT_MANAGEMENT',10,60,false), ('supervision_manager','STAKEHOLDER_ORIENTATION',8,60,false),

  ('pipeline_supervisor','SAFETY_ORIENTATION',15,75,true), ('pipeline_supervisor','LEADERSHIP',12,65,true),
  ('pipeline_supervisor','OWNERSHIP',12,70,false), ('pipeline_supervisor','DISCIPLINE',10,65,false),
  ('pipeline_supervisor','PROBLEM_OWNERSHIP',10,65,false), ('pipeline_supervisor','TEAMWORK',10,60,false),
  ('pipeline_supervisor','RISK_AWARENESS',10,65,false),

  ('welding_supervisor','SAFETY_ORIENTATION',15,75,true), ('welding_supervisor','DETAIL_ORIENTATION',12,70,true),
  ('welding_supervisor','LEADERSHIP',12,65,false), ('welding_supervisor','RULE_ORIENTATION',12,70,false),
  ('welding_supervisor','TEAMWORK',10,60,false), ('welding_supervisor','DISCIPLINE',10,65,false),

  ('mechanical_piping_supervisor','SAFETY_ORIENTATION',15,75,true), ('mechanical_piping_supervisor','LEADERSHIP',12,65,true),
  ('mechanical_piping_supervisor','DETAIL_ORIENTATION',12,70,false), ('mechanical_piping_supervisor','PROBLEM_OWNERSHIP',10,65,false),
  ('mechanical_piping_supervisor','TEAMWORK',10,60,false), ('mechanical_piping_supervisor','DISCIPLINE',10,65,false),

  ('civil_supervisor','SAFETY_ORIENTATION',15,75,true), ('civil_supervisor','LEADERSHIP',12,65,true),
  ('civil_supervisor','OWNERSHIP',12,65,false), ('civil_supervisor','DISCIPLINE',10,65,false),
  ('civil_supervisor','TEAMWORK',10,60,false), ('civil_supervisor','COMMUNICATION',8,60,false),

  ('coating_supervisor','DETAIL_ORIENTATION',15,70,true), ('coating_supervisor','SAFETY_ORIENTATION',15,75,true),
  ('coating_supervisor','LEADERSHIP',10,65,false), ('coating_supervisor','RULE_ORIENTATION',10,65,false),
  ('coating_supervisor','DISCIPLINE',10,65,false), ('coating_supervisor','TEAMWORK',10,60,false),

  ('contract_commercial_manager','COMMERCIAL_AWARENESS',18,75,true), ('contract_commercial_manager','INTEGRITY_ORIENTATION',12,70,true),
  ('contract_commercial_manager','LEADERSHIP',12,65,false), ('contract_commercial_manager','STAKEHOLDER_ORIENTATION',12,65,false),
  ('contract_commercial_manager','CONFLICT_MANAGEMENT',10,65,false), ('contract_commercial_manager','DECISION_QUALITY',10,65,false),
  ('contract_commercial_manager','DETAIL_ORIENTATION',10,65,false)
),
missing_roles as (
  select distinct s.job_role
  from spec s
  join comp_job_role_config c on c.job_role = s.job_role
  where not exists (select 1 from personality_job_behavioral_profiles p where p.job_role = s.job_role)
),
new_profiles as (
  insert into personality_job_behavioral_profiles (job_role, version, title, active)
  select m.job_role, 1, 'نیم‌رخ رفتاری پیش‌فرض — ' || c.label_fa, true
  from missing_roles m join comp_job_role_config c on c.job_role = m.job_role
  returning id, job_role
)
insert into personality_job_behavioral_requirements (profile_id, dimension_id, weight, min_threshold, is_critical)
select np.id, d.id, s.weight, s.min_threshold, s.is_critical
from new_profiles np
join spec s on s.job_role = np.job_role
join personality_behavioral_dimensions d on d.key = s.dim_key;

-- Personality assessments created while their role had no profile: attach the role's active profile
-- so the role-alignment section can be computed (display-only; scores are unaffected).
update personality_assessments pa
set job_profile_id = p.id
from personality_job_behavioral_profiles p
where pa.job_profile_id is null
  and p.job_role = pa.job_role
  and p.active;

commit;
