-- Item-coverage top-up: expert review of a real candidate's (site_supervisor) results found
-- BEHAVIORAL_DIMENSION scores unrealistically high and undifferentiated (10 of 18 scored
-- dimensions at 100%, none below 60%) and system-wide, half of all BEHAVIORAL_DIMENSION scores
-- (105/212) rested on a single questionnaire item (coverage_count = 1, confidence LOW) — one
-- forced-choice pick swinging a whole dimension to near-0 or near-100. personalitySelection.ts
-- already enforces MIN_ITEMS_PER_DIMENSION = 2 at exam-generation time, but several dimensions'
-- item pools were too thin (as low as 2) for that guarantee to hold with margin.
--
-- Adds 23 new role-agnostic (job_role = null) items — SJT, PRIORITY_CHOICE and EXPERIENCE_ANCHORED
-- — each with 4 options spanning 2-4 distinct behavioral dimensions, prioritizing the thinnest
-- pools first (LEARNING_AGILITY 2→8, PROBLEM_OWNERSHIP/PERSISTENCE/STAKEHOLDER_ORIENTATION 4→9,
-- DOCUMENTATION_DISCIPLINE 5→11, ACCOUNTABILITY/SAFETY_ORIENTATION/RISK_AWARENESS/
-- DECISION_QUALITY/DETAIL_ORIENTATION 6→10-13) while also topping up every other dimension that
-- was below ~9 items. Every dimension in the bank now has at least 8 items. Scenarios are grounded
-- in real EPC oil & gas situations (piping fit-up, hydrotest, isometric/survey discrepancies,
-- scaffold tags, near-misses, variation orders, vendor invoices, punch-list items, cross-discipline
-- coordination) and deliberately vary the situational hook (a subordinate already did something,
-- a pattern noticed over time, a resource-constrained priority call) rather than reusing the
-- "زمان/برنامه فشار → آیا کاهش X قابل قبول است؟" template flagged in an earlier pass.
--
-- Already-scored assessments are untouched by this seed (personality_responses/
-- personality_dimension_scores are not touched) — this only improves coverage for future exams.

insert into personality_questions
  (question_type, question_text, scenario_context, options, dimension_id, complexity, weight, active, approval_status, job_role)
values
('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'یکی از جوشکاران زیرمجموعه شما، بدون اطلاع به شما، بازرسی مرحله fit-up (هم‌ترازی) یک اتصال خط لوله را قبل از جوشکاری انجام نداده و مستقیم جوشکاری را شروع کرده است. شما این موضوع را بعد از اتمام جوشکاری متوجه شده‌اید.',
 '[{"key":"A","score":5,"label_fa":"جوش را متوقف اعلام می‌کنم، بازرسی fit-up را با NDT یا برش آزمایشی جبران می‌کنم و تا اطمینان از صحت اتصال اجازه ادامه کار را نمی‌دهم.","dimension_key":"SAFETY_ORIENTATION"},{"key":"B","score":3,"label_fa":"موضوع را به‌صورت رسمی ثبت می‌کنم و مسئولیت را با جوشکار در میان می‌گذارم، اما اجازه می‌دهم کار فعلاً ادامه یابد.","dimension_key":"ACCOUNTABILITY"},{"key":"C","score":1,"label_fa":"چون جوش ظاهراً سالم به نظر می‌رسد، فرض می‌کنم مشکلی نیست و کار را همان‌طور می‌پذیرم.","dimension_key":"RISK_AWARENESS"},{"key":"D","score":2,"label_fa":"فقط از جوشکار می‌خواهم دفعه بعد رعایت کند، بدون بررسی فنی این مورد خاص.","dimension_key":"DETAIL_ORIENTATION"}]'::jsonb,
 '84c50ac3-fc96-4005-9971-4220acfe3317', 'L3', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'شرکت اعلام کرده که ظرف دو هفته باید از یک نرم‌افزار جدید بازرسی جوش (به‌جای فرم‌های کاغذی قبلی) استفاده کنید که تجربه قبلی با آن ندارید.',
 '[{"key":"A","score":5,"label_fa":"در اولین فرصت آموزش نرم‌افزار را می‌گذرانم، با تمرین روی چند نمونه واقعی به آن مسلط می‌شوم و در صورت ابهام از همکاران مسلط‌تر کمک می‌گیرم.","dimension_key":"LEARNING_AGILITY"},{"key":"B","score":2,"label_fa":"تا زمانی که مجبور شوم، همان روش کاغذی را ادامه می‌دهم و استفاده از نرم‌افزار را به تعویق می‌اندازم.","dimension_key":"ADAPTABILITY"},{"key":"C","score":3,"label_fa":"خودم دنبال منابع آموزشی آنلاین می‌گردم، هرچند برنامه رسمی آموزش شرکت را دنبال نمی‌کنم.","dimension_key":"INITIATIVE"},{"key":"D","score":1,"label_fa":"بعد از اولین خطا در کار با نرم‌افزار، از مدیر می‌خواهم اجازه دهد به فرم کاغذی برگردم.","dimension_key":"PERSISTENCE"}]'::jsonb,
 '84b885c8-f93c-4ed7-8b8c-1d6fd49045c8', 'L2', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'کارفرما یک دستور تغییر (Variation Order) را بدون امضای رسمی و فقط با ایمیل درخواست کرده و از شما می‌خواهد فوراً اجرای آن را شروع کنید، در حالی که این کار هزینه و زمان قابل توجهی دارد.',
 '[{"key":"A","score":5,"label_fa":"مودبانه توضیح می‌دهم که برای اجرای کار نیاز به تایید رسمی و برآورد هزینه و زمان داریم و پیگیر تکمیل مدارک قراردادی می‌شوم.","dimension_key":"COMMERCIAL_AWARENESS"},{"key":"B","score":3,"label_fa":"برای حفظ رابطه خوب با کارفرما، همان لحظه شروع به اجرای کار می‌کنم و مستندسازی را بعداً انجام می‌دهم.","dimension_key":"STAKEHOLDER_ORIENTATION"},{"key":"C","score":1,"label_fa":"درخواست را به‌طور کامل رد می‌کنم و از کارفرما می‌خواهم مستقیم با مدیر پروژه صحبت کند.","dimension_key":"CONFLICT_MANAGEMENT"},{"key":"D","score":2,"label_fa":"بدون بررسی اثر مالی، فقط بر اساس فوریت ابراز شده کارفرما تصمیم می‌گیرم.","dimension_key":"DECISION_QUALITY"}]'::jsonb,
 '9471e55b-cfad-440b-b04e-8ed75501b05c', 'L4', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'متوجه شده‌اید که بازرس جوانی که زیر نظر شما کار می‌کند، گزارش روزانه کنترل کیفیت دیروز را ناقص و با چند مقدار تخمینی (نه اندازه‌گیری واقعی) پر کرده است.',
 '[{"key":"A","score":5,"label_fa":"گزارش را باطل می‌کنم، با او درباره اهمیت ثبت داده واقعی صحبت می‌کنم و اندازه‌گیری‌های واقعی را دوباره انجام می‌دهیم.","dimension_key":"INTEGRITY_ORIENTATION"},{"key":"B","score":2,"label_fa":"خودم مقادیر را اصلاح می‌کنم بدون اینکه به او یا مافوق چیزی بگویم.","dimension_key":"ACCOUNTABILITY"},{"key":"C","score":3,"label_fa":"یادداشتی رسمی برای پرونده او ثبت می‌کنم اما گزارش فعلی را همان‌طور که هست نگه می‌دارم.","dimension_key":"DOCUMENTATION_DISCIPLINE"},{"key":"D","score":1,"label_fa":"چون تفاوت مقادیر تخمینی با واقعی احتمالاً کم است، گزارش را تایید می‌کنم.","dimension_key":"DETAIL_ORIENTATION"}]'::jsonb,
 'aadae8ab-d2cb-4c8b-b9dc-35bc241a2b32', 'L3', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'برای سومین بار، یک بخش از خط لوله در تست هیدرواستاتیک (Hydrotest) با افت فشار مواجه شده، بدون اینکه علت دقیق آن تا الان مشخص شده باشد.',
 '[{"key":"A","score":5,"label_fa":"خودم مسئولیت پیدا کردن ریشه مشکل را برعهده می‌گیرم، تیم بازرسی و مهندسی را هماهنگ می‌کنم تا قبل از تست بعدی علت واقعی مشخص شود.","dimension_key":"PROBLEM_OWNERSHIP"},{"key":"B","score":4,"label_fa":"داده‌های هر سه تست قبلی را کنار هم مقایسه می‌کنم تا الگوی مشترک افت فشار را پیدا کنم.","dimension_key":"ANALYTICAL_THINKING"},{"key":"C","score":2,"label_fa":"همان روش تست قبلی را دوباره تکرار می‌کنم، به این امید که این بار نتیجه متفاوت باشد.","dimension_key":"PERSISTENCE"},{"key":"D","score":1,"label_fa":"تست بعدی را با فشار کمی پایین‌تر برنامه‌ریزی می‌کنم تا احتمال قبولی بیشتر شود.","dimension_key":"DECISION_QUALITY"}]'::jsonb,
 '533a48ae-b52c-4c42-a662-854f50fc694f', 'L4', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'به دلیل بارش شدید باران، کار میدانی جبهه اصلی برای سه روز کاملاً متوقف شده و نیروی انسانی در سایت بلااستفاده مانده است.',
 '[{"key":"A","score":5,"label_fa":"برنامه کار را بازآرایی می‌کنم تا فعالیت‌های داخل سوله یا کارهای غیرمرتبط با هوا جایگزین شود و نیرو بیکار نماند.","dimension_key":"ADAPTABILITY"},{"key":"B","score":4,"label_fa":"از این فرصت برای برگزاری دوره‌های آموزشی HSE یا فنی کوتاه برای تیم استفاده می‌کنم.","dimension_key":"INITIATIVE"},{"key":"C","score":2,"label_fa":"منتظر می‌مانم هوا خوب شود و هیچ تغییری در برنامه یا تخصیص نیرو نمی‌دهم.","dimension_key":"PERSISTENCE"},{"key":"D","score":3,"label_fa":"از این وقفه برای یادگیری بخش‌هایی از نرم‌افزار برنامه‌ریزی که کمتر با آن‌ها کار کرده‌ام استفاده می‌کنم.","dimension_key":"LEARNING_AGILITY"}]'::jsonb,
 'a6b51690-e4ea-48f1-8693-256113393dbb', 'L2', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'یک نقشه‌بردار تازه‌کار متوجه شده که مختصات یک نقطه کلیدی در ایزومتریک اجرایی با مختصات واقعی میدان حدود ۱۵ سانتی‌متر تفاوت دارد، اما این تفاوت هنوز به هیچ‌کس دیگری گزارش نشده.',
 '[{"key":"A","score":5,"label_fa":"بلافاصله علت اختلاف را بررسی می‌کنم، ایزومتریک را با تیم مهندسی صحت‌سنجی می‌کنم و اصلاح لازم را قبل از ادامه نصب پیگیری می‌کنم.","dimension_key":"PROBLEM_OWNERSHIP"},{"key":"B","score":3,"label_fa":"تفاوت را در گزارش هفتگی ثبت می‌کنم اما تا جلسه بعدی کار را به همان صورت ادامه می‌دهم.","dimension_key":"DOCUMENTATION_DISCIPLINE"},{"key":"C","score":1,"label_fa":"چون خودم مقصر این اختلاف نبوده‌ام، منتظر می‌مانم تیم دیگری آن را کشف و پیگیری کند.","dimension_key":"ACCOUNTABILITY"},{"key":"D","score":2,"label_fa":"چون ۱۵ سانتی‌متر تفاوت کمی به نظر می‌رسد، بدون بررسی بیشتر از آن عبور می‌کنم.","dimension_key":"DETAIL_ORIENTATION"}]'::jsonb,
 '533a48ae-b52c-4c42-a662-854f50fc694f', 'L3', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'دو هفته بعد از پرداخت یک صورت‌حساب تامین‌کننده تجهیزات، متوجه می‌شوید مبلغ پرداختی حدود ۸٪ بیشتر از مقدار واقعی سفارش بوده است.',
 '[{"key":"A","score":5,"label_fa":"موضوع را فوراً به‌صورت رسمی به واحد مالی و تامین‌کننده اطلاع می‌دهم و پیگیر بازگشت یا تسویه مابه‌التفاوت می‌شوم.","dimension_key":"INTEGRITY_ORIENTATION"},{"key":"B","score":3,"label_fa":"چون مبلغ نسبت به کل قرارداد کوچک است، آن را در تسویه‌حساب نهایی پروژه لحاظ می‌کنم بدون اطلاع فوری.","dimension_key":"COMMERCIAL_AWARENESS"},{"key":"C","score":1,"label_fa":"چون این اشتباه واحد مالی بوده، منتظر می‌مانم خودشان متوجه شوند.","dimension_key":"ACCOUNTABILITY"},{"key":"D","score":2,"label_fa":"فقط یک یادداشت داخلی برای خودم ثبت می‌کنم تا در صورت پرسش بعدی مدرک داشته باشم.","dimension_key":"DOCUMENTATION_DISCIPLINE"}]'::jsonb,
 'e3b34f34-6ddc-46b5-8d97-38d2c49dea83', 'L3', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'مدیریت پروژه اعلام کرده که از ماه آینده تمام چک‌لیست‌های بازرسی کاغذی حذف و باید فقط از یک اپلیکیشن موبایل جدید برای ثبت بازرسی‌ها استفاده شود.',
 '[{"key":"A","score":5,"label_fa":"قبل از موعد اجباری، خودم اپلیکیشن را نصب و با چند بازرسی آزمایشی با آن تمرین می‌کنم.","dimension_key":"LEARNING_AGILITY"},{"key":"B","score":2,"label_fa":"تا روزی که مجبور شوم، از همان فرم کاغذی به‌صورت موازی هم استفاده می‌کنم.","dimension_key":"ADAPTABILITY"},{"key":"C","score":1,"label_fa":"استفاده از اپلیکیشن را به تعویق می‌اندازم تا ببینم آیا واقعاً اجباری می‌شود یا نه.","dimension_key":"DISCIPLINE"},{"key":"D","score":3,"label_fa":"منتظر یک جلسه آموزشی رسمی می‌مانم و تا آن زمان کاری در این باره نمی‌کنم.","dimension_key":"DOCUMENTATION_DISCIPLINE"}]'::jsonb,
 '84b885c8-f93c-4ed7-8b8c-1d6fd49045c8', 'L2', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'یک عضو جوان تیم شما، با وجود سه دور بازخورد و راهنمایی جداگانه، همچنان در ثبت دقیق ابعاد جوش اشتباه می‌کند.',
 '[{"key":"A","score":5,"label_fa":"روش آموزش را عوض می‌کنم، همراه او چند نمونه واقعی را قدم‌به‌قدم انجام می‌دهم و علت ریشه‌ای اشتباهات را پیدا می‌کنم.","dimension_key":"LEADERSHIP"},{"key":"B","score":3,"label_fa":"همان بازخوردهای قبلی را دوباره و با همان روش تکرار می‌کنم، به این امید که این بار جواب دهد.","dimension_key":"PERSISTENCE"},{"key":"C","score":1,"label_fa":"کار او را به یکی دیگر از اعضای تیم می‌سپارم تا خودم درگیر این موضوع نشوم.","dimension_key":"TEAMWORK"},{"key":"D","score":2,"label_fa":"او را از این وظیفه خاص کنار می‌گذارم بدون اینکه ریشه مشکل را بررسی کنم.","dimension_key":"ACCOUNTABILITY"}]'::jsonb,
 'a6b51690-e4ea-48f1-8693-256113393dbb', 'L3', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'نماینده کارفرما بدون هماهنگی قبلی به سایت آمده و متوجه شده که چند وسیله حفاظت فردی اضافی و مصالح در راهروی اصلی جبهه کار به‌صورت نامرتب رها شده است.',
 '[{"key":"A","score":5,"label_fa":"بلافاصله مسئولیت را می‌پذیرم، محل را جلوی چشم او مرتب می‌کنیم و علت این بی‌نظمی را همان روز بررسی و اصلاح می‌کنم.","dimension_key":"OWNERSHIP"},{"key":"B","score":3,"label_fa":"از او عذرخواهی می‌کنم و قول می‌دهم تا فردا مرتب شود، اما همان لحظه اقدامی نمی‌کنم.","dimension_key":"STAKEHOLDER_ORIENTATION"},{"key":"C","score":1,"label_fa":"توضیح می‌دهم که این وضعیت موقتی و بی‌اهمیت است و ادامه بازدید را پیشنهاد می‌دهم.","dimension_key":"SAFETY_ORIENTATION"},{"key":"D","score":2,"label_fa":"مسئول نظافت سایت را برای این موضوع سرزنش می‌کنم بدون اینکه خودم اقدامی انجام دهم.","dimension_key":"DISCIPLINE"}]'::jsonb,
 '9471e55b-cfad-440b-b04e-8ed75501b05c', 'L2', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'برچسب بازرسی داربست یک جبهه کاری دو روز پیش منقضی شده، اما تیم اجرایی برای جلوگیری از توقف کار می‌خواهد بدون بازرسی مجدد از آن استفاده کند.',
 '[{"key":"A","score":5,"label_fa":"استفاده از داربست را متوقف می‌کنم تا بازرسی مجدد و صدور برچسب معتبر جدید انجام شود.","dimension_key":"SAFETY_ORIENTATION"},{"key":"B","score":2,"label_fa":"چون داربست دو روز پیش تایید بوده، فرض می‌کنم هنوز ایمن است و اجازه استفاده می‌دهم.","dimension_key":"DECISION_QUALITY"},{"key":"C","score":3,"label_fa":"فقط از تیم می‌خواهم با احتیاط بیشتری کار کنند و بازرسی را برای فردا برنامه‌ریزی می‌کنم.","dimension_key":"RISK_AWARENESS"},{"key":"D","score":1,"label_fa":"تصمیم را به عهده سرکارگر می‌گذارم و خودم درگیر نمی‌شوم.","dimension_key":"ACCOUNTABILITY"}]'::jsonb,
 '84c50ac3-fc96-4005-9971-4220acfe3317', 'L3', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'یک مورد در پانچ‌لیست (فهرست نواقص) پروژه، مربوط به نشتی جزئی یک فلنج، بیش از دو ماه است که همچنان باز مانده و هر بار به دلایل مختلف به تعویق افتاده.',
 '[{"key":"A","score":5,"label_fa":"علت اصلی تاخیر مکرر را بررسی می‌کنم، مسئول مشخصی برای رفع قطعی آن تعیین می‌کنم و تا بسته شدن کامل آیتم پیگیری می‌کنم.","dimension_key":"PROBLEM_OWNERSHIP"},{"key":"B","score":3,"label_fa":"دوباره یادآوری می‌کنم که این مورد باید رفع شود، مثل دفعات قبلی.","dimension_key":"PERSISTENCE"},{"key":"C","score":1,"label_fa":"چون نشتی جزئی و کم‌خطر است، آن را در اولویت‌های پایین‌تر نگه می‌دارم.","dimension_key":"DETAIL_ORIENTATION"},{"key":"D","score":2,"label_fa":"منتظر می‌مانم واحد کنترل کیفیت دوباره آن را در بازرسی بعدی یادآوری کند.","dimension_key":"OWNERSHIP"}]'::jsonb,
 '533a48ae-b52c-4c42-a662-854f50fc694f', 'L3', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'دو تامین‌کننده تجهیزات، مشخصات فنی متفاوتی برای یک شیر (Valve) مشابه ارائه داده‌اند و هر دو ادعا می‌کنند مشخصات‌شان با استاندارد پروژه مطابقت دارد.',
 '[{"key":"A","score":5,"label_fa":"مشخصات هر دو را با استاندارد و نیازمندی واقعی پروژه ردیف‌به‌ردیف مقایسه می‌کنم تا اختلاف واقعی مشخص شود.","dimension_key":"ANALYTICAL_THINKING"},{"key":"B","score":2,"label_fa":"گزینه ارزان‌تر را انتخاب می‌کنم چون هر دو ادعای مطابقت با استاندارد را دارند.","dimension_key":"DECISION_QUALITY"},{"key":"C","score":3,"label_fa":"گزینه‌ای را انتخاب می‌کنم که سابقه طولانی‌تری در پروژه‌های مشابه داشته، بدون بررسی فنی دقیق‌تر.","dimension_key":"RISK_AWARENESS"},{"key":"D","score":1,"label_fa":"تصمیم را کاملاً به واحد تدارکات می‌سپارم و از جنبه فنی وارد نمی‌شوم.","dimension_key":"COMMERCIAL_AWARENESS"}]'::jsonb,
 'bd6cc96c-2e08-4dc6-94cf-23335d6d2c0b', 'L3', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'کارفرما به‌تازگی یک فرآیند هماهنگی جدید بین‌رشته‌ای را برای تمام تیم‌های پیمانکار اجباری کرده که با روش قبلی کار شما تفاوت زیادی دارد.',
 '[{"key":"A","score":5,"label_fa":"فرآیند جدید را می‌پذیرم، روش‌های داخلی تیم خودم را برای تطبیق با آن تنظیم می‌کنم و تیم را همراه می‌کنم.","dimension_key":"ADAPTABILITY"},{"key":"B","score":3,"label_fa":"برای حفظ رابطه با کارفرما ظاهراً می‌پذیرم اما در عمل بیشتر همان روش قبلی را ادامه می‌دهم.","dimension_key":"STAKEHOLDER_ORIENTATION"},{"key":"C","score":1,"label_fa":"چون روش جدید پیچیده به نظر می‌رسد، از کارفرما می‌خواهم فعلاً از فرآیند قبلی استفاده کنیم.","dimension_key":"LEARNING_AGILITY"},{"key":"D","score":2,"label_fa":"فقط خودم فرآیند جدید را یاد می‌گیرم و مابقی تیم را در جریان جزئیات نمی‌گذارم.","dimension_key":"TEAMWORK"}]'::jsonb,
 '84b885c8-f93c-4ed7-8b8c-1d6fd49045c8', 'L3', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'متوجه می‌شوید یکی از اعضای تیم شما، برای صرفه‌جویی در وقت، مرحله ثبت عکس قبل از دفن یک بخش از خط لوله را انجام نداده و خاک‌ریزی را آغاز کرده است.',
 '[{"key":"A","score":5,"label_fa":"کار خاک‌ریزی را متوقف می‌کنم، بخش مربوطه را دوباره باز می‌کنیم تا مستندسازی کامل شود و با او درباره اهمیت این مرحله صحبت می‌کنم.","dimension_key":"LEADERSHIP"},{"key":"B","score":2,"label_fa":"فقط تذکر شفاهی می‌دهم و اجازه می‌دهم خاک‌ریزی همان‌طور ادامه یابد.","dimension_key":"ACCOUNTABILITY"},{"key":"C","score":1,"label_fa":"در گزارش نهایی وانمود می‌کنم عکس‌برداری قبل از دفن انجام شده است.","dimension_key":"INTEGRITY_ORIENTATION"},{"key":"D","score":3,"label_fa":"فقط یک یادداشت داخلی می‌نویسم که این مرحله جا افتاده، بدون اقدام اصلاحی روی خود کار.","dimension_key":"DOCUMENTATION_DISCIPLINE"}]'::jsonb,
 'aadae8ab-d2cb-4c8b-b9dc-35bc241a2b32', 'L3', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'در یک ماه گذشته، سه نزدیک‌به‌حادثه (Near-Miss) جزئی و به‌ظاهر بی‌ربط در جبهه‌های مختلف کاری شما ثبت شده است.',
 '[{"key":"A","score":5,"label_fa":"گزارش هر سه مورد را کنار هم بررسی می‌کنم تا ببینم آیا یک الگو یا ریشه مشترک (مثلاً نظارت ناکافی یا خستگی نیرو) وجود دارد.","dimension_key":"ANALYTICAL_THINKING"},{"key":"B","score":4,"label_fa":"مسئولیت بررسی ریشه‌ای این الگو را شخصاً برعهده می‌گیرم و یک اقدام اصلاحی سیستمی پیشنهاد می‌دهم.","dimension_key":"PROBLEM_OWNERSHIP"},{"key":"C","score":1,"label_fa":"چون هیچ‌کدام منجر به حادثه واقعی نشده، آن‌ها را جدا از هم و کم‌اهمیت در نظر می‌گیرم.","dimension_key":"SAFETY_ORIENTATION"},{"key":"D","score":2,"label_fa":"فقط جبهه‌ای که آخرین نزدیک‌به‌حادثه در آن رخ داده را بررسی می‌کنم.","dimension_key":"RISK_AWARENESS"}]'::jsonb,
 'd61c9ed0-882a-4305-9882-cdda629186cf', 'L4', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'در بررسی گزارش‌های هزینه سه ماه اخیر متوجه می‌شوید هزینه واقعی یک بخش پروژه هر ماه کمی بیشتر از پیش‌بینی بوده و این روند تکرار شده است.',
 '[{"key":"A","score":5,"label_fa":"اقلام هزینه هر سه ماه را ردیف‌به‌ردیف مقایسه می‌کنم تا منشأ دقیق و تکرارشونده انحراف را پیدا کنم.","dimension_key":"DETAIL_ORIENTATION"},{"key":"B","score":3,"label_fa":"مسئولیت اصلاح پیش‌بینی آینده را برعهده می‌گیرم، بدون بررسی علت انحراف‌های گذشته.","dimension_key":"OWNERSHIP"},{"key":"C","score":1,"label_fa":"چون مبلغ هر ماه به‌تنهایی کوچک است، روند کلی را نادیده می‌گیرم.","dimension_key":"DECISION_QUALITY"},{"key":"D","score":2,"label_fa":"فقط گزارش را به واحد مالی ارجاع می‌دهم و خودم پیگیری نمی‌کنم.","dimension_key":"COMMERCIAL_AWARENESS"}]'::jsonb,
 'a1180023-cf2c-4621-bb24-177797855365', 'L3', 1, true, 'APPROVED', null),

('PRIORITY_CHOICE', 'در این شرایط با وقت محدود، کدام یک را در اولویت نخست قرار می‌دهید؟',
 'در پایان شیفت کاری، فقط فرصت رسیدگی کامل به یکی از این چهار مورد را دارید: پیگیری یک جلسه آموزش کوتاه ایمنی (Toolbox Talk) که به تعویق افتاده، جلسه راهنمایی فردی با یک نیروی تازه‌استخدام، پاسخ به یک مطالبه (Claim) مکتوب کارفرما، یا پیگیری یک اقدام اصلاحی قدیمی و بازمانده.',
 '[{"key":"A","score":5,"label_fa":"برگزاری جلسه آموزش ایمنی، چون تاخیر بیشتر در آن می‌تواند ریسک ایمنی فردا را افزایش دهد.","dimension_key":"SAFETY_ORIENTATION"},{"key":"B","score":3,"label_fa":"جلسه راهنمایی فردی با نیروی تازه‌استخدام، چون شروع درست او بر عملکرد بلندمدت تیم اثر دارد.","dimension_key":"LEADERSHIP"},{"key":"C","score":3,"label_fa":"پاسخ به مطالبه مکتوب کارفرما، چون تاخیر در پاسخ می‌تواند رابطه قراردادی را تحت فشار بگذارد.","dimension_key":"STAKEHOLDER_ORIENTATION"},{"key":"D","score":2,"label_fa":"پیگیری اقدام اصلاحی قدیمی، چون مدت‌هاست باز مانده و باید بالاخره بسته شود.","dimension_key":"PERSISTENCE"}]'::jsonb,
 '9471e55b-cfad-440b-b04e-8ed75501b05c', 'L3', 1, true, 'APPROVED', null),

('PRIORITY_CHOICE', 'در این شرایط با ظرفیت محدود، کدام یک را در اولویت نخست قرار می‌دهید؟',
 'در پایان فصل کاری، ظرفیت کافی برای انجام کامل فقط یکی از این موارد را دارید: رسیدگی به یک شکایت مکتوب مشتری نهایی درباره کیفیت تحویل، تکمیل مستندات معوق چند هفته‌ای بازرسی‌ها، ریشه‌یابی یک عیب تکرارشونده در یکی از تجهیزات، یا یادگیری یک نرم‌افزار جدید بازرسی که قرار است پروژه بعدی از آن استفاده کند.',
 '[{"key":"A","score":5,"label_fa":"رسیدگی به شکایت مشتری نهایی، چون نارضایتی حل‌نشده مشتری مستقیماً به اعتبار پروژه آسیب می‌زند.","dimension_key":"STAKEHOLDER_ORIENTATION"},{"key":"B","score":4,"label_fa":"ریشه‌یابی عیب تکرارشونده تجهیز، چون تا وقتی علت اصلی پیدا نشود، مشکل بارها تکرار خواهد شد.","dimension_key":"PROBLEM_OWNERSHIP"},{"key":"C","score":2,"label_fa":"تکمیل مستندات معوق بازرسی‌ها، چون تجمع مستندات ناقص ریسک حسابرسی آینده را افزایش می‌دهد.","dimension_key":"DOCUMENTATION_DISCIPLINE"},{"key":"D","score":1,"label_fa":"یادگیری نرم‌افزار جدید، چون آماده‌بودن برای پروژه بعدی در بلندمدت مهم‌تر است.","dimension_key":"LEARNING_AGILITY"}]'::jsonb,
 '533a48ae-b52c-4c42-a662-854f50fc694f', 'L3', 1, true, 'APPROVED', null),

('EXPERIENCE_ANCHORED', 'در آن موقعیت، واقعاً چه کردید؟',
 'به آخرین باری فکر کنید که یک بخش از کار شما یا تیم‌تان چندین بار پشت سر هم (نه فقط یک بار) در بازرسی یا تست رد شد.',
 '[{"key":"A","score":5,"label_fa":"علی‌رغم رد شدن‌های مکرر، هر بار روش را کمی تغییر دادم و تا رسیدن به نتیجه درست ادامه دادم.","dimension_key":"PERSISTENCE"},{"key":"B","score":3,"label_fa":"مسئولیت رفع مشکل را کامل پذیرفتم، هرچند در برخی موارد نیاز به کمک گرفتن از دیگران داشتم.","dimension_key":"OWNERSHIP"},{"key":"C","score":1,"label_fa":"پس از دومین رد شدن، بدون بررسی بیشتر، همان روش قبلی را دوباره امتحان کردم به امید نتیجه بهتر.","dimension_key":"DECISION_QUALITY"},{"key":"D","score":2,"label_fa":"بعد از چند بار رد شدن، تصمیم گرفتم موضوع را کاملاً به فرد دیگری واگذار کنم.","dimension_key":"ADAPTABILITY"}]'::jsonb,
 'a6b51690-e4ea-48f1-8693-256113393dbb', 'L3', 1, true, 'APPROVED', null),

('EXPERIENCE_ANCHORED', 'در آن موقعیت، واقعاً چه کردید؟',
 'به آخرین باری فکر کنید که مجبور شدید در مدت‌زمانی کوتاه، یک مهارت فنی کاملاً جدید (که تا آن زمان با آن کار نکرده بودید) را یاد بگیرید.',
 '[{"key":"A","score":5,"label_fa":"به‌سرعت منابع و افراد مسلط را پیدا کردم، اصول اولیه را یاد گرفتم و با تمرین عملی مهارت لازم را کسب کردم.","dimension_key":"LEARNING_AGILITY"},{"key":"B","score":3,"label_fa":"خودم بدون اینکه کسی بخواهد، شروع به یادگیری کردم، هرچند روش من زیاد منظم نبود.","dimension_key":"INITIATIVE"},{"key":"C","score":1,"label_fa":"به دیگران وابسته ماندم و منتظر ماندم مرحله‌به‌مرحله به من نشان بدهند، بدون تلاش برای درک منطق کار.","dimension_key":"ANALYTICAL_THINKING"},{"key":"D","score":2,"label_fa":"کار را به تعویق انداختم تا زمانی که فرد دیگری در دسترس شود که آن مهارت را داشته باشد.","dimension_key":"ADAPTABILITY"}]'::jsonb,
 '84b885c8-f93c-4ed7-8b8c-1d6fd49045c8', 'L2', 1, true, 'APPROVED', null),

('SJT', 'در این شرایط، بیشترین احتمال دارد چه کاری انجام دهید؟',
 'دو سرکارگر که مسئول مشترک یک جبهه کاری هستند، طی چند هفته اخیر بارها بر سر ترتیب انجام کارها با هم اختلاف پیدا کرده‌اند و این اختلاف باعث سردرگمی نیروها و کندی پیشرفت شده است.',
 '[{"key":"A","score":5,"label_fa":"هر دو را در یک جلسه مشترک می‌نشانم، ریشه اختلاف را روشن می‌کنم و یک تقسیم مسئولیت شفاف و مورد توافق تعیین می‌کنم.","dimension_key":"LEADERSHIP"},{"key":"B","score":3,"label_fa":"با هرکدام جداگانه صحبت می‌کنم تا دیدگاه‌شان را بفهمم، اما تصمیم نهایی را به تعویق می‌اندازم.","dimension_key":"CONFLICT_MANAGEMENT"},{"key":"C","score":1,"label_fa":"برای جلوگیری از درگیر شدن در تعارض، اجازه می‌دهم خودشان به‌مرور به تفاهم برسند.","dimension_key":"TEAMWORK"},{"key":"D","score":2,"label_fa":"بدون شنیدن دیدگاه هیچ‌کدام، رأساً تصمیم می‌گیرم و به هر دو ابلاغ می‌کنم.","dimension_key":"DECISION_QUALITY"}]'::jsonb,
 'd79ca2be-a5e4-46fc-89a7-adcc99e8eefb', 'L3', 1, true, 'APPROVED', null);
