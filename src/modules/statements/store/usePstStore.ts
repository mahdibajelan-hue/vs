import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useExecutionStore } from '../../execution/store/useExecutionStore'
import { useEpcStore } from '../../execution/store/useEpcStore'
import { executionCore } from '../../execution/lib/executionCore'
import { effectiveBase } from '../../execution/lib/progress'
import { buildStatement } from '../../execution/lib/statement'
import {
  buildC, buildE, buildP, DEFAULT_ENG_SPLIT, DEFAULT_PAY_STEPS, totals, withPrevious,
  type Built, type EngStep, type GenLine, type MatItem, type MatStage, type Part, type PaySeq, type PayStep, type Period, type Rates, type StStatus, type Totals,
} from '../lib/stmtCore'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const n = (v: unknown) => (v == null || v === '' ? 0 : Number(v))
const nn = (v: unknown) => (v == null || v === '' ? null : Number(v))

export interface Contract { id: string; no: string; title: string; type: string; value: number; amendments: number; cap: number; advPct: number; retPct: number; currency: string }
export interface Cfg { contractId: string; capE: number | null; capP: number | null; capC: number | null; advRecoveryPct: number; retPct: number; taxPct: number; insPct: number; engSplit: EngStep[]; eDocContract: string | null; pPackages: string[] | null; cBooks: string[] | null; saved: boolean }
export interface Statement {
  id: string; contractId: string; part: Part; no: number; periodKey: string; from: string; to: string; status: StStatus; gen: number
  cumSys: number; cumAmount: number; prevAmount: number; thisAmount: number; cap: number | null; deductions: Totals['deductions']; payable: number
  note: string; rejectReason: string; finCertificateId: string | null; createdAt: string; submittedAt: string | null; approvedAt: string | null; postedAt: string | null
}
export interface Line extends GenLine { id: string; statementId: string }
export interface Preview { contract: Contract; part: Part; period: Period; built: Built; lines: GenLine[]; totals: Totals; prev: Statement | null; rates: Rates; advanceLeft: number }
export interface Lookups { groups: { id: string; title: string }[]; materials: { id: string; code: string; title: string; groupId: string | null }[]; packages: { id: string; code: string; title: string }[]; books: { id: string; title: string }[]; docContracts: string[] }

const cfgDefault = (c: Contract): Cfg => ({ contractId: c.id, capE: null, capP: null, capC: null, advRecoveryPct: c.advPct || 10, retPct: c.retPct || 5, taxPct: 2.5, insPct: 5, engSplit: DEFAULT_ENG_SPLIT, eDocContract: null, pPackages: null, cBooks: null, saved: false })
const stmtRow = (r: Row): Statement => ({
  id: r.id, contractId: r.contract_id, part: r.part, no: r.no, periodKey: r.period_key, from: r.period_from, to: r.period_to, status: r.status, gen: r.gen ?? 1,
  cumSys: n(r.cum_sys), cumAmount: n(r.cum_amount), prevAmount: n(r.prev_amount), thisAmount: n(r.this_amount), cap: nn(r.cap),
  deductions: { advance: n(r.deductions?.advance), retention: n(r.deductions?.retention), tax: n(r.deductions?.tax), insurance: n(r.deductions?.insurance), total: n(r.deductions?.total) },
  payable: n(r.payable), note: r.note ?? '', rejectReason: r.reject_reason ?? '', finCertificateId: r.fin_certificate_id, createdAt: r.created_at, submittedAt: r.submitted_at, approvedAt: r.approved_at, postedAt: r.posted_at,
})
const lineRow = (r: Row): Line => ({
  id: r.id, statementId: r.statement_id, sourceKind: r.source_kind, sourceId: r.source_id, code: r.code, title: r.title, unit: r.unit, groupLabel: r.group_label,
  unitPrice: n(r.unit_price), baseQty: n(r.base_qty), baseAmount: n(r.base_amount), sysCumQty: n(r.sys_cum_qty), sysCumAmount: n(r.sys_cum_amount),
  cumAmount: n(r.cum_amount), prevAmount: n(r.prev_amount), edited: !!r.edited, note: r.note ?? '', detail: r.detail ?? {},
})
const toDb = (l: GenLine) => ({ source_kind: l.sourceKind, source_id: l.sourceId, code: l.code, title: l.title, unit: l.unit, group_label: l.groupLabel, unit_price: l.unitPrice, base_qty: l.baseQty, base_amount: l.baseAmount,
  sys_cum_qty: l.sysCumQty, sys_cum_amount: l.sysCumAmount, cum_amount: l.cumAmount, prev_amount: l.prevAmount, edited: l.edited, note: l.note, detail: l.detail })

const ERR: [RegExp, string][] = [
  [/not_allowed|42501|permission/i, 'دسترسی این کار را ندارید.'], [/open_exists/, 'برای این قرارداد و بخش یک صورت‌وضعیت باز (پیش‌نویس، در بررسی یا برگشتی) هست؛ ابتدا آن را تأیید یا باطل کنید.'],
  [/not_after_last/, 'دورهٔ انتخاب‌شده باید بعد از آخرین صورت‌وضعیت این بخش باشد.'], [/exists/, 'برای این ماه قبلاً صورت‌وضعیت ساخته شده است.'], [/locked/, 'این صورت‌وضعیت قفل است و تغییر نمی‌کند.'],
[/reason_required/, 'برای برگشت، علت را بنویسید.'], [/not_last/, 'فقط آخرین صورت‌وضعیت هر بخش را می‌توان باطل کرد.'],
  [/not_approved/, 'فقط صورت‌وضعیت تأییدشده به مالی ارسال می‌شود.'], [/bad_transition/, 'این تغییر وضعیت در حالت فعلی ممکن نیست.'], [/does not exist|schema cache/, 'جدول‌های ماژول ساخته نشده است.'],
]
const msg = (e: { message: string }) => ERR.find(([r]) => r.test(e.message))?.[1] ?? e.message

interface State {
  projectId: string | null; loading: boolean; error: string | null; flash: string | null
  contracts: Contract[]; cfg: Map<string, Cfg>; seqs: (PaySeq & { contractId: string })[]; statements: Statement[]; lines: Map<string, Line[]>; lookups: Lookups
  advanceRecovered: Map<string, number>
  load: (projectId: string) => Promise<void>
  cfgOf: (contractId: string) => Cfg
  loadLines: (s: Statement) => Promise<Line[]>
  preview: (contractId: string, part: Part, period: Period) => Promise<Preview | null>
  save: (p: Preview, existing?: Statement) => Promise<string | null>
  setLine: (s: Statement, lineId: string, cum: number, note?: string) => Promise<boolean>
  setStatus: (s: Statement, status: StStatus, reason?: string) => Promise<boolean>
  post: (s: Statement) => Promise<boolean>
  voidStmt: (s: Statement) => Promise<boolean>
  saveCfg: (c: Cfg) => Promise<boolean>
  saveSeq: (contractId: string, seq: { id?: string; title: string; groupId: string | null; materialId: string | null; steps: PayStep[] }) => Promise<boolean>
  removeSeq: (id: string) => Promise<boolean>
}

export const usePstStore = create<State>()((set, get) => {
  const fail = (what: string, e: { message: string } | null) => { if (!e) return false; set({ flash: `${what}: ${msg(e)}` }); return true }
  const refresh = async () => { const p = get().projectId; if (p) await get().load(p) }

  /** everything each part needs, read from the source modules at the period end */
  const sourceE = async (pid: string, cfg: Cfg, c: Contract, p: Period): Promise<Built> => {
    const { data, error } = await supabase.from('ex_eng_docs').select('id, doc_no, title, discipline, status, price, actual_prepared, actual_approved, contract').eq('project_id', pid)
    if (error) throw error
    const docs = ((data ?? []) as Row[]).map((r) => ({ id: r.id, docNo: r.doc_no ?? '', title: r.title ?? '', discipline: r.discipline ?? '', status: r.status ?? '', price: n(r.price), actualPrepared: r.actual_prepared, actualApproved: r.actual_approved, contract: r.contract ?? '' }))
    return buildE(docs, cfg.engSplit, p.to, cfg.eDocContract || c.no)
  }
  const sourceP = async (pid: string, cfg: Cfg, c: Contract, p: Period): Promise<Built> => {
    const [mats, grps, pos, ships, recs, pkgs] = await Promise.all([
      supabase.from('mtl_materials').select('id, material_code, description, unit, group_id, contract_qty, mto_quantity, unit_price').eq('master_project_id', pid),
      supabase.from('mtl_groups').select('id, title'),
      supabase.from('mtl_purchase_orders').select('id, po_date, status, mtl_po_lines(material_id, quantity_ordered, unit_price)').eq('master_project_id', pid),
      supabase.from('mtl_shipments').select('id, shipment_date, mtl_shipment_lines(material_id, quantity_shipped)').eq('master_project_id', pid),
      supabase.from('mtl_warehouse_receipts').select('id, receipt_date, mtl_warehouse_lines(material_id, quantity_received, inspection_status, inspected_at)').eq('master_project_id', pid),
      supabase.from('mtl_packages').select('id, mtl_package_items(id, material_id, qty, mtl_item_stages(stage_key, status, approved_at, approved_qty, done_qty))').eq('master_project_id', pid),
    ])
    const err = mats.error ?? grps.error ?? pos.error ?? ships.error ?? recs.error ?? pkgs.error
    if (err) throw err
    const scope = cfg.pPackages?.length ? new Set(((pkgs.data ?? []) as Row[]).filter((k) => cfg.pPackages!.includes(k.id)).flatMap((k) => (k.mtl_package_items ?? []).map((i: Row) => i.material_id))) : null
    const gTitle = new Map(((grps.data ?? []) as Row[]).map((g) => [g.id, g.title]))
    const qty = new Map<string, Partial<Record<MatStage, number>>>()
    const add = (m: string, s: MatStage, q: number) => { const x = qty.get(m) ?? {}; x[s] = (x[s] ?? 0) + q; qty.set(m, x) }
    const poPrice = new Map<string, { q: number; v: number }>()
    for (const o of (pos.data ?? []) as Row[]) for (const l of o.mtl_po_lines ?? []) {
      const pp = poPrice.get(l.material_id) ?? { q: 0, v: 0 }; pp.q += n(l.quantity_ordered); pp.v += n(l.quantity_ordered) * n(l.unit_price); poPrice.set(l.material_id, pp)
      if (o.po_date && o.po_date <= p.to) add(l.material_id, 'po_issue', n(l.quantity_ordered))
    }
    for (const s of (ships.data ?? []) as Row[]) if (s.shipment_date && s.shipment_date <= p.to) for (const l of s.mtl_shipment_lines ?? []) add(l.material_id, 'shipping', n(l.quantity_shipped))
    for (const r of (recs.data ?? []) as Row[]) for (const l of r.mtl_warehouse_lines ?? []) {
      if (r.receipt_date && r.receipt_date <= p.to) add(l.material_id, 'site_receipt', n(l.quantity_received))
      if (l.inspection_status === 'accepted' && (l.inspected_at ?? r.receipt_date ?? '').slice(0, 10) <= p.to) add(l.material_id, 'entry_inspection', n(l.quantity_received))
    }
    // approved stage records of the material packages count too (the larger of record and transactions)
    const staged = new Map<string, Partial<Record<MatStage, number>>>()
    for (const k of (pkgs.data ?? []) as Row[]) for (const i of k.mtl_package_items ?? []) for (const s of i.mtl_item_stages ?? []) {
      if (s.status !== 'approved' || !s.approved_at || s.approved_at.slice(0, 10) > p.to) continue
      const x = staged.get(i.material_id) ?? {}; x[s.stage_key as MatStage] = (x[s.stage_key as MatStage] ?? 0) + n(s.approved_qty ?? s.done_qty ?? i.qty); staged.set(i.material_id, x)
    }
    for (const [m, st] of staged) { const x = qty.get(m) ?? {}; for (const [k, v] of Object.entries(st)) x[k as MatStage] = Math.max(x[k as MatStage] ?? 0, v ?? 0); qty.set(m, x) }
    const items: MatItem[] = ((mats.data ?? []) as Row[]).filter((m) => !scope || scope.has(m.id)).map((m) => {
      const pp = poPrice.get(m.id)
      return { id: m.id, code: m.material_code ?? '', title: m.description ?? '', unit: m.unit ?? '', groupId: m.group_id, groupTitle: gTitle.get(m.group_id) ?? '', qty: n(m.contract_qty ?? m.mto_quantity), unitPrice: pp && pp.q > 0 ? pp.v / pp.q : n(m.unit_price) }
    })
    const seqs = get().seqs.filter((s) => s.contractId === c.id)
    return buildP(items, qty, seqs)
  }
  const sourceC = async (pid: string, cfg: Cfg, _c: Contract, p: Period): Promise<Built> => {
    const ex = useExecutionStore.getState(), epc = useEpcStore.getState()
    await Promise.all([ex.loaded ? null : ex.fetchAll(), epc.loaded ? null : epc.fetchAll()])
    const core = executionCore(useExecutionStore.getState(), useEpcStore.getState(), pid, p.to)
    const acts = cfg.cBooks?.length ? core.activities.filter((a) => a.bookId && cfg.cBooks!.includes(a.bookId)) : core.activities
    const st = buildStatement({ activities: acts, reports: core.reports, lines: core.lines }, { from: p.from, to: p.to }, (a, d) => effectiveBase(a, core.baselines, core.blines, d).baseQty, () => '')
    const rows = st.books.flatMap((b) => b.chapters.flatMap((ch) => ch.rows.map((r) => ({ activityId: r.activity.id, itemNo: r.activity.itemNo, title: r.activity.title, unit: r.activity.unit, chapter: [ch.chapterNo, ch.title].filter(Boolean).join(' — '), unitPrice: r.unitPrice, base: r.base, cum: r.cum, pending: r.pending }))))
    return buildC(rows, core.unmappedActions.length)
  }

  return {
    projectId: null, loading: false, error: null, flash: null,
    contracts: [], cfg: new Map(), seqs: [], statements: [], lines: new Map(), advanceRecovered: new Map(),
    lookups: { groups: [], materials: [], packages: [], books: [], docContracts: [] },

    load: async (projectId) => {
      set({ projectId, loading: true, error: null })
      const cs = await supabase.from('fin_contracts').select('id, contract_number, title, contract_type, contract_value, advance_payment_percent, retention_percent, currency, status').eq('master_project_id', projectId).order('contract_number')
      if (cs.error) { set({ loading: false, error: msg(cs.error) }); return }
      const ids = ((cs.data ?? []) as Row[]).map((c) => c.id)
      const none = { data: [], error: null }
      const [am, cf, sq, st, certs, grps, mats, pkgs, books, docs] = await Promise.all([
        ids.length ? supabase.from('fin_contract_amendments').select('contract_id, amount, voided_at').in('contract_id', ids) : none,
        supabase.from('pst_contract_cfg').select('*').eq('master_project_id', projectId),
        supabase.from('pst_pay_sequences').select('*').eq('master_project_id', projectId).order('created_at'),
        supabase.from('pst_statements').select('*').eq('master_project_id', projectId).is('voided_at', null).order('period_to', { ascending: false }),
        ids.length ? supabase.from('fin_payment_certificates').select('contract_id, advance_recovery_amount, status').in('contract_id', ids) : none,
        supabase.from('mtl_groups').select('id, title').order('sort'),
        supabase.from('mtl_materials').select('id, material_code, description, group_id').eq('master_project_id', projectId).order('material_code'),
        supabase.from('mtl_packages').select('id, code, title').eq('master_project_id', projectId).order('code'),
        supabase.from('ex_price_books').select('id, title').eq('project_id', projectId),
        supabase.from('ex_eng_docs').select('contract').eq('project_id', projectId),
      ])
      const e = am.error ?? cf.error ?? sq.error ?? st.error ?? certs.error
      if (e) { set({ loading: false, error: msg(e) }); return }
      const amend = new Map<string, number>()
      for (const a of (am.data ?? []) as Row[]) if (!a.voided_at) amend.set(a.contract_id, (amend.get(a.contract_id) ?? 0) + n(a.amount))
      const contracts: Contract[] = ((cs.data ?? []) as Row[]).filter((c) => c.status !== 'cancelled').map((c) => ({ id: c.id, no: c.contract_number ?? '', title: c.title ?? '', type: c.contract_type ?? '', value: n(c.contract_value), amendments: amend.get(c.id) ?? 0, cap: n(c.contract_value) + (amend.get(c.id) ?? 0), advPct: n(c.advance_payment_percent), retPct: n(c.retention_percent), currency: c.currency ?? 'IRR' }))
      const cfg = new Map<string, Cfg>()
      for (const r of (cf.data ?? []) as Row[]) cfg.set(r.contract_id, { contractId: r.contract_id, capE: nn(r.cap_e), capP: nn(r.cap_p), capC: nn(r.cap_c), advRecoveryPct: n(r.adv_recovery_pct), retPct: n(r.ret_pct), taxPct: n(r.tax_pct), insPct: n(r.ins_pct), engSplit: Array.isArray(r.eng_split) ? r.eng_split : DEFAULT_ENG_SPLIT, eDocContract: r.e_doc_contract, pPackages: r.p_packages, cBooks: r.c_books, saved: true })
      const rec = new Map<string, number>()
      for (const x of (certs.data ?? []) as Row[]) if (x.status !== 'rejected') rec.set(x.contract_id, (rec.get(x.contract_id) ?? 0) + n(x.advance_recovery_amount))
      set({
        loading: false, contracts, cfg, advanceRecovered: rec,
        seqs: ((sq.data ?? []) as Row[]).map((r) => ({ id: r.id, contractId: r.contract_id, title: r.title ?? '', groupId: r.group_id, materialId: r.material_id, steps: r.steps ?? [] })),
        statements: ((st.data ?? []) as Row[]).map(stmtRow),
        lookups: {
          groups: ((grps.data ?? []) as Row[]).map((g) => ({ id: g.id, title: g.title })), materials: ((mats.data ?? []) as Row[]).map((m) => ({ id: m.id, code: m.material_code ?? '', title: m.description ?? '', groupId: m.group_id })),
          packages: ((pkgs.data ?? []) as Row[]).map((k) => ({ id: k.id, code: k.code ?? '', title: k.title ?? '' })), books: ((books.data ?? []) as Row[]).map((b) => ({ id: b.id, title: b.title ?? '' })),
          docContracts: [...new Set(((docs.data ?? []) as Row[]).map((d) => d.contract).filter(Boolean))].sort(),
        },
      })
    },

    cfgOf: (id) => get().cfg.get(id) ?? cfgDefault(get().contracts.find((c) => c.id === id)!),

    loadLines: async (s) => {
      const { data, error } = await supabase.from('pst_lines').select('*').eq('statement_id', s.id).eq('gen', s.gen).order('group_label').order('code')
      if (fail('خواندن ردیف‌ها', error)) return []
      const ls = ((data ?? []) as Row[]).map(lineRow)
      set({ lines: new Map(get().lines).set(s.id, ls) })
      return ls
    },

    preview: async (contractId, part, period) => {
      const pid = get().projectId!, c = get().contracts.find((x) => x.id === contractId)!, cfg = get().cfgOf(contractId)
      try {
        const built = await (part === 'E' ? sourceE : part === 'P' ? sourceP : sourceC)(pid, cfg, c, period)
        // the previous APPROVED statement of this contract part (approved or posted, the latest before the month): its accepted
        // cumulative amounts are the «previous»; the month = cumulative to the end of the selected month − those
        const prev = get().statements.filter((s) => s.contractId === contractId && s.part === part && s.to < period.from && (s.status === 'approved' || s.status === 'posted')).sort((a, b) => b.to.localeCompare(a.to))[0] ?? null
        const prevLines = prev ? (get().lines.get(prev.id) ?? (await get().loadLines(prev))) : []
        const lines = withPrevious(built.lines, prevLines)
        const rates: Rates = { advRecoveryPct: cfg.advRecoveryPct, retPct: cfg.retPct, taxPct: cfg.taxPct, insPct: cfg.insPct }
        const cap = (part === 'E' ? cfg.capE : part === 'P' ? cfg.capP : cfg.capC) ?? c.cap
        const pendingAdv = get().statements.filter((s) => s.contractId === contractId && !s.finCertificateId).reduce((a, s) => a + s.deductions.advance, 0)
        const advanceLeft = Math.max(0, (c.value * c.advPct) / 100 - (get().advanceRecovered.get(contractId) ?? 0) - pendingAdv)
        return { contract: c, part, period, built, lines, totals: totals(lines, rates, cap, advanceLeft, prev?.cumAmount ?? 0), prev, rates, advanceLeft }
      } catch (e) { fail('خواندن داده‌های منبع', e as { message: string }); return null }
    },

    save: async (p, existing) => {
      const t = p.totals
      const { data, error } = await supabase.rpc('pst_save', {
        p: { id: existing?.id ?? '', contract_id: p.contract.id, part: p.part, period_key: p.period.key, period_from: p.period.from, period_to: p.period.to, cum_sys: t.cumSys, cum_amount: t.cumAmount, prev_amount: t.prevAmount, this_amount: t.thisAmount, cap: t.cap ?? '', deductions: t.deductions, payable: t.payable },
        p_lines: p.lines.map(toDb),
      })
      if (fail('ذخیرهٔ صورت‌وضعیت', error)) return null
      await refresh(); set({ flash: existing ? 'صورت‌وضعیت از روی داده‌های تازه بازسازی شد.' : 'صورت‌وضعیت ساخته شد.' })
      return data as string
    },

    setLine: async (s, lineId, cum, note) => {
      const ls = (get().lines.get(s.id) ?? []).map((l) => (l.id === lineId ? { ...l, cumAmount: cum } : l))
      const c = get().contracts.find((x) => x.id === s.contractId)!, cfg = get().cfgOf(s.contractId)
      const pendingAdv = get().statements.filter((x) => x.contractId === s.contractId && !x.finCertificateId && x.id !== s.id).reduce((a, x) => a + x.deductions.advance, 0)
      const t = totals(ls, { advRecoveryPct: cfg.advRecoveryPct, retPct: cfg.retPct, taxPct: cfg.taxPct, insPct: cfg.insPct }, s.cap, Math.max(0, (c.value * c.advPct) / 100 - (get().advanceRecovered.get(s.contractId) ?? 0) - pendingAdv), s.prevAmount)
      const { error } = await supabase.rpc('pst_set_line', { p_line: lineId, p_cum: cum, p_note: note ?? null, p_totals: { cum_amount: t.cumAmount, this_amount: t.thisAmount, deductions: t.deductions, payable: t.payable } })
      if (fail('ثبت مبلغ', error)) return false
      await refresh(); await get().loadLines(get().statements.find((x) => x.id === s.id) ?? s)
      return true
    },

    setStatus: async (s, status, reason) => {
      const { error } = await supabase.rpc('pst_set_status', { p_stmt: s.id, p_status: status, p_reason: reason ?? '' })
      if (fail('تغییر وضعیت', error)) return false
      await refresh(); set({ flash: status === 'submitted' ? 'برای بررسی ارسال شد.' : status === 'approved' ? 'صورت‌وضعیت تأیید شد.' : status === 'rejected' ? 'برای اصلاح برگشت داده شد.' : 'به پیش‌نویس برگشت.' })
      return true
    },
    post: async (s) => {
      const { error } = await supabase.rpc('pst_post', { p_stmt: s.id })
      if (fail('ثبت در مالی', error)) return false
      await refresh(); set({ flash: 'در دفتر صورت‌وضعیت‌های ماژول «قراردادها و مالی» ثبت شد.' })
      return true
    },
    voidStmt: async (s) => {
      const { error } = await supabase.rpc('pst_void', { p_stmt: s.id })
      if (fail('باطل کردن', error)) return false
      await refresh(); set({ flash: 'صورت‌وضعیت باطل شد.' })
      return true
    },

    saveCfg: async (c) => {
      const pid = get().projectId!
      const { error } = await supabase.from('pst_contract_cfg').upsert({ contract_id: c.contractId, master_project_id: pid, cap_e: c.capE, cap_p: c.capP, cap_c: c.capC, adv_recovery_pct: c.advRecoveryPct, ret_pct: c.retPct, tax_pct: c.taxPct, ins_pct: c.insPct, eng_split: c.engSplit, e_doc_contract: c.eDocContract || null, p_packages: c.pPackages?.length ? c.pPackages : null, c_books: c.cBooks?.length ? c.cBooks : null, updated_at: new Date().toISOString() })
      if (fail('ذخیرهٔ تنظیمات', error)) return false
      await refresh(); set({ flash: 'تنظیمات قرارداد ذخیره شد.' }); return true
    },
    saveSeq: async (contractId, q) => {
      const pid = get().projectId!
      const row = { master_project_id: pid, contract_id: contractId, title: q.title, group_id: q.groupId, material_id: q.materialId, steps: q.steps }
      const { error } = q.id ? await supabase.from('pst_pay_sequences').update(row).eq('id', q.id) : await supabase.from('pst_pay_sequences').insert(row)
      if (error && /duplicate|unique/i.test(error.message)) { set({ flash: 'برای این گروه/قلم قبلاً توالی تعریف شده است.' }); return false }
      if (fail('ذخیرهٔ توالی پرداخت', error)) return false
      await refresh(); set({ flash: 'توالی پرداخت ذخیره شد.' }); return true
    },
    removeSeq: async (id) => {
      const { error } = await supabase.from('pst_pay_sequences').delete().eq('id', id)
      if (fail('حذف توالی', error)) return false
      await refresh(); return true
    },
  }
})

export { DEFAULT_PAY_STEPS }
