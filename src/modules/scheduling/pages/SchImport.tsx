import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Info, Upload, XCircle } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { jalaliText } from '../../execution/lib/periods'
import { useExecutionStore } from '../../execution/store/useExecutionStore'
import { Chip, KpiCard, Section } from '../../finance/components/fn'
import { Empty, fa } from '../../execution/components/common'
import { EXCEL_FIELDS, findHeaderRow, parseExcelGrid, suggestMapping, templateGrid, type FieldKey, type Grid } from '../lib/excel'
import { detectP6Format, parseP6Xml, parseXer } from '../lib/p6'
import { countIssues, validateParsed } from '../lib/validate'
import { KIND_LABEL_FA, type ImportIssue, type ParsedSchedule, type VersionKind, type VersionSource } from '../lib/types'
import { fileHash, useSchedulingStore, type ImportOutcome } from '../store/useSchedulingStore'
import type { ScheduleModel } from '../store/useScheduleModel'
import { Hint } from '../components/Hint'
import type { SchTab } from '../SchedulingApp'

interface Sheet { name: string; grid: Grid }
const LEVEL_ICON = { error: <XCircle size={13} color="#ef4444" aria-label="خطا" />, warning: <AlertTriangle size={13} color="#d97706" aria-label="هشدار" />, info: <Info size={13} color="#0ea5e9" aria-label="اطلاع" /> }

async function readSheets(file: File): Promise<Sheet[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  return wb.SheetNames.map((name) => ({ name, grid: XLSX.utils.sheet_to_json<Grid[number]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false }).slice(0, 20000) }))
}
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const utf = new TextDecoder('utf-8').decode(buf)
  return utf.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf
}
async function downloadTemplate() {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet(templateGrid()); ws['!cols'] = EXCEL_FIELDS.map((f) => ({ wch: Math.max(12, f.label.length + 4) }))
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Schedule'); XLSX.writeFile(wb, 'farin-schedule-template.xlsx')
}

/** «ورود برنامه»: Excel (with column mapping) or Primavera P6 (XER / XML) → validated preview → a draft version. Nothing is stored until the version is registered. */
export function SchImport({ projectId, go }: { projectId: string; m?: ScheduleModel; go: (t: SchTab) => void }) {
  const st = useSchedulingStore()
  const ex = useExecutionStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<{ name: string; hash: string; format: 'excel' | 'p6_xml' | 'p6_xer'; text?: string } | null>(null)
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [sheetIdx, setSheetIdx] = useState(0)
  const [headerRow, setHeaderRow] = useState(-1)
  const [mapping, setMapping] = useState<Record<FieldKey, number>>(() => suggestMapping([]))
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<VersionKind>('update')
  const [dataDate, setDataDate] = useState('')
  const [parent, setParent] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [dup, setDup] = useState('')
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  const [show, setShow] = useState<'all' | 'error' | 'warning'>('all')
  const settings = ex.settings(projectId)
  const versions = st.versions.filter((v) => v.projectId === projectId)
  const can = st.canEdit

  const parsed: ParsedSchedule | null = useMemo(() => {
    if (!file) return null
    try {
      if (file.format === 'p6_xer') return parseXer(file.text ?? '')
      if (file.format === 'p6_xml') return parseP6Xml(file.text ?? '')
      const sh = sheets[sheetIdx]; if (!sh || headerRow < 0) return null
      return parseExcelGrid(sh.grid, headerRow, mapping, { defaultWorkDays: settings.workDays })
    } catch (e) { return { format: file.format, projectName: '', dataDate: null, activities: [], relations: [], calendars: [], issues: [{ level: 'error', message: `خواندن فایل ناموفق بود: ${(e as Error).message}` }], unsupported: [] } }
  }, [file, sheets, sheetIdx, headerRow, mapping, settings.workDays])
  const issues: ImportIssue[] = useMemo(() => (parsed ? [...parsed.issues, ...(parsed.activities.length ? validateParsed(parsed) : [])] : []), [parsed])
  const cnt = countIssues(issues)

  const pick = async (f: File) => {
    setMsg(''); setOutcome(null); setDup(''); setBusy(true)
    try {
      const buf = await f.arrayBuffer(), hash = await fileHash(buf)
      const lower = f.name.toLowerCase()
      const base = f.name.replace(/\.[^.]+$/, '')
      if (/\.(xlsx|xls|xlsm)$/.test(lower)) {
        const s = await readSheets(f); setSheets(s)
        const idx = s.findIndex((x) => findHeaderRow(x.grid) >= 0); const i = idx < 0 ? 0 : idx
        setSheetIdx(i); const hr = s[i] ? findHeaderRow(s[i].grid) : -1; setHeaderRow(hr)
        setMapping(suggestMapping(hr >= 0 ? s[i].grid[hr].map((c) => String(c ?? '')) : []))
        setFile({ name: f.name, hash, format: 'excel' })
        if (hr < 0) setMsg('ردیف عنوان ستون‌ها خودکار پیدا نشد؛ ردیف عنوان را دستی انتخاب کنید.')
      } else {
        const text = await readText(f); const fmt = detectP6Format(text) ?? (/\.xer$/.test(lower) ? 'xer' : /\.xml$/.test(lower) ? 'xml' : null)
        if (!fmt) { setMsg('نوع فایل شناخته نشد. فایل‌های Excel (xlsx)، P6 XER یا P6 XML پذیرفته می‌شوند.'); setFile(null); return }
        setFile({ name: f.name, hash, format: fmt === 'xer' ? 'p6_xer' : 'p6_xml', text }); setSheets([])
      }
      setLabel((l) => l || base)
    } catch (e) { setMsg(`فایل خوانده نشد: ${(e as Error).message}`) } finally { setBusy(false) }
  }
  const changeSheet = (i: number) => {
    setSheetIdx(i); const hr = findHeaderRow(sheets[i].grid); setHeaderRow(hr)
    setMapping(suggestMapping(hr >= 0 ? sheets[i].grid[hr].map((c) => String(c ?? '')) : []))
  }
  const changeHeader = (r: number) => { setHeaderRow(r); const sh = sheets[sheetIdx]; if (sh && r >= 0) setMapping(suggestMapping(sh.grid[r].map((c) => String(c ?? '')))) }
  const headers = sheets[sheetIdx] && headerRow >= 0 ? sheets[sheetIdx].grid[headerRow].map((c) => String(c ?? '').trim()) : []

  const commit = async (force = false) => {
    if (!file || !parsed) return
    setBusy(true); setMsg(''); setDup('')
    const source: VersionSource = file.format
    const mappingNames = Object.fromEntries(EXCEL_FIELDS.filter((f) => mapping[f.key] >= 0 && file.format === 'excel').map((f) => [f.key, headers[mapping[f.key]] ?? String(mapping[f.key])]))
    const out = await st.importVersion({ projectId, parsed, label: label.trim(), kind, source, fileName: file.name, fileHash: file.hash, dataDate: dataDate || null, mapping: mappingNames, parentVersionId: parent || null, defaultWorkDays: settings.workDays }, force)
    setBusy(false)
    if (out.duplicateOf) { setDup(out.duplicateOf); return }
    if (out.error) { setMsg(out.error); return }
    setOutcome(out)
  }

  if (!can) return <Empty>ورود و ویرایش برنامه برای نقش‌های دارای «ثبت نسخهٔ مبنا» (مثل برنامه‌ریز) یا مدیر اجرا ممکن است؛ شما فقط مشاهده می‌کنید.</Empty>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Section title={<span>ورود برنامهٔ زمان‌بندی <Hint id="import-source" /></span>} hint="Excel (xlsx)، Primavera P6 به‌صورت XER یا XML. فایل شما تغییر نمی‌کند و تا زدن «ثبت نسخه» چیزی ذخیره نمی‌شود.">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.xlsm,.xer,.xml" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = '' }} />
          <button className="im-btn im-btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={14} /> انتخاب فایل</button>
          <button className="im-btn im-btn-sm" onClick={() => void downloadTemplate()}><Download size={13} /> دریافت فایل نمونهٔ Excel</button>
          {file && <Chip tone="neutral"><FileSpreadsheet size={12} style={{ verticalAlign: -2 }} /> {file.name}</Chip>}
        </div>
        {msg && <p className="ex-bad" style={{ margin: '8px 0 0' }}>{msg}</p>}
      </Section>

      {file?.format === 'excel' && sheets.length > 0 && (
        <Section title={<span>نگاشت ستون‌ها <Hint id="import-mapping" /></span>} hint="ستون‌ها خودکار حدس زده شده‌اند؛ در صورت نیاز اصلاح کنید.">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            {sheets.length > 1 && <label className="ex-lab">برگه<select value={sheetIdx} onChange={(e) => changeSheet(Number(e.target.value))}>{sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}</select></label>}
            <label className="ex-lab">ردیف عنوان <Hint id="import-header" /><select value={headerRow} onChange={(e) => changeHeader(Number(e.target.value))}><option value={-1}>—</option>{(sheets[sheetIdx]?.grid ?? []).slice(0, 25).map((r, i) => <option key={i} value={i}>{fa(i + 1)}: {r.slice(0, 4).map((c) => String(c ?? '')).join(' | ').slice(0, 50)}</option>)}</select></label>
          </div>
          {headerRow >= 0 && (
            <div className="ex-sheet-grid">
              {EXCEL_FIELDS.map((f) => (
                <label key={f.key} title={f.hint}>{f.label}{f.required ? ' *' : ''}
                  <select value={mapping[f.key]} onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}><option value={-1}>— بدون نگاشت —</option>{headers.map((h, i) => <option key={i} value={i}>{h || `ستون ${fa(i + 1)}`}</option>)}</select>
                </label>
              ))}
            </div>
          )}
        </Section>
      )}

      {parsed && (
        <>
          <div className="fn-kpis">
            <KpiCard i={0} label="فعالیت" value={fa(parsed.activities.length)} sub={parsed.projectName || undefined} />
            <KpiCard i={1} label="رابطه" value={fa(parsed.relations.length)} tone={parsed.relations.length === 0 && parsed.activities.length > 1 ? 'warn' : 'good'} />
            <KpiCard i={2} label="خطا" value={fa(cnt.errors)} tone={cnt.errors ? 'bad' : 'good'} sub={cnt.errors ? 'مانع ثبت' : 'بدون مانع'} />
            <KpiCard i={3} label="هشدار" value={fa(cnt.warnings)} tone={cnt.warnings ? 'warn' : 'good'} />
          </div>
          <Section title={<span>خطاها و هشدارها <Hint id="import-issues" /></span>} flush>
            <div style={{ padding: '8px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['all', 'error', 'warning'] as const).map((k) => <button key={k} className={`im-btn im-btn-sm${show === k ? ' im-btn-primary' : ''}`} onClick={() => setShow(k)}>{k === 'all' ? 'همه' : k === 'error' ? 'خطا' : 'هشدار'}</button>)}
            </div>
            {issues.length === 0 ? <p className="im-helper" style={{ padding: '0 12px 12px', margin: 0 }}><CheckCircle2 size={13} color="#22c55e" style={{ verticalAlign: -2 }} /> مشکلی پیدا نشد.</p> : (
              <div className="fn-tbl-wrap" style={{ maxHeight: 260 }}><table className="ex-lines"><tbody>
                {issues.filter((i) => show === 'all' || i.level === show).slice(0, 150).map((i, k) => <tr key={k}><td style={{ width: 24 }}>{LEVEL_ICON[i.level]}</td><td className="num" style={{ width: 60 }}>{i.row ? `ردیف ${fa(i.row)}` : ''}</td><td style={{ whiteSpace: 'normal' }}>{i.message}</td></tr>)}
              </tbody></table></div>
            )}
            {parsed.unsupported.length > 0 && <p className="im-helper" style={{ padding: '8px 12px', margin: 0 }}>موارد وارد‌نشده از فایل: {parsed.unsupported.join('، ')}.</p>}
          </Section>
          {parsed.activities.length > 0 && (
            <Section title="پیش‌نمایش فعالیت‌ها" flush>
              <div className="fn-tbl-wrap" style={{ maxHeight: 260 }}><table className="ex-lines"><thead><tr><th>کد</th><th>نام</th><th className="num">مدت</th><th>شروع</th><th>پایان</th><th className="num">٪</th></tr></thead><tbody>
                {parsed.activities.slice(0, 12).map((a) => <tr key={a.code}><td className="fn-code">{a.code}</td><td style={{ whiteSpace: 'normal' }}>{a.name}</td><td className="num">{fa(a.origDuration, 1)}</td><td>{a.plannedStart ? jalaliText(a.plannedStart) : '—'}</td><td>{a.plannedFinish ? jalaliText(a.plannedFinish) : '—'}</td><td className="num">{a.pctComplete != null ? fa(a.pctComplete, 0) : '—'}</td></tr>)}
              </tbody></table></div>
            </Section>
          )}
          <Section title="ثبت نسخه">
            <div className="ex-sheet-grid">
              <label>برچسب نسخه *<input value={label} onChange={(e) => setLabel(e.target.value)} dir="auto" placeholder="مثلاً Rev0 یا مهر ۱۴۰۵" /></label>
              <label>نوع <Hint id="version-kind" /><select value={kind} onChange={(e) => setKind(e.target.value as VersionKind)}>{(Object.keys(KIND_LABEL_FA) as VersionKind[]).filter((k) => k !== 'baseline').map((k) => <option key={k} value={k}>{KIND_LABEL_FA[k]}</option>)}</select></label>
              <label>تاریخ وضعیت <Hint id="data-date" /><JalaliDateInput value={dataDate || parsed.dataDate || ''} onChange={setDataDate} /></label>
              <label>تطبیق با نسخهٔ قبلی <Hint id="import-parent" /><select value={parent} onChange={(e) => setParent(e.target.value)}><option value="">— نسخهٔ تازه، بدون تطبیق —</option>{versions.map((v) => <option key={v.id} value={v.id}>{v.label}{v.isBaseline ? ' (خط مبنا)' : v.isCurrent ? ' (جاری)' : ''}</option>)}</select></label>
            </div>
            {dup && <p className="ex-bad" style={{ margin: '8px 0 0' }}>این فایل قبلاً در نسخهٔ «{dup}» وارد شده است. <button className="im-btn im-btn-sm" onClick={() => void commit(true)}>ثبت به‌عنوان نسخهٔ جدید با وجود تکراری</button></p>}
            <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="im-btn im-btn-primary" disabled={busy || cnt.errors > 0 || !parsed.activities.length || !label.trim()} onClick={() => void commit()}>{busy ? 'در حال ثبت…' : 'ثبت نسخه (پیش‌نویس)'}</button>
              {cnt.errors > 0 && <span className="im-helper" style={{ margin: 0 }}>ابتدا خطاها را در فایل اصلاح و دوباره بارگذاری کنید.</span>}
            </div>
          </Section>
        </>
      )}

      {outcome?.versionId && outcome.counts && (
        <div className="im-card" style={{ padding: 14, borderInlineStart: '3px solid #22c55e', display: 'grid', gap: 6 }}>
          <b><CheckCircle2 size={14} color="#22c55e" style={{ verticalAlign: -2 }} /> نسخه ثبت شد.</b>
          <span>{fa(outcome.counts.activities)} فعالیت و {fa(outcome.counts.relations)} رابطه ثبت شد{parent ? `؛ ${fa(outcome.counts.matched)} فعالیت با نسخهٔ قبلی تطبیق خورد و ${fa(outcome.counts.created)} فعالیت جدید است.` : '.'}</span>
          <div style={{ display: 'flex', gap: 8 }}><button className="im-btn im-btn-primary im-btn-sm" onClick={() => go('versions')}>رفتن به نسخه‌ها (تأیید / خط مبنا)</button><button className="im-btn im-btn-sm" onClick={() => go('gantt')}>مشاهدهٔ گانت</button></div>
        </div>
      )}
    </div>
  )
}
