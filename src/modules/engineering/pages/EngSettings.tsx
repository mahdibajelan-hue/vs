import { useMemo, useState } from 'react'
import { RotateCcw, Save, Scale } from 'lucide-react'
import type { EpcModel } from '../../execution/lib/useEpcModel'
import { useExecutionStore } from '../../execution/store/useExecutionStore'
import { DEFAULT_ENG_CREDITS, engProgress, engRulesOf, type EngCredits } from '../../execution/lib/engine/engineering'
import { NumInput } from '../../finance/components/fn'
import { fa, pct } from '../../execution/components/common'

const STEPS: { k: keyof EngCredits; label: string; hint: string }[] = [
  { k: 'first', label: 'ارسال اول (معمولاً Rev A)', hint: 'از تاریخ نخستین ارسالِ پذیرفته‌شدهٔ مدرک برای مشاور' },
  { k: 'later', label: 'ارسال‌های بعدی (Rev B و بعد)', hint: 'پس از رفع کامنت و ارسال دوباره' },
  { k: 'noted', label: 'تأیید با ملاحظات (Approved as Noted)', hint: 'تا ارسال ویرایش نهایی' },
  { k: 'approved', label: 'تأیید نهایی (Approved)', hint: 'معمولاً ۱۰۰٪' },
]
const toPct = (c: EngCredits): Record<keyof EngCredits, number> => ({ first: Math.round(c.first * 100), later: Math.round(c.later * 100), noted: Math.round(c.noted * 100), approved: Math.round(c.approved * 100) })

/** تنظیمات پایش مهندسی — the progress weight of each step of a document's issue / review cycle, and the total engineering amount. */
export function EngSettings({ m, projectId }: { m: EpcModel; projectId: string }) {
  const ex = useExecutionStore()
  const can = ex.can(projectId, '*') || ex.can(projectId, 'configure')
  const settings = ex.settings(projectId)
  const saved = toPct(engRulesOf(settings).credits)
  const [f, setF] = useState(saved)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const order = [f.first, f.later, f.noted, f.approved]
  const err = order.some((v) => !Number.isFinite(v) || v < 0 || v > 100) ? 'هر مقدار باید بین ۰ تا ۱۰۰ باشد.'
    : order.some((v, i) => i > 0 && v < order[i - 1]) ? 'هر مرحله باید دست‌کم به اندازهٔ مرحلهٔ پیش از خود وزن داشته باشد (ارسال اول ≤ ارسال‌های بعدی ≤ تأیید با ملاحظات ≤ تأیید نهایی).' : ''
  const changed = (Object.keys(f) as (keyof EngCredits)[]).some((k) => f[k] !== saved[k])
  // today's progress with the saved weights and with the values on screen
  const preview = useMemo(() => {
    const now = engProgress(m.engDocs, m.today, engRulesOf(settings))
    const next = err ? null : engProgress(m.engDocs, m.today, engRulesOf({ engCredits: f }))
    return { now, next }
  }, [m.engDocs, m.today, settings, f, err])
  const save = async () => {
    if (err) return
    const ok = await ex.saveSettings(projectId, { engCredits: f })
    setMsg(ok ? { ok: true, text: 'وزن مراحل ذخیره شد؛ پیشرفت مهندسی در همهٔ صفحه‌ها با این وزن‌ها محاسبه می‌شود.' } : { ok: false, text: 'ذخیره انجام نشد.' })
  }

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 900 }}>
      <div className="im-card" style={{ padding: 16, display: 'grid', gap: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 900, margin: 0 }}><Scale size={17} style={{ display: 'inline', verticalAlign: -3 }} /> وزن مراحل گردش مدرک در پیشرفت</h2>
        <p className="im-helper" style={{ margin: 0, lineHeight: 1.9 }}>
          هر مدرک به اندازهٔ وزن خود در پیشرفت مهندسی سهم دارد. این سهم به مرحله‌ای بستگی دارد که مدرک در گردش بین پیمانکار و مشاور به آن رسیده است. پاسخ «کامنت‌دار» سهم را تغییر نمی‌دهد. پاسخ «ردشده» سهم همان ارسال را حذف می‌کند تا مدرک دوباره ارسال شود. پیشرفت برنامه‌ای با همین قاعده محاسبه می‌شود: سهم «ارسال اول» در تاریخ برنامه‌ای ارسال و سهم کامل در تاریخ برنامه‌ای تأیید.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          {STEPS.map((s) => (
            <label key={s.k} className="ex-lab" style={{ display: 'grid', gap: 4 }}>
              <span>{s.label}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="number" min={0} max={100} step={1} value={f[s.k]} disabled={!can} onChange={(e) => setF({ ...f, [s.k]: Number(e.target.value) })} style={{ width: 90 }} aria-label={s.label} /><b>٪</b></span>
              <small className="sub">{s.hint}</small>
            </label>
          ))}
        </div>
        {err && <p className="ex-bad" style={{ margin: 0, fontSize: 12.5 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5 }}>
          <span>پیشرفت واقعی امروز: <b>{pct(preview.now.actualScore, 1)}</b>{changed && preview.next && <> ← با مقادیر جدید <b>{pct(preview.next.actualScore, 1)}</b></>}</span>
          <span className="sub">برنامه: {pct(preview.now.plannedScore, 1)}{changed && preview.next ? ` ← ${pct(preview.next.plannedScore, 1)}` : ''}</span>
        </div>
        {can ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="im-btn im-btn-primary im-btn-sm" disabled={!!err || !changed} onClick={() => void save()}><Save size={13} /> ذخیرهٔ وزن مراحل</button>
            <button className="im-btn im-btn-sm" onClick={() => setF(toPct(DEFAULT_ENG_CREDITS))}><RotateCcw size={13} /> پیش‌فرض ({fa(60)} / {fa(70)} / {fa(80)} / {fa(100)})</button>
          </div>
        ) : <p className="im-helper" style={{ margin: 0 }}>تغییر وزن مراحل با مدیر پروژه یا کسی است که اجازهٔ پیکربندی پروژه را دارد.</p>}
        {msg && <p className={msg.ok ? 'im-helper' : 'ex-bad'} style={{ margin: 0, color: msg.ok ? '#16a34a' : undefined }}>{msg.text}</p>}
      </div>

      <div className="im-card" style={{ padding: 16, display: 'grid', gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 900, margin: 0 }}>مهلت‌ها در گزارش‌های مهندسی</h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <label className="ex-lab">مهلت بررسی مشاور (روز)<input type="number" min={0} disabled={!can} defaultValue={settings.engConsultantDays ?? 15} key={`c${settings.engConsultantDays ?? 15}`} style={{ width: 90 }} onBlur={(e) => { const v = Math.round(Number(e.target.value)); if (can && Number.isFinite(v) && v >= 0 && v !== (settings.engConsultantDays ?? 15)) void ex.saveSettings(projectId, { engConsultantDays: v }) }} /></label>
          <label className="ex-lab">مهلت رفع کامنت پیمانکار (روز)<input type="number" min={0} disabled={!can} defaultValue={settings.engCommentDays ?? 15} key={`k${settings.engCommentDays ?? 15}`} style={{ width: 90 }} onBlur={(e) => { const v = Math.round(Number(e.target.value)); if (can && Number.isFinite(v) && v >= 0 && v !== (settings.engCommentDays ?? 15)) void ex.saveSettings(projectId, { engCommentDays: v }) }} /></label>
        </div>
        <p className="im-helper" style={{ margin: 0 }}>مدرکی که بیش از این مدت نزد مشاور بماند، یا پاسخ کامنت‌دار، ردشده یا تأیید با ملاحظاتِ آن بیش از این مدت بدون ارسال دوباره بماند، در گزارش‌های «معوق نزد مشاور» و «رفع کامنت معوق» می‌آید.</p>
      </div>

      <div className="im-card" style={{ padding: 16, display: 'grid', gap: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 900, margin: 0 }}>مبلغ کل مهندسی</h2>
        <label className="ex-lab">مبلغ کل (ریال)<NumInput className="" value={settings.engAmount ?? 0} label="مبلغ کل مهندسی" decimals={0} onCommit={(n) => can && void ex.saveSettings(projectId, { engAmount: n })} /></label>
        <p className="im-helper" style={{ margin: 0 }}>هزینهٔ هر مدرک برابر با سهم وزن آن از مبلغ کل است. اگر مبلغ کل وارد نشود، جمع مبلغ مدارک فهرست MDL به کار می‌رود.</p>
      </div>
    </div>
  )
}
