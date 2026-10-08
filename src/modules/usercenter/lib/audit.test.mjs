// Run: npx tsx src/modules/usercenter/lib/audit.test.mjs
import assert from 'node:assert/strict'
import { describeAudit } from './audit.ts'

const L = {
  userName: (id) => id ?? 'سیستم', projectName: (p, id) => `P:${p}:${id}`, masterProjectName: (id) => `M:${id}`, roleName: (id) => `R:${id}`,
  moduleLabel: (k) => `mod:${k}`, permission: (id) => (id === 'p1' ? { moduleKey: 'risk', action: 'approve' } : null),
  portfolioName: (id) => `PF:${id}`, programName: (id) => `PG:${id}`, projectRoleName: (id) => `PR:${id}`,
}
const e = (category, action, detail) => ({ id: 1, at: '2026-01-01T00:00:00Z', actorId: 'a', targetId: 't', category, action, detail })

let v = describeAudit(e('status', 'update', { changes: { account_status: { from: 'active', to: 'blocked' }, status_reason: { from: '', to: 'مشکوک' } } }), L)
assert.equal(v.title, 'وضعیت حساب به «مسدود» تغییر کرد'); assert.deepEqual(v.lines, ['دلیل: مشکوک']); assert.equal(v.tone, 'bad')
v = describeAudit(e('profile', 'update', { changes: { phone: { from: null, to: '0912' }, user_type: { from: 'other', to: 'owner' } } }), L)
assert.deepEqual(v.lines, ['موبایل: — ← 0912', 'نوع کاربر: سایر ← کارفرما'])
v = describeAudit(e('admin', 'update', { changes: { is_admin: { from: false, to: true } } }), L)
assert.equal(v.title, 'دسترسی مدیر سیستم داده شد')
assert.equal(describeAudit(e('role', 'insert', { row: { role_id: 'x' } }), L).title, 'نقش «R:x» افزوده شد')
assert.equal(describeAudit(e('module', 'insert', { row: { module_key: 'risk', has_access: false } }), L).title, 'دسترسی به ماژول «mod:risk» بسته شد')
assert.equal(describeAudit(e('module', 'delete', { row: { module_key: 'risk', has_access: false } }), L).title, 'دسترسی به ماژول «mod:risk» باز شد')
assert.equal(describeAudit(e('scope', 'insert', { row: { scope_level: 'portfolio', portfolio_id: 'z' } }), L).title, 'محدودهٔ دسترسی پورتفولیو «PF:z» افزوده شد')
assert.equal(describeAudit(e('permission', 'insert', { row: { permission_id: 'p1', effect: 'deny' } }), L).title, 'مجوز «تأیید — mod:risk» برای کاربر ممنوع شد')
assert.equal(describeAudit(e('permission', 'insert', { row: { permission_id: 'p1', effect: 'allow' } }), L).tone, 'direct')
v = describeAudit(e('project_rm', 'update', { row: { project_id: 'q', role: 'risk_owner' }, old: { role: 'team_member' } }), L)
assert.equal(v.title, 'نقش در پروژه «P:risk:q» (مدیریت ریسک) تغییر کرد'); assert.deepEqual(v.lines, ['عضو تیم پروژه ← مالک ریسک'])
assert.equal(describeAudit(e('project_pp', 'delete', { row: { project_id: 'q', role: 'owner' } }), L).tone, 'warn')
assert.equal(describeAudit(e('project_role', 'insert', { row: { project_role_id: 'r', project_id: 'm' } }), L).title, 'سمت «PR:r» در پروژه «M:m» ثبت شد')
assert.equal(describeAudit(e('account', 'create', {}), L).title, 'حساب کاربری ایجاد شد')
console.log('usercenter/lib/audit: all assertions passed')
