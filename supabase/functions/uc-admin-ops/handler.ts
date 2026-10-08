/**
 * Admin-only account operations that need the service-role key and therefore cannot run in the browser:
 * create a user, set a user's password, and block / unblock sign-in at the auth layer.
 *
 * Kept free of Deno / Supabase imports (everything it touches arrives through `Deps`) so the same file can be
 * unit-tested in Node with fakes — see supabase/functions/uc-admin-ops/handler.test.mjs.
 */

export interface AuthResult<T> {
  data: T
  error: { message: string } | null
}

export interface Deps {
  /** Verifies the caller's JWT and returns their user id (null when invalid). */
  verifyToken(jwt: string): Promise<string | null>
  /** True only for a profile that is an admin AND currently active. */
  isActiveAdmin(userId: string): Promise<boolean>
  createUser(args: { email: string; password: string; email_confirm: boolean; user_metadata: Record<string, unknown> }): Promise<AuthResult<{ user: { id: string } | null }>>
  inviteUserByEmail(email: string, data: Record<string, unknown>): Promise<AuthResult<{ user: { id: string } | null }>>
  updateUserById(id: string, attrs: { password?: string; ban_duration?: string }): Promise<AuthResult<unknown>>
  updateProfile(id: string, patch: Record<string, unknown>): Promise<{ error: { message: string } | null }>
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const USER_TYPES = ['project_manager', 'owner', 'consultant', 'contractor', 'supervisor', 'other']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const MIN_PASSWORD = 8

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const str = (v: unknown, max = 200): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' })

  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') ?? '')
  if (!bearer) return json(401, { ok: false, error: 'نشست معتبر نیست' })
  const callerId = await deps.verifyToken(bearer[1]).catch(() => null)
  if (!callerId) return json(401, { ok: false, error: 'نشست معتبر نیست' })
  if (!(await deps.isActiveAdmin(callerId).catch(() => false))) return json(403, { ok: false, error: 'فقط مدیر سیستم مجاز به این عملیات است' })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return json(400, { ok: false, error: 'درخواست نامعتبر است' })
  }

  switch (body.action) {
    case 'create_user': {
      const email = str(body.email, 254).toLowerCase()
      const password = typeof body.password === 'string' ? body.password : ''
      const fullName = str(body.full_name)
      const userType = str(body.user_type) || 'other'
      if (!EMAIL_RE.test(email)) return json(400, { ok: false, error: 'ایمیل معتبر نیست' })
      if (!fullName) return json(400, { ok: false, error: 'نام و نام خانوادگی را وارد کنید' })
      if (!USER_TYPES.includes(userType)) return json(400, { ok: false, error: 'نوع کاربر نامعتبر است' })
      if (password && password.length < MIN_PASSWORD) return json(400, { ok: false, error: `رمز عبور باید حداقل ${MIN_PASSWORD} کاراکتر باشد` })

      // With a password the account is usable immediately; without one the person gets an invitation e-mail.
      const created = password
        ? await deps.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } })
        : await deps.inviteUserByEmail(email, { full_name: fullName })
      const id = created.data?.user?.id
      if (created.error || !id) {
        const dup = /already|registered|exists/i.test(created.error?.message ?? '')
        return json(dup ? 409 : 500, { ok: false, error: dup ? 'برای این ایمیل قبلاً حساب ساخته شده است' : 'ساخت حساب انجام نشد — ' + (created.error?.message ?? 'خطای ناشناخته') })
      }
      const patch: Record<string, unknown> = {
        full_name: fullName,
        position_title: str(body.position_title),
        phone: str(body.phone, 40),
        organization: str(body.organization),
        user_type: userType,
      }
      if (body.is_admin === true) patch.is_admin = true
      const upd = await deps.updateProfile(id, patch)
      if (upd.error) return json(500, { ok: false, id, error: 'حساب ساخته شد ولی ثبت مشخصات انجام نشد — ' + upd.error.message })
      return json(200, { ok: true, id, invited: !password })
    }

    case 'set_password': {
      const userId = str(body.user_id)
      const password = typeof body.password === 'string' ? body.password : ''
      if (!UUID_RE.test(userId)) return json(400, { ok: false, error: 'شناسه کاربر نامعتبر است' })
      if (password.length < MIN_PASSWORD) return json(400, { ok: false, error: `رمز عبور باید حداقل ${MIN_PASSWORD} کاراکتر باشد` })
      const res = await deps.updateUserById(userId, { password })
      if (res.error) return json(500, { ok: false, error: 'تغییر رمز انجام نشد — ' + res.error.message })
      return json(200, { ok: true })
    }

    case 'set_ban': {
      const userId = str(body.user_id)
      if (!UUID_RE.test(userId)) return json(400, { ok: false, error: 'شناسه کاربر نامعتبر است' })
      if (userId === callerId) return json(400, { ok: false, error: 'نمی‌توانید ورود حساب خودتان را مسدود کنید' })
      const res = await deps.updateUserById(userId, { ban_duration: body.banned === true ? '876000h' : 'none' })
      if (res.error) return json(500, { ok: false, error: 'تغییر وضعیت ورود انجام نشد — ' + res.error.message })
      return json(200, { ok: true })
    }

    default:
      return json(400, { ok: false, error: 'عملیات ناشناخته است' })
  }
}
