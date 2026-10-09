-- Change Management v2 — SAMPLE rule set (editable; NOT binding regulations). Active on creation so the module works end to end;
-- the administrator must align it with the valid regulations, contract clauses, company resolutions and the latest delegation-of-authority matrix.
do $$ declare s uuid; r1 uuid; r2 uuid; r3 uuid; r4 uuid; begin
  if exists (select 1 from cm_rule_sets) then return; end if;
  insert into cm_rule_sets (name, status, effective_from, note, is_sample) values ('ماتریس اختیارات — نمونهٔ اولیه (قابل ویرایش)', 'draft', current_date,
    'قواعد نمونه برای آزمون و تنظیم سامانه است، نه ضوابط قطعی. پیش از استفادهٔ واقعی باید با مقررات معتبر، مفاد قرارداد، مصوبات شرکت و آخرین ماتریس تفویض اختیار تطبیق داده شود.', true) returning id into s;
  insert into cm_routes (rule_set_id, code, title, mode, level) values (s, 'R-EXEC', 'تصویب مجری طرح', 'sequential', 1) returning id into r1;
  insert into cm_routes (rule_set_id, code, title, mode, level) values (s, 'R-BOARD', 'مدیرعامل و هیئت‌مدیره', 'sequential', 3) returning id into r2;
  insert into cm_routes (rule_set_id, code, title, mode, level) values (s, 'R-TIME-S', 'تمدید کوتاه‌مدت — مجری طرح', 'sequential', 2) returning id into r3;
  insert into cm_routes (rule_set_id, code, title, mode, level) values (s, 'R-TIME-L', 'تمدید بلندمدت — مدیرعامل', 'sequential', 3) returning id into r4;
  insert into cm_route_steps (route_id, seq, kind, role_name, label, sla_days, requires_reference) values
    (r1, 1, 'opinion', 'مدیر امور پیمان', 'نظر امور پیمان', 5, false), (r1, 2, 'approval', 'مدیر ارشد پروژه', 'تصویب مجری طرح', 7, false),
    (r2, 1, 'opinion', 'مدیر امور پیمان', 'نظر امور پیمان', 5, false), (r2, 2, 'opinion', 'مدیر ارشد پروژه', 'نظر مجری طرح', 7, false),
    (r2, 3, 'approval', 'مدیرعامل', 'تصویب مدیرعامل', 7, false), (r2, 4, 'body', 'مدیرعامل', 'مصوبهٔ هیئت‌مدیره (ثبت شمارهٔ مصوبه)', 14, true),
    (r3, 1, 'opinion', 'مدیر برنامه‌ریزی و کنترل پروژه', 'نظر برنامه‌ریزی و کنترل پروژه', 5, false), (r3, 2, 'approval', 'مدیر ارشد پروژه', 'تصویب مجری طرح', 7, false),
    (r4, 1, 'opinion', 'مدیر برنامه‌ریزی و کنترل پروژه', 'نظر برنامه‌ریزی و کنترل پروژه', 5, false), (r4, 2, 'opinion', 'مدیر ارشد پروژه', 'نظر مجری طرح', 7, false), (r4, 3, 'approval', 'مدیرعامل', 'تصویب مدیرعامل', 10, false);
  insert into cm_rules (rule_set_id, code, title, dimension, cost_basis, pct_max, route_id, priority, notes) values
    (s, 'C-10', 'تغییر/کار اضافی تا ۱۰٪ مبلغ اولیه قرارداد (تجمعی)', 'cost', 'cumulative', 10, r1, 100, 'نمونه: تصویب مجری طرح، مشروط به حدود اختیارات معتبر');
  insert into cm_rules (rule_set_id, code, title, dimension, cost_basis, pct_min, pct_max, route_id, priority, notes) values
    (s, 'C-25', 'بیش از ۱۰٪ و تا ۲۵٪ مبلغ اولیه قرارداد (تجمعی)', 'cost', 'cumulative', 10, 25, r2, 100, 'نمونه: ارجاع به مدیرعامل و هیئت‌مدیره. بالاتر از ۲۵٪ عمداً قاعده‌ای ندارد تا سامانه متوقف شود و مدیر تعیین تکلیف کند.');
  insert into cm_rules (rule_set_id, code, title, dimension, change_types, requires_opinions, route_id, priority, notes) values
    (s, 'T-NEW', 'کار جدید — صرف‌نظر از مبلغ', 'type', array['new_work'], array['مدیر مهندسی'], r2, 100, 'نمونه: ارجاع به مدیرعامل و هیئت‌مدیره با نظر فنی');
  insert into cm_rules (rule_set_id, code, title, dimension, days_basis, days_max, route_id, priority, notes) values
    (s, 'D-30', 'تمدید مدت تا ۳۰ روز (تجمعی)', 'time', 'cumulative', 30, r3, 100, 'نمونه؛ حدود زمانی باید با ماتریس تفویض اختیار تطبیق داده شود');
  insert into cm_rules (rule_set_id, code, title, dimension, days_basis, days_min, route_id, priority, notes) values
    (s, 'D-30P', 'تمدید مدت بیش از ۳۰ روز (تجمعی)', 'time', 'cumulative', 30, r4, 100, 'نمونه؛ حدود زمانی باید با ماتریس تفویض اختیار تطبیق داده شود');
  insert into cm_authority_limits (role_name, max_cost_pct, max_days, note) values ('مدیر ارشد پروژه', 10, 30, 'نمونه: سقف اختیار مجری طرح');
  update cm_rule_sets set status = 'active', activated_at = now() where id = s;
end $$;
