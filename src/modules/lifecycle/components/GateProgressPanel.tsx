import { useState } from 'react'
import { useLifecycleStore } from '../store/useLifecycleStore'
import {
  EPC_WEIGHTS, KIND_LABEL_FA, KIND_WEIGHT, epcProgress, kindProgress, latestManualPct,
  type GateItemKind, type GateItemLite,
} from '../lib/gateModel'
import type { ProgressSeries, ProjectGate } from '../types'
import { Bar, fa, faNum } from './ui'

const SERIES_LABEL: Record<ProgressSeries, string> = {
  overall: 'پیشرفت دستی', engineering: 'مهندسی (E)', procurement: 'تدارکات (P)', construction: 'ساخت (C)',
}

/** Shows how the gate's progress is built (50/30/20) and, for G4/G6, its engine inputs. */
export function GateProgressPanel({ gate, items, progress }: { gate: ProjectGate; items: GateItemLite[]; progress: number }) {
  const log = useLifecycleStore((s) => s.bundle.progressLog).filter((e) => e.gateId === gate.id)
  const logProgress = useLifecycleStore((s) => s.logProgress)
  const [val, setVal] = useState('')
  const [note, setNote] = useState('')
  const [series, setSeries] = useState<ProgressSeries>(gate.engine === 'epc' ? 'engineering' : 'overall')

  const latest = (s: ProgressSeries) => latestManualPct(log.filter((e) => e.series === s).map((e) => ({ pct: e.pct, at: e.recordedAt })))
  const kinds: GateItemKind[] = ['objective', 'output', 'criterion']
  const history = log.filter((e) => (gate.engine === 'epc' ? e.series !== 'overall' : e.series === 'overall'))

  async function save() {
    const n = Number(val)
    if (!Number.isFinite(n) || n < 0 || n > 100) return
    await logProgress(gate, series, n, note)
    setVal(''); setNote('')
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {kinds.map((k) => {
          const p = kindProgress(items, k)
          return (
            <div key={k}>
              <div className="flex justify-between text-[11px]">
                <span>{KIND_LABEL_FA[k]} <span className="text-muted">(وزن {faNum(KIND_WEIGHT[k])}٪)</span></span>
                <b>{p === null ? '—' : `${faNum(Math.round(p))}٪`}</b>
              </div>
              <Bar percent={p ?? 0} />
            </div>
          )
        })}
      </div>

      {gate.engine === 'epc' && (
        <p className="plc-stat-sub">
          موتور EPC: ترکیب وزنی مهندسی {faNum(EPC_WEIGHTS.engineering * 100)}٪ · تدارکات {faNum(EPC_WEIGHTS.procurement * 100)}٪ · ساخت {faNum(EPC_WEIGHTS.construction * 100)}٪ =
          <b> {faNum(epcProgress({ engineering: latest('engineering'), procurement: latest('procurement'), construction: latest('construction') }))}٪</b>
        </p>
      )}

      {(gate.engine === 'basic_design' || gate.engine === 'epc') && (
        <div className="rounded-lg border p-2.5" style={{ borderColor: 'var(--border-soft)' }}>
          <p className="mb-1.5 text-[11px] font-bold">ثبت درصد پیشرفت (تاریخچه تغییرناپذیر)</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {gate.engine === 'epc' && (
              <select value={series} onChange={(e) => setSeries(e.target.value as ProgressSeries)}
                className="rounded-md border bg-black/20 px-1.5 py-1 text-[11px]" style={{ borderColor: 'var(--border-soft)' }}>
                {(['engineering', 'procurement', 'construction'] as ProgressSeries[]).map((s) => <option key={s} value={s}>{SERIES_LABEL[s]}</option>)}
              </select>
            )}
            <input type="number" min={0} max={100} value={val} onChange={(e) => setVal(e.target.value)} placeholder="٪"
              className="w-16 rounded-md border bg-black/20 px-1.5 py-1 text-[11px]" style={{ borderColor: 'var(--border-soft)' }} />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="توضیح"
              className="min-w-0 flex-1 rounded-md border bg-black/20 px-1.5 py-1 text-[11px]" style={{ borderColor: 'var(--border-soft)' }} />
            <button onClick={save} className="rounded-md px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: '#3b82f6' }}>ثبت</button>
          </div>
          {history.length > 0 && (
            <ul className="mt-2 max-h-28 space-y-0.5 overflow-auto">
              {[...history].reverse().map((e) => (
                <li key={e.id} className="plc-stat-sub">
                  {fa(e.recordedAt)} · {SERIES_LABEL[e.series]}: <b>{faNum(e.pct)}٪</b>{e.note && ` — ${e.note}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="plc-stat-sub">پیشرفت واقعی گیت: <b>{faNum(progress)}٪</b></p>
    </div>
  )
}
