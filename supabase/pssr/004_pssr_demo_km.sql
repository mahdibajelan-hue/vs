-- دادهٔ نمایشی: کیلومتر ایستگاه ST-01 تا روی نقشهٔ آمادگی و دوقلوی دیجیتال دیده شود
update pssr_systems set km_from = 80, km_to = 80 where code = 'ST-01' and master_project_id = '5aa1afc2-c569-4546-a07f-2ca4160c2e63' and km_from is null;
