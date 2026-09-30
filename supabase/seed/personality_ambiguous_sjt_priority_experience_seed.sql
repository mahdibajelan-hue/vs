-- Part 4 (personality bank): genuinely ambiguous SJT items (real values trade-offs,
-- no single obviously-correct answer — top two options score closely), the first
-- ever PRIORITY_CHOICE items, and additional EXPERIENCE_ANCHORED items matching the
-- exact existing row shape. All items are role-agnostic (job_role = null), matching
-- the pattern of all existing SJT/EXPERIENCE_ANCHORED rows, so every job role's
-- active personality profile can draw on them via dimension coverage.

-- ===================== SJT (8 new items) =====================

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'SJT', d.id,
 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'یکی از همکاران نزدیک شما، تحت فشار زمانی، گزارش پیشرفت هفتگی را کمی بهتر از واقعیت به کارفرما ارسال کرده است. شما این موضوع را فقط پس از ارسال گزارش متوجه می‌شوید.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','بلافاصله و شفاف، اصلاحیه را مستقیماً به کارفرما اطلاع می‌دهید، حتی اگر همکار در موقعیت دشواری قرار بگیرد.','dimension_key','INTEGRITY_ORIENTATION'),
   jsonb_build_object('key','B','score',4,'label_fa','ابتدا خصوصی با همکار صحبت می‌کنید و فرصت کوتاهی برای اصلاح داوطلبانه گزارش به او می‌دهید، سپس در صورت عدم اقدام، خودتان پیگیری می‌کنید.','dimension_key','ACCOUNTABILITY'),
   jsonb_build_object('key','C','score',2,'label_fa','موضوع را مستقیماً و بدون گفتگوی قبلی به مدیر بالادستی گزارش می‌دهید.','dimension_key','ESCALATION_JUDGMENT'),
   jsonb_build_object('key','D','score',1,'label_fa','چون تفاوت جزئی است، فعلاً چیزی نمی‌گویید و امیدوارید موضوع خودش حل شود.','dimension_key','INTEGRITY_ORIENTATION')
 ), null, 'L4', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='INTEGRITY_ORIENTATION';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'SJT', d.id,
 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'تیم اجرایی برای رساندن یک بخش از کار به موعد کارفرما، از شما می‌خواهد یک بازرسی میانی غیرالزامی (که در رویه داخلی توصیه شده اما در قرارداد الزامی نیست) را برای صرفه‌جویی در زمان حذف کنید. ریسک واقعی این حذف کم اما غیرصفر است.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','بازرسی را انجام می‌دهید، اما با هماهنگی تیم، آن را فشرده و کارآمدتر اجرا می‌کنید تا کمترین تاخیر ایجاد شود.','dimension_key','RISK_AWARENESS'),
   jsonb_build_object('key','B','score',4,'label_fa','ریسک حذف بازرسی را به‌صورت مستند و شفاف به مدیریت اعلام می‌کنید و تصمیم نهایی را با تایید کتبی آن‌ها می‌گیرید.','dimension_key','ESCALATION_JUDGMENT'),
   jsonb_build_object('key','C','score',2,'label_fa','چون بازرسی قراردادی الزامی نیست، آن را حذف می‌کنید تا موعد حفظ شود.','dimension_key','RULE_ORIENTATION'),
   jsonb_build_object('key','D','score',1,'label_fa','تصمیم را کاملاً به تیم اجرایی واگذار می‌کنید و خودتان مسئولیتی نمی‌پذیرید.','dimension_key','OWNERSHIP')
 ), null, 'L3', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='RISK_AWARENESS';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'SJT', d.id,
 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'یک کارفرمای بلندمدت و باارزش، به‌طور غیررسمی از شما می‌خواهد کار اضافه‌ای خارج از دامنه قرارداد را بدون ثبت رسمی و بدون هزینه اضافی انجام دهید، با این استدلال که رابطه بلندمدت مهم‌تر از جزئیات قراردادی است.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','با احترام توضیح می‌دهید که این کار باید به‌صورت رسمی (حتی با تخفیف در قیمت در صورت تمایل) ثبت شود تا رابطه بلندمدت روی مبنای شفاف باقی بماند.','dimension_key','COMMERCIAL_AWARENESS'),
   jsonb_build_object('key','B','score',4,'label_fa','کار را انجام می‌دهید اما داخلی آن را مستند می‌کنید تا در صورت لزوم بعداً بتوانید به آن استناد کنید.','dimension_key','DOCUMENTATION_DISCIPLINE'),
   jsonb_build_object('key','C','score',2,'label_fa','برای حفظ رابطه، کار را بدون هیچ مستندسازی انجام می‌دهید.','dimension_key','STAKEHOLDER_ORIENTATION'),
   jsonb_build_object('key','D','score',1,'label_fa','درخواست را رد می‌کنید و هیچ توضیحی هم نمی‌دهید.','dimension_key','COMMUNICATION')
 ), null, 'L4', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='COMMERCIAL_AWARENESS';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'SJT', d.id,
 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'یک همکار ارشد که تجربه بیشتری از شما دارد، دستوری فنی می‌دهد که با دانش و تجربه شما در تضاد است، اما او با اطمینان کامل صحبت می‌کند و در جمع تیم این دستور را داده است.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','بلافاصله در همان جمع، دلیل فنی نگرانی خود را محترمانه و مستند مطرح می‌کنید تا اگر اشتباهی هست به‌موقع اصلاح شود.','dimension_key','CONFLICT_MANAGEMENT'),
   jsonb_build_object('key','B','score',4,'label_fa','در جمع چیزی نمی‌گویید اما بلافاصله پس از جلسه، خصوصی با او صحبت می‌کنید تا او را در برابر تیم در موقعیت دشوار قرار ندهید.','dimension_key','CONFLICT_MANAGEMENT'),
   jsonb_build_object('key','C','score',2,'label_fa','چون تجربه او بیشتر است، دستور را بدون اظهار نظر اجرا می‌کنید.','dimension_key','DECISION_CONFIDENCE'),
   jsonb_build_object('key','D','score',1,'label_fa','دستور را نادیده می‌گیرید و طبق نظر خودتان عمل می‌کنید بدون اینکه چیزی بگویید.','dimension_key','RULE_ORIENTATION')
 ), null, 'L3', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='CONFLICT_MANAGEMENT';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'SJT', d.id,
 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'یک عضو جوان و کم‌تجربه تیم شما اشتباهی مرتکب شده که باعث یک تاخیر کوچک اما قابل توجه شده است. مدیریت بالادستی می‌خواهد بداند چه کسی مسئول این تاخیر است.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','مسئولیت نظارتی خودتان بر آن بخش کار را به‌عنوان مدیر مستقیم می‌پذیرید و در عین حال به‌صورت دقیق و صادقانه علت واقعی تاخیر را هم توضیح می‌دهید.','dimension_key','OWNERSHIP'),
   jsonb_build_object('key','B','score',4,'label_fa','علت دقیق و واقعی را کاملاً شفاف گزارش می‌دهید، از جمله نام فرد، بدون کم و کاست.','dimension_key','ACCOUNTABILITY'),
   jsonb_build_object('key','C','score',2,'label_fa','برای حفظ روحیه عضو جوان تیم، علت تاخیر را مبهم و کلی گزارش می‌دهید.','dimension_key','TEAMWORK'),
   jsonb_build_object('key','D','score',1,'label_fa','تمام مسئولیت را کاملاً بر عهده عضو جوان تیم می‌گذارید و نقش نظارتی خودتان را مطرح نمی‌کنید.','dimension_key','OWNERSHIP')
 ), null, 'L4', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='OWNERSHIP';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'SJT', d.id,
 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'یک رویه رسمی و دقیق برای موضوعی خاص وجود دارد، اما در این پروژه خاص شرایط میدانی طوری است که اجرای دقیق آن، بدون هیچ فایده ایمنی/کیفی ملموس، فقط باعث اتلاف زمان قابل توجه می‌شود.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','درخواست رسمی برای تغییر یا استثنای موقت رویه را با ذکر دلیل فنی به مرجع تصویب‌کننده ارائه می‌دهید و تا تایید، طبق رویه فعلی عمل می‌کنید.','dimension_key','RULE_ORIENTATION'),
   jsonb_build_object('key','B','score',4,'label_fa','با هماهنگی شفاهی سرپرست مستقیم، نسخه ساده‌شده را موقتاً اجرا می‌کنید و همزمان درخواست رسمی اصلاح رویه را هم پیگیری می‌کنید.','dimension_key','INITIATIVE'),
   jsonb_build_object('key','C','score',2,'label_fa','بدون هماهنگی با کسی، خودتان تصمیم می‌گیرید رویه را دور بزنید چون منطقی به نظر می‌رسد.','dimension_key','DECISION_CONFIDENCE'),
   jsonb_build_object('key','D','score',1,'label_fa','با وجود اتلاف زمان بی‌فایده، دقیقاً طبق رویه رسمی ادامه می‌دهید چون تغییر رویه کار پیچیده‌ای است.','dimension_key','RULE_ORIENTATION')
 ), null, 'L3', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='RULE_ORIENTATION';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'SJT', d.id,
 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'در بازبینی داده‌های یک تحلیل مهم، به ریسکی بزرگ اما هنوز نامطمئن پی می‌برید که در صورت افشا می‌تواند نگرانی جدی کارفرما را برانگیزد و ممکن است حتی هرگز واقع نشود.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','ریسک را همراه با میزان عدم قطعیت آن و یک برنامه پاسخ اولیه، شفاف و به‌موقع به کارفرما گزارش می‌دهید.','dimension_key','RISK_AWARENESS'),
   jsonb_build_object('key','B','score',4,'label_fa','ابتدا با تحلیل بیشتر، سطح قطعیت ریسک را دقیق‌تر می‌کنید و در بازه زمانی کوتاه، آن را با جزئیات کامل‌تر گزارش می‌دهید.','dimension_key','ANALYTICAL_THINKING'),
   jsonb_build_object('key','C','score',1,'label_fa','چون قطعی نیست، فعلاً چیزی نمی‌گویید تا زمانی که واقعاً اتفاق بیفتد.','dimension_key','RISK_AWARENESS'),
   jsonb_build_object('key','D','score',2,'label_fa','ریسک را فقط به‌صورت شفاهی و غیررسمی مطرح می‌کنید تا واکنش رسمی برنگیزد.','dimension_key','COMMUNICATION')
 ), null, 'L4', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='RISK_AWARENESS';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'SJT', d.id,
 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'دو نفر از اعضای تیم شما بر سر نحوه تقسیم یک وظیفه مشترک دچار اختلاف شدید شده‌اند و هر دو از شما می‌خواهند به نفع او تصمیم بگیرید. هر دو استدلال قابل قبولی دارند.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','هر دو را در یک جلسه کوتاه کنار هم می‌نشانید تا با کمک شما، خودشان به توافق منصفانه‌ای برسند و فقط در صورت بن‌بست، تصمیم نهایی را خودتان می‌گیرید.','dimension_key','CONFLICT_MANAGEMENT'),
   jsonb_build_object('key','B','score',4,'label_fa','بعد از شنیدن جداگانه استدلال هر دو، خودتان تصمیم نهایی منصفانه را می‌گیرید و دلیل آن را برای هر دو توضیح می‌دهید.','dimension_key','LEADERSHIP'),
   jsonb_build_object('key','C','score',2,'label_fa','برای پرهیز از درگیر شدن در تعارض، وظیفه را دوباره و به‌طور کامل خودتان انجام می‌دهید.','dimension_key','CONFLICT_MANAGEMENT'),
   jsonb_build_object('key','D','score',1,'label_fa','به نفع کسی که استدلال محکم‌تری ارائه داده تصمیم می‌گیرید، بدون توضیح دادن دلیل به نفر دیگر.','dimension_key','COMMUNICATION')
 ), null, 'L3', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='LEADERSHIP';

-- ===================== PRIORITY_CHOICE (8 new items — first ever in DB) =====================

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'PRIORITY_CHOICE', d.id,
 'در این شرایط با منابع محدود، کدام یک را در اولویت نخست قرار می‌دهید؟',
 'در یک روز پرمشغله، هم‌زمان چهار موضوع نیاز به توجه فوری شما دارند: پیگیری یک نزدیک‌به‌حادثه (Near-Miss) ایمنی گزارش‌شده، پاسخ به تماس فوری کارفرما درباره یک شکایت، آماده‌سازی گزارش هزینه برای جلسه فردا، و بازبینی برنامه هفتگی که سرکارگرها منتظر آن هستند.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','پیگیری فوری نزدیک‌به‌حادثه ایمنی، چون تاخیر در آن می‌تواند به حادثه واقعی بعدی منجر شود.','dimension_key','SAFETY_ORIENTATION'),
   jsonb_build_object('key','B','score',3,'label_fa','پاسخ به تماس کارفرما درباره شکایت، چون روابط کارفرما حساسیت زمانی بالایی دارد.','dimension_key','STAKEHOLDER_ORIENTATION'),
   jsonb_build_object('key','C','score',2,'label_fa','آماده‌سازی گزارش هزینه، چون جلسه فردا غیرقابل تعویق است.','dimension_key','COMMERCIAL_AWARENESS'),
   jsonb_build_object('key','D','score',2,'label_fa','بازبینی برنامه هفتگی، چون سرکارگرها بدون آن نمی‌توانند کار فردا را شروع کنند.','dimension_key','DISCIPLINE')
 ), null, 'L3', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='SAFETY_ORIENTATION';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'PRIORITY_CHOICE', d.id,
 'در این شرایط با زمان محدود، کدام یک را در اولویت نخست قرار می‌دهید؟',
 'نزدیک پایان روز کاری متوجه می‌شوید که فقط وقت کافی برای انجام کامل یکی از این کارها دارید: مستندسازی دقیق یک تغییر فنی کوچک امروز، شرکت در جلسه توسعه مهارت تیم، پیگیری یک مغایرت جزئی مالی با تامین‌کننده، یا بازدید میدانی اضافی از یک جبهه کاری کم‌ریسک.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','مستندسازی دقیق تغییر فنی امروز، چون تاخیر در ثبت آن ریسک فراموشی جزئیات مهم را افزایش می‌دهد.','dimension_key','DOCUMENTATION_DISCIPLINE'),
   jsonb_build_object('key','B','score',3,'label_fa','شرکت در جلسه توسعه مهارت تیم، چون سرمایه‌گذاری بلندمدت روی توانمندی تیم است.','dimension_key','LEADERSHIP'),
   jsonb_build_object('key','C','score',3,'label_fa','پیگیری مغایرت مالی جزئی، چون تاخیر می‌تواند آن را بزرگ‌تر کند.','dimension_key','COMMERCIAL_AWARENESS'),
   jsonb_build_object('key','D','score',1,'label_fa','بازدید میدانی اضافی از جبهه کم‌ریسک، چون حضور میدانی همیشه ارزشمند است.','dimension_key','INITIATIVE')
 ), null, 'L3', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='DOCUMENTATION_DISCIPLINE';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'PRIORITY_CHOICE', d.id,
 'در این شرایط با ظرفیت محدود تیم، کدام یک را در اولویت نخست قرار می‌دهید؟',
 'تیم کوچک شما ظرفیت کافی برای انجام هم‌زمان همه این کارها را ندارد: رفع یک نقص کیفی کوچک که مشتری هنوز متوجه آن نشده، آموزش یک عضو جدید تیم، تسریع یک بخش از کار برای جلوگیری از جریمه تاخیر قراردادی، یا بهبود یک فرآیند داخلی که کارایی بلندمدت را افزایش می‌دهد.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',4,'label_fa','رفع نقص کیفی کوچک، چون کیفیت نهایی تحویل به مشتری اولویت دارد.','dimension_key','DETAIL_ORIENTATION'),
   jsonb_build_object('key','B','score',3,'label_fa','آموزش عضو جدید تیم، چون ظرفیت آینده تیم به آن وابسته است.','dimension_key','LEADERSHIP'),
   jsonb_build_object('key','C','score',5,'label_fa','تسریع کار برای جلوگیری از جریمه تاخیر، چون تاثیر مالی مستقیم و فوری دارد.','dimension_key','COMMERCIAL_AWARENESS'),
   jsonb_build_object('key','D','score',2,'label_fa','بهبود فرآیند داخلی، چون در بلندمدت کارایی بیشتری ایجاد می‌کند.','dimension_key','INITIATIVE')
 ), null, 'L4', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='COMMERCIAL_AWARENESS';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'PRIORITY_CHOICE', d.id,
 'در این شرایط با وقت محدود پیش از جلسه، کدام یک را در اولویت نخست قرار می‌دهید؟',
 'نیم ساعت پیش از یک جلسه مهم با کارفرما، متوجه می‌شوید که فقط وقت کافی برای آماده‌سازی کامل یکی از این موارد دارید: توضیح شفاف یک تاخیر برنامه‌ای که هنوز به کارفرما گفته نشده، آماده‌سازی ارائه بصری زیباتر از پیشرفت کلی، بررسی نهایی یک بند قراردادی مناقشه‌برانگیز، یا جمع‌آوری بازخورد میدانی تازه از سرکارگران.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','آماده‌سازی توضیح شفاف تاخیر برنامه‌ای، چون افشای فعال و به‌موقع بر کتمان یا تاخیر در اطلاع‌رسانی اولویت دارد.','dimension_key','COMMUNICATION'),
   jsonb_build_object('key','B','score',1,'label_fa','آماده‌سازی ارائه بصری زیباتر، چون تاثیر اولین برداشت جلسه مهم است.','dimension_key','COMMUNICATION'),
   jsonb_build_object('key','C','score',4,'label_fa','بررسی نهایی بند قراردادی مناقشه‌برانگیز، چون تصمیم اشتباه در جلسه می‌تواند هزینه‌بر باشد.','dimension_key','COMMERCIAL_AWARENESS'),
   jsonb_build_object('key','D','score',2,'label_fa','جمع‌آوری بازخورد تازه میدانی، چون داده به‌روز برای جلسه ارزشمند است.','dimension_key','ANALYTICAL_THINKING')
 ), null, 'L4', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='COMMUNICATION';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'PRIORITY_CHOICE', d.id,
 'در این شرایط با فرصت محدود، کدام یک را در اولویت نخست قرار می‌دهید؟',
 'در پایان هفته، فقط فرصت پیگیری کامل یکی از این چهار مورد باز مانده از هفته را دارید: یک اقدام اصلاحی معوق ایمنی با ریسک متوسط، یک درخواست اطلاعات (RFI) فنی معلق که کار جبهه را کند کرده، یک مغایرت کوچک در صورت‌وضعیت پیمانکار، یا برنامه‌ریزی بازدید کیفیت هفته آینده.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','پیگیری اقدام اصلاحی معوق ایمنی، چون تاخیر بیشتر ریسک را افزایش می‌دهد.','dimension_key','SAFETY_ORIENTATION'),
   jsonb_build_object('key','B','score',4,'label_fa','پیگیری RFI فنی معلق، چون کندی جبهه کاری هزینه زمانی رو به رشد دارد.','dimension_key','PROBLEM_OWNERSHIP'),
   jsonb_build_object('key','C','score',2,'label_fa','پیگیری مغایرت کوچک صورت‌وضعیت، چون مسائل مالی معمولاً بعداً پیچیده‌تر می‌شوند.','dimension_key','COMMERCIAL_AWARENESS'),
   jsonb_build_object('key','D','score',2,'label_fa','برنامه‌ریزی بازدید کیفیت هفته آینده، چون آمادگی از پیش کیفیت بازدید را بالا می‌برد.','dimension_key','DISCIPLINE')
 ), null, 'L3', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='PROBLEM_OWNERSHIP';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'PRIORITY_CHOICE', d.id,
 'در این شرایط با بودجه سفر محدود، کدام یک را در اولویت نخست قرار می‌دهید؟',
 'شما فقط بودجه یک سفر بازدید میدانی این ماه را دارید و باید بین چهار جبهه کاری با وضعیت‌های متفاوت انتخاب کنید: جبهه‌ای با کندی جزئی پیشرفت اما بدون ریسک خاص، جبهه‌ای با یک شکایت غیررسمی کارگری درباره شرایط کاری، جبهه‌ای که تازه یک تجهیز پرارزش و حساس در آن نصب شده، یا جبهه‌ای که سرکارگر جدید و کم‌تجربه آن هنوز ارزیابی نشده است.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',2,'label_fa','جبهه با کندی جزئی پیشرفت، چون این جبهه از نظر برنامه عقب‌تر است.','dimension_key','DISCIPLINE'),
   jsonb_build_object('key','B','score',5,'label_fa','جبهه با شکایت غیررسمی کارگری، چون مسائل انسانی حل‌نشده می‌توانند به مشکلات بزرگ‌تر (از جمله ایمنی و روحیه) تبدیل شوند.','dimension_key','STAKEHOLDER_ORIENTATION'),
   jsonb_build_object('key','C','score',3,'label_fa','جبهه با تجهیز پرارزش تازه‌نصب‌شده، چون ریسک آسیب به آن هزینه بالایی دارد.','dimension_key','RISK_AWARENESS'),
   jsonb_build_object('key','D','score',4,'label_fa','جبهه با سرکارگر جدید و کم‌تجربه، چون ارزیابی و حمایت زودهنگام از او می‌تواند از مشکلات بزرگ‌تر بعدی جلوگیری کند.','dimension_key','LEADERSHIP')
 ), null, 'L4', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='STAKEHOLDER_ORIENTATION';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'PRIORITY_CHOICE', d.id,
 'در این شرایط با وقت محدود بازبینی، کدام یک را در اولویت نخست قرار می‌دهید؟',
 'برای بازبینی نهایی پیش از ارسال یک بسته مستندات مهم به کارفرما، فقط وقت کافی برای بررسی دقیق یکی از این چهار بخش دارید: صحت اعداد و محاسبات فنی کلیدی، رعایت کامل قالب و امضاهای الزامی قراردادی، پوشش کامل الزامات ایمنی مستندشده، یا هماهنگی داخلی بین بخش‌های مختلف گزارش.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','صحت اعداد و محاسبات فنی کلیدی، چون خطای عددی می‌تواند مستقیماً به تصمیمات نادرست بعدی منجر شود.','dimension_key','DETAIL_ORIENTATION'),
   jsonb_build_object('key','B','score',2,'label_fa','رعایت قالب و امضاهای الزامی، چون بدون آن مستندات از نظر اداری قابل قبول نیست.','dimension_key','DOCUMENTATION_DISCIPLINE'),
   jsonb_build_object('key','C','score',4,'label_fa','پوشش کامل الزامات ایمنی مستندشده، چون کسری در این بخش می‌تواند پیامد جدی داشته باشد.','dimension_key','SAFETY_ORIENTATION'),
   jsonb_build_object('key','D','score',2,'label_fa','هماهنگی داخلی بین بخش‌های گزارش، چون ناهماهنگی ظاهر غیرحرفه‌ای ایجاد می‌کند.','dimension_key','ANALYTICAL_THINKING')
 ), null, 'L3', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='DETAIL_ORIENTATION';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'PRIORITY_CHOICE', d.id,
 'در این شرایط با انرژی و زمان محدود این هفته، کدام یک را در اولویت نخست قرار می‌دهید؟',
 'این هفته فقط انرژی و زمان کافی برای پیگیری جدی یکی از این چهار موضوع دارید: یادگیری یک ابزار/روش جدید که کار آینده را کارآمدتر می‌کند، رفع یک مشکل فوری اما کوچک جاری، کمک به همکار دیگری که با حجم کاری بالا دست‌وپنجه نرم می‌کند، یا استراحت کافی برای جلوگیری از فرسودگی خودتان.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',3,'label_fa','یادگیری ابزار/روش جدید، چون سرمایه‌گذاری روی توانمندی آینده خودتان است.','dimension_key','LEARNING_AGILITY'),
   jsonb_build_object('key','B','score',2,'label_fa','رفع مشکل فوری کوچک جاری، چون مسائل کوچک حل‌نشده تجمع پیدا می‌کنند.','dimension_key','INITIATIVE'),
   jsonb_build_object('key','C','score',4,'label_fa','کمک به همکار با حجم کاری بالا، چون کار تیمی مؤثر معمولاً اثر بزرگ‌تری از تلاش فردی دارد.','dimension_key','TEAMWORK'),
   jsonb_build_object('key','D','score',4,'label_fa','استراحت کافی برای جلوگیری از فرسودگی، چون تصمیمات بلندمدت پروژه به پایداری عملکرد شما وابسته است.','dimension_key','DISCIPLINE')
 ), null, 'L3', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='TEAMWORK';

-- ===================== EXPERIENCE_ANCHORED (8 new items) =====================

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'EXPERIENCE_ANCHORED', d.id,
 'در آن موقعیت، واقعاً چه کردید؟',
 'به آخرین باری فکر کنید که از دو مدیر یا سرپرست مختلف، هم‌زمان دستورات متناقض درباره یک موضوع دریافت کردید.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','به هر دو اطلاع دادم که دستورات متناقض است و از آن‌ها خواستم با هم هماهنگ کنند تا یک تصمیم نهایی به من برسد.','dimension_key','ESCALATION_JUDGMENT'),
   jsonb_build_object('key','B','score',3,'label_fa','دستور شخصی که به نظرم اولویت سازمانی بالاتری داشت را اجرا کردم بدون اطلاع به دیگری.','dimension_key','DECISION_CONFIDENCE'),
   jsonb_build_object('key','C','score',1,'label_fa','برای دور ماندن از تعارض بین آن دو، کاری انجام ندادم و منتظر ماندم خودشان متوجه شوند.','dimension_key','ESCALATION_JUDGMENT'),
   jsonb_build_object('key','D','score',2,'label_fa','هر دو دستور را به نوعی هم‌زمان و ناقص اجرا کردم تا کسی را ناراضی نکنم.','dimension_key','DECISION_QUALITY')
 ), null, 'L3', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='ESCALATION_JUDGMENT';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'EXPERIENCE_ANCHORED', d.id,
 'در آن موقعیت، واقعاً چه کردید؟',
 'به آخرین باری فکر کنید که در جمع تیم، سوالی از شما پرسیده شد که جواب دقیق آن را نمی‌دانستید.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','صادقانه گفتم که مطمئن نیستم و متعهد شدم پاسخ دقیق را بررسی و بعداً اعلام کنم.','dimension_key','INTEGRITY_ORIENTATION'),
   jsonb_build_object('key','B','score',2,'label_fa','حدسی نزدیک به واقعیت زدم و امیدوار بودم درست باشد.','dimension_key','DECISION_CONFIDENCE'),
   jsonb_build_object('key','C','score',0,'label_fa','با اطمینان کاذب پاسخی دادم که مطمئن نبودم درست است.','dimension_key','INTEGRITY_ORIENTATION'),
   jsonb_build_object('key','D','score',3,'label_fa','موضوع را تغییر دادم تا مجبور به پاسخ مستقیم نشوم.','dimension_key','COMMUNICATION')
 ), null, 'L2', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='INTEGRITY_ORIENTATION';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'EXPERIENCE_ANCHORED', d.id,
 'در آن موقعیت، واقعاً چه کردید؟',
 'به آخرین باری فکر کنید که تحت فشار زمانی شدید بودید و وسوسه شدید یک مرحله از کار را کوتاه کنید یا حذف کنید.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','همه مراحل را کامل انجام دادم و به‌جای حذف مرحله، راه‌حلی برای انجام سریع‌تر و درست آن پیدا کردم.','dimension_key','DISCIPLINE'),
   jsonb_build_object('key','B','score',3,'label_fa','با هماهنگی رسمی مافوق، یک مرحله کم‌ریسک را موقتاً ساده کردم.','dimension_key','RISK_AWARENESS'),
   jsonb_build_object('key','C','score',1,'label_fa','بدون هماهنگی با کسی، خودم تصمیم گرفتم مرحله را حذف کنم.','dimension_key','RULE_ORIENTATION'),
   jsonb_build_object('key','D','score',2,'label_fa','مرحله را انجام دادم اما با کیفیت و دقت کمتر از حد معمول.','dimension_key','DETAIL_ORIENTATION')
 ), null, 'L3', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='DISCIPLINE';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'EXPERIENCE_ANCHORED', d.id,
 'در آن موقعیت، واقعاً چه کردید؟',
 'به آخرین باری فکر کنید که با تصمیم یک فرد ارشد یا مدیر بالادستی خودتان به‌طور جدی مخالف بودید.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','مخالفت خودم را با دلایل مستند و محترمانه مستقیماً با او در میان گذاشتم.','dimension_key','CONFLICT_MANAGEMENT'),
   jsonb_build_object('key','B','score',3,'label_fa','نظرم را با یک همکار مورد اعتماد مطرح کردم اما مستقیماً با مدیر صحبت نکردم.','dimension_key','COMMUNICATION'),
   jsonb_build_object('key','C','score',1,'label_fa','هیچ‌وقت مخالفت خودم را بیان نکردم و بدون اعتقاد، تصمیم را اجرا کردم.','dimension_key','CONFLICT_MANAGEMENT'),
   jsonb_build_object('key','D','score',0,'label_fa','به‌صورت غیرمستقیم (مثل کندکاری) نارضایتی خودم را نشان دادم.','dimension_key','ACCOUNTABILITY')
 ), null, 'L3', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='CONFLICT_MANAGEMENT';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'EXPERIENCE_ANCHORED', d.id,
 'در آن موقعیت، واقعاً چه کردید؟',
 'به آخرین باری فکر کنید که یک عضو کم‌تجربه تیم شما اشتباهی مرتکب شد که مستقیماً روی کار شما هم تاثیر گذاشت.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','با او آرام و سازنده صحبت کردم، علت اشتباه را بررسی کردیم و راهکار جلوگیری از تکرار را با هم تعیین کردیم.','dimension_key','LEADERSHIP'),
   jsonb_build_object('key','B','score',2,'label_fa','خودم بی‌سروصدا اشتباه را اصلاح کردم و چیزی به او نگفتم.','dimension_key','TEAMWORK'),
   jsonb_build_object('key','C','score',0,'label_fa','با عصبانیت و در جمع تیم او را سرزنش کردم.','dimension_key','LEADERSHIP'),
   jsonb_build_object('key','D','score',1,'label_fa','موضوع را مستقیم به مدیر بالادستی او گزارش دادم بدون صحبت قبلی با خودش.','dimension_key','ESCALATION_JUDGMENT')
 ), null, 'L3', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='LEADERSHIP';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'EXPERIENCE_ANCHORED', d.id,
 'در آن موقعیت، واقعاً چه کردید؟',
 'به آخرین باری فکر کنید که فردی با نفوذ یا موقعیت بالاتر از شما درخواست کرد کاری خلاف یک رویه رسمی انجام دهید.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','محترمانه اما قاطع، درخواست را رد کردم و دلیل رویه‌ای آن را توضیح دادم.','dimension_key','RULE_ORIENTATION'),
   jsonb_build_object('key','B','score',3,'label_fa','موضوع را به یک مرجع بی‌طرف بالاتر ارجاع دادم تا تصمیم رسمی گرفته شود.','dimension_key','ESCALATION_JUDGMENT'),
   jsonb_build_object('key','C','score',1,'label_fa','به دلیل نفوذ آن فرد، درخواست را بدون مقاومت انجام دادم.','dimension_key','INTEGRITY_ORIENTATION'),
   jsonb_build_object('key','D','score',2,'label_fa','با بهانه‌های مختلف انجام آن را به تعویق انداختم بدون رد صریح.','dimension_key','DECISION_CONFIDENCE')
 ), null, 'L4', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='RULE_ORIENTATION';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'EXPERIENCE_ANCHORED', d.id,
 'در آن موقعیت، واقعاً چه کردید؟',
 'به آخرین باری فکر کنید که ماه‌ها بعد از انجام یک کار، متوجه یک اشتباه در همان کار قدیمی خودتان شدید که کسی دیگر متوجه آن نشده بود.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','بلافاصله موضوع را به مسئول مربوطه اطلاع دادم و در رفع اثرات آن مشارکت کردم، حتی با وجود گذشت زمان.','dimension_key','ACCOUNTABILITY'),
   jsonb_build_object('key','B','score',2,'label_fa','چون کسی متوجه نشده بود و اثر آن احتمالاً کوچک بود، چیزی نگفتم.','dimension_key','INTEGRITY_ORIENTATION'),
   jsonb_build_object('key','C','score',3,'label_fa','در فرصتی مناسب و غیرمستقیم، بدون اشاره به اینکه اشتباه از من بوده، آن را اصلاح کردم.','dimension_key','ACCOUNTABILITY'),
   jsonb_build_object('key','D','score',1,'label_fa','منتظر ماندم کس دیگری متوجه شود و آن‌وقت واکنش نشان دهم.','dimension_key','OWNERSHIP')
 ), null, 'L4', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='ACCOUNTABILITY';

insert into personality_questions (question_type, dimension_id, question_text, scenario_context, options, job_role, complexity, weight, approval_status)
select 'EXPERIENCE_ANCHORED', d.id,
 'در آن موقعیت، واقعاً چه کردید؟',
 'به آخرین باری فکر کنید که منابع (زمان، نیرو یا تجهیزات) در دسترس شما به‌وضوح برای انجام درست کاری که به شما محول شده بود کافی نبود.',
 jsonb_build_array(
   jsonb_build_object('key','A','score',5,'label_fa','کمبود منابع را با جزئیات مستند به مسئول مربوطه اعلام کردم و راهکار جایگزین یا نیاز واقعی را پیشنهاد دادم.','dimension_key','PROBLEM_OWNERSHIP'),
   jsonb_build_object('key','B','score',3,'label_fa','با کمترین منابع موجود تلاش کردم بهترین نتیجه ممکن را بگیرم، بدون اطلاع رسمی به کسی.','dimension_key','INITIATIVE'),
   jsonb_build_object('key','C','score',1,'label_fa','کار را با همان کیفیت پایین‌تر انجام دادم و چیزی نگفتم.','dimension_key','OWNERSHIP'),
   jsonb_build_object('key','D','score',2,'label_fa','کار را ناتمام گذاشتم و منتظر ماندم منابع بیشتری برسد.','dimension_key','PERSISTENCE')
 ), null, 'L3', 1, 'APPROVED'
from personality_behavioral_dimensions d where d.key='PROBLEM_OWNERSHIP';
