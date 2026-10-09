import type { AuthorityLimit, Basis, Blocker, ChangeType, DimensionTrace, ResolvedStep, Route, RouteResolution, RouteStep, Rule, RuleDimension, RuleSet, ValidationIssue } from '../types'

/** Pure mirror of the server function `cm_resolve_core` (used for the live preview in the form and for tests).
 *  The SERVER result is the one that counts: it is stored as the request's route snapshot.
 *  Convention: lower bound EXCLUSIVE, upper bound INCLUSIVE — "up to 10%" = pct <= 10; "over 10 up to 25" = pct > 10 && pct <= 25. */

export interface EngineRequest { id?: string; masterProjectId: string; changeType: ChangeType | null; proposedCost: number; proposedDays: number; orgUnit?: string; contractType?: string | null }
export interface BasisInput { baseAmount: number | null; baseSource?: string; durationDays: number | null; durationSource?: string; cumPrevAmount: number; cumPrevDays: number; pendingOtherAmount?: number }
export interface EngineRuleSet { set: Pick<RuleSet, 'id' | 'version' | 'name'>; routes: Route[]; steps: RouteStep[]; rules: Rule[] }

const r4 = (n: number) => Math.round(n * 10000) / 10000

export function computeBasis(req: EngineRequest, b: BasisInput): Basis {
  const cost = req.proposedCost || 0, days = req.proposedDays || 0
  const base = b.baseAmount && b.baseAmount > 0 ? b.baseAmount : null
  const dur = b.durationDays && b.durationDays > 0 ? b.durationDays : null
  const pend = b.pendingOtherAmount ?? 0
  return {
    base_amount: base, base_source: b.baseSource ?? 'none', duration_days: dur, duration_source: b.durationSource ?? 'none', current_cost: cost,
    current_pct: base ? r4(Math.abs(cost) / base * 100) : null, cum_prev_amount: b.cumPrevAmount, cum_amount: b.cumPrevAmount + Math.abs(cost), cum_pct: base ? r4((b.cumPrevAmount + Math.abs(cost)) / base * 100) : null,
    pending_other_amount: pend, pending_pct: base ? r4((b.cumPrevAmount + Math.abs(cost) + pend) / base * 100) : null,
    current_days: days, current_days_pct: dur ? r4(Math.abs(days) / dur * 100) : null, cum_prev_days: b.cumPrevDays, cum_days: b.cumPrevDays + Math.abs(days), cum_days_pct: dur ? r4((b.cumPrevDays + Math.abs(days)) / dur * 100) : null,
    change_type: req.changeType, contract_type: req.contractType ?? null,
  }
}

const within = (v: number, lo: number | null, hi: number | null) => (lo == null || v > lo) && (hi == null || v <= hi)
const subset = (a: string[], b: string[]) => a.every((x) => b.includes(x))
const kindRank = { opinion: 1, approval: 2, body: 3 } as const

export function routeRoles(es: EngineRuleSet, routeId: string): string[] {
  return [...new Set(es.steps.filter((s) => s.routeId === routeId).map((s) => s.roleName))]
}

function ruleMatches(rule: Rule, d: RuleDimension, req: EngineRequest, b: Basis, today: string): boolean {
  if (!rule.active || rule.dimension !== d) return false
  if (rule.validFrom && rule.validFrom > today) return false
  if (rule.validTo && rule.validTo < today) return false
  if (rule.changeTypes.length && (!req.changeType || !rule.changeTypes.includes(req.changeType))) return false
  if (rule.projectIds.length && !rule.projectIds.includes(req.masterProjectId)) return false
  if (rule.orgUnits.length && !rule.orgUnits.includes(req.orgUnit ?? '')) return false
  if (rule.contractTypes.length && !rule.contractTypes.includes(b.contract_type ?? '')) return false
  if (d === 'type') return true
  if (d === 'cost') {
    if (rule.pctMin == null && rule.pctMax == null ? false : b.current_pct == null) return false
    const pct = rule.costBasis === 'current' ? b.current_pct : b.cum_pct
    const amt = rule.costBasis === 'current' ? Math.abs(b.current_cost) : b.cum_amount
    if ((rule.pctMin != null || rule.pctMax != null) && pct == null) return false
    return within(pct ?? 0, rule.pctMin, rule.pctMax) && within(amt, rule.amountMin, rule.amountMax)
  }
  const dd = rule.daysBasis === 'current' ? Math.abs(b.current_days) : b.cum_days
  const dp = rule.daysBasis === 'current' ? b.current_days_pct : b.cum_days_pct
  if ((rule.daysPctMin != null || rule.daysPctMax != null) && dp == null) return false
  return within(dd, rule.daysMin, rule.daysMax) && within(dp ?? 0, rule.daysPctMin, rule.daysPctMax)
}

export function resolveRoute(req: EngineRequest, es: EngineRuleSet | null, basis: Basis, today: string): RouteResolution {
  if (!es) return { status: 'blocked', basis, dimensions: [], blockers: [{ code: 'no_active_rule_set', message: 'هیچ مجموعه قاعدهٔ فعالی تعریف نشده است؛ مدیر سامانه باید قواعد تصویب را فعال کند.' }] }
  const cost = req.proposedCost || 0, days = req.proposedDays || 0
  const blockers: Blocker[] = []
  if (!req.changeType) blockers.push({ code: 'no_type', message: 'نوع تغییر مشخص نشده است.' })
  if (cost !== 0 && !(basis.base_amount && basis.base_amount > 0)) blockers.push({ code: 'no_base_amount', dimension: 'cost', message: 'مبلغ پایهٔ قرارداد مشخص نیست؛ درصد تغییر قابل محاسبه نیست. قرارداد یا مبلغ اولیهٔ پروژه را در داده‌های پایه ثبت کنید.' })
  const dims: DimensionTrace[] = []
  const chosenRoutes: string[] = []
  const codes: string[] = []
  const opinions: string[] = []
  let escDays: number | null = null, escRole: string | null = null
  const routeById = new Map(es.routes.map((r) => [r.id, r]))
  for (const d of ['cost', 'time', 'type'] as RuleDimension[]) {
    const applicable = d === 'cost' ? cost !== 0 : d === 'time' ? days !== 0 : true
    const matched = applicable ? es.rules.filter((x) => x.ruleSetId === es.set.id && ruleMatches(x, d, req, basis, today)).sort((a, b) => b.priority - a.priority || a.code.localeCompare(b.code)) : []
    const trace = (chosen: string | null): DimensionTrace => ({ dimension: d, applicable, matched: matched.map((m) => ({ code: m.code, title: m.title, priority: m.priority, route: routeById.get(m.routeId)?.code ?? '' })), chosen: chosen ? { route: chosen } : null })
    if (!matched.length) {
      dims.push(trace(null))
      if (applicable && d !== 'type' && !(d === 'cost' && !(basis.base_amount && basis.base_amount > 0))) {
        blockers.push({ code: 'no_rule', dimension: d, message: d === 'cost' ? `هیچ قاعدهٔ تصویب برای تغییر هزینه‌ای با ${basis.cum_pct ?? '؟'}٪ تجمعی (${basis.current_pct ?? '؟'}٪ جاری) تعریف نشده است؛ مسیر تصویب حدسی انتخاب نمی‌شود.` : `هیچ قاعدهٔ تصویب برای تغییر زمانی با ${Math.trunc(basis.cum_days)} روز تجمعی تعریف نشده است؛ مسیر تصویب حدسی انتخاب نمی‌شود.` })
      }
      continue
    }
    const top = matched[0].priority
    const group = matched.filter((m) => m.priority === top)
    const routes = [...new Set(group.map((m) => m.routeId))]
    let cover: string | null = null
    if (routes.length === 1) cover = routes[0]
    else for (const c of routes) if (routes.every((o) => subset(routeRoles(es, o), routeRoles(es, c)))) { cover = c; break }
    if (!cover) {
      blockers.push({ code: 'conflict', dimension: d, message: `تعارض قواعد: چند قاعدهٔ هم‌اولویت (${group.map((g) => g.code).join('، ')}) با مسیرهای ناهمخوان برای بُعد «${d === 'cost' ? 'هزینه' : d === 'time' ? 'زمان' : 'نوع تغییر'}» اعمال می‌شوند؛ مدیر سامانه باید اولویت یا بازه‌ها را اصلاح کند.` })
      dims.push(trace(null))
    } else {
      chosenRoutes.push(cover)
      for (const m of group) {
        codes.push(m.code); opinions.push(...m.requiresOpinions)
        if (m.escalateAfterDays != null) { escDays = escDays == null ? m.escalateAfterDays : Math.min(escDays, m.escalateAfterDays); escRole = escRole ?? m.escalationRole }
      }
      dims.push(trace(routeById.get(cover)?.code ?? null))
    }
  }
  if (!chosenRoutes.length && !blockers.length) blockers.push({ code: 'no_rule', dimension: 'any', message: 'برای این تغییر هیچ قاعدهٔ تصویبی اعمال نمی‌شود (مبلغ و زمان صفر و بدون قاعدهٔ نوع)؛ مسیر حدسی انتخاب نمی‌شود.' })
  const ruleSet = { id: es.set.id, version: es.set.version, name: es.set.name }
  if (blockers.length) return { status: 'blocked', rule_set: ruleSet, basis, dimensions: dims, blockers }

  const chosen = [...new Set(chosenRoutes)]
  let cover: string | null = null
  for (const c of chosen) {
    if (chosen.every((o) => subset(routeRoles(es, o), routeRoles(es, c))) && (cover == null || (routeById.get(c)!.level > routeById.get(cover)!.level))) cover = c
  }
  let steps: ResolvedStep[]; let route: NonNullable<RouteResolution['route']>
  const byLevel = [...chosen].sort((a, b) => routeById.get(a)!.level - routeById.get(b)!.level || routeById.get(a)!.code.localeCompare(routeById.get(b)!.code))
  if (cover) {
    const rt = routeById.get(cover)!
    steps = es.steps.filter((s) => s.routeId === cover).sort((a, b) => a.seq - b.seq).map((s) => ({ kind: s.kind, role: s.roleName, label: s.label, sla_days: s.slaDays, requires_reference: s.requiresReference, route: rt.code, pg: s.parallelGroup }))
    route = { code: rt.code, title: rt.title, mode: rt.mode, level: rt.level, combined: false, steps, reason: chosen.length > 1 ? `مسیر «${rt.title}» همهٔ الزامات مسیرهای هزینه/زمان/نوع را پوشش می‌دهد و انتخاب شد.` : `مسیر «${rt.title}» طبق قواعد ${codes.join('، ')} انتخاب شد.` }
  } else {
    const raw = chosen.flatMap((id) => { const rt = routeById.get(id)!; return es.steps.filter((s) => s.routeId === id).map((s) => ({ s, rt })) })
    const best = new Map<string, { s: RouteStep; rt: Route }>()
    for (const x of raw.sort((a, b) => kindRank[b.s.kind] - kindRank[a.s.kind] || b.rt.level - a.rt.level || a.s.seq - b.s.seq)) if (!best.has(x.s.roleName)) best.set(x.s.roleName, x)
    steps = [...best.values()].sort((a, b) => kindRank[a.s.kind] - kindRank[b.s.kind] || a.rt.level - b.rt.level || a.s.seq - b.s.seq)
      .map(({ s, rt }) => ({ kind: s.kind, role: s.roleName, label: s.label, sla_days: s.slaDays, requires_reference: s.requiresReference, route: rt.code, pg: null }))
    route = { code: byLevel.map((id) => routeById.get(id)!.code).join('+'), title: 'مسیر ترکیبی: ' + byLevel.map((id) => routeById.get(id)!.title).join(' + '), mode: 'sequential', level: Math.max(...chosen.map((id) => routeById.get(id)!.level)), combined: true, steps,
      reason: `هیچ‌یک از مسیرهای انتخاب‌شده (${byLevel.map((id) => routeById.get(id)!.code).join('، ')}) به‌تنهایی همهٔ مراجع لازم را پوشش نمی‌دهد؛ مراحل ادغام شد (قواعد: ${codes.join('، ')}).` }
  }
  const have = new Set(steps.map((s) => s.role))
  for (const role of [...new Set(opinions)].filter((r) => !have.has(r)).reverse()) steps = [{ kind: 'opinion', role, label: 'نظر تخصصی الزامی (طبق قاعده)', sla_days: 5, requires_reference: false, route: 'rule', pg: null }, ...steps]
  route = { ...route, steps }
  if (!steps.length) return { status: 'blocked', rule_set: ruleSet, basis, dimensions: dims, blockers: [{ code: 'empty_route', message: 'مسیر انتخاب‌شده هیچ مرحله‌ای ندارد؛ تعریف مسیر ناقص است.' }] }
  return { status: 'resolved', rule_set: ruleSet, basis, dimensions: dims, blockers: [], route, applied_rules: codes, escalate_after_days: escDays, escalation_role: escRole }
}

/** Would this approver's personal limit cover the request? (server: cm_decide_step → beyond_authority_limit) */
export function withinAuthority(limit: AuthorityLimit | null, basis: Pick<Basis, 'cum_pct' | 'cum_amount' | 'cum_days'>): { ok: boolean; reason?: string } {
  if (!limit) return { ok: true }
  if (limit.maxCostPct != null && (basis.cum_pct ?? 0) > limit.maxCostPct) return { ok: false, reason: `درصد تجمعی ${basis.cum_pct}٪ از سقف اختیار این نقش (${limit.maxCostPct}٪) بیشتر است` }
  if (limit.maxCostAmount != null && basis.cum_amount > limit.maxCostAmount) return { ok: false, reason: 'مبلغ تجمعی از سقف اختیار این نقش بیشتر است' }
  if (limit.maxDays != null && basis.cum_days > limit.maxDays) return { ok: false, reason: `تمدید تجمعی ${basis.cum_days} روز از سقف اختیار این نقش (${limit.maxDays}) بیشتر است` }
  return { ok: true }
}

/** Static checks shown in the editor before a rule set can be activated (server: cm_validate_rule_set). */
export function validateRuleSet(es: EngineRuleSet, knownRoles: string[]): ValidationIssue[] {
  const out: ValidationIssue[] = []
  const rules = es.rules.filter((r) => r.active)
  if (!rules.length) out.push({ level: 'error', code: 'no_rules', message: 'مجموعه هیچ قاعدهٔ فعالی ندارد.' })
  for (const rt of es.routes) if (!es.steps.some((s) => s.routeId === rt.id)) out.push({ level: 'error', code: 'empty_route', message: `مسیر «${rt.title}» هیچ مرحله‌ای ندارد.` })
  for (const role of new Set(es.steps.filter((s) => s.kind !== 'body').map((s) => s.roleName))) if (!knownRoles.includes(role)) out.push({ level: 'warn', code: 'unknown_role', message: `نقش «${role}» در مدیریت کاربران تعریف نشده است؛ هیچ‌کس نمی‌تواند این مرحله را تصمیم بگیرد.` })
  for (let i = 0; i < rules.length; i++) for (let j = i + 1; j < rules.length; j++) {
    const a = rules[i], b = rules[j]
    if (a.dimension !== b.dimension || a.priority !== b.priority || a.dimension === 'type') continue
    if (a.changeTypes.length && b.changeTypes.length && !a.changeTypes.some((t) => b.changeTypes.includes(t))) continue
    let lo: number, hi: number
    if (a.dimension === 'cost') { if (a.costBasis !== b.costBasis) continue; lo = Math.max(a.pctMin ?? -1e18, b.pctMin ?? -1e18); hi = Math.min(a.pctMax ?? 1e18, b.pctMax ?? 1e18) }
    else { if (a.daysBasis !== b.daysBasis) continue; lo = Math.max(a.daysMin ?? -1e18, b.daysMin ?? -1e18); hi = Math.min(a.daysMax ?? 1e18, b.daysMax ?? 1e18) }
    const ra = routeRoles(es, a.routeId), rb = routeRoles(es, b.routeId)
    if (lo < hi && !(subset(ra, rb) || subset(rb, ra))) out.push({ level: 'error', code: 'overlap', message: `قواعد ${a.code} و ${b.code} هم‌اولویت‌اند، بازه‌هایشان هم‌پوشانی دارد و مسیرهایشان ناهمخوان است.` })
  }
  for (const basis of ['cumulative', 'current'] as const) {
    const cr = rules.filter((r) => r.dimension === 'cost' && r.costBasis === basis)
    if (cr.length && cr.every((r) => r.pctMax != null)) out.push({ level: 'warn', code: 'open_above', message: `بالاتر از ${Math.max(...cr.map((r) => r.pctMax!))}٪ (مبنای ${basis === 'cumulative' ? 'تجمعی' : 'جاری'}) هیچ قاعدهٔ هزینه‌ای نیست؛ چنین درخواست‌هایی متوقف می‌شوند تا مدیر تعیین تکلیف کند.` })
  }
  return out
}
