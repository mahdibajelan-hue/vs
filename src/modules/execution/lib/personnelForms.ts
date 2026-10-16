/**
 * Welders and coating applicators: the test form (WQT) a welder takes first, and the card issued after a qualified result.
 * Each fact is typed ONCE: the person's identity (name, national code = «Welder ID», stamp) lives on the person; the card takes everything else from the test and only asks for what the test does not know.
 */
export type PersonKind = 'welder' | 'coater'
export const KIND_FA: Record<PersonKind, string> = { welder: 'جوشکار', coater: 'عایق‌کار' }
export interface PField { key: string; label: string; kind?: 'text' | 'date' | 'select' | 'num'; options?: { value: string; label: string }[]; def?: string; hint?: string; wide?: boolean }
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
export function testProblems(d: Record<string, string>): string[] {
  return [['wqtNo', 'شمارهٔ آزمون'], ['testDate', 'تاریخ آزمون'], ['qualified', 'نتیجهٔ صلاحیت']].filter(([k]) => !(d[k] ?? '').trim()).map(([, l]) => `«${l}» خالی است`)
}

/** card data a person needs beyond the test (welder) — only what the test does not know */
export const WELDER_CARD_EXTRA: PField[] = [{ key: 'wps', label: 'شمارهٔ WPS' }, { key: 'polarity', label: 'نوع / قطبیت (Type Manual)', def: 'DCEP' }]
/** a coating applicator has no test: the card asks for the whole scope */
export const COATER_CARD_FIELDS: PField[] = [
  { key: 'sys', label: 'سیستم پوشش', def: 'Heat-shrink sleeve' }, { key: 'method', label: 'روش اجرا', def: 'Manual' }, { key: 'size', label: 'اندازهٔ لوله', def: '30"' },
  { key: 'spec', label: 'مشخصات پوشش (Coating Spec)', wide: true }, { key: 'mat', label: 'پوشش لوله', def: 'PE 3-layer' }, { key: 'thk', label: 'ضخامت آستین (mm)' }, { key: 'prep', label: 'آماده‌سازی سطح' },
  { key: 'preheat', label: 'پیش‌گرم', kind: 'select', options: sel('Induction', 'Torch') }, { key: 'primer', label: 'پرایمر', kind: 'select', options: sel('Yes', 'No') }, { key: 'testDate', label: 'تاریخ آزمون', kind: 'date' }, { key: 'cert', label: 'شمارهٔ گواهی' },
]

export interface CardData { title: string; name: string; nationalId: string; stamp: string; rows: [string, string][]; validity: string; /** the stored value: «END» or an ISO date */ validityRaw: string; table?: [string, string][]; dirs?: { fill: 'up' | 'down' | ''; root: 'up' | 'down' | '' } }
interface PersonLike { kind: PersonKind; fullName: string; nationalId: string; raw: string; card: Record<string, string> }
/** «End of project» or a date; empty when not set */
export const validityText = (v: string | undefined, jd: (iso: string) => string = (x) => x) => (!v ? '' : v === 'END' ? 'End of project' : jd(v))
/** the card as it is printed, from the person, his qualifying test and the few card-only answers */
export function cardData(p: PersonLike, test: Record<string, string> | undefined, jd: (iso: string) => string = (x) => x): CardData {
  const c = p.card, t = test ?? {}, base: Pick<CardData, 'name' | 'nationalId' | 'stamp' | 'validity' | 'validityRaw'> = { name: p.fullName, nationalId: p.nationalId, stamp: p.raw, validity: validityText(c.validity, jd), validityRaw: c.validity ?? '' }
  if (p.kind === 'coater') {
    return { ...base, title: 'COATING APPLICATOR QUALIFICATION CARD', rows: ([['Coating System', c.sys], ['Application', c.method], ['Pipe Size', c.size], ['Coating Spec', c.spec], ['Pipe Coating', c.mat], ['Sleeve Thk (mm)', c.thk], ['Surface Prep', c.prep], ['Preheat', c.preheat], ['Primer', c.primer], ['Test Date', c.testDate ? jd(c.testDate) : ''], ['Cert NO', c.cert]] as [string, string][]).filter((r) => r[1]) }
  }
  const dir = t.progression === 'Up Hill' ? 'up' : t.progression === 'Down Hill' ? 'down' : ''
  const rows = ([['Welding Process', t.process], ['Type Manual', c.polarity], ['Welding Position', t.position], ['Reference Standard', t.refStd], ['Mat Specification', t.baseMat], ['Material', 'Pipe'], ['Electrode', t.filler], ['Thickness', t.range], ['Test Date', t.testDate ? jd(t.testDate) : '']] as [string, string][]).filter((r) => r[1])
  const table = ([['WQT NO', t.wqtNo], ['WPS NO', c.wps], ['Base Material', t.baseMat], ['Pos', t.position], ['Size (inch)', t.coupon], ['Electrode', t.filler], ['Thk (inch)', t.range]] as [string, string][]).filter((r) => r[1])
  return { ...base, title: 'WELDER QUALIFICATION CARD', rows, table, dirs: { fill: dir, root: dir } }
}
