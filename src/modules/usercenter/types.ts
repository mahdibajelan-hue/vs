import type { ScopeLevel } from '../masterdata/rbacTypes'

export type AccountStatus = 'active' | 'disabled' | 'blocked'
export type UserType = 'project_manager' | 'owner' | 'consultant' | 'contractor' | 'supervisor' | 'other'
export type ProductKey = 'pipepulse' | 'risk' | 'issues'

export const USER_TYPES: UserType[] = ['project_manager', 'owner', 'consultant', 'contractor', 'supervisor', 'other']
export const USER_TYPE_LABEL: Record<UserType, string> = {
  project_manager: 'مدیر پروژه',
  owner: 'کارفرما',
  consultant: 'مشاور',
  contractor: 'پیمانکار',
  supervisor: 'ناظر',
  other: 'سایر',
}
export const USER_TYPE_HINT: Record<UserType, string> = {
  project_manager: 'مسئول اجرای پروژه و هماهنگی تیم‌ها',
  owner: 'نماینده سازمان مالک پروژه',
  consultant: 'بازبین و تأییدکنندهٔ فنی',
  contractor: 'اجراکنندهٔ کار و ثبت‌کنندهٔ داده',
  supervisor: 'ناظر و بازرس کیفیت یا پیشرفت',
  other: 'سایر نقش‌ها و همکاران پشتیبان',
}

export const STATUS_LABEL: Record<AccountStatus, string> = { active: 'فعال', disabled: 'غیرفعال', blocked: 'مسدود' }
export const STATUS_HINT: Record<AccountStatus, string> = {
  active: 'کاربر می‌تواند وارد شود و طبق دسترسی‌هایش کار کند.',
  disabled: 'ورود موقتاً بسته است؛ همهٔ دسترسی‌ها و سوابق می‌مانند و هر زمان قابل بازگشت است.',
  blocked: 'ورود به دلیل مسئلهٔ امنیتی یا انضباطی بسته شده است و دلیل آن ثبت می‌شود.',
}

export const PRODUCT_LABEL: Record<ProductKey, string> = { pipepulse: 'PipePulse', risk: 'مدیریت ریسک', issues: 'مدیریت مسائل' }
export const PRODUCTS: ProductKey[] = ['pipepulse', 'risk', 'issues']

export interface UcUser {
  id: string
  email: string
  fullName: string
  positionTitle: string
  phone: string
  organization: string
  userType: UserType
  isAdmin: boolean
  avatarUrl: string
  profileCompleted: boolean
  accountStatus: AccountStatus
  statusReason: string
  statusChangedAt: string | null
  statusChangedBy: string | null
  createdAt: string
  /** From auth.users (admin-only RPC) — null when never signed in or the RPC is unavailable. */
  lastSignInAt: string | null
  authCreatedAt: string | null
  bannedUntil: string | null
  emailConfirmed: boolean
}

export interface UcProject {
  product: ProductKey
  id: string
  name: string
}

export interface Membership {
  product: ProductKey
  projectId: string
  userId: string
  role: string
}

export type OverrideEffect = 'allow' | 'deny'
export interface PermissionOverride {
  userId: string
  permissionId: string
  effect: OverrideEffect
  note: string
  createdAt: string
}

export type AuditCategory = 'account' | 'profile' | 'status' | 'admin' | 'role' | 'module' | 'scope' | 'permission' | 'project_pp' | 'project_rm' | 'project_im' | 'project_role'

export interface AuditEntry {
  id: number
  at: string
  actorId: string | null
  targetId: string | null
  category: AuditCategory
  action: 'insert' | 'update' | 'delete' | 'create'
  detail: Record<string, unknown>
}

export type { ScopeLevel }
