import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { BUNDLED_TEMPLATES } from '../forms/bundled'
import { GRID_SPECS } from '../forms/gridSpecs'
import { addr } from '../forms/gridTypes'
import { designGrid } from '../forms/designGrid'
import { GridSheet } from '../forms/GridTemplate'
import { OfficeRoundTrip, downloadWorkbook } from '../forms/OfficeRoundTrip'
import { TemplateAdjuster } from '../forms/TemplateAdjuster'
import { Chip, Section } from '../../finance/components/fn'
import { fa } from '../components/common'
import { useAuthStore } from '../../../store/useAuthStore'
import { EpcGate } from '../components/epc/EpcBanner'
import { fmtD } from '../../finance/components/fn'

const ST_FA = { draft: 'پیش‌نویس', approved: 'مصوب (فعال)', retired: 'بازنشسته' } as const
const TONE = { draft: 'warn', approved: 'good', retired: 'neutral' } as const

/** Central library of approved form sheets: every version is frozen (geometry, texts, bindings, source hash); only an approved version is used for printing, and approval needs no form code or revision. */
export function TemplateLibrary({ projectId }: { projectId: string }) { return <EpcGate><Inner projectId={projectId} /></EpcGate> }
function Inner({ projectId }: { projectId: string }) {
  const epc = useEpcStore()
  const can = useExecutionStore((s) => s.can(projectId, '*') || s.can(projectId, 'configure'))
  const isAdmin = useAuthStore((s) => Boolean(s.profile?.isAdmin))
  const [fields, setFields] = useState<Record<string, { code: string; rev: string }>>({})
  const [busy, setBusy] = useState('')
  // after a draft is saved the viewer jumps to it (otherwise the old version stays on screen and the change looks lost)
  const savedDraft = async (formKey: string, title: string, layout: Parameters<typeof epc.saveTemplateDraft>[0]['layout'], bindings: Parameters<typeof epc.saveTemplateDraft>[0]['bindings']) => {
    const ok = await epc.saveTemplateDraft({ formKey, title, layout, bindings })
    if (ok) { const t = useEpcStore.getState().templates.filter((x) => x.formKey === formKey).sort((a, b) => b.version - a.version)[0]; if (t) setViewing((v) => ({ ...v, [formKey]: t.id })); window.alert(`نسخهٔ ${t?.version ?? ''} به‌صورت پیش‌نویس ثبت شد و نمایش داده می‌شود. برای اعمال در چاپ: «تأیید و فعال‌سازی» نسخه، سپس «تأیید نگاشت سلول‌ها».`) }
    return ok
  }
  const [nf, setNf] = useState({ key: '', title: '' })
  const [viewing, setViewing] = useState<Record<string, string>>({})
  const ex = useExecutionStore.getState()
  const flags = (useExecutionStore((s) => s.settingsByProject.get(projectId)) as unknown as { flags?: Record<string, boolean> } | undefined)?.flags ?? {}
  const todayOn = !!flags.today
  const [d, setD] = useState({ key: '', title: '', headers: 'تاریخ، شمارهٔ گزارش، محل', cols: 'شرح، مقدار، توضیحات', rows: 15 })
  const split = (x: string) => x.split(/[،,\n]/).map((v) => v.trim()).filter(Boolean)
  const preview = d.title.trim() ? designGrid({ formKey: d.key || 'new_form', title: d.title, headerLabels: split(d.headers), columns: split(d.cols).map((label) => ({ label })), rows: Math.min(40, Math.max(1, d.rows)), signers: ['نماینده پیمانکار', 'نماینده دستگاه نظارت'] }) : null
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="im-helper" style={{ margin: 0 }}>هر فرم مصوب یک «الگوی منجمد» است: چیدمان و متن ثابت آن هرگز تغییر نمی‌کند؛ فقط سلول‌های نگاشت‌شده از اطلاعات پروژه و گزارش پر می‌شوند. تا وقتی نسخه‌ای تصویب نشده، همان چاپ فعلی سامانه استفاده می‌شود. {!can && 'ثبت و تأیید فقط با مدیر پروژه/سامانه است.'}</p>
      {[...BUNDLED_TEMPLATES, ...[...new Set(epc.templates.map((t) => t.formKey))].filter((k) => !BUNDLED_TEMPLATES.some((b) => b.formKey === k)).map((k) => { const t = epc.templates.find((x) => x.formKey === k)!; return { formKey: k, title: t.title, layout: t.layout, bindings: t.bindings, renderer: 'static' as const } })].map((b) => {
        const mine = epc.templates.filter((t) => t.formKey === b.formKey)
        const same = mine.find((t) => t.sourceSha256 === b.layout.source.sha256)
        return (
          <Section key={b.formKey} title={b.title} hint={`برگ ${b.layout.sheet} از فایل ${b.layout.source.file} · ${fa(b.layout.stats.cells)} سلول · ${fa(b.layout.stats.merged)} ادغام`}>
            {!same && can && <button className="im-btn im-btn-primary im-btn-sm" disabled={busy === b.formKey} onClick={async () => { setBusy(b.formKey); await epc.saveTemplateDraft({ formKey: b.formKey, title: b.title, layout: b.layout, bindings: b.bindings }); setBusy('') }}>ثبت این فایل در کتابخانه (پیش‌نویس)</button>}
            <details style={{ marginTop: 8 }} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) setViewing((v) => ({ ...v, [b.formKey]: v[b.formKey] ?? (mine[0]?.id ?? 'base') })) }}>
              <summary>مشاهده و اصلاح ظاهر فرم (فاصلهٔ سطر و ستون، تراز، اندازهٔ فونت)</summary>
              {viewing[b.formKey] !== undefined && (() => {
                const vid = viewing[b.formKey], ver = mine.find((t) => t.id === vid)
                const lay = (ver?.layout ?? b.layout) as typeof b.layout, bnd = ver?.bindings ?? b.bindings
                return <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  <label className="im-helper">نسخه: <select value={vid} onChange={(e) => setViewing({ ...viewing, [b.formKey]: e.target.value })}>
                    {mine.map((t) => <option key={t.id} value={t.id}>نسخهٔ {t.version} — {ST_FA[t.status]}{t.layout.adjusted ? ' (اصلاح ظاهر)' : ''}</option>)}
                    <option value="base">فایل اصلی همراه برنامه (ثبت‌نشده)</option>
                  </select></label>
                  {ver?.layout.adjusted && <span className="im-helper">این نسخه فقط از نظر ظاهر اصلاح شده است: {ver.layout.adjusted.ops.join(' · ')}</span>}
                  <TemplateAdjuster key={vid} base={lay} bindings={bnd} fromVersion={ver?.version ?? null} canEdit={can} onSave={(layout, nb) => savedDraft(b.formKey, b.title, layout, nb)} slots={epc.signSlots.filter((x) => x.projectId === projectId && x.formKey === b.formKey && x.active).map((x) => ({ slotKey: x.slotKey, label: x.label }))} />
                  <details><summary className="im-helper">ویرایش در Excel (دریافت فایل ← ویرایش در آفیس ← بارگذاری)</summary>
                    <OfficeRoundTrip key={`o${vid}`} formKey={b.formKey} title={b.title} base={lay} bindings={bnd} version={ver?.version ?? null} strict={b.renderer !== 'static'} canEdit={can} onSave={(layout) => savedDraft(b.formKey, b.title, layout, bnd)} />
                  </details>
                </div>
              })()}
            </details>
            {GRID_SPECS[b.formKey] && (
              <details style={{ marginTop: 8 }}>
                <summary>بازبینی نگاشت سلول‌ها (پیشنهادی — قابل تأیید توسط مسئول فرم)</summary>
                {(() => { const sp = GRID_SPECS[b.formKey], txt = (r: number, c: number) => b.layout.cells.find((x) => x.r === r && x.c === c)?.v?.replace(/\s+/g, ' ').trim() ?? ''
                  const colHead = (c: number) => { for (let r = sp.rows.first - 1; r >= Math.max(0, sp.rows.first - 4); r--) { const t = txt(r, c); if (t) return t } return '' }
                  return <div className="fn-tbl-wrap" style={{ maxHeight: 260 }}><table className="ex-lines"><thead><tr><th>سلول</th><th>متن ثابت فرم</th><th>داده</th></tr></thead><tbody>
                    {sp.headers.map((h) => <tr key={h.cell}><td dir="ltr">{h.cell}</td><td dir="auto">{b.layout.cells.find((x) => addr(x.r, x.c) === h.cell)?.v ?? '—'}</td><td>{h.key}{h.mode === 'append' ? ' (بعد از برچسب)' : ''}</td></tr>)}
                    {sp.rows.cols.map((c, i) => <tr key={`c${i}`}><td dir="ltr">ستون {addr(0, c.c).replace(/\d+/, '')}{c.dr ? ' (ردیف دوم رکورد)' : ''}</td><td dir="auto">{colHead(c.c) || '—'}</td><td>فیلد ردیف</td></tr>)}
                  </tbody></table></div> })()}
              </details>
            )}
            {mine.length === 0 && !can && <span className="im-helper">هنوز ثبت نشده است.</span>}
            <div className="fn-tbl-wrap" style={{ maxHeight: 'none', marginTop: 8 }}><table className="ex-lines"><thead><tr><th>نسخه</th><th>وضعیت</th><th>کد فرم</th><th>بازنگری</th><th>فایل مبدأ (هش)</th><th>تأیید</th><th /><th /></tr></thead>
              <tbody>{mine.map((t) => {
                const f = fields[t.id] ?? { code: '', rev: '' }
                return <tr key={t.id}>
                  <td className="num">{fa(t.version)}</td><td><Chip tone={TONE[t.status]}>{ST_FA[t.status]}</Chip></td>
                  <td>{t.status === 'draft' && can ? <input dir="ltr" value={f.code} onChange={(e) => setFields({ ...fields, [t.id]: { ...f, code: e.target.value } })} placeholder="کد فرم مصوب" style={{ width: 130 }} aria-label="کد فرم" /> : t.code || '—'}</td>
                  <td>{t.status === 'draft' && can ? <input dir="ltr" value={f.rev} onChange={(e) => setFields({ ...fields, [t.id]: { ...f, rev: e.target.value } })} placeholder="بازنگری" style={{ width: 80 }} aria-label="شمارهٔ بازنگری" /> : t.revision || '—'}</td>
                  <td className="fn-code" title={t.sourceSha256}>{t.sourceFile} · {t.sourceSha256.slice(0, 8)}</td>
                  <td>{t.approvedAt ? fmtD(t.approvedAt.slice(0, 10)) : '—'}</td>
                  <td>{t.status === 'draft' && can && <button className="im-btn im-btn-sm im-btn-primary" disabled={busy === t.id} onClick={async () => { setBusy(t.id); await epc.approveTemplate(t.id, f.code, f.rev); setBusy('') }}><CheckCircle2 size={13} /> تأیید و فعال‌سازی</button>}{t.status === 'approved' && (() => { const ap = epc.mappingApprovals.find((x) => x.templateId === t.id && !x.revokedAt); return ap ? <span className="im-helper">نگاشت سلول‌ها تأیید شده ({fmtD(ap.approvedAt.slice(0, 10))}){can && <button className="im-btn im-btn-sm" style={{ marginInlineStart: 6 }} onClick={() => void epc.revokeMapping(ap.id)}>ابطال</button>}</span> : can ? <button className="im-btn im-btn-sm" onClick={() => { if (window.confirm('جدول نگاشت سلول‌ها بررسی و تأیید شود؟ این تأیید برای همین نسخه ثبت می‌شود.')) void epc.approveMapping(t.id, '') }}><CheckCircle2 size={13} /> تأیید نگاشت سلول‌ها</button> : <span className="im-helper">نگاشت تأیید نشده</span> })()}</td>
                  <td>{isAdmin && <button className="im-btn im-btn-sm" disabled={busy === t.id} title="فقط مدیر سامانه؛ فرمی که از این نسخه ثبت شده باشد مانع حذف است" onClick={async () => { if (!window.confirm(`نسخهٔ ${t.version} این فرم برای همیشه حذف شود؟${t.status === 'approved' ? ' این نسخه مصوب و فعال است و فرم تا تأیید نسخهٔ دیگر بدون الگو می‌ماند.' : ''}`)) return; setBusy(t.id); await epc.deleteTemplate(t.id); setBusy('') }}>حذف نسخه</button>}</td>
                </tr>
              })}{mine.length === 0 && <tr><td colSpan={8} className="sub">نسخه‌ای ثبت نشده است.</td></tr>}</tbody></table></div>
          </Section>
        )
      })}
      {can && (
        <Section title="فرم جدید از فایل Excel" hint="فرم را در Excel بسازید (یا بالا یک نمونه را دریافت و تغییر دهید یا از «طراحی فرم جدید» پایین فایل شروع بگیرید)، سپس اینجا بارگذاری کنید. فرم به‌صورت پیش‌نویس و بدون نگاشت ثبت می‌شود؛ بعد از تأیید در «فرم‌های طراحی‌شده» قابل پر کردن است.">
          <div style={{ display: 'grid', gap: 6, maxWidth: 640 }}>
            <input value={nf.title} onChange={(e) => setNf({ ...nf, title: e.target.value })} placeholder="عنوان فرم" aria-label="عنوان فرم جدید" />
            <input dir="ltr" value={nf.key} onChange={(e) => setNf({ ...nf, key: e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase() })} placeholder="کلید لاتین فرم (مثلاً hydro_test)" aria-label="کلید فرم جدید" />
            {nf.title.trim() && nf.key ? <OfficeRoundTrip key={nf.key} formKey={nf.key} title={nf.title} canEdit={can} onSave={(layout) => epc.saveTemplateDraft({ formKey: nf.key, title: nf.title, layout, bindings: [] })} /> : <span className="im-helper">ابتدا عنوان و کلید فرم را بنویسید.</span>}
          </div>
        </Section>
      )}
      {can && (
        <Section title="طراحی فرم جدید" hint="برای فرم‌های آینده: عنوان، فیلدهای سربرگ و ستون‌های جدول را بنویسید؛ نمونهٔ چاپی ساخته می‌شود و پس از ثبت، مانند بقیهٔ قالب‌ها با تأیید قفل می‌شود.">
          <div style={{ display: 'grid', gap: 6, maxWidth: 640 }}>
            <input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="عنوان فرم" aria-label="عنوان فرم" />
            <input dir="ltr" value={d.key} onChange={(e) => setD({ ...d, key: e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase() })} placeholder="کلید لاتین فرم (مثلاً hydro_test)" aria-label="کلید فرم" />
            <input value={d.headers} onChange={(e) => setD({ ...d, headers: e.target.value })} placeholder="فیلدهای سربرگ (با ویرگول جدا کنید)" aria-label="سربرگ" />
            <input value={d.cols} onChange={(e) => setD({ ...d, cols: e.target.value })} placeholder="ستون‌های جدول (با ویرگول جدا کنید)" aria-label="ستون‌ها" />
            <label>تعداد ردیف جدول <input type="number" min={1} max={40} value={d.rows} onChange={(e) => setD({ ...d, rows: Number(e.target.value) })} style={{ width: 80 }} /></label>
            <button className="im-btn im-btn-primary im-btn-sm" disabled={!preview || !d.key || busy === 'design'} onClick={async () => { if (!preview) return; setBusy('design'); await epc.saveTemplateDraft({ formKey: d.key, title: d.title, layout: preview, bindings: [] }); setBusy('') }}>ثبت به‌عنوان پیش‌نویس قالب</button>
          </div>
          {preview && <button className="im-btn im-btn-sm" style={{ marginTop: 8 }} onClick={() => void downloadWorkbook(preview, `${d.key || 'new_form'}-start.xlsx`, { title: d.title, version: null })}>دریافت این طرح به‌صورت Excel (برای ادامهٔ طراحی در آفیس)</button>}
          {preview && <div style={{ overflow: 'auto', marginTop: 10, border: '1px solid var(--border, #ddd)' }}><GridSheet tpl={preview} /></div>}
        </Section>
      )}
      {can && <Section title="قابلیت‌های آزمایشی" hint="هر قابلیت آزمایشی با یک پرچم پروژه روشن می‌شود و با خاموش‌کردن، رفتار قبلی برمی‌گردد.">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={!!flags.centralWeld} onChange={(x) => void ex.saveSettings(projectId, { flags: { ...flags, centralWeld: x.target.checked } } as never)} /> «جدول مرکزی سرجوش»: مشخصات مشترک سرجوش (لوله، قطر، ضخامت، طول، زاویه) فقط یک‌بار در جدول مرکزی ذخیره و در همهٔ فرم‌ها از همان خوانده شود</label>
        {!!flags.centralWeld && <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 10px' }}><button className="im-btn im-btn-sm" disabled={busy === 'bf'} onClick={async () => { setBusy('bf'); const n = await epc.weldBackfill(projectId); setBusy(''); if (n != null) window.alert(`${n} مقدار از فرم‌های ثبت‌شده به جدول مرکزی منتقل شد (سطرهای فرم‌ها تغییر نکرد).`) }}>تکمیل جدول مرکزی از فرم‌های ثبت‌شده</button><span className="im-helper">فقط مقدارهای خالی پر می‌شود؛ تاریخچهٔ هر مقدار نگه داشته می‌شود.</span></div>}
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={todayOn} onChange={(x) => void ex.saveSettings(projectId, { flags: { ...flags, today: x.target.checked } } as never)} /> «امروز در کارگاه» (زیرمنوی گزارش روزانه)</label>
      </Section>}
    </div>
  )
}
