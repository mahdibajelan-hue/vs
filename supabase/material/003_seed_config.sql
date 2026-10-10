-- Material control — part 3: default configuration (reference data, editable by configurators; not project data).
insert into mtl_units (code, label, kind, base_code, to_base) values
 ('EA','عدد','count',null,1),('SET','دست','count',null,1),('BOX','جعبه','pack',null,1),('PKT','بسته','pack',null,1),('ROLL','رول','pack',null,1),
 ('M','متر','length',null,1),('KM','کیلومتر','length','M',1000),
 ('KG','کیلوگرم','weight',null,1),('TON','تن','weight','KG',1000),
 ('M2','متر مربع','area',null,1),('M3','متر مکعب','volume',null,1),('L','لیتر','volume','M3',0.001)
on conflict (code) do nothing;

insert into mtl_stage_defs (key, title, sort, review_level, needs_evidence) values
 ('pr_submit','تهیه و ارسال درخواست خرید',10,'consultant',true),
 ('pr_approve','تأیید درخواست خرید و مشخصات فنی',20,'consultant',true),
 ('rfq','استعلام و ارزیابی تأمین‌کنندگان',30,'consultant',true),
 ('po_issue','تأیید سازنده و صدور سفارش خرید',40,'both',true),
 ('manufacturing','ساخت و تولید',50,'consultant',true),
 ('inspection','بازرسی حین ساخت و نهایی',60,'consultant',true),
 ('release','صدور مجوز حمل یا تحویل',70,'consultant',true),
 ('shipping','حمل و ارسال',80,'consultant',true),
 ('site_receipt','ورود به کارگاه و ثبت رسید',90,'consultant',true),
 ('entry_inspection','بازرسی ورودی و تأیید قابلیت مصرف',100,'consultant',true)
on conflict (key) do nothing;

insert into mtl_patterns (code, title, notes, is_default) values
 ('STD','الگوی استاندارد','پیش‌فرض همهٔ گروه‌ها',true),
 ('EQUIP','تجهیزات ساخت‌محور','تجهیزات و شیرآلات بحرانی با سهم ساخت و بازرسی بیشتر',false),
 ('CONS','اقلام مصرفی','اقلام مصرفی بدون ساخت و بازرسی حین ساخت',false)
on conflict (code) do nothing;

insert into mtl_pattern_weights (pattern_id, stage_key, weight)
select p.id, w.k, w.w from mtl_patterns p join (values
 ('STD','pr_submit',5),('STD','pr_approve',5),('STD','rfq',10),('STD','po_issue',10),('STD','manufacturing',30),('STD','inspection',10),('STD','release',5),('STD','shipping',10),('STD','site_receipt',5),('STD','entry_inspection',10),
 ('EQUIP','pr_submit',3),('EQUIP','pr_approve',5),('EQUIP','rfq',7),('EQUIP','po_issue',10),('EQUIP','manufacturing',35),('EQUIP','inspection',15),('EQUIP','release',5),('EQUIP','shipping',10),('EQUIP','site_receipt',5),('EQUIP','entry_inspection',5),
 ('CONS','pr_submit',10),('CONS','pr_approve',10),('CONS','rfq',15),('CONS','po_issue',20),('CONS','manufacturing',0),('CONS','inspection',0),('CONS','release',5),('CONS','shipping',25),('CONS','site_receipt',10),('CONS','entry_inspection',5)
) as w(c,k,w) on w.c = p.code
on conflict do nothing;

insert into mtl_groups (code, title, measure_kind, default_unit, is_consumable, pattern_id, lead_time_days, criticality, sort) values
 ('pipe','لوله','length','M',false,(select id from mtl_patterns where code='STD'),120,'A',10),
 ('fitting','اتصالات','count','EA',false,(select id from mtl_patterns where code='STD'),75,'B',20),
 ('valve','شیرآلات','count','EA',false,(select id from mtl_patterns where code='EQUIP'),180,'A',30),
 ('flange','فلنج','count','EA',false,(select id from mtl_patterns where code='STD'),75,'B',40),
 ('gasket','گسکت','count','EA',false,(select id from mtl_patterns where code='STD'),45,'C',50),
 ('bolt_nut','پیچ و مهره','count','SET',false,(select id from mtl_patterns where code='STD'),45,'C',60),
 ('instrument','ابزاردقیق','count','EA',false,(select id from mtl_patterns where code='EQUIP'),150,'A',70),
 ('equipment','تجهیزات','count','EA',false,(select id from mtl_patterns where code='EQUIP'),240,'A',80),
 ('support','ساپورت','weight','KG',false,(select id from mtl_patterns where code='STD'),60,'C',90),
 ('electrode','الکترود جوشکاری','consumable','KG',true,(select id from mtl_patterns where code='CONS'),30,'B',100),
 ('coating','پوشش سرجوش و مواد پوششی','consumable','KG',true,(select id from mtl_patterns where code='CONS'),30,'B',110),
 ('rt_film','فیلم رادیوگرافی و ملزومات NDT','consumable','BOX',true,(select id from mtl_patterns where code='CONS'),45,'B',120),
 ('gas','گازهای صنعتی','consumable','M3',true,(select id from mtl_patterns where code='CONS'),15,'B',130),
 ('install_cons','اقلام مصرفی نصب و تعمیرات','consumable','EA',true,(select id from mtl_patterns where code='CONS'),20,'C',140),
 ('other','سایر','count','EA',false,(select id from mtl_patterns where code='STD'),60,'C',900)
on conflict (code) do nothing;

insert into mtl_settings_versions (version, valid_from, note, values_json) values
 (1, '2000-01-01', 'مقادیر پیش‌فرض', '{"longLeadDays":90,"delayBufferDays":14,"stagnantDays":120,"qtyTolerancePct":0,"scrapWarnPct":3,"consumptionTolerancePct":10,"priority":{"criticality":40,"urgency":30,"gap":20,"risk":10}}')
on conflict (version) do nothing;
