import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, LayoutGrid, Search } from 'lucide-react'
import { useAccessData, useUserAccess } from '../lib/useAccessModel'
import { useAccessActions } from '../lib/useAccessActions'
import { ACCESS_LEVELS, isMember, moduleLevel, rolesAbove, rowHasAccess, type AccessLevel } from '../lib/access'
import { faNum } from '../lib/format'
import type { UcUser } from '../types'
import type { ModuleKeyRef } from '../../masterdata/rbacTypes'
import { ProjectsTab } from './ProjectsTab'

/**
 * Everything a person can reach, on one page and in two plain steps:
 *   1 · which modules, and at what level (closed / view / record & edit / approve / manage);
 *   2 · which projects (with a project role) — those projects appear in every module that is open to them.
 * The detailed permission matrix and system roles live in the «تکمیلی» tab for the rare exception.
 */
export function AccessLevelTab({ user }: { user: UcUser }) {
  const { modules } = useAccessData()
  const access = useUserAccess(user.id)
  const actions = useAccessActions(user.id)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const list = useMemo(() => modules.filter((m) => m.isActive && m.key !== 'admin').sort((a, b) => a.labelFa.localeCompare(b.labelFa, 'fa')), [modules])
  const levels = useMemo(() => new Map(list.map((m) => [m.key, moduleLevel(access.permCtx, m.key, access.blockedModules.has(m.key))])), [list, access])
  const open = list.filter((m) => levels.get(m.key) !== 'closed')
  const projects = access.rows.filter((r) => r.masterId && rowHasAccess(r)).length
  const members = access.rows.filter((r) => r.masterId && isMember(r)).length
  // open modules first, so what the person has is visible without scrolling
  const shown = list.filter((m) => !q.trim() || m.labelFa.includes(q.trim())).sort((a, b) => Number(levels.get(a.key) === 'closed') - Number(levels.get(b.key) === 'closed'))

  const set = async (key: ModuleKeyRef, level: AccessLevel) => {
    if (levels.get(key) === level) return
    setBusy(key)
    await actions.setLevel(key, level)
    setBusy(null)
  }

  if (user.isAdmin) return (
    <div className="flex flex-col gap-4">
      <div className="uc-card flex items-start gap-3 p-4"><CheckCircle2 size={18} style={{ color: 'var(--uc-ok)', marginTop: 3 }} /><p className="text-[13px] leading-7">این کاربر <b>مدیر سیستم</b> است و به همهٔ ماژول‌ها و همهٔ پروژه‌ها با بالاترین سطح دسترسی دارد. برای محدود کردنش، ابتدا در تب «تکمیلی» دسترسی مدیر سیستم را بردارید.</p></div>
      <ProjectsTab user={user} />
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* the whole picture in one sentence */}
      <div className="uc-card flex flex-wrap items-start gap-3 p-4">
        {open.length && projects ? <CheckCircle2 size={18} style={{ color: 'var(--uc-ok)', marginTop: 3 }} /> : <AlertTriangle size={18} style={{ color: 'var(--uc-warn)', marginTop: 3 }} />}
        <p className="min-w-0 flex-1 text-[13px] leading-7">
          <b>{user.fullName || user.email}</b> {open.length ? <>در <b>{faNum(open.length)} ماژول</b> ({open.slice(0, 4).map((m) => m.labelFa).join('، ')}{open.length > 4 ? '، …' : ''})</> : <>به هیچ ماژولی</>} و {projects ? <><b>{faNum(projects)} پروژه</b>{members !== projects ? ` (${faNum(members)} پروژه با عضویت مستقیم)` : ''}</> : <>هیچ پروژه‌ای</>} دسترسی دارد.
          {open.length > 0 && !projects && <span className="block" style={{ color: 'var(--uc-warn)' }}>ماژول باز است ولی پروژه‌ای ندارد؛ در بخش «پروژه‌ها» پایین، او را به پروژه اضافه کنید تا داده‌ای ببیند.</span>}
          {!open.length && projects > 0 && <span className="block" style={{ color: 'var(--uc-warn)' }}>عضو پروژه است ولی هیچ ماژولی برایش باز نیست؛ در بخش «ماژول‌ها» دست‌کم یک ماژول را باز کنید.</span>}
        </p>
      </div>

      <section className="uc-card overflow-hidden">
        <header className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0" style={{ maxWidth: 640 }}>
            <h3 className="uc-section-title inline-flex items-center gap-1.5"><LayoutGrid size={16} /> ۱ · ماژول‌ها و سطح دسترسی</h3>
            <p className="uc-eyebrow mt-0.5 leading-6">برای هر ماژول یک سطح انتخاب کنید. «مشاهده» فقط دیدن داده‌های پروژه‌های خودش است؛ «ثبت و ویرایش» برای کسی است که در آن ماژول کار ثبت می‌کند؛ «تأیید» برای بررسی‌کننده؛ «مدیریت» همهٔ کارها شامل حذف و تنظیمات.</p>
          </div>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute top-1/2 -translate-y-1/2" style={{ insetInlineStart: 11, color: 'var(--uc-muted)' }} />
            <input className="uc-input" style={{ paddingInlineStart: 32, minHeight: 34, width: 180 }} placeholder="جستجوی ماژول…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جستجوی ماژول" />
          </div>
        </header>
        <ul className="uc-plist">
          {shown.map((m) => {
            const lv = levels.get(m.key) ?? 'closed'
            const more = rolesAbove(access.permCtx, m.key, lv)
            return (
              <li key={m.key} className={`uc-prow uc-lvrow${lv === 'closed' ? ' is-dim' : ''}`}>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[13px]">{m.labelFa}</b>
                  <span className="uc-eyebrow">{ACCESS_LEVELS.find((l) => l.level === lv)?.hint}{more.length ? ` · نقش «${more.join('، ')}» دسترسی بیشتری هم می‌دهد` : ''}</span>
                </div>
                <div className="uc-lv" role="radiogroup" aria-label={`سطح دسترسی ${m.labelFa}`} aria-busy={busy === m.key}>
                  {ACCESS_LEVELS.map((l) => (
                    <button key={l.level} type="button" role="radio" aria-checked={lv === l.level} data-level={l.level} disabled={busy === m.key} title={l.hint} onClick={() => set(m.key as ModuleKeyRef, l.level)}>{l.label}</button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <div>
        <h3 className="uc-section-title mb-2 px-1">۲ · پروژه‌ها</h3>
        <ProjectsTab user={user} />
      </div>
    </div>
  )
}
