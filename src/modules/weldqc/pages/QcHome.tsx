import { useEffect, useMemo, type CSSProperties } from 'react'
import { ArrowLeft, ClipboardList, FileWarning, Flame, Gauge, PaintRoller, ScanSearch, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import { useQc, fa } from '../lib/useQc'
import { useTestingStore } from '../../testing/store/useTestingStore'
import { coveredKm } from '../../testing/lib/htCore'
import { useEpcStore } from '../../execution/store/useEpcStore'
import { useExecutionStore } from '../../execution/store/useExecutionStore'
import { isQcForm } from '../../execution/lib/formCatalog'
import type { QcTab } from '../WeldQcApp'

const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0)
interface Tile { tab: QcTab; icon: LucideIcon; color: string; title: string; big: string; unit: string; lines: [string, string][]; warn?: string }

/** میز کیفیت — one view of every quality stream of the project; each tile opens its own area. */
export function QcHome({ projectId, onGo }: { projectId: string; onGo: (t: QcTab) => void }) {
  const wq = useWqStore()
  const qc = useQc()
  const ht = useTestingStore()
  const epc = useEpcStore()
  const ex = useExecutionStore()
  useEffect(() => { if (!epc.loaded) void epc.fetchAll() }, [epc.loaded, epc])

  const tiles = useMemo<Tile[]>(() => {
    const rows = qc.rows
    const shot = rows.filter((r) => r.state !== 'no_film')
    const acc = rows.filter((r) => r.state === 'accepted').length, cut = rows.filter((r) => r.state === 'cut_out').length
    const due = rows.filter((r) => r.state === 'repair_due' || r.state === 'reshoot').length
    const firstOk = shot.filter((r) => r.round === 0 && r.state === 'accepted').length
    const scored = rows.filter((r) => r.health.score != null)
    const health = scored.length ? scored.reduce((s, r) => s + (r.health.score ?? 0), 0) / scored.length : 0
    const coat = wq.coatings.filter((c) => !c.removed)
    const insp = coat.filter((c) => c.kind === 'inspection'), insFail = insp.filter((c) => c.result === 'fail' || c.result === 'repair').length
    const coatedW = new Set(coat.filter((c) => c.kind === 'application').map((c) => c.weldId)), inspW = new Set(insp.map((c) => c.weldId))
    const coatedKm = coveredKm(ht.coated), holKm = coveredKm(ht.records.filter((r) => r.kind === 'holiday' && r.result === 'pass').map((r) => [r.kmFrom, r.kmTo]))
    const openDef = ht.defects.filter((d) => d.status === 'open').length
    const pre = ht.packs.filter((p) => p.category === 'pretest'), preAcc = pre.filter((p) => p.stage === 'accepted').length, preFail = pre.filter((p) => p.failed).length
    const ncr = epc.ncrs.filter((n) => n.projectId === projectId && n.status !== 'void'), ncrOpen = ncr.filter((n) => n.status !== 'closed')
    const today = new Date().toISOString().slice(0, 10)
    const late = ncrOpen.filter((n) => n.dueDate && n.dueDate < today).length
    const findOpen = epc.findings.filter((f) => f.projectId === projectId && f.status === 'open').length
    const forms = ex.reports.filter((r) => r.projectId === projectId && isQcForm(r.formKey) && r.status !== 'rejected')
    const waiting = forms.filter((r) => r.status === 'submitted' || r.status === 'partially_approved').length
    const returned = forms.filter((r) => r.status === 'returned' || r.status === 'incomplete').length
    return [
      { tab: 'dash', icon: Flame, color: '#f43f5e', title: 'جوش و رادیوگرافی', big: shot.length ? `${fa(pct(firstOk, shot.length), 1)}٪` : '—', unit: 'قبولی در اولین رادیوگرافی',
        lines: [['سرجوش', fa(rows.length)], ['پذیرفته', fa(acc)], ['منتظر تعمیر / عکس مجدد', fa(due)], ['برش', fa(cut)], ['میانگین شاخص سلامت', scored.length ? fa(health, 0) : '—']], warn: due ? `${fa(due)} سرجوش منتظر تعمیر است` : undefined },
      { tab: 'coating', icon: PaintRoller, color: '#a855f7', title: 'پوشش سرجوش', big: fa(coatedW.size), unit: 'سرجوش پوشش‌شده',
        lines: [['بازرسی‌شده', fa(inspW.size)], ['آزمون تصادفی', fa(insp.filter((c) => c.random).length)], ['نیازمند تعمیر / مردود', fa(insFail)], ['پوشش‌کاران', fa(new Set(coat.map((c) => c.applicatorKey).filter(Boolean)).size)]], warn: coatedW.size > inspW.size ? `${fa(coatedW.size - inspW.size)} سرجوش پوشش‌شده بازرسی نشده است` : undefined },
      { tab: 'linecoat', icon: ShieldCheck, color: '#0ea5e9', title: 'تست پوشش خط', big: `${fa(holKm, 1)} km`, unit: 'هالیدی قبول',
        lines: [['پوشش‌شده (دوقلوی دیجیتال)', `${fa(coatedKm, 1)} km`], ['آزمون الکتریکی I/S', fa(ht.ctTests.length)], ['عیوب پوشش باز', fa(openDef)]], warn: coatedKm - holKm > 0.5 ? `${fa(coatedKm - holKm, 1)} km پوشش‌شده هنوز هالیدی نشده است` : undefined },
      { tab: 'pretest', icon: Gauge, color: '#14b8a6', title: 'پیش‌تست قطعات عبوری', big: `${fa(preAcc)} از ${fa(pre.length)}`, unit: 'قطعهٔ پذیرفته',
        lines: [['در جریان', fa(pre.length - preAcc - preFail)], ['مردود', fa(preFail)], ['طول لولهٔ آزمون‌شده', `${fa(pre.filter((p) => p.stage === 'accepted').reduce((s, p) => s + (p.lengthM ?? 0), 0))} m`]], warn: preFail ? `${fa(preFail)} قطعه مردود شده است` : undefined },
      { tab: 'ncr', icon: FileWarning, color: '#ef4444', title: 'NCR و عدم انطباق', big: fa(ncrOpen.length), unit: 'NCR باز',
        lines: [['کل NCR', fa(ncr.length)], ['مهلت‌گذشته', fa(late)], ['مغایرت باز', fa(findOpen)]], warn: late ? `${fa(late)} NCR از مهلت گذشته است` : undefined },
      { tab: 'forms', icon: ClipboardList, color: '#22c55e', title: 'فرم‌ها و گزارش‌های کیفی', big: fa(forms.length), unit: 'فرم صادرشده',
        lines: [['در انتظار بررسی', fa(waiting)], ['برگشتی / ناقص', fa(returned)], ['جوشکاری روزانه', fa(forms.filter((r) => r.formKey === 'welding').length)], ['درخواست / گزارش RT', `${fa(forms.filter((r) => r.formKey.startsWith('rt_request')).length)} / ${fa(forms.filter((r) => r.formKey === 'rt_report').length)}`]], warn: returned ? `${fa(returned)} فرم برگشت خورده است` : undefined },
    ]
  }, [qc.rows, wq.coatings, ht.coated, ht.records, ht.defects, ht.packs, ht.ctTests, epc.ncrs, epc.findings, ex.reports, projectId])

  return (
    <div className="qc-home">
      <header className="qc-home-head">
        <span className="qc-home-ico" aria-hidden><ScanSearch size={20} /></span>
        <div><b>میز کیفیت پروژه</b><small>هر کاشی خلاصهٔ یک جریان کیفی است؛ با کلیک، بخش مربوط باز می‌شود. داده‌ها از همان ثبت‌های اجرا، آزمایش‌ها و ارزیابی صلاحیت خوانده می‌شوند و جایی دوباره وارد نمی‌شوند.</small></div>
      </header>
      <div className="qc-tiles">
        {tiles.map((t, i) => (
          <button key={t.tab} type="button" className="qc-tile" style={{ '--c': t.color, '--i': i } as CSSProperties} onClick={() => onGo(t.tab)}>
            <span className="qc-tile-top"><t.icon size={17} aria-hidden /><b>{t.title}</b><ArrowLeft size={15} aria-hidden className="qc-tile-go" /></span>
            <span className="qc-tile-big"><strong>{t.big}</strong><small>{t.unit}</small></span>
            <dl>{t.lines.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            {t.warn && <em>{t.warn}</em>}
          </button>
        ))}
      </div>
    </div>
  )
}
