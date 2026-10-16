/**
 * Welders and coating applicators: the test form (WQT) a welder takes first, and the card issued after a qualified result.
 * Each fact is typed ONCE: the person's identity (name, national code = «Welder ID», stamp) lives on the person; the card takes everything else from the test and only asks for what the test does not know.
 */
export type PersonKind = 'welder' | 'coater'
export const KIND_FA: Record<PersonKind, string> = { welder: 'جوشکار', coater: 'عایق‌کار' }
export interface PField { key: string; label: string; kind?: 'text' | 'date' | 'select' | 'num' | 'multi'; options?: { value: string; label: string }[]; def?: string; hint?: string; wide?: boolean }
const sel = (...o: string[]) => [{ value: '', label: '—' }, ...o.map((v) => ({ value: v, label: v }))]
const yn = [{ value: '', label: '—' }, { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]

/** the test form, in the order of the paper form; the groups keep the screen short — the optional ones are folded */
export const WQT_FIELDS: PField[] = [
  { key: 'wqtNo', label: 'شمارهٔ آزمون (W.Q.T NO)' }, { key: 'repNo', label: 'REP NO' }, { key: 'date', label: 'تاریخ فرم', kind: 'date' }, { key: 'testDate', label: 'تاریخ آزمون', kind: 'date' },
  { key: 'refStd', label: 'استاندارد مرجع', def: 'API 1104' }, { key: 'process', label: 'فرایند جوشکاری', def: 'SMAW' }, { key: 'type', label: 'نوع (Type)', def: 'BW' },
  { key: 'baseMat', label: 'متریال پایه', def: 'API 5L-X60' }, { key: 'thk', label: 'ضخامت آزمون (in)' }, { key: 'coupon', label: 'قطر لولهٔ آزمون', def: '30"' }, { key: 'position', label: 'وضعیت جوش (Position)', def: '5G' },
  { key: 'progression', label: 'جهت جوشکاری', kind: 'select', options: sel('Down Hill', 'Up Hill') }, { key: 'filler', label: 'الکترود / فیلر (Filler Class)', wide: true },
  { key: 'thkMin', label: 'ضخامت مجاز از (in)', kind: 'num' }, { key: 'thkMax', label: 'ضخامت مجاز تا (in)', kind: 'num' }, { key: 'range', label: 'محدودهٔ صلاحیت (متن چاپی کارت)', wide: true, hint: 'مثلاً 0.154≤ST<0.750 & T≥0.750' },
  { key: 'visual', label: 'بازرسی چشمی', kind: 'select', options: [{ value: '', label: '—' }, { value: 'yes', label: 'پذیرفته' }, { value: 'no', label: 'مردود' }] },
  { key: 'rtNo', label: 'شمارهٔ گزارش RT' }, { key: 'rtDate', label: 'تاریخ RT', kind: 'date' }, { key: 'rtResult', label: 'نتیجهٔ RT', kind: 'select', options: sel('ACC', 'REJ') },
  { key: 'qualified', label: 'نتیجه: صلاحیت (QUALIFIED)', kind: 'select', options: sel('YES', 'NO') }, { key: 'notes', label: 'آزمون مکانیکی / توضیحات', wide: true },
  { key: 'deposit', label: 'ضخامت رسوب جوش (Weld Deposit)' }, { key: 'backing', label: 'Backing', kind: 'select', options: yn }, { key: 'others', label: 'سایر (Others)', wide: true },
]
export const WQT_GROUPS: { title: string; keys: string[]; folded?: boolean }[] = [
  { title: 'مشخصات آزمون', keys: ['wqtNo', 'testDate', 'date', 'repNo', 'refStd', 'process', 'type'] },
  { title: 'جوش آزمون', keys: ['baseMat', 'thk', 'coupon', 'position', 'progression', 'filler'] },
  { title: 'نتیجه و محدودهٔ صلاحیت', keys: ['visual', 'rtNo', 'rtDate', 'rtResult', 'thkMin', 'thkMax', 'range', 'qualified', 'notes'] },
  { title: 'موارد تکمیلی (اختیاری)', keys: ['deposit', 'backing', 'others'], folded: true },
]
export const wqtDefaults = (): Record<string, string> => Object.fromEntries(WQT_FIELDS.filter((f) => f.def).map((f) => [f.key, f.def as string]))
/** what must be filled before the two signatures can be given */
export function testProblems(d: Record<string, string>, kind: PersonKind = 'welder'): string[] {
  const out = [['wqtNo', 'شمارهٔ آزمون'], ['testDate', 'تاریخ آزمون'], ['qualified', 'نتیجهٔ صلاحیت']].filter(([k]) => !(d[k] ?? '').trim()).map(([, l]) => `«${l}» خالی است`)
  if (kind === 'coater' && d.qualified === 'YES' && !(d.scope ?? '').trim()) out.push('نوع عایق‌کاری مجاز را انتخاب کنید')
  return out
}


const okRej = [{ value: '', label: '—' }, { value: 'ok', label: 'تأیید' }, { value: 'rej', label: 'مردود' }]
const hasNot = [{ value: '', label: '—' }, { value: 'no', label: 'ندارد' }, { value: 'yes', label: 'دارد' }]
/** kinds of coating work a qualified applicator may be allowed to do */
export const COATER_SCOPE: { value: string; label: string; short: string }[] = [
  { value: 'FJC-HS', label: 'پوشش سرجوش با آستین حرارتی (Heat-shrink sleeve)', short: 'Field joint — heat-shrink sleeve' },
  { value: 'FJC-LQ', label: 'پوشش سرجوش مایع (Liquid epoxy / coating)', short: 'Field joint — liquid coating' },
  { value: 'PATCH', label: 'ترمیم موضعی با پچ (Closure patch)', short: 'Closure patch' },
  { value: 'REPAIR', label: 'تعمیر عیوب پوشش لوله (Holiday / defect repair)', short: 'Coating defect repair' },
]
/** the coating applicator's test = the field-joint coating test sheet (bond / peel test + holiday test) applied to a test joint */
export const COATER_TEST_FIELDS: PField[] = [
  { key: 'wqtNo', label: 'شمارهٔ آزمون' }, { key: 'testDate', label: 'تاریخ آزمون', kind: 'date' }, { key: 'time', label: 'ساعت' }, { key: 'reportNo', label: 'Report No' }, { key: 'formNo', label: 'Form No' }, { key: 'jointNo', label: 'شمارهٔ سرجوش / قطعهٔ آزمون' },
  { key: 'sys', label: 'سیستم پوشش / نوع آستین', def: 'Heat-shrink sleeve' }, { key: 'size', label: 'اندازهٔ لوله', def: '30"' }, { key: 'spec', label: 'مشخصات پوشش (Spec)', wide: true },
  { key: 'adhPipe', label: 'چسبندگی به سطح لوله (kg/2cm²)', kind: 'num' }, { key: 'adhPipeOk', label: 'نتیجه', kind: 'select', options: okRej }, { key: 'adhMain', label: 'چسبندگی به پوشش اصلی (kg/2cm²)', kind: 'num' }, { key: 'adhMainOk', label: 'نتیجه', kind: 'select', options: okRej },
  { key: 'adhStrength', label: 'میزان چسبندگی (kg/cm)', kind: 'num' }, { key: 'sepType', label: 'نوع جدایش', kind: 'select', options: [{ value: '', label: '—' }, { value: 'pe-adhesive', label: 'جدایش لایهٔ پلی‌اتیلن از چسب' }, { value: 'adhesive-epoxy', label: 'جدایش پلی‌اتیلن و چسب از اپوکسی' }, { value: 'full', label: 'جدایش کامل پوشش از سطح لوله' }], wide: true },
  { key: 'pinholes', label: 'منفذ', kind: 'select', options: hasNot }, { key: 'squeeze', label: 'خروج چسب از لبه‌های نوار', kind: 'select', options: [{ value: '', label: '—' }, { value: 'yes', label: 'مناسب' }, { value: 'no', label: 'نامناسب' }] },
  { key: 'burn', label: 'سوختگی', kind: 'select', options: hasNot }, { key: 'crack', label: 'ترک', kind: 'select', options: hasNot }, { key: 'wrinkle', label: 'چروک', kind: 'select', options: hasNot }, { key: 'air', label: 'هوا زیر پوشش', kind: 'select', options: hasNot },
  { key: 'patch', label: 'چسبندگی پچ سرجوش (Closure Patch)', kind: 'select', options: okRej }, { key: 'overlap', label: 'همپوشانی (Over Lap) روی پوشش اصلی', kind: 'select', options: okRej },
  { key: 'voltage', label: 'ولتاژ آزمایش منفذیابی', kind: 'num' }, { key: 'holeCount', label: 'تعداد منافذ', kind: 'num' }, { key: 'holeOk', label: 'نتیجهٔ منفذیابی', kind: 'select', options: okRej },
  { key: 'scope', label: 'نوع عایق‌کاری مجاز (صلاحیت)', kind: 'multi', wide: true }, { key: 'qualified', label: 'تأیید نهایی: صلاحیت (QUALIFIED)', kind: 'select', options: sel('YES', 'NO') }, { key: 'notes', label: 'توضیحات', wide: true },
  { key: 'equipment', label: 'تجهیزات تست و بازرسی (رطوبت‌سنج، دماسنج، زبری‌سنج، منفذیاب، ضخامت‌سنج، Peel)', kind: 'select', options: [{ value: '', label: '—' }, { value: 'ok', label: 'همه موجود و کالیبره' }, { value: 'partial', label: 'ناقص یا کالیبره نیست' }], wide: true },
]
export const COATER_TEST_GROUPS: { title: string; keys: string[]; folded?: boolean }[] = [
  { title: 'مشخصات آزمون', keys: ['wqtNo', 'testDate', 'time', 'reportNo', 'formNo', 'jointNo', 'sys', 'size', 'spec'] },
  { title: 'آزمون چسبندگی (Peel)', keys: ['adhPipe', 'adhPipeOk', 'adhMain', 'adhMainOk', 'adhStrength', 'sepType'] },
  { title: 'شرایط ظاهری و منفذیابی', keys: ['pinholes', 'squeeze', 'burn', 'crack', 'wrinkle', 'air', 'patch', 'overlap', 'voltage', 'holeCount', 'holeOk'] },
  { title: 'نتیجه و دامنهٔ صلاحیت', keys: ['scope', 'qualified', 'notes'] },
  { title: 'تجهیزات تست (اختیاری)', keys: ['equipment'], folded: true },
]
export interface TestConfig { fields: PField[]; groups: { title: string; keys: string[]; folded?: boolean }[]; defaults: Record<string, string> }
export const testConfig = (kind: PersonKind): TestConfig => {
  const fields = kind === 'welder' ? WQT_FIELDS : COATER_TEST_FIELDS
  return { fields, groups: kind === 'welder' ? WQT_GROUPS : COATER_TEST_GROUPS, defaults: Object.fromEntries(fields.filter((f) => f.def).map((f) => [f.key, f.def as string])) }
}
export const scopeLabels = (v: string | undefined) => (v ?? '').split(',').filter(Boolean).map((x) => COATER_SCOPE.find((s) => s.value === x)?.short ?? x)

/** card data a person needs beyond the test (welder) — only what the test does not know */
export const WELDER_CARD_EXTRA: PField[] = [{ key: 'wps', label: 'شمارهٔ WPS' }, { key: 'polarity', label: 'نوع / قطبیت (Type Manual)', def: 'DCEP' }]
/** a coating applicator's card takes everything from the test; only the validity is asked */
export const COATER_CARD_FIELDS: PField[] = []

export interface CardData { title: string; name: string; nationalId: string; stamp: string; rows: [string, string][]; validity: string; /** the stored value: «END» or an ISO date */ validityRaw: string; /** kinds of work the person is qualified for (coating applicators) */ scope?: string[]; table?: [string, string][]; dirs?: { fill: 'up' | 'down' | ''; root: 'up' | 'down' | '' } }
interface PersonLike { kind: PersonKind; fullName: string; nationalId: string; raw: string; card: Record<string, string> }
/** «End of project» or a date; empty when not set */
export const validityText = (v: string | undefined, jd: (iso: string) => string = (x) => x) => (!v ? '' : v === 'END' ? 'End of project' : jd(v))
/** the card as it is printed, from the person, his qualifying test and the few card-only answers */
export function cardData(p: PersonLike, test: Record<string, string> | undefined, jd: (iso: string) => string = (x) => x): CardData {
  const c = p.card, t = test ?? {}, base: Pick<CardData, 'name' | 'nationalId' | 'stamp' | 'validity' | 'validityRaw'> = { name: p.fullName, nationalId: p.nationalId, stamp: p.raw, validity: validityText(c.validity, jd), validityRaw: c.validity ?? '' }
  if (p.kind === 'coater') {
    const rows = ([['Coating System', t.sys], ['Pipe Size', t.size], ['Coating Spec', t.spec], ['Test No', t.wqtNo], ['Test Date', t.testDate ? jd(t.testDate) : '']] as [string, string][]).filter((r) => r[1])
    const peel = [t.adhPipe && `Peel (pipe) ${t.adhPipe}`, t.adhMain && `Peel (coating) ${t.adhMain}`, t.voltage && `Holiday ${t.voltage}`].filter(Boolean) as string[]
    return { ...base, title: 'COATING APPLICATOR QUALIFICATION CARD', rows, scope: scopeLabels(t.scope), table: peel.length ? ([['Test results', peel.join('  ·  ')]] as [string, string][]) : undefined }
  }
  const dir = t.progression === 'Up Hill' ? 'up' : t.progression === 'Down Hill' ? 'down' : ''
  const rows = ([['Welding Process', t.process], ['Type Manual', c.polarity], ['Welding Position', t.position], ['Reference Standard', t.refStd], ['Mat Specification', t.baseMat], ['Material', 'Pipe'], ['Electrode', t.filler], ['Thickness', t.range], ['Test Date', t.testDate ? jd(t.testDate) : '']] as [string, string][]).filter((r) => r[1])
  const table = ([['WQT NO', t.wqtNo], ['WPS NO', c.wps], ['Base Material', t.baseMat], ['Pos', t.position], ['Size (inch)', t.coupon], ['Electrode', t.filler], ['Thk (inch)', t.range]] as [string, string][]).filter((r) => r[1])
  return { ...base, title: 'WELDER QUALIFICATION CARD', rows, table, dirs: { fill: dir, root: dir } }
}
