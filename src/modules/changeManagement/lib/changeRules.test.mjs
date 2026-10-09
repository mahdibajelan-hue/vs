import assert from 'node:assert/strict'
import { computeBasis, resolveRoute, validateRuleSet, withinAuthority } from './changeRules.ts'

const BASE = 7_148_000_000_000
const DUR = 577
const TODAY = '2026-06-01'
let id = 0
const route = (code, title, level) => ({ id: 'rt-' + code, ruleSetId: 'S1', code, title, mode: 'sequential', level })
const step = (rt, seq, kind, roleName, o = {}) => ({ id: 'st' + ++id, routeId: 'rt-' + rt, seq, kind, roleName, label: roleName, parallelGroup: null, slaDays: 5, requiresReference: false, ...o })
const rule = (code, dimension, routeCode, o = {}) => ({ id: 'ru-' + code, ruleSetId: 'S1', code, title: code, dimension, changeTypes: [], costBasis: 'cumulative', pctMin: null, pctMax: null, amountMin: null, amountMax: null, daysBasis: 'cumulative', daysMin: null, daysMax: null,
  daysPctMin: null, daysPctMax: null, contractTypes: [], projectIds: [], orgUnits: [], requiresOpinions: [], routeId: 'rt-' + routeCode, priority: 100, active: true, validFrom: null, validTo: null, escalateAfterDays: null, escalationRole: null, notes: '', ...o })
// same sample matrix as the seeded rule set (supabase/change_mgmt/004)
const ES = {
  set: { id: 'S1', version: 1, name: 'نمونه' },
  routes: [route('R-EXEC', 'مجری طرح', 1), route('R-BOARD', 'مدیرعامل و هیئت‌مدیره', 3), route('R-TIME-S', 'تمدید کوتاه', 2), route('R-TIME-L', 'تمدید بلند', 3)],
  steps: [
    step('R-EXEC', 1, 'opinion', 'مدیر امور پیمان'), step('R-EXEC', 2, 'approval', 'مدیر ارشد پروژه'),
    step('R-BOARD', 1, 'opinion', 'مدیر امور پیمان'), step('R-BOARD', 2, 'opinion', 'مدیر ارشد پروژه'), step('R-BOARD', 3, 'approval', 'مدیرعامل'), step('R-BOARD', 4, 'body', 'مدیرعامل', { requiresReference: true }),
    step('R-TIME-S', 1, 'opinion', 'مدیر برنامه‌ریزی و کنترل پروژه'), step('R-TIME-S', 2, 'approval', 'مدیر ارشد پروژه'),
    step('R-TIME-L', 1, 'opinion', 'مدیر برنامه‌ریزی و کنترل پروژه'), step('R-TIME-L', 2, 'opinion', 'مدیر ارشد پروژه'), step('R-TIME-L', 3, 'approval', 'مدیرعامل'),
  ],
  rules: [
    rule('C-10', 'cost', 'R-EXEC', { pctMax: 10 }), rule('C-25', 'cost', 'R-BOARD', { pctMin: 10, pctMax: 25 }), rule('T-NEW', 'type', 'R-BOARD', { changeTypes: ['new_work'], requiresOpinions: ['مدیر مهندسی'] }),
    rule('D-30', 'time', 'R-TIME-S', { daysMax: 30 }), rule('D-30P', 'time', 'R-TIME-L', { daysMin: 30 }),
  ],
}
const run = (type, costPct, days, o = {}, es = ES) => {
  const req = { masterProjectId: 'P1', changeType: type, proposedCost: BASE * costPct / 100, proposedDays: days }
  const basis = computeBasis(req, { baseAmount: BASE, durationDays: DUR, cumPrevAmount: o.prev ?? 0, cumPrevDays: o.prevDays ?? 0 })
  return resolveRoute(req, es, basis, TODAY)
}
const roles = (r) => r.route.steps.map((s) => s.role).join('>')

// ---- percentages: current AND cumulative
let r = run('additional_work', 8, 0)
assert.equal(r.status, 'resolved'); assert.equal(r.route.code, 'R-EXEC'); assert.equal(r.basis.current_pct, 8); assert.equal(r.basis.cum_pct, 8)
r = run('additional_work', 5, 0, { prev: BASE * 0.07 })                 // 7% already approved + 5% now = 12% -> board, though 5% alone is within the executive limit
assert.equal(r.basis.current_pct, 5); assert.equal(r.basis.cum_pct, 12); assert.equal(r.route.code, 'R-BOARD')
// boundaries: lower exclusive, upper inclusive
assert.equal(run('additional_work', 10, 0).route.code, 'R-EXEC'); assert.equal(run('additional_work', 10.0001, 0).route.code, 'R-BOARD'); assert.equal(run('additional_work', 25, 0).route.code, 'R-BOARD')
// above the highest rule -> stopped, never guessed
r = run('additional_work', 25.01, 0); assert.equal(r.status, 'blocked'); assert.equal(r.blockers[0].code, 'no_rule'); assert.equal(r.route, undefined)
r = run('additional_work', 30, 0); assert.equal(r.status, 'blocked')
// a decrease counts by absolute value
assert.equal(run('additional_work', -8, 0).route.code, 'R-EXEC')

// ---- new work: type rule + cost rule; the covering route wins, required opinion is added
r = run('new_work', 5, 0); assert.equal(r.status, 'resolved'); assert.equal(r.route.code, 'R-BOARD'); assert.equal(r.route.combined, false); assert.equal(roles(r), 'مدیر مهندسی>مدیر امور پیمان>مدیر ارشد پروژه>مدیرعامل>مدیرعامل')
assert.deepEqual(r.applied_rules.sort(), ['C-10', 'T-NEW'])
assert.equal(run('new_work', 0, 0).status, 'resolved')                  // type rule alone is enough when cost/time are zero

// ---- time dimension is independent
r = run('time_extension', 0, 20); assert.equal(r.route.code, 'R-TIME-S'); assert.equal(r.basis.cum_days_pct, 3.4662)
assert.equal(run('time_extension', 0, 45).route.code, 'R-TIME-L'); assert.equal(run('time_extension', 0, 30).route.code, 'R-TIME-S')
r = run('time_extension', 0, 20, { prevDays: 15 }); assert.equal(r.route.code, 'R-TIME-L')       // 15 + 20 = 35 days cumulative
// ---- cost + time: neither route covers the other -> merged, all roles present exactly once
r = run('additional_work', 8, 40); assert.equal(r.route.combined, true); assert.equal(r.route.code, 'R-EXEC+R-TIME-L'); assert.equal(roles(r), 'مدیر امور پیمان>مدیر برنامه‌ریزی و کنترل پروژه>مدیر ارشد پروژه>مدیرعامل')
// ... but when one route covers the other it is used as is
r = run('additional_work', 15, 40); assert.equal(r.route.combined, true)  // R-BOARD {contracts, senior, CEO} vs R-TIME-L {planning, senior, CEO}: not a superset either
r = run('additional_work', 8, 20); assert.equal(r.route.combined, true)  // R-EXEC vs R-TIME-S (planning) -> merged
// ---- nothing applies -> blocked, not skipped
r = run('other', 0, 0); assert.equal(r.status, 'blocked')
r = run(null, 8, 0); assert.ok(r.blockers.some((b) => b.code === 'no_type'))
// ---- no base amount: a percentage cannot be computed
{
  const req = { masterProjectId: 'P1', changeType: 'additional_work', proposedCost: 1e9, proposedDays: 0 }
  const res = resolveRoute(req, ES, computeBasis(req, { baseAmount: null, durationDays: DUR, cumPrevAmount: 0, cumPrevDays: 0 }), TODAY)
  assert.equal(res.status, 'blocked'); assert.ok(res.blockers.some((b) => b.code === 'no_base_amount'))
}
// ---- no active rule set
assert.equal(run('additional_work', 5, 0, {}, null).blockers[0].code, 'no_active_rule_set')

// ---- conflicts: same priority, overlapping range, incompatible routes -> blocked; different priority -> higher wins; compatible (superset) -> covering route
{
  const es = { ...ES, rules: [...ES.rules, rule('C-X', 'cost', 'R-TIME-S', { pctMax: 12 })] }
  r = run('additional_work', 8, 0, {}, es); assert.equal(r.status, 'blocked'); assert.equal(r.blockers[0].code, 'conflict')
  const es2 = { ...ES, rules: [...ES.rules, rule('C-X', 'cost', 'R-TIME-S', { pctMax: 12, priority: 200 })] }
  r = run('additional_work', 8, 0, {}, es2); assert.equal(r.route.code, 'R-TIME-S')
  const es3 = { ...ES, rules: [...ES.rules, rule('C-Y', 'cost', 'R-BOARD', { pctMax: 12 })] }       // R-BOARD covers R-EXEC
  r = run('additional_work', 8, 0, {}, es3); assert.equal(r.route.code, 'R-BOARD')
}
// ---- validity window / inactive rules / filters
{
  const old = { ...ES, rules: ES.rules.map((x) => (x.code === 'C-10' ? { ...x, validTo: '2026-01-01' } : x)) }
  assert.equal(run('additional_work', 8, 0, {}, old).status, 'blocked')
  const proj = { ...ES, rules: ES.rules.map((x) => (x.code === 'C-10' ? { ...x, projectIds: ['OTHER'] } : x)) }
  assert.equal(run('additional_work', 8, 0, {}, proj).status, 'blocked')
  const cur = { ...ES, rules: [rule('C-CUR', 'cost', 'R-EXEC', { costBasis: 'current', pctMax: 6 }), rule('C-CUM', 'cost', 'R-BOARD', { costBasis: 'cumulative', pctMin: 6, pctMax: 25 })] }
  assert.equal(run('additional_work', 5, 0, { prev: BASE * 0.04 }, cur).route.code, 'R-BOARD')        // current 5% fits C-CUR but cumulative 9% — C-CUR is current-based so both match? (current 5 <= 6 -> C-CUR; cum 9 -> C-CUM)
}
// ---- authority limits
assert.equal(withinAuthority({ roleName: 'x', maxCostPct: 10, maxCostAmount: null, maxDays: 30 }, { cum_pct: 9, cum_amount: 1, cum_days: 10 }).ok, true)
assert.equal(withinAuthority({ roleName: 'x', maxCostPct: 10, maxCostAmount: null, maxDays: 30 }, { cum_pct: 12, cum_amount: 1, cum_days: 10 }).ok, false)
assert.equal(withinAuthority({ roleName: 'x', maxCostPct: null, maxCostAmount: null, maxDays: 30 }, { cum_pct: 99, cum_amount: 1, cum_days: 31 }).ok, false)
assert.equal(withinAuthority(null, { cum_pct: 99, cum_amount: 1, cum_days: 99 }).ok, true)

// ---- validation of a rule set before activation
const known = ['مدیر امور پیمان', 'مدیر ارشد پروژه', 'مدیرعامل', 'مدیر برنامه‌ریزی و کنترل پروژه', 'مدیر مهندسی']
let v = validateRuleSet(ES, known); assert.ok(!v.some((x) => x.level === 'error')); assert.ok(v.some((x) => x.code === 'open_above'))
v = validateRuleSet({ ...ES, rules: [...ES.rules, rule('C-X', 'cost', 'R-TIME-S', { pctMax: 12 })] }, known); assert.ok(v.some((x) => x.code === 'overlap'))
v = validateRuleSet({ ...ES, routes: [...ES.routes, route('R-EMPTY', 'خالی', 1)] }, known); assert.ok(v.some((x) => x.code === 'empty_route'))
v = validateRuleSet(ES, ['مدیرعامل']); assert.ok(v.some((x) => x.code === 'unknown_role'))
assert.ok(validateRuleSet({ ...ES, rules: [] }, known).some((x) => x.code === 'no_rules'))
console.log('change rules ok')
