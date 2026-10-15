import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { BUNDLED_TEMPLATES } from '../forms/bundled'
import { designGrid } from '../forms/designGrid'
import { GridSheet } from '../forms/GridTemplate'
import { Chip, Section } from '../../finance/components/fn'
import { fa } from '../components/common'
import { EpcGate } from '../components/epc/EpcBanner'
import { fmtD } from '../../finance/components/fn'

const ST_FA = { draft: 'پیش‌نویس', approved: 'مصوب (فعال)', retired: 'بازنشسته' } as const
const TONE = { draft: 'warn', approved: 'good', retired: 'neutral' } as const

/** Central library of approved form sheets: every version is frozen (geometry, texts, bindings, source hash); only an approved version is used for printing, and approval needs no form code or revision. */
export function TemplateLibrary({ projectId }: { projectId: string }) { return <EpcGate><Inner projectId={projectId} /></EpcGate> }
function Inner({ projectId }: { projectId: string }) {
  const epc = useEpcStore()
  const can = useExecutionStore((s) => s.can(projectId, '*') || s.can(projectId, 'configure'))
  const [fields, setFields] = useState<Record<string, { code: string; rev: string }>>({})
  const [busy, setBusy] = useState('')
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
            {mine.length === 0 && !can && <span className="im-helper">هنوز ثبت نشده است.</span>}
            <div className="fn-tbl-wrap" style={{ maxHeight: 'none', marginTop: 8 }}><table className="ex-lines"><thead><tr><th>نسخه</th><th>وضعیت</th><th>کد فرم</th><th>بازنگری</th><th>فایل مبدأ (هش)</th><th>تأیید</th><th /></tr></thead>
              <tbody>{mine.map((t) => {
                const f = fields[t.id] ?? { code: '', rev: '' }
                return <tr key={t.id}>
                  <td className="num">{fa(t.version)}</td><td><Chip tone={TONE[t.status]}>{ST_FA[t.status]}</Chip></td>
                  <td>{t.status === 'draft' && can ? <input dir="ltr" value={f.code} onChange={(e) => setFields({ ...fields, [t.id]: { ...f, code: e.target.value } })} placeholder="کد فرم مصوب" style={{ width: 130 }} aria-label="کد فرم" /> : t.code || '—'}</td>
                  <td>{t.status === 'draft' && can ? <input dir="ltr" value={f.rev} onChange={(e) => setFields({ ...fields, [t.id]: { ...f, rev: e.target.value } })} placeholder="بازنگری" style={{ width: 80 }} aria-label="شمارهٔ بازنگری" /> : t.revision || '—'}</td>
                  <td className="fn-code" title={t.sourceSha256}>{t.sourceFile} · {t.sourceSha256.slice(0, 8)}</td>
                  <td>{t.approvedAt ? fmtD(t.approvedAt.slice(0, 10)) : '—'}</td>
                  <td>{t.status === 'draft' && can && <button className="im-btn im-btn-sm im-btn-primary" disabled={busy === t.id} onClick={async () => { setBusy(t.id); await epc.approveTemplate(t.id, f.code, f.rev); setBusy('') }}><CheckCircle2 size={13} /> تأیید و فعال‌سازی</button>}</td>
                </tr>
              })}{mine.length === 0 && <tr><td colSpan={7} className="sub">نسخه‌ای ثبت نشده است.</td></tr>}</tbody></table></div>
          </Section>
        )
      })}
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
          {preview && <div style={{ overflow: 'auto', marginTop: 10, border: '1px solid var(--border, #ddd)' }}><GridSheet tpl={preview} /></div>}
        </Section>
      )}
    </div>
  )
}
