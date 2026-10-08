import { useState } from 'react'
import { Database, Trash2 } from 'lucide-react'
import { useLandStore } from '../store/useLandStore'
import { DEFAULT_SETTINGS, type RouteInfo } from '../types'
import { faNum } from '../lib/fa'
import { LEGAL_REFERENCE } from '../lib/legal'
import { Card, ConfirmDialog, Field } from '../components/ui'
import { RolesCard } from '../components/RolesCard'
import { RouteImport } from '../components/RouteImport'

export function SettingsPage() {
  const data = useLandStore((s) => s.data)
  const projectId = useLandStore((s) => s.projectId)
  const saveRoute = useLandStore((s) => s.saveRoute)
  const loadDemo = useLandStore((s) => s.loadDemo)
  const clearDemo = useLandStore((s) => s.clearDemo)
  const loading = useLandStore((s) => s.loading)
  const route = data?.route
  const base: RouteInfo = route ?? { masterProjectId: projectId ?? '', name: '', totalKm: 0, startKm: 0, geometry: [], geometrySource: 'none', settings: DEFAULT_SETTINGS, isDemo: false }
  const [form, setForm] = useState({ name: base.name, totalKm: base.totalKm || 100, startKm: base.startKm, buffer: base.settings.bufferDays, horizon: base.settings.horizonDays })
  const [confirmClear, setConfirmClear] = useState(false)
  const hasDemo = !!route?.isDemo || !!data?.parcels.some((p) => p.isDemo)
  const valid = form.name.trim() !== '' && form.totalKm > 0 && form.buffer >= 0 && form.horizon > 0

  const save = (geometry = base.geometry, geometrySource = base.geometrySource, totalKm = form.totalKm) =>
    saveRoute({ ...base, masterProjectId: projectId ?? base.masterProjectId, name: form.name.trim(), totalKm, startKm: form.startKm, geometry, geometrySource, settings: { ...base.settings, bufferDays: form.buffer, horizonDays: form.horizon } })

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Card help="settings" title="مسیر پروژه" hint="مبنای همهٔ قطعه‌ها، نقشه و برنامه زمان‌بندی: یک محور کیلومتراژ">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="نام مسیر" className="sm:col-span-3"><input className="la-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثلاً خط لولهٔ ۳۶ اینچ ..." /></Field>
          <Field label="طول کل (km)"><input className="la-input la-num" type="number" min={0} step={0.5} value={form.totalKm} onChange={(e) => setForm({ ...form, totalKm: Number(e.target.value) })} /></Field>
          <Field label="کیلومتر شروع" hint="معمولاً ۰"><input className="la-input la-num" type="number" step={0.5} value={form.startKm} onChange={(e) => setForm({ ...form, startKm: Number(e.target.value) })} /></Field>
        </div>
        <div className="mt-4"><RouteImport onApply={(pts, src, lengthKm, setTotal) => { if (setTotal) setForm((f) => ({ ...f, totalKm: +lengthKm.toFixed(3) })); void save(pts, src, setTotal ? +lengthKm.toFixed(3) : undefined) }} /></div>
        <p className="la-hint">{base.geometry.length >= 2 ? `مختصات مسیر ثبت است (${faNum(base.geometry.length)} نقطه) — نقشه روی مسیر واقعی رسم می‌شود.` : 'مختصات مسیر ثبت نشده؛ نقشه نمای شماتیک نشان می‌دهد و همهٔ محاسبات با کیلومتراژ درست کار می‌کنند.'}</p>
      </Card>

      <RolesCard />

      <Card title="قواعد هشدار زودهنگام">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ذخیرهٔ اطمینان (روز)" hint="به زمان لازم تحصیل اضافه می‌شود تا تاریخ «باید شروع شود» زودتر محاسبه شود"><input className="la-input la-num" type="number" min={0} value={form.buffer} onChange={(e) => setForm({ ...form, buffer: Number(e.target.value) })} /></Field>
          <Field label="افق «پیش‌رو» (روز)" hint="X روز آینده در داشبورد و اقدام‌های پیش‌رو"><input className="la-input la-num" type="number" min={1} value={form.horizon} onChange={(e) => setForm({ ...form, horizon: Number(e.target.value) })} /></Field>
        </div>
        <div className="mt-4 flex justify-end"><button className="la-btn la-btn-primary" disabled={!valid} onClick={() => save()}>ذخیرهٔ تنظیمات</button></div>
      </Card>

      <Card title="مواعد قانونی لایحهٔ ۱۳۵۸" hint="هر مهلت از رویداد آغازین حساب می‌شود و نزدیک یا گذشته‌بودنش در همهٔ بخش‌ها هشدار می‌دهد؛ «ماه» ماه شمسی است.">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
            <thead><tr style={{ color: 'var(--la-muted)' }}><th className="px-2 py-2 text-right font-semibold">ماده</th><th className="px-2 py-2 text-right font-semibold">رویداد</th><th className="px-2 py-2 text-right font-semibold">مهلت</th></tr></thead>
            <tbody>
              {LEGAL_REFERENCE.map((r) => (
                <tr key={r.article + r.title} style={{ borderTop: '1px solid var(--la-line)' }}>
                  <td className="whitespace-nowrap px-2 py-2 font-bold">{r.article}</td>
                  <td className="px-2 py-2 leading-6"><b>{r.title}</b><span className="la-eyebrow block">{r.rule}</span></td>
                  <td className="whitespace-nowrap px-2 py-2 font-bold" style={{ color: 'var(--la-accent)' }}>{r.period}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="داده‌های نمونه" hint="یک خط لولهٔ ۱۰۰ کیلومتری با قطعه، مالک، فعالیت و نقاط بحرانی برای آشنایی با ماژول. داده‌های واقعی شما هرگز لمس نمی‌شود.">
        <div className="flex flex-wrap gap-2">
          <button className="la-btn" disabled={loading} onClick={() => loadDemo()}><Database size={14} /> {hasDemo ? 'بازسازی داده نمونه' : 'بارگذاری داده نمونه'}</button>
          {hasDemo && <button className="la-btn la-btn-danger" onClick={() => setConfirmClear(true)}><Trash2 size={14} /> پاک‌کردن داده نمونه</button>}
        </div>
      </Card>
      {confirmClear && <ConfirmDialog title="پاک‌کردن داده نمونه" confirmLabel="پاک شود" description="فقط ردیف‌های نمونه حذف می‌شود؛ قطعه‌ها و فعالیت‌هایی که خودتان ثبت کرده‌اید می‌ماند." onClose={() => setConfirmClear(false)} onConfirm={async () => { await clearDemo(); setConfirmClear(false) }} />}
    </div>
  )
}
