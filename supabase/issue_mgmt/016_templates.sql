-- Issue Management v2 — starter templates for frequent EPC issues (editable by admins; tasks use offset days from creation).
insert into im_templates (key, name, category, defaults, tasks) values
 ('doc_approval_delay', 'تأخیر در تأیید مدرک مهندسی', 'document_approval',
  '{"severity":"medium","urgency":"high","deadline_days":10,"acceptance_criteria":"نامه یا گواهی تأیید مدرک دریافت و در سامانه مدارک ثبت شده باشد"}',
  '[{"title":"بررسی وضعیت مدرک نزد مشاور/کارفرما","offset_days":2},{"title":"پیگیری رسمی و ثبت مکاتبه","offset_days":5},{"title":"دریافت تأییدیه و بایگانی","offset_days":10}]'),
 ('material_delivery_delay', 'تأخیر تحویل کالا / تجهیز', 'procurement',
  '{"severity":"high","urgency":"high","deadline_days":14,"acceptance_criteria":"کالا در سایت تحویل و بازرسی ورودی (IR) تأیید شده باشد"}',
  '[{"title":"استعلام وضعیت ساخت/حمل از تأمین‌کننده","offset_days":2},{"title":"بازنگری برنامهٔ نصب و اثر بر مسیر بحرانی","offset_days":5},{"title":"تحویل و بازرسی ورودی","offset_days":14}]'),
 ('drawing_conflict', 'مغایرت نقشه با وضعیت اجرا', 'engineering',
  '{"severity":"high","urgency":"high","deadline_days":7,"acceptance_criteria":"نقشهٔ بازنگری‌شده تأیید و به کارگاه ابلاغ شده باشد"}',
  '[{"title":"ثبت مغایرت و ارسال به مهندسی","offset_days":1},{"title":"صدور نقشهٔ اصلاحی","offset_days":5},{"title":"ابلاغ به کارگاه و اجرای اصلاح","offset_days":7}]'),
 ('contractor_performance', 'ضعف عملکرد پیمانکار', 'contractor',
  '{"severity":"high","urgency":"medium","deadline_days":14,"acceptance_criteria":"برنامهٔ جبرانی پذیرفته و عملکرد دو هفتهٔ متوالی مطابق برنامه باشد"}',
  '[{"title":"اخطار رسمی به پیمانکار","offset_days":2},{"title":"دریافت برنامهٔ جبرانی","offset_days":6},{"title":"پایش اجرای برنامهٔ جبرانی","offset_days":14}]'),
 ('right_of_way', 'مانع تصرف زمین / حریم', 'land_right_of_way',
  '{"severity":"high","urgency":"high","deadline_days":21,"acceptance_criteria":"زمین یا حریم مورد نیاز با صورت‌جلسهٔ تحویل آزاد شده باشد"}',
  '[{"title":"شناسایی مالک و وضعیت حقوقی","offset_days":3},{"title":"مذاکره/اقدام حقوقی","offset_days":14},{"title":"تحویل زمین با صورت‌جلسه","offset_days":21}]')
on conflict (key) do nothing;
