import { useMemo, useState, type ReactNode } from 'react'
import { AlertOctagon, ArrowUpRight, ShieldAlert } from 'lucide-react'
import { useModuleStore } from '../../../../store/useModuleStore'
import { useDeepLinkStore } from '../../../../store/useDeepLinkStore'
import { useMaterialControlStore, type LinkTarget } from '../../store/useMaterialControlStore'
import { isOpenTarget } from '../../lib/control/useMaterialModel'
import { Chip } from '../../../finance/components/fn'
import { FormModal, type FieldDef } from '../../../finance/components/FormModal'
import type { RaiseSuggestion } from '../../lib/control/riskSuggest'

export const fa = (n: number, d = 0): string => (Number.isFinite(n) ? n.toLocaleString('fa-IR', { maximumFractionDigits: d }) : '—')
/** Quantity with its unit, e.g. «۱٬۲۰۰ M». Units stay as written (EA, M, KG) because that is how drawings and MTOs show them. */
export const qtyText = (n: number, unit: string, d = 2): string => `${fa(n, d)}${unit ? ` ${unit}` : ''}`
export const pct = (x: number | null, d = 0): string => (x == null ? '—' : `${fa(x * 100, d)}٪`)
/** Money for tables: billions of rials, one decimal. Base-currency values (quantity × price × rate) are what the module sums. */
export const bn = (n: number, d = 1): string => (n / 1e9).toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: n !== 0 && Math.abs(n) < 1e10 ? d : 0 })

/** Open the real risk / issue record in its own module. */
export function openRecord(target: 'risk' | 'issue', id: string, projectId: string): void {
  useDeepLinkStore.getState().request({ module: target === 'issue' ? 'issues' : 'risk', recordId: id, masterProjectId: projectId })
  useModuleStore.getState().enterModule(target === 'issue' ? 'issues' : 'risk')
}

export function ProgressBar({ actual, planned }: { actual: number; planned?: number }) {
  return (
    <div className="mt-bar" role="img" aria-label={`واقعی ${fa(actual * 100)}٪${planned != null ? `، برنامه ${fa(planned * 100)}٪` : ''}`}>
      <i style={{ width: `${Math.min(100, Math.max(0, actual * 100))}%` }} />
      {planned != null && <u style={{ insetInlineStart: `${Math.min(100, Math.max(0, planned * 100))}%` }} title="پیشرفت برنامه‌ای" />}
    </div>
  )
}

export function DemoBadge() { return <span className="mt-demo" title="این ردیف از مولد داده آزمایشی ساخته شده است">آزمایشی</span> }

/** Risks and issues tied to the given records, read live from their own modules (status, owner, due date). */
export function LinkedRecords({ projectId, sourceType, sourceIds }: { projectId: string; sourceType: 'material' | 'package' | 'discrepancy'; sourceIds: string[] }) {
  const links = useMaterialControlStore((s) => s.links)
  const targets = useMaterialControlStore((s) => s.linkTargets)
  const people = useMaterialControlStore((s) => s.people)
  const rows = useMemo(() => {
    const ids = new Set(sourceIds)
    const seen = new Set<string>()
    return links.filter((l) => l.masterProjectId === projectId && l.sourceType === sourceType && l.sourceId && ids.has(l.sourceId)).filter((l) => (seen.has(l.targetId) ? false : (seen.add(l.targetId), true)))
  }, [links, projectId, sourceType, sourceIds])
  if (!rows.length) return <p className="im-helper" style={{ margin: 0 }}>ریسک یا مسئله‌ای به این مورد وصل نیست.</p>
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map((l) => {
        const t: LinkTarget | undefined = targets.get(l.targetId)
        return (
          <div key={l.id} className="mt-link-row">
            {l.targetType === 'risk' ? <ShieldAlert size={16} /> : <AlertOctagon size={16} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{t?.code ? `${t.code} · ` : ''}{t?.title || l.label || (l.targetType === 'risk' ? 'ریسک' : 'مسئله')}</b>
              <div><small>{l.targetType === 'risk' ? 'ریسک' : 'مسئله'}{t?.ownerId && people.get(t.ownerId) ? ` · مسئول: ${people.get(t.ownerId)}` : ''}{t?.dueDate ? ` · مهلت/مرور: ${t.dueDate}` : ''}{t?.realizedAt ? ' · محقق شده' : ''}</small></div>
            </div>
            {t ? <Chip tone={isOpenTarget(t) ? 'warn' : 'good'}>{t.status || '—'}</Chip> : <Chip>نامشخص</Chip>}
            <button className="im-btn im-btn-sm" onClick={() => openRecord(l.targetType, l.targetId, projectId)} aria-label="باز کردن رکورد اصلی"><ArrowUpRight size={13} /> باز کردن</button>
          </div>
        )
      })}
    </div>
  )
}

const SEV = [{ value: 'critical', label: 'بحرانی' }, { value: 'high', label: 'زیاد' }, { value: 'medium', label: 'متوسط' }, { value: 'low', label: 'کم' }]

/** Create a risk or an issue (in their own modules) from material records, or attach the records to one that already exists. */
export function RaiseModal({ projectId, sources, defaults, onClose }: { projectId: string; sources: { type: 'material' | 'package' | 'discrepancy'; id: string }[]; defaults: Pick<RaiseSuggestion, 'target' | 'title' | 'description' | 'severity' | 'extra'>; onClose: () => void }) {
  const raise = useMaterialControlStore((s) => s.raise)
  const linkExisting = useMaterialControlStore((s) => s.linkExisting)
  const links = useMaterialControlStore((s) => s.links)
  const targets = useMaterialControlStore((s) => s.linkTargets)
  const [target, setTarget] = useState(defaults.target)
  const open = useMemo(() => [...new Set(links.filter((l) => l.masterProjectId === projectId).map((l) => l.targetId))].map((id) => targets.get(id)).filter((t): t is LinkTarget => !!t && isOpenTarget(t)), [links, targets, projectId])
  const fields: FieldDef[] = [
    { key: 'mode', label: 'کار موردنظر', kind: 'select', required: true, options: [{ value: 'new', label: 'ایجاد رکورد جدید' }, ...(open.length ? [{ value: 'attach', label: 'اتصال به ریسک یا مسئلهٔ باز موجود' }] : [])], span: 2 },
    { key: 'target', label: 'نوع رکورد', kind: 'select', required: true, options: [{ value: 'risk', label: 'ریسک (ممکن است رخ دهد)' }, { value: 'issue', label: 'مسئله (رخ داده و نیازمند اقدام است)' }], show: (v) => v.mode === 'new' },
    { key: 'severity', label: 'شدت', kind: 'select', required: true, options: SEV, show: (v) => v.mode === 'new' },
    { key: 'title', label: 'عنوان', kind: 'text', required: true, span: 2, show: (v) => v.mode === 'new' },
    { key: 'description', label: 'شرح (اقلام و علت)', kind: 'area', span: 2, show: (v) => v.mode === 'new' },
    { key: 'existing', label: 'رکورد موجود', kind: 'select', required: true, options: open.map((t) => ({ value: t.id, label: `${t.kind === 'risk' ? 'ریسک' : 'مسئله'} ${t.code} · ${t.title}` })), span: 2, show: (v) => v.mode === 'attach' },
  ]
  return (
    <FormModal title={defaults.target === 'risk' ? 'ثبت ریسک تأمین' : 'ثبت مسئلهٔ تأمین'} subtitle={`${sources.length.toLocaleString('fa-IR')} مورد به این رکورد وصل می‌شود. رکورد در ماژول ${target === 'risk' ? 'مدیریت ریسک' : 'مدیریت مسائل'} ساخته و پیگیری می‌شود؛ وضعیت، مسئول و مهلت از همان‌جا خوانده می‌شود.`}
      fields={fields} initial={{ mode: 'new', target, severity: defaults.severity, title: defaults.title, description: defaults.description, existing: open[0]?.id ?? '' }} submitLabel="ثبت" onClose={onClose}
      onSubmit={async (v) => {
        setTarget(v.target as 'risk' | 'issue')
        if (v.mode === 'attach') { const t = targets.get(String(v.existing)); if (t) await linkExisting(projectId, sources, t.kind, t.id); return }
        await raise({ projectId, sources, target: v.target as 'risk' | 'issue', title: String(v.title), description: String(v.description ?? ''), severity: String(v.severity), extra: defaults.extra })
      }} />
  )
}

/** A small button + modal pair used wherever a record can become a risk or an issue. */
export function RaiseButton({ projectId, sources, defaults, label, children }: { projectId: string; sources: { type: 'material' | 'package' | 'discrepancy'; id: string }[]; defaults: Pick<RaiseSuggestion, 'target' | 'title' | 'description' | 'severity' | 'extra'>; label?: string; children?: ReactNode }) {
  const can = useMaterialControlStore((s) => s.can)
  const [open, setOpen] = useState(false)
  if (!can(projectId, 'raise')) return null
  return (
    <>
      <button className="im-btn im-btn-sm" onClick={() => setOpen(true)}>{children ?? (defaults.target === 'risk' ? <ShieldAlert size={13} /> : <AlertOctagon size={13} />)} {label ?? (defaults.target === 'risk' ? 'ثبت ریسک' : 'ثبت مسئله')}</button>
      {open && <RaiseModal projectId={projectId} sources={sources} defaults={defaults} onClose={() => setOpen(false)} />}
    </>
  )
}
