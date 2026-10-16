/**
 * Data behind the personnel forms: the welder qualification TEST (WQT sheet) and the qualification CARD of a welder, and the same card for a field-joint coating applicator.
 * The sheets are the approved Excel layouts (forms/templates); this file only says which cell each field lands in. Nothing here changes a sheet's text or geometry.
 */
export type PersonKind = 'welder' | 'coater'
export const KIND_FA: Record<PersonKind, string> = { welder: 'جوشکار', coater: 'عایق‌کار' }
export interface PField { key: string; label: string; kind?: 'text' | 'date' | 'select'; options?: { value: string; label: string }[]; def?: string; hint?: string }

const DIR = [{ value: '', label: '—' }, { value: 'up', label: 'Up Hill' }, { value: 'down', label: 'Down Hill' }]
const COAT_A = [{ value: '', label: '—' }, { value: 'up', label: 'Induction' }, { value: 'down', label: 'Torch' }]
const COAT_B = [{ value: '', label: '—' }, { value: 'up', label: 'Yes' }, { value: 'down', label: 'No' }]

/** fields of the qualification card, in the order of the sheet (labels follow the sheet's English labels) */
export function cardFields(kind: PersonKind): PField[] {
  const w = kind === 'welder'
  return [
    { key: 'name', label: w ? 'Welder Name' : 'Applicator Name' }, { key: 'id', label: w ? 'Welder ID' : 'Applicator ID' }, { key: 'stamp', label: w ? 'Stamp' : 'Stamp / Badge' },
    { key: 'sys', label: w ? 'Welding Process' : 'Coating System', def: w ? 'SMAW' : 'Heat-shrink sleeve' }, { key: 'method', label: w ? 'Type Manual' : 'Application', def: w ? 'DCEP' : 'Manual' },
    { key: 'pos', label: w ? 'Welding Position' : 'Pipe Size', def: w ? '5G' : '30"' },
    { key: 'spec', label: w ? 'Mat Specification' : 'Coating Spec', def: w ? 'API-5L-X60' : '' }, { key: 'mat', label: w ? 'Material' : 'Pipe Coating', def: w ? 'Pipe' : 'PE 3-layer' },
    { key: 'thk', label: w ? 'Thickness (inch)' : 'Sleeve Thk (mm)' }, { key: 'prep', label: w ? 'Electrode' : 'Surface Prep' },
    { key: 'validity', label: 'Card Validity', kind: 'date' }, { key: 'testDate', label: 'Test Date', kind: 'date' },
    { key: 'dirA', label: w ? 'Filling Cap' : 'Preheat', kind: 'select', options: w ? DIR : COAT_A, def: w ? 'down' : '' }, { key: 'dirB', label: w ? 'Root & Hot' : 'Primer', kind: 'select', options: w ? DIR : COAT_B },
    { key: 'size', label: 'Size (inch)', def: '30"' }, { key: 'base', label: w ? 'Base Material' : 'Pipe Coating', def: w ? 'API-5L-X60' : '' },
    { key: 'proc', label: w ? 'WPS NO' : 'Procedure NO' }, { key: 'cert', label: w ? 'WQT NO' : 'Cert NO' },
  ]
}
/** where each card field is written (A1 addresses of the sheet) */
const CARD_CELL: Record<string, string> = { name: 'D3', id: 'D4', stamp: 'D5', sys: 'D6', method: 'D7', pos: 'D8', spec: 'A9', mat: 'I9', thk: 'A10', prep: 'I10', validity: 'A11', testDate: 'I11', size: 'F17', base: 'I17', proc: 'L17', cert: 'M17' }
export interface Sign { name: string; date: string }
/** cell → text for the card sheet; unset fields fall back to the sheet's own defaults (nothing is invented) */
export function cardValues(_kind: PersonKind, data: Record<string, string>, sig: { consultant?: Sign; contractor?: Sign } = {}, jd: (iso: string) => string = (x) => x): Record<string, string> {
  const out: Record<string, string> = {}, v = (k: string) => (data[k] ?? '').trim()
  for (const [k, cell] of Object.entries(CARD_CELL)) { const x = v(k); if (x) out[cell] = (k === 'validity' || k === 'testDate') ? jd(x) : x }
  // the table repeats thickness, electrode / system and position of the upper part
  if (v('thk')) out.A17 = v('thk'); if (v('prep')) out.C17 = v('prep'); if (v('pos')) out.H17 = v('pos')
  // direction ticks: left group = filling & cap (welder) / preheat (coater); right group = root & hot / primer
  if (v('dirA')) { out.A12 = v('dirA') === 'up' ? '✓' : ''; out.A13 = v('dirA') === 'down' ? '✓' : '' }
  if (v('dirB')) { out.H12 = v('dirB') === 'up' ? '✓' : ''; out.H13 = v('dirB') === 'down' ? '✓' : '' }
  const sg = (s?: Sign) => `Name: ${s?.name ?? ''}\nSign:\nDate: ${s?.date ? jd(s.date) : ''}`
  if (sig.consultant) out.A21 = sg(sig.consultant)
  if (sig.contractor) out.H21 = sg(sig.contractor)
  return out
}

/** WQT sheet: every field is appended after the label printed in its cell */
export const WQT_FIELDS: (PField & { cell: string; prefix: string })[] = [
  { key: 'repNo', label: 'REP NO', cell: 'A4', prefix: 'REP NO:' }, { key: 'date', label: 'DATE', cell: 'F4', prefix: 'DATE:', kind: 'date' },
  { key: 'wqtNo', label: 'W.Q.T NO', cell: 'A5', prefix: 'W.Q.T NO:' }, { key: 'welderName', label: 'Welder Name', cell: 'A6', prefix: '   Welder Name:' },
  { key: 'refStd', label: 'Reference Standard', cell: 'A7', prefix: 'Reference Standard:', def: 'API 1104' }, { key: 'testDate', label: 'Date Of Test', cell: 'E7', prefix: 'Date Of Test:', kind: 'date' },
  { key: 'process', label: 'Welding Process(es) Used', cell: 'A8', prefix: 'Welding Process(es) Used:', def: 'SMAW' }, { key: 'type', label: 'Type', cell: 'E8', prefix: 'Type:', def: 'BW' },
  { key: 'baseMat', label: 'Base Material(s) Welded', cell: 'A9', prefix: 'Base Material(s) Welded:', def: 'API 5L-X60' }, { key: 'thk', label: 'Thickness', cell: 'D9', prefix: 'Thickness:' },
  { key: 'coupon', label: 'Test Coupon Diameter', cell: 'A10', prefix: 'Test Coupon Diameter (if pipe):', def: '30"' }, { key: 'position', label: 'Position(s)', cell: 'D10', prefix: 'Position(s):' },
  { key: 'welderId', label: 'Welder ID No.', cell: 'F10', prefix: 'Welder ID No.:' }, { key: 'deposit', label: 'Weld Deposit thickness', cell: 'A11', prefix: 'Weld Deposit thickness (per weld process):' },
  { key: 'range', label: 'Qualification Range', cell: 'D11', prefix: 'Qualification Range:' }, { key: 'progression', label: 'Welding progression (up/down)', cell: 'A12', prefix: 'Welding progression (up/down):' },
  { key: 'qualified', label: 'QUALIFIED', cell: 'A13', prefix: 'QUALIFIED:', kind: 'select', options: [{ value: '', label: '—' }, { value: 'YES', label: 'YES' }, { value: 'NO', label: 'NO' }] },
  { key: 'filler', label: 'Filler Material Specification Class', cell: 'A14', prefix: 'Filler Material Specification Class:' },
  { key: 'backing', label: 'Backing', cell: 'F14', prefix: 'Backing(Yes Or No):', kind: 'select', options: [{ value: '', label: '—' }, { value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }] },
  { key: 'others', label: 'Others', cell: 'A15', prefix: 'Others:' },
  { key: 'visual', label: 'Visual Inspection', cell: 'A16', prefix: 'Visual Inspection: Acceptable', kind: 'select', options: [{ value: '', label: '—' }, { value: 'yes', label: 'yes' }, { value: 'no', label: 'no' }] },
  { key: 'rtNo', label: 'RT Report No.', cell: 'A17', prefix: '' }, { key: 'rtDate', label: 'RT Date', cell: 'A17', prefix: '', kind: 'date' }, { key: 'rtResult', label: 'RT Result', cell: 'A17', prefix: '', kind: 'select', options: [{ value: '', label: '—' }, { value: 'ACC', label: 'ACC' }, { value: 'REJ', label: 'REJ' }] },
  { key: 'mech', label: 'Mechanical test (Type & Results)', cell: 'A18', prefix: 'Mechanical test (Type & Results)' },
]
export function wqtValues(data: Record<string, string>, jd: (iso: string) => string = (x) => x): Record<string, string> {
  const out: Record<string, string> = {}, v = (k: string) => (data[k] ?? '').trim()
  for (const f of WQT_FIELDS) {
    if (['visual', 'rtNo', 'rtDate', 'rtResult', 'mech'].includes(f.key)) continue
    const x = v(f.key); if (x) out[f.cell] = `${f.prefix} ${f.kind === 'date' ? jd(x) : x}`
  }
  if (v('mech')) out.A18 = `Mechanical test (Type & Results): ${v('mech')}`
  if (v('visual')) out.A16 = `Visual Inspection: Acceptable       ${v('visual') === 'yes' ? '☑ yes   ☐ no' : '☐ yes   ☑ no'}`
  if (v('rtNo') || v('rtDate') || v('rtResult')) out.A17 = `Radiographic test (if done) Report No.: ${v('rtNo') || '………….……'} Date: ${v('rtDate') ? jd(v('rtDate')) : '………….....……'} Results ${v('rtResult') || 'ACC'}`
  return out
}
/** a person can be put on the forms only with the identification the sheets print */
export function cardProblems(kind: PersonKind, data: Record<string, string>): string[] {
  const need = kind === 'welder' ? ['name', 'id', 'stamp', 'cert'] : ['name', 'id', 'cert']
  return cardFields(kind).filter((f) => need.includes(f.key) && !(data[f.key] ?? '').trim()).map((f) => `«${f.label}» خالی است`)
}
