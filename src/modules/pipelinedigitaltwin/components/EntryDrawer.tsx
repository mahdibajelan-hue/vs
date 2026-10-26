import { useMemo, useState, type CSSProperties } from 'react'
import { ArrowDownToLine, CheckCircle2, ClipboardPen, Flame, Layers, Loader2, PaintBucket, ScanLine, StepForward, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePdtStore } from '../store/usePdtStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { formatChainage } from '../lib/chainage'
import { bulkPreview, frontOf, jointNumberOf, jointRangeOfKm, STAGE_DEFAULT, STAGE_FA, STAGE_OPTIONS, STAGE_ORDER, type StageKey } from '../lib/twinCore'

const STAGE_ICON: Record<StageKey, LucideIcon> = { welding: Flame, ndt: ScanLine, coating: PaintBucket, lowering: ArrowDownToLine, backfill: Layers }
export const STAGE_COLOR: Record<StageKey, string> = { welding: '#38bdf8', ndt: '#2dd4bf', coating: '#eab308', lowering: '#a78bfa', backfill: '#22c55e' }
const TONE: Record<string, string> = { done: '#22c55e', bad: '#ef4444', neutral: '#94a3b8' }
const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const today = () => new Date().toISOString().slice(0, 10)

/**
 * «ثبت پیشرفت» — how site reports actually arrive: one activity over a stretch of line («پوشش از کیلومتر ۱۲+۴۰۰ تا ۱۳+۱۰۰»).
 * Pick the activity and its result, the stretch (by km or by joint number), the date — the preview shows how many joints
 * change and which ones are out of sequence before anything is saved. After saving, the next stretch starts where this
 * one ended.
 */
export function EntryDrawer({ onClose, presetJoint }: { onClose: () => void; presetJoint: number | null }) {
  const st = usePdtStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const n = st.joints.length, L = st.settings.stockLengthM, k0 = st.startKm
  const kmOfJoint = (no: number) => k0 + (no * L) / 1000
  const [stage, setStage] = useState<StageKey>('welding')
  const [value, setValue] = useState('welded')
  const [mode, setMode] = useState<'km' | 'joint'>('km')
  const [from, setFrom] = useState(presetJoint ? String(mode === 'km' ? kmOfJoint(presetJoint).toFixed(3) : presetJoint) : '')
  const [to, setTo] = useState(presetJoint ? String(kmOfJoint(presetJoint).toFixed(3)) : '')
  const [date, setDate] = useState(today())
  const [welders, setWelders] = useState('')
  const [note, setNote] = useState('')

  const range = useMemo<[number, number] | null>(() => {
    const a = Number(from), b = Number(to)
    if (from === '' || to === '' || !Number.isFinite(a) || !Number.isFinite(b)) return null
    if (mode === 'joint') { const x = Math.max(1, Math.min(a, b)), y = Math.min(n, Math.max(a, b)); return y >= x ? [Math.round(x), Math.round(y)] : null }
    return jointRangeOfKm(a, b, k0, L, n)
  }, [from, to, mode, k0, L, n])
  const preview = useMemo(() => (range ? bulkPreview(st.joints.slice(range[0] - 1, range[1]), stage, value) : null), [range, st.joints, stage, value])
  const tooLate = date > today()

  const pickStage = (s: StageKey) => { setStage(s); setValue(STAGE_OPTIONS[s][0].value) }
  /** the work front of this activity: the first joint on which it has not been done at all */
  const continueFront = () => {
    const i = frontOf(st.joints, stage)
    if (i < 0) return
    const a = i + 1, b = Math.min(n, a + Math.round(1000 / L) - 1)
    setFrom(mode === 'km' ? kmOfJoint(a).toFixed(3) : String(a)); setTo(mode === 'km' ? kmOfJoint(b).toFixed(3) : String(b))
  }
  const save = async () => {
    if (!range) return
    const ok = await st.bulkUpdate({ from: range[0], to: range[1], stage, value, atIso: new Date(`${date}T12:00:00`).toISOString(), note, welders: welders.split(/[,،\s]+/).map((w) => w.trim()).filter(Boolean) }, email)
    if (ok) {
      // the next stretch continues from here — the usual way consecutive site reports are entered
      const a = Math.min(n, range[1] + 1), b = Math.min(n, a + (range[1] - range[0]))
      setFrom(mode === 'km' ? kmOfJoint(a).toFixed(3) : String(a)); setTo(mode === 'km' ? kmOfJoint(b).toFixed(3) : String(b)); setNote('')
    }
  }
  const switchMode = (m: 'km' | 'joint') => {
    if (m === mode) return
    if (range) { setFrom(m === 'km' ? kmOfJoint(range[0]).toFixed(3) : String(range[0])); setTo(m === 'km' ? kmOfJoint(range[1]).toFixed(3) : String(range[1])) }
    setMode(m)
  }

  return (
    <aside className="tw-drawer glass-panel" aria-label="ثبت پیشرفت">
      <header>
        <span className="tw-ph-ico"><ClipboardPen size={16} /></span>
        <div><h3>ثبت پیشرفت روی مسیر</h3><p>یک فعالیت، روی یک بازه از خط</p></div>
        <button type="button" className="tw-x" onClick={onClose} aria-label="بستن"><X size={16} /></button>
      </header>
      <div className="tw-body tw-form">
        <div className="tw-field"><span>۱. فعالیت</span>
          <div className="tw-seg is-stages" role="group" aria-label="فعالیت">
            {STAGE_ORDER.map((s) => { const I = STAGE_ICON[s]; return <button key={s} type="button" aria-pressed={stage === s} style={{ '--c': STAGE_COLOR[s] } as CSSProperties} onClick={() => pickStage(s)}><I size={14} aria-hidden />{STAGE_FA[s]}</button> })}
          </div>
        </div>
        <div className="tw-field"><span>۲. نتیجه</span>
          <div className="tw-seg" role="group" aria-label="نتیجه">
            {STAGE_OPTIONS[stage].map((o) => <button key={o.value} type="button" aria-pressed={value === o.value} style={{ '--c': TONE[o.tone] } as CSSProperties} onClick={() => setValue(o.value)}>{o.label}</button>)}
          </div>
          {value === STAGE_DEFAULT[stage] && <small>این گزینه ثبت قبلی را برمی‌گرداند (برای اصلاح اشتباه).</small>}
        </div>
        <div className="tw-field"><span>۳. بازه</span>
          <div className="tw-seg" role="group" aria-label="نوع بازه">
            <button type="button" aria-pressed={mode === 'km'} onClick={() => switchMode('km')}>با کیلومتر</button>
            <button type="button" aria-pressed={mode === 'joint'} onClick={() => switchMode('joint')}>با شمارهٔ سرجوش</button>
            <button type="button" className="tw-btn is-acc" onClick={continueFront} title="ابتدای جبههٔ کاری همین فعالیت (اولین سرجوشی که هنوز این نتیجه را ندارد)"><StepForward size={13} /> ادامهٔ جبهه</button>
          </div>
          <div className="tw-grid2">
            <label className="tw-field"><small>{mode === 'km' ? 'از کیلومتر' : 'از سرجوش شمارهٔ'}</small><input type="number" inputMode="decimal" step={mode === 'km' ? 0.001 : 1} value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" /></label>
            <label className="tw-field"><small>{mode === 'km' ? 'تا کیلومتر' : 'تا سرجوش شمارهٔ'}</small><input type="number" inputMode="decimal" step={mode === 'km' ? 0.001 : 1} value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" aria-invalid={from !== '' && to !== '' && !range} /></label>
          </div>
          {from !== '' && to !== '' && !range && <p className="tw-err">این بازه بیرون از مسیر است ({mode === 'km' ? `کیلومتر ${fa(k0, 3)} تا ${fa(k0 + (n * L) / 1000, 3)}` : `سرجوش ۱ تا ${fa(n)}`}).</p>}
        </div>
        <div className="tw-grid2">
          <label className="tw-field"><span>۴. تاریخ انجام</span><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} aria-invalid={tooLate} /></label>
          {stage === 'welding'
            ? <label className="tw-field"><span>جوشکاران (اختیاری)</span><input value={welders} onChange={(e) => setWelders(e.target.value)} placeholder="کد جوشکاران، با ویرگول" /></label>
            : <label className="tw-field"><span>توضیح (اختیاری)</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="شمارهٔ گزارش روزانه، …" /></label>}
        </div>
        {stage === 'welding' && <label className="tw-field"><span>توضیح (اختیاری)</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="شمارهٔ گزارش روزانه، …" /></label>}

        {range && preview && (
          <div className="tw-preview" aria-live="polite">
            <span><b>{fa(preview.total)}</b> سرجوش ({jointNumberOf(range[0])} تا {jointNumberOf(range[1])}) — <span dir="ltr">{formatChainage(range[0] * L + (k0 * 1000))}</span> تا <span dir="ltr">{formatChainage(range[1] * L + (k0 * 1000))}</span> · {fa(((range[1] - range[0] + 1) * L) / 1000, 2)} کیلومتر</span>
            <span>{preview.changed ? <>وضعیت <b>{fa(preview.changed)}</b> سرجوش به «{STAGE_OPTIONS[stage].find((o) => o.value === value)?.label}» تغییر می‌کند.</> : 'همهٔ سرجوش‌های این بازه از قبل همین وضعیت را دارند.'}</span>
            {preview.kept > 0 && <span>{fa(preview.kept)} سرجوش نتیجهٔ بهتری دارند (مثلاً «پذیرفته‌شده») و دست نمی‌خورند.</span>}
            {preview.outOfSequence > 0 && <span className="is-warn">⚠ {fa(preview.outOfSequence)} سرجوش {preview.outLabel}؛ اگر گزارش درست است ثبت کنید، وگرنه بازه را اصلاح کنید.</span>}
          </div>
        )}
      </div>
      <footer>
        <button type="button" className="tw-cta" disabled={!range || !preview?.changed || st.saving || tooLate} onClick={save}>{st.saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} ثبت {range && preview?.changed ? `${fa(preview.changed)} سرجوش` : ''}</button>
      </footer>
    </aside>
  )
}
