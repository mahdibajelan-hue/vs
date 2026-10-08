import type { AuditCategory, AuditEntry, ProductKey } from '../types'
import { PRODUCT_LABEL, STATUS_LABEL, USER_TYPE_LABEL, type AccountStatus, type UserType } from '../types'
import { ALL_ACTIONS } from './access'
import { roleLabel } from './productRoles'

export interface AuditLookups {
  userName: (id: string | null) => string
  projectName: (product: ProductKey, id: string) => string
  masterProjectName: (id: string) => string
  roleName: (id: string) => string
  moduleLabel: (key: string) => string
  /** permission id -> { moduleKey, action } */
  permission: (id: string) => { moduleKey: string; action: string } | null
  portfolioName: (id: string) => string
  programName: (id: string) => string
  projectRoleName: (id: string) => string
}

export type AuditTone = 'ok' | 'warn' | 'bad' | 'info' | 'direct' | 'accent' | 'neutral'
export interface AuditView {
  icon: 'user' | 'edit' | 'power' | 'shield' | 'role' | 'module' | 'scope' | 'permission' | 'project' | 'key'
  tone: AuditTone
  title: string
  lines: string[]
}

const FIELD_LABEL: Record<string, string> = {
  full_name: 'نام',
  position_title: 'سمت',
  phone: 'موبایل',
  organization: 'شرکت / سازمان',
  user_type: 'نوع کاربر',
  account_status: 'وضعیت حساب',
  status_reason: 'دلیل',
  is_admin: 'مدیر سیستم',
  email: 'ایمیل',
}

const fmtValue = (field: string, v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—'
  if (field === 'user_type') return USER_TYPE_LABEL[v as UserType] ?? String(v)
  if (field === 'account_status') return STATUS_LABEL[v as AccountStatus] ?? String(v)
  if (field === 'is_admin') return v ? 'بله' : 'خیر'
  return String(v)
}

const actionLabel = (action: string) => ALL_ACTIONS.find((a) => a.action === action)?.label ?? action
const PRODUCT_OF: Partial<Record<AuditCategory, ProductKey>> = { project_pp: 'pipepulse', project_rm: 'risk', project_im: 'issues' }
const row = (e: AuditEntry) => (e.detail.row ?? {}) as Record<string, unknown>
const old = (e: AuditEntry) => (e.detail.old ?? {}) as Record<string, unknown>
const s = (v: unknown) => (typeof v === 'string' ? v : '')

export function describeAudit(e: AuditEntry, L: AuditLookups): AuditView {
  const r = row(e)
  switch (e.category) {
    case 'account':
      return { icon: 'user', tone: 'ok', title: 'حساب کاربری ایجاد شد', lines: [] }

    case 'profile':
    case 'status':
    case 'admin': {
      const changes = (e.detail.changes ?? {}) as Record<string, { from: unknown; to: unknown }>
      const lines = Object.entries(changes)
        .filter(([k]) => k !== 'status_reason' || !('account_status' in changes))
        .map(([k, c]) => `${FIELD_LABEL[k] ?? k}: ${fmtValue(k, c.from)} ← ${fmtValue(k, c.to)}`)
      if (e.category === 'status') {
        const to = changes.account_status?.to as AccountStatus
        const reason = s(changes.status_reason?.to)
        return { icon: 'power', tone: to === 'active' ? 'ok' : to === 'blocked' ? 'bad' : 'warn', title: `وضعیت حساب به «${STATUS_LABEL[to] ?? to}» تغییر کرد`, lines: reason ? [`دلیل: ${reason}`] : [] }
      }
      if (e.category === 'admin') {
        const on = !!changes.is_admin?.to
        return { icon: 'shield', tone: on ? 'warn' : 'info', title: on ? 'دسترسی مدیر سیستم داده شد' : 'دسترسی مدیر سیستم برداشته شد', lines: lines.filter((l) => !l.startsWith('مدیر سیستم')) }
      }
      return { icon: 'edit', tone: 'info', title: 'اطلاعات کاربر ویرایش شد', lines }
    }

    case 'role': {
      const name = L.roleName(s(r.role_id))
      return e.action === 'delete'
        ? { icon: 'role', tone: 'warn', title: `نقش «${name}» برداشته شد`, lines: [] }
        : { icon: 'role', tone: 'ok', title: `نقش «${name}» افزوده شد`, lines: [] }
    }

    case 'module': {
      const mod = L.moduleLabel(s(r.module_key))
      const closed = e.action !== 'delete' && r.has_access === false
      return closed
        ? { icon: 'module', tone: 'bad', title: `دسترسی به ماژول «${mod}» بسته شد`, lines: [] }
        : { icon: 'module', tone: 'ok', title: `دسترسی به ماژول «${mod}» باز شد`, lines: [] }
    }

    case 'scope': {
      const level = s(r.scope_level)
      const what = level === 'all' ? 'همهٔ پروژه‌ها' : level === 'portfolio' ? `پورتفولیو «${L.portfolioName(s(r.portfolio_id))}»` : level === 'program' ? `طرح «${L.programName(s(r.program_id))}»` : level === 'project' ? `پروژه «${L.masterProjectName(s(r.project_id))}»` : `محدودهٔ ${level}`
      return e.action === 'delete'
        ? { icon: 'scope', tone: 'warn', title: `محدودهٔ دسترسی ${what} برداشته شد`, lines: [] }
        : { icon: 'scope', tone: 'ok', title: `محدودهٔ دسترسی ${what} افزوده شد`, lines: [] }
    }

    case 'permission': {
      const p = L.permission(s(r.permission_id))
      const label = p ? `${actionLabel(p.action)} — ${L.moduleLabel(p.moduleKey)}` : 'مجوز'
      if (e.action === 'delete') return { icon: 'permission', tone: 'info', title: `مورد اختصاصی «${label}» برداشته شد و به حالت نقش‌ها برگشت`, lines: [] }
      return r.effect === 'deny'
        ? { icon: 'permission', tone: 'bad', title: `مجوز «${label}» برای کاربر ممنوع شد`, lines: [] }
        : { icon: 'permission', tone: 'direct', title: `مجوز «${label}» به‌صورت اختصاصی داده شد`, lines: [] }
    }

    case 'project_pp':
    case 'project_rm':
    case 'project_im': {
      const product = PRODUCT_OF[e.category]!
      const project = L.projectName(product, s(r.project_id))
      const where = `پروژه «${project}» (${PRODUCT_LABEL[product]})`
      if (e.action === 'delete') return { icon: 'project', tone: 'warn', title: `دسترسی به ${where} حذف شد`, lines: [] }
      if (e.action === 'update') return { icon: 'project', tone: 'info', title: `نقش در ${where} تغییر کرد`, lines: [`${roleLabel(product, s(old(e).role))} ← ${roleLabel(product, s(r.role))}`] }
      return { icon: 'project', tone: 'ok', title: `به ${where} با نقش «${roleLabel(product, s(r.role))}» افزوده شد`, lines: [] }
    }

    case 'project_role': {
      const name = L.projectRoleName(s(r.project_role_id))
      const project = L.masterProjectName(s(r.project_id))
      return e.action === 'delete'
        ? { icon: 'key', tone: 'warn', title: `سمت «${name}» در پروژه «${project}» برداشته شد`, lines: [] }
        : { icon: 'key', tone: 'ok', title: `سمت «${name}» در پروژه «${project}» ثبت شد`, lines: [] }
    }
  }
}
