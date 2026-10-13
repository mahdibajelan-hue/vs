/**
 * Digital forms of the execution module, derived from the attached QC workbooks (QC_FORM_2.xlsx / QC_FORM_welding.xlsx).
 * Every form is data: header fields, line columns, the counters printed at the bottom of the paper form (today / until now) and who signs.
 * A form can be switched on or off per project; fields that exist on paper but are not built are listed in `notBuilt` (shown in the coverage matrix).
 */
export type FieldKind = 'text' | 'num' | 'select' | 'date' | 'time' | 'km'
export interface Opt { value: string; label: string }
export interface FieldDef { key: string; label: string; en?: string; kind: FieldKind; options?: Opt[]; req?: boolean; unit?: string; wide?: boolean; hint?: string }
/** A counter of the paper form: «تا امروز / امروز / جمع» computed from the lines. `groupBy` splits it (e.g. per wall thickness). */
export interface MetricDef { key: string; label: string; unit: string; op: 'count' | 'sum'; fields?: string[]; groupBy?: string; where?: { field: string; eq: string } }
export type FormGroup = 'pipeline' | 'weld' | 'rt' | 'coating' | 'ground' | 'qc'
export type Signer = 'contractor' | 'supervision' | 'rt_contractor' | 'consultant' | 'site_head' | 'project_control' | 'employer'
export interface FormDef {
  key: string; title: string; en: string; group: FormGroup; kind: 'daily' | 'record'; sheet: string
  header: FieldDef[]; columns: FieldDef[]; metrics: MetricDef[]; resources?: boolean; signers: Signer[]
  /** the line table is optional (a record is one set of header fields) */
  noLines?: boolean
  notBuilt?: string[]
  /** a short hint shown above the table */
  hint?: string
}

export const SIGNER_LABEL_FA: Record<Signer, string> = { contractor: 'نماینده پیمانکار', supervision: 'نماینده دستگاه نظارت', rt_contractor: 'نماینده پیمانکار رادیوگرافی', consultant: 'مشاور', site_head: 'سرپرست کارگاه پیمانکار', project_control: 'کنترل پروژه پیمانکار', employer: 'نمایندهٔ کارفرما' }
export const FORM_GROUP_LABEL_FA: Record<FormGroup, string> = { pipeline: 'عملیات خط لوله (ریسه، خمکاری، فیت‌آپ)', weld: 'جوشکاری و تعمیر', rt: 'رادیوگرافی', coating: 'پوشش و بازرسی', ground: 'عملیات خاکی و حفاظت', qc: 'سوابق صلاحیت و کیفیت' }

const accRej: Opt[] = [{ value: 'acc', label: 'پذیرفته' }, { value: 'rej', label: 'مردود' }]
const yesNo: Opt[] = [{ value: 'yes', label: 'بله' }, { value: 'no', label: 'خیر' }]
const f = (key: string, label: string, kind: FieldKind = 'text', extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind, ...extra })
const sec = f('sec', 'شماره سکشن (Sec)'), weldNo = f('weldNo', 'شماره سرجوش (Weld No.)', 'text', { req: true }), pipeNo = f('pipeNo', 'شماره لوله (Pipe No.)'), remark = f('remark', 'ملاحظات', 'text', { wide: true })
const weather: FieldDef = f('weather', 'وضعیت جوی', 'select', { options: [{ value: 'sunny', label: 'آفتابی' }, { value: 'cloudy', label: 'ابری' }, { value: 'rainy', label: 'بارانی' }, { value: 'snowy', label: 'برفی' }, { value: 'stormy', label: 'طوفانی (باد و خاک)' }] })
const pipeSpec = f('pipeSpec', 'مشخصات لوله (Pipe / Grade / Code)', 'text', { hint: 'مثلاً 30" API 5L X60 API 1104', wide: true })
const wps = f('wpsNo', 'شماره WPS')
const stamps = [f('stampRoot', 'مهر جوشکار Root'), f('stampHot', 'Hot'), f('stampFill', 'Fill'), f('stampCap', 'Cap')]
const bendDeg = f('bendDeg', 'زاویه خم (Bend °)', 'num')
const size = f('sizeIn', 'قطر (in)', 'num', { unit: 'in' })


export const FORMS: FormDef[] = [
  { key: 'pipe_entry', title: 'صورتجلسه ورود لوله به کارگاه', en: 'Pipe delivery record', group: 'pipeline', kind: 'daily', sheet: 'Pipe inter', signers: ['supervision', 'contractor'],
    header: [f('carrier', 'حمل‌کننده / پیمانکار حمل')],
    columns: [pipeNo, f('lengthM', 'طول (m)', 'num', { req: true, unit: 'm' }), f('thkIn', 'ضخامت (in)', 'num', { req: true, unit: 'in' }), size, f('waybill', 'شماره بارنامه'), f('loadDate', 'تاریخ بارگیری', 'date'), f('truckNo', 'شماره کامیون'), f('unloadDate', 'تاریخ تخلیه', 'date'), f('placeNote', 'ریسه / دپو')],
    metrics: [{ key: 'joints', label: 'تعداد شاخه', unit: 'شاخه', op: 'count', groupBy: 'thkIn' }, { key: 'length', label: 'متراژ لوله', unit: 'm', op: 'sum', fields: ['lengthM'], groupBy: 'thkIn' }],
    notBuilt: ['جمع‌بندی به‌تفکیک ضخامت‌های ثابت ۰٫۴۰۶/۰٫۵۶۲/۰٫۶۸۸/۰٫۷۵۰ اینچ — به‌جای آن به‌تفکیک هر ضخامت واردشده محاسبه می‌شود'] },
  { key: 'string', title: 'گزارش روزانه عملیات ریسه', en: 'Stringing daily report', group: 'pipeline', kind: 'daily', sheet: 'string', signers: ['supervision', 'contractor'],
    header: [],
    columns: [pipeNo, f('lengthM', 'طول لوله (m)', 'num', { req: true, unit: 'm' }), f('thkIn', 'ضخامت (in)', 'num', { req: true, unit: 'in' }), f('origin', 'وضعیت (حمل از)', 'select', { options: [{ value: 'factory', label: 'حمل از کارخانه' }, { value: 'depot', label: 'حمل از دپو' }] }), remark],
    metrics: [{ key: 'joints', label: 'تعداد شاخه', unit: 'شاخه', op: 'count', groupBy: 'thkIn' }, { key: 'length', label: 'متراژ', unit: 'm', op: 'sum', fields: ['lengthM'], groupBy: 'thkIn' }] },
  { key: 'bend', title: 'گزارش روزانه خمکاری', en: 'Bending daily report', group: 'pipeline', kind: 'daily', sheet: 'bend', signers: ['supervision', 'contractor'],
    header: [f('machine', 'مدل دستگاه خمکاری (Bend machine model)')],
    columns: [f('km', 'کیلومتر (Km)', 'km'), f('direction', 'جهت خم', 'select', { options: [{ value: 'sag', label: 'Sag' }, { value: 'over', label: 'Over' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }] }), pipeNo, f('wtMm', 'ضخامت (mm)', 'num', { unit: 'mm' }), f('lengthM', 'طول (m)', 'num', { unit: 'm' }), f('diaMm', 'قطر (mm)', 'num', { unit: 'mm' }), f('bendDeg', 'زاویه خم', 'num'), f('ovalMm', 'بیضوی‌شدن (mm)', 'num'), f('ovalPct', 'بیضوی‌شدن (٪)', 'num'), f('result', 'نتیجه', 'select', { options: accRej, req: true }), remark],
    metrics: [{ key: 'bends', label: 'تعداد خم', unit: 'عدد', op: 'count' }, { key: 'accepted', label: 'خم پذیرفته', unit: 'عدد', op: 'count', where: { field: 'result', eq: 'acc' } }] },
  { key: 'fitup', title: 'گزارش روزانه فیت‌آپ', en: 'Daily fit-up report', group: 'pipeline', kind: 'daily', sheet: 'Fit up', signers: ['consultant', 'contractor'],
    header: [wps, pipeSpec],
    columns: [sec, f('jointNo', 'شماره اتصال (Joint No.)', 'text', { req: true }), pipeNo, f('lenA', 'طول A (m)', 'num'), f('lenB', 'طول B (m)', 'num'), f('thkIn', 'ضخامت (in)', 'num'), size, bendDeg, f('result', 'نتیجه', 'select', { options: accRej, req: true }), remark],
    metrics: [{ key: 'joints', label: 'تعداد اتصال', unit: 'اتصال', op: 'count' }, { key: 'length', label: 'متراژ', unit: 'm', op: 'sum', fields: ['lenA', 'lenB'] }],
    notBuilt: ['ستون کمکی و ابعاد C/D شکل کاغذی'] },
  { key: 'welding', title: 'گزارش روزانه جوشکاری', en: 'DAILY WELDING REPORT', group: 'weld', kind: 'daily', sheet: 'welding', signers: ['consultant', 'contractor'],
    hint: 'هر سرجوش دو سطر مهر جوشکار دارد: R و C (مثل فرم کاغذی). طول لوله زیر ستون ضخامت همان لوله جمع می‌شود.',
    header: [wps, pipeSpec, f('thkSet', 'ضخامت‌های ستون‌های A تا D (in)', 'text', { hint: '0.406, 0.438, 0.688, 0.750' })],
    columns: [f('sec', 'Sec No.'), f('weldNo', 'WELD No.', 'text', { req: true }), f('pipeNo', 'PIPE No.'), f('lengthM', 'Length (m)', 'num', { unit: 'm' }), f('thkIn', 'Thickness (in)', 'num'), f('sizeIn', 'SIZE (inch)', 'num', { unit: 'in' }), f('bendDeg', 'BEND (DEGREE)', 'num'),
      f('stampRoot', 'R · Root'), f('stampHot', 'R · Hot'), f('stampFill', 'R · Fill'), f('stampCap', 'R · CAP'), f('stampRootC', 'C · Root'), f('stampHotC', 'C · Hot'), f('stampFillC', 'C · Fill'), f('stampCapC', 'C · CAP'),
      f('vt', 'VT Result', 'select', { options: [{ value: 'acc', label: 'ACC' }, { value: 'rej', label: 'REJ' }] }), f('remark', 'REMARK', 'text', { wide: true })],
    metrics: [{ key: 'len', label: 'Total length', unit: 'm', op: 'sum', fields: ['lengthM'], groupBy: 'thkIn' }, { key: 'joints', label: 'Total number of joints', unit: 'joint', op: 'count', groupBy: 'thkIn' }, { key: 'vtAcc', label: 'VT پذیرفته', unit: 'سرجوش', op: 'count', where: { field: 'vt', eq: 'acc' } }] },
  { key: 'weld_repair', title: 'گزارش روزانه عملیات تعمیرات جوش', en: 'Weld repair daily report', group: 'weld', kind: 'daily', sheet: 'Rep rep', signers: ['supervision', 'contractor'], resources: true,
    header: [],
    columns: [sec, weldNo, f('stamp', 'مهر جوشکار (Stamp)'), f('defect', 'نوع و محل عیب'), f('repairDone', 'وضعیت تعمیر', 'select', { options: [{ value: 'done', label: 'انجام شد' }, { value: 'notdone', label: 'انجام نشد' }] }), f('vtCheck', 'بازبینی VT', 'select', { options: yesNo }), f('rtReqNo', 'شماره درخواست RT')],
    metrics: [{ key: 'repairs', label: 'تعداد تعمیر', unit: 'سرجوش', op: 'count' }, { key: 'done', label: 'تعمیرشده', unit: 'سرجوش', op: 'count', where: { field: 'repairDone', eq: 'done' } }] },
  { key: 'tie_in', title: 'گزارش روزانه عملیات Tie-in و Connection', en: 'Tie-in & connection daily report', group: 'weld', kind: 'daily', sheet: 'CONE REP', signers: ['supervision', 'contractor'], resources: true,
    header: [f('workPlace', 'محل کار'), f('km', 'کیلومتر', 'km'), f('workType', 'نوع کار و متراژ'), pipeSpec, f('routeSide', 'سمت', 'select', { options: [{ value: 'route', label: 'سمت مسیر' }, { value: 'canal', label: 'سمت کانال' }] }), f('weldersCount', 'تعداد جوشکاران', 'num'), f('weldersIds', 'شناسه جوشکاران (Welders ID)'), f('tieSecFrom', 'Tie-in از سکشن'), f('tieSecTo', 'تا سکشن')],
    columns: [sec, weldNo, pipeNo, f('lengthM', 'طول (m)', 'num', { unit: 'm' }), f('thkIn', 'ضخامت (in)', 'num'), bendDeg],
    metrics: [{ key: 'welds', label: 'تعداد سرجوش', unit: 'سرجوش', op: 'count' }, { key: 'length', label: 'متراژ', unit: 'm', op: 'sum', fields: ['lengthM'] }],
    notBuilt: ['کروکی دستی محل (Sketch)'] },
  { key: 'rt_request', title: 'درخواست رادیوگرافی (کامل)', en: 'Radiography request', group: 'rt', kind: 'daily', sheet: 'Req full', signers: ['consultant', 'contractor'],
    header: [pipeSpec],
    columns: [sec, weldNo, f('thkIn', 'ضخامت (in)', 'num'), f('odIn', 'قطر / OD (in)', 'num'), ...stamps, remark],
    metrics: [{ key: 'welds', label: 'سرجوش درخواستی', unit: 'سرجوش', op: 'count' }] },
  { key: 'rt_request_rp', title: 'درخواست رادیوگرافی RP / RS / RT', en: 'Radiography request RP/RS/RT', group: 'rt', kind: 'daily', sheet: 'Req rp.rs.rt', signers: ['consultant', 'contractor'],
    header: [pipeSpec],
    columns: [sec, weldNo, f('thkIn', 'ضخامت (in)', 'num'), f('odIn', 'قطر (in)', 'num'), f('stNo', 'St No.'), f('segment', 'Segment'), remark],
    metrics: [{ key: 'welds', label: 'سرجوش درخواستی', unit: 'سرجوش', op: 'count' }] },
  { key: 'rt_report', title: 'گزارش رادیوگرافی', en: 'Radiography report', group: 'rt', kind: 'daily', sheet: 'rep rt.', signers: ['supervision', 'contractor', 'rt_contractor'],
    header: [f('rtContractor', 'پیمانکار رادیوگرافی'), f('code', 'کد / استاندارد'), f('source', 'نوع منبع', 'select', { options: [{ value: 'x', label: 'X-Ray' }, { value: 'gamma', label: 'Gamma-Ray' }] }), f('iqi', 'IQI'), f('sensitivity', 'حساسیت'), f('focal', 'Focal Spot'), f('strength', 'قدرت منبع'), f('isotope', 'ایزوتوپ'), f('film', 'نوع فیلم'), f('technique', 'روش', 'select', { options: [{ value: 'SWSI', label: 'SWSI' }, { value: 'DWSI', label: 'DWSI' }, { value: 'DWDI', label: 'DWDI' }] }), f('groove', 'نوع شیار (Groove)'), f('sfd', 'SFD/FFD'), f('exposure', 'زمان تابش'), f('ug', 'Ug (mm)', 'num'), f('process', 'فرایند جوشکاری')],
    columns: [f('rtReqNo', 'شماره درخواست RT'), sec, weldNo, f('odIn', 'OD (in)', 'num'), f('thkIn', 'ضخامت (in)', 'num'), f('result', 'نتیجه', 'select', { options: [{ value: 'acc', label: 'پذیرفته (Acc.)' }, { value: 'rep', label: 'تعمیر (Rep.)' }], req: true }), f('repairKind', 'نوع تعمیر', 'select', { options: [{ value: 'RS', label: 'RS' }, { value: 'RT', label: 'RT' }, { value: 'CO', label: 'CO' }, { value: 'RC', label: 'RC' }] }), f('defect', 'نوع و محل عیب (CR/PO/BT/IC…)')],
    metrics: [{ key: 'films', label: 'سرجوش رادیوگرافی‌شده', unit: 'سرجوش', op: 'count' }, { key: 'accepted', label: 'پذیرفته', unit: 'سرجوش', op: 'count', where: { field: 'result', eq: 'acc' } }, { key: 'repair', label: 'نیازمند تعمیر', unit: 'سرجوش', op: 'count', where: { field: 'result', eq: 'rep' } }] },
  { key: 'coating_line', title: 'گزارش پوشش خط لوله', en: 'Pipeline coating report', group: 'coating', kind: 'daily', sheet: 'Coating.', signers: ['consultant', 'contractor'],
    header: [f('approvedBy', 'تأییدکننده (Approved by)')],
    columns: [sec, f('jointNo', 'شماره اتصال', 'text', { req: true }), f('brand', 'مارک پوشش'), f('blast', 'سندبلاست سطح', 'select', { options: accRej }), f('vt', 'کنترل چشمی (VT)', 'select', { options: accRej }), f('lengthM', 'متراژ عایق‌کاری‌شده (m)', 'num', { unit: 'm' })],
    metrics: [{ key: 'joints', label: 'سرجوش عایق‌کاری‌شده', unit: 'سرجوش', op: 'count' }, { key: 'length', label: 'متراژ عایق‌کاری‌شده', unit: 'm', op: 'sum', fields: ['lengthM'] }] },
  { key: 'coating_daily', title: 'گزارش روزانه پوشش (ITP)', en: 'Coating daily report', group: 'coating', kind: 'daily', sheet: 'Coating', signers: ['consultant', 'contractor'],
    header: [f('spec', 'مرجع مشخصات'), f('ambientC', 'دمای محیط (°C)', 'num'), f('pipeC', 'دمای لوله (°C)', 'num'), f('humidity', 'رطوبت نسبی (٪)', 'num'), f('sandCond', 'وضعیت شن سندبلاست', 'select', { options: [{ value: 'ok', label: 'مناسب' }, { value: 'soil', label: 'خاک زیاد' }, { value: 'wet', label: 'مرطوب' }, { value: 'grain', label: 'دانه‌بندی نامناسب' }] }), f('airPressure', 'فشار هوا (psi)', 'num'), f('cleanliness', 'درجه تمیزی', 'select', { options: [{ value: 'sa25', label: 'SA 2½' }, { value: 'other', label: 'سایر / مردود' }] }), f('roughness', 'زبری سطح (µm)', 'num'), f('insulationType', 'نوع عایق')],
    columns: [sec, f('jointNo', 'شماره اتصال', 'text', { req: true }), f('coatType', 'نوع / جنس پوشش'), f('batchNo', 'شماره بچ'), f('prodDate', 'تاریخ تولید', 'date'), f('primerA', 'پرایمر A'), f('primerB', 'پرایمر B'), f('primerPct', 'درصد حجمی پرایمر', 'num'), f('lengthM', 'متراژ (m)', 'num', { unit: 'm' })],
    metrics: [{ key: 'joints', label: 'تعداد', unit: 'سرجوش', op: 'count' }, { key: 'length', label: 'متراژ', unit: 'm', op: 'sum', fields: ['lengthM'] }] },
  { key: 'fj_coating', title: 'گزارش روزانه اعمال پوشش سرجوش', en: 'Field-joint coating report', group: 'coating', kind: 'daily', sheet: 'Coating1', signers: ['supervision', 'contractor'],
    header: [f('time', 'ساعت', 'time'), f('ambientC', 'دمای محیط (°C)', 'num'), f('humidity', 'رطوبت نسبی (٪)', 'num'), f('pipeC', 'دمای سطح لوله (°C)', 'num'), f('dewC', 'نقطه شبنم (°C)', 'num'), f('sandCond', 'وضعیت شن'), f('airOil', 'روغن/رطوبت همراه هوا', 'select', { options: [{ value: 'none', label: 'ندارد' }, { value: 'has', label: 'دارد' }] }), f('cleanliness', 'درجه تمیزی SA2½', 'select', { options: [{ value: 'ok', label: 'تأیید' }, { value: 'redo', label: 'آماده‌سازی مجدد' }, { value: 'rej', label: 'مردود' }] }), f('roughness', 'زبری (حداقل ۶۵ میکرون)', 'num'), f('sleeveType', 'نوع عایق سرجوش'), f('maker', 'سازنده / کشور'), f('prodNo', 'شماره تولید'), f('prodDate', 'تاریخ تولید', 'date'), f('primerType', 'نوع و کد پرایمر'), f('mixRatio', 'نسبت ترکیب')],
    columns: [sec, weldNo, f('thk12', 'ضخامت ساعت ۱۲ (µm)', 'num'), f('thk3', 'ساعت ۳', 'num'), f('thk6', 'ساعت ۶', 'num'), f('thk9', 'ساعت ۹', 'num'), f('result', 'نتیجه', 'select', { options: accRej }), remark],
    metrics: [{ key: 'joints', label: 'سرجوش پوشش‌داده‌شده', unit: 'سرجوش', op: 'count' }] },
  { key: 'bond_test', title: 'گزارش آزمایش چسبندگی پوشش سرجوش (Bond test)', en: 'Bond test report', group: 'coating', kind: 'daily', sheet: 'new bond test / bond test', signers: ['supervision', 'contractor'],
    header: [weather, f('startTime', 'ساعت شروع', 'time'), f('endTime', 'ساعت پایان', 'time'), f('instruments', 'تجهیزات تست (کالیبره)'), f('holidayV', 'ولتاژ منفذیابی (V)', 'num')],
    columns: [sec, weldNo, f('position', 'موقعیت تست روی پوشش'), f('testDate', 'تاریخ', 'date'), f('testTime', 'ساعت', 'time'), f('widthCm', 'عرض نوار (cm)', 'num'), f('pipeC', 'دمای لوله (°C)', 'num'), f('tensile', 'نیروی کشش (kg/cm²)', 'num'), f('result', 'نتیجه', 'select', { options: accRej, req: true })],
    metrics: [{ key: 'tests', label: 'آزمایش انجام‌شده', unit: 'مورد', op: 'count' }, { key: 'accepted', label: 'پذیرفته', unit: 'مورد', op: 'count', where: { field: 'result', eq: 'acc' } }] },
  { key: 'lowering', title: 'گزارش Lowering و Holiday', en: 'Lowering & holiday report', group: 'ground', kind: 'daily', sheet: 'LOW1', signers: ['consultant', 'contractor'],
    header: [f('standard', 'استاندارد کاربرد', 'text', { hint: 'API 1104' }), weather],
    columns: [f('lineSec', 'Line / Sec'), weldNo, f('km', 'محل (Km)', 'km'), f('kmFrom', 'از Km', 'km'), f('kmTo', 'تا Km', 'km'), f('loweredM', 'متراژ Lowering (m)', 'num', { unit: 'm' }), f('padding', 'Padding', 'select', { options: accRej }), f('holiday', 'Holiday', 'select', { options: accRej }), f('crossing', 'عبور / تقاطع (نام و نوع)'), f('crossingM', 'طول عبور (m)', 'num'), remark],
    metrics: [{ key: 'lowered', label: 'متراژ Lowering', unit: 'm', op: 'sum', fields: ['loweredM'] }, { key: 'holidayOk', label: 'Holiday پذیرفته', unit: 'مورد', op: 'count', where: { field: 'holiday', eq: 'acc' } }] },
  { key: 'sand', title: 'گزارش روزانه خاک سرندی', en: 'Sand padding daily report', group: 'ground', kind: 'daily', sheet: 'sand', signers: ['supervision', 'contractor'],
    header: [f('contractNo', 'شماره قرارداد')],
    columns: [sec, f('jointNo', 'شماره اتصال'), f('kmFrom', 'از Km', 'km'), f('kmTo', 'تا Km', 'km'), f('lengthM', 'طول عملیات (m)', 'num', { unit: 'm' }), f('result', 'نتیجه', 'select', { options: accRej }), remark],
    metrics: [{ key: 'length', label: 'طول خاک سرندی', unit: 'm', op: 'sum', fields: ['lengthM'] }] },
  { key: 'backfill', title: 'گزارش روزانه بکفیل و گرده‌ماهی', en: 'Backfill & padding daily report', group: 'ground', kind: 'daily', sheet: 'fill', signers: ['supervision', 'contractor'],
    header: [f('contractNo', 'شماره قرارداد')],
    columns: [f('kind', 'نوع', 'select', { options: [{ value: 'backfill', label: 'بکفیل' }, { value: 'bund', label: 'گرده‌ماهی' }], req: true }), sec, f('jointNo', 'شماره اتصال'), f('kmFrom', 'از Km', 'km'), f('kmTo', 'تا Km', 'km'), f('lengthM', 'طول (m)', 'num', { unit: 'm' }), f('result', 'نتیجه', 'select', { options: accRej }), remark],
    metrics: [{ key: 'backfill', label: 'طول بکفیل', unit: 'm', op: 'sum', fields: ['lengthM'], where: { field: 'kind', eq: 'backfill' } }, { key: 'bund', label: 'طول گرده‌ماهی', unit: 'm', op: 'sum', fields: ['lengthM'], where: { field: 'kind', eq: 'bund' } }] },
  { key: 'rock_shield', title: 'گزارش راکشیلد (Rock Shield)', en: 'Rock shield report', group: 'ground', kind: 'daily', sheet: 'Rock Shield', signers: ['supervision', 'contractor'],
    header: [f('standard', 'استاندارد کاربرد', 'text', { hint: 'API 1104 - 2021' }), f('contractNo', 'قرارداد'), weather],
    columns: [sec, weldNo, f('lengthM', 'طول (m)', 'num', { unit: 'm' }), f('km', 'محل (Km)', 'km'), f('sheetNo', 'تعداد ورق', 'num'), remark],
    metrics: [{ key: 'length', label: 'طول راکشیلدبندی', unit: 'm', op: 'sum', fields: ['lengthM'] }, { key: 'sheets', label: 'ورق مصرفی', unit: 'ورق', op: 'sum', fields: ['sheetNo'] }] },
  { key: 'pqr', title: 'برگه ثبت PQR', en: 'PQR record sheet', group: 'qc', kind: 'record', sheet: 'pqr / PQR', signers: ['consultant'], noLines: false,
    header: [f('process', 'فرایند جوشکاری', 'text', { req: true }), f('jointDesign', 'طرح اتصال (Joint design)'), f('wpqtNo', 'شماره WPQT'), f('wpsNo', 'شماره WPS'), f('polarity', 'پلاریته'), f('brand', 'مارک الکترود'), f('electrodeClass', 'کلاس الکترود (Root / Hot & Fill & Cap)', 'text', { wide: true }), f('welderNo', 'شماره جوشکار'), f('welderName', 'نام جوشکار'), f('position', 'وضعیت جوشکاری (Position)'), f('batchNo', 'شماره بچ'), f('preheat', 'پیش‌گرمایش حداقل (°C)', 'num'), f('preheatMethod', 'روش پیش‌گرمایش'), f('baseDia', 'قطر (in)', 'text'), f('baseThk', 'ضخامت (in)', 'num'), f('baseGrade', 'گرید فلز پایه'), f('heatNo', 'Heat No.'), f('qcName', 'نام QC / بازرس')],
    columns: [f('aws', 'کلاس AWS'), f('lenMm', 'طول الکترود (mm)', 'num'), f('dia', 'قطر الکترود (mm)', 'num'), f('elecNo', 'ELEC. NO'), f('interpass', 'دمای بین پاس (°C)', 'num'), f('polarity', 'پلاریته'), f('weldLenCm', 'طول جوش (cm)', 'num'), f('timeMin', 'زمان جوش (min)', 'num'), f('speed', 'سرعت پیشروی (cm/min)', 'num'), f('direction', 'جهت جوشکاری'), f('heatInput', 'حرارت ورودی (kJ/mm)', 'num'), f('volts', 'ولتاژ (V)', 'num'), f('amps', 'آمپر (A)', 'num')],
    metrics: [{ key: 'passes', label: 'تعداد پاس', unit: 'پاس', op: 'count' }],
    notBuilt: ['تصویر طرح اتصال و ترتیب پاس‌ها (SKETCH / RUNS)', 'پیوست نتایج آزمون‌های مکانیکی'], hint: 'هر ردیف یک پاس جوش است.' },
  { key: 'wqt', title: 'آزمون صلاحیت جوشکار (WQT)', en: 'Welder qualification test', group: 'qc', kind: 'record', sheet: 'WQT', signers: ['supervision', 'contractor'], noLines: true,
    header: [f('welderName', 'نام جوشکار', 'text', { req: true }), f('welderId', 'شناسه جوشکار (Welder ID)', 'text', { req: true }), f('stamp', 'مهر جوشکار (Stamp)', 'text', { req: true }), f('wqtNo', 'شماره WQT'), f('standard', 'استاندارد مرجع'), f('testDate', 'تاریخ آزمون', 'date'), f('process', 'فرایند'), f('type', 'نوع اتصال'), f('baseMaterial', 'فلز پایه'), f('thickness', 'ضخامت'), f('couponDia', 'قطر نمونه'), f('position', 'وضعیت جوشکاری'), f('depositThk', 'ضخامت رسوب جوش'), f('range', 'محدودهٔ صلاحیت'), f('progression', 'جهت پیشروی', 'select', { options: [{ value: 'up', label: 'Up hill' }, { value: 'down', label: 'Down hill' }] }), f('filler', 'کلاس فلز پرکننده'), f('backing', 'Backing', 'select', { options: yesNo }), f('visual', 'بازرسی چشمی', 'select', { options: accRej }), f('rtReport', 'شماره/تاریخ گزارش رادیوگرافی'), f('mechanical', 'آزمون مکانیکی (نوع و نتیجه)'), f('qualified', 'نتیجه', 'select', { options: [{ value: 'yes', label: 'واجد صلاحیت' }, { value: 'no', label: 'فاقد صلاحیت' }], req: true }), f('validTo', 'اعتبار تا', 'date')],
    columns: [], metrics: [{ key: 'tests', label: 'آزمون', unit: 'مورد', op: 'count' }], notBuilt: ['تصویر کارت و امضای دستی'] },
  { key: 'welder_card', title: 'کارت صلاحیت جوشکار', en: 'Welder qualification card', group: 'qc', kind: 'record', sheet: 'CARD WELDER', signers: ['consultant', 'contractor'],
    header: [f('welderName', 'نام جوشکار', 'text', { req: true }), f('welderId', 'شناسه', 'text', { req: true }), f('stamp', 'مهر (Stamp)', 'text', { req: true }), f('process', 'فرایند'), f('manual', 'نوع'), f('position', 'وضعیت جوشکاری'), f('matSpec', 'مشخصات فلز'), f('material', 'مواد'), f('thickness', 'ضخامت'), f('electrode', 'الکترود'), f('testDate', 'تاریخ آزمون', 'date'), f('validTo', 'اعتبار کارت تا', 'date')],
    columns: [f('thkIn', 'ضخامت (in)', 'num'), f('electrode', 'الکترود'), f('sizeIn', 'قطر (in)', 'num'), f('pos', 'Pos'), f('baseMat', 'فلز پایه'), f('wpsNo', 'WPS'), f('wqtNo', 'WQT'), f('direction', 'جهت', 'select', { options: [{ value: 'up', label: 'Up hill' }, { value: 'down', label: 'Down hill' }] }), f('pass', 'پاس', 'select', { options: [{ value: 'root', label: 'Root & Hot' }, { value: 'fill', label: 'Filling & Cap' }] })],
    metrics: [], notBuilt: ['عکس جوشکار روی کارت'], hint: 'هر ردیف یک محدودهٔ صلاحیت است.' },
]

export const FORM_BY_KEY: Record<string, FormDef> = Object.fromEntries(FORMS.map((x) => [x.key, x]))
export const DAILY_FORMS = FORMS.filter((x) => x.kind === 'daily')

/** Fields every form shares (kept in columns of ex_reports rather than in `data`). */
export const COMMON_FIELDS = ['پروژه', 'قرارداد / پیمانکار', 'تاریخ شمسی', 'شماره گزارش (خودکار)', 'جبهه کاری', 'ایستگاه / محدوده', 'شیفت', 'وضعیت آب‌وهوا', 'امضای نماینده پیمانکار و دستگاه نظارت']

export const STOPPAGE_CATEGORY_FA: Record<string, string> = { material: 'کمبود متریال', drawing: 'نقشه / مدارک', land: 'زمین / حق عبور', permit: 'مجوز', weather: 'شرایط جوی', equipment: 'ماشین‌آلات', manpower: 'نیروی انسانی', hse: 'HSE', other: 'سایر' }
