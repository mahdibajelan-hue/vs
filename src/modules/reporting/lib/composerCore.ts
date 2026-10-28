/**
 * Report composer (reporting phase 4): a report for a chosen audience, period, scope and set of sections, assembled
 * from analyticsCore over the same facts the analysis center shows — never a second calculation of the same figure.
 * Period-dated records (issues opened/closed, stoppages, changes, decisions and actions due) are filtered to the period;
 * state figures (progress, SPI, open risks) are "as of" the latest record and labelled so.
 */
import { jd, BASIS_FA, DISCIPLINE_FA, DOMAIN_FA, WARNING_KIND_FA, compareProjects, deviations, earlyWarnings, rootCauses, suggestions, summarise, type DisciplineKey, type ProjectFacts, type Severity } from './analyticsCore'

export type Audience = 'project' | 'program' | 'ceo'
export type PeriodKind = 'daily' | 'weekly' | 'monthly' | 'custom'
export type Detail = 'summary' | 'standard' | 'full'
export type SectionKey = 'summary' | 'critical' | 'deviations' | 'engineering' | 'procurement' | 'construction' | 'contract' | 'risk' | 'issues' | 'decisions' | 'warnings' | 'causes' | 'actions' | 'compare' | 'quality'
export interface ComposerConfig {
  audience: Audience
  period: PeriodKind
  from?: string
  to?: string
  scope: { level: 'project' | 'program' | 'portfolio' | 'all'; id: string | null }
  sections: SectionKey[]
  detail: Detail
}

export const SECTION_FA: Record<SectionKey, string> = {
  summary: 'خلاصهٔ مدیریتی', critical: 'پروژه‌های بحرانی', deviations: 'انحرافات زمان، هزینه و پیشرفت', engineering: 'وضعیت مهندسی و مدارک', procurement: 'وضعیت تأمین کالا',
  construction: 'وضعیت اجرا و توقفات', contract: 'قرارداد و تغییرات', risk: 'ریسک‌ها', issues: 'مسائل باز', decisions: 'تصمیم‌های موردنیاز مدیریت', warnings: 'هشدارهای پیش‌نگر',
  causes: 'علل ریشه‌ای', actions: 'اقدامات اصلاحی پیشنهادی', compare: 'مقایسهٔ بین‌پروژه‌ای', quality: 'کیفیت و اعتبار داده',
}
export const AUDIENCE_FA: Record<Audience, string> = { project: 'مدیر پروژه', program: 'مدیر طرح', ceo: 'مدیرعامل' }
export const PERIOD_FA: Record<PeriodKind, string> = { daily: 'روزانه', weekly: 'هفتگی', monthly: 'ماهانه', custom: 'دورهٔ دلخواه' }
export const DETAIL_FA: Record<Detail, string> = { summary: 'خلاصه', standard: 'استاندارد', full: 'کامل' }

export const AUDIENCE_PRESETS: Record<Audience, { sections: SectionKey[]; detail: Detail; note: string }> = {
  project: { sections: ['summary', 'deviations', 'engineering', 'procurement', 'construction', 'contract', 'risk', 'issues', 'decisions', 'causes', 'warnings', 'actions', 'quality'], detail: 'full', note: 'همهٔ حوزه‌ها با جزئیات، برای پیگیری اجرایی' },
  program: { sections: ['summary', 'critical', 'deviations', 'compare', 'causes', 'warnings', 'decisions', 'actions', 'quality'], detail: 'standard', note: 'مقایسهٔ پروژه‌های طرح و موضوعات مشترک' },
  ceo: { sections: ['summary', 'critical', 'decisions', 'warnings', 'compare', 'actions'], detail: 'summary', note: 'فقط آنچه تصمیم مدیرعامل را لازم دارد' },
}

export type Tone = 'bad' | 'warn' | 'good' | 'none'
export type Block =
  | { key: string; title: string; note?: string; kind: 'kpis'; items: { label: string; value: string; tone: Tone }[] }
  | { key: string; title: string; note?: string; kind: 'table'; head: string[]; rows: string[][]; tones?: Tone[] }
  | { key: string; title: string; note?: string; kind: 'list'; items: { text: string; sub?: string; tone?: Tone; tag?: string }[] }
export interface ComposedReport {
  title: string
  audience: Audience
  periodLabel: string
  from: string
  to: string
  scopeLabel: string
  generatedAt: string
  projects: number
  sections: { key: SectionKey; title: string; blocks: Block[]; empty: string | null }[]
  caveats: string[]
}

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: d })
const j = jd
const tone = (s: Severity): Tone => (s === 'material' ? 'bad' : s === 'watch' ? 'warn' : s === 'ok' ? 'good' : 'none')
const SEV_FA: Record<Severity, string> = { material: 'مهم', watch: 'زیر نظر', ok: 'در حد مجاز', none: 'داده ندارد' }
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10)
const inP = (d: string | null | undefined, from: string, to: string) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= to
const isOpenIssue = (s: string) => s !== 'approved' && s !== 'rejected' && s !== 'closed'

export function periodRange(kind: PeriodKind, today: string, from?: string, to?: string): { from: string; to: string } {
  if (kind === 'custom' && from && to) return from <= to ? { from, to } : { from: to, to: from }
  if (kind === 'daily') return { from: today, to: today }
  if (kind === 'weekly') return { from: addDays(today, -6), to: today }
  return { from: addDays(today, -29), to: today }
}

export function scopeFacts(cfg: ComposerConfig, list: ProjectFacts[]): { facts: ProjectFacts[]; label: string } {
  const { level, id } = cfg.scope
  if (level === 'project' && id) { const f = list.filter((x) => x.id === id); return { facts: f, label: f[0]?.name ?? 'پروژهٔ انتخاب‌شده' } }
  if (level === 'program' && id) { const f = list.filter((x) => x.program?.id === id); return { facts: f, label: `طرح ${f[0]?.program?.name ?? ''}`.trim() } }
  if (level === 'portfolio' && id) { const f = list.filter((x) => x.portfolio?.id === id); return { facts: f, label: `پورتفولیوی ${f[0]?.portfolio?.name ?? ''}`.trim() } }
  return { facts: list, label: 'همهٔ پروژه‌های در دسترس' }
}

export function composeReport(cfg: ComposerConfig, all: ProjectFacts[], today: string): ComposedReport {
  const { facts: list, label } = scopeFacts(cfg, all)
  const { from, to } = periodRange(cfg.period, today, cfg.from, cfg.to)
  const cap = cfg.detail === 'summary' ? 5 : cfg.detail === 'standard' ? 15 : Infinity
  const take = <T,>(xs: T[]) => xs.slice(0, cap)
  const more = (n: number) => (n > cap ? `${fa(n - cap)} مورد دیگر در سطح جزئیات «کامل» دیده می‌شود.` : undefined)
  const caveats: string[] = ['وضعیت پیشرفت، شاخص‌ها و ریسک‌ها «آخرین وضعیت ثبت‌شده» هستند؛ مسائل، توقفات، تغییرات و تصمیم‌ها به دورهٔ گزارش محدود شده‌اند.']
  const multi = list.length > 1
  const sections: ComposedReport['sections'] = []
  const devs = list.flatMap(deviations)
  const sm = summarise(list)

  // stoppages are loaded for the window since each project's previous report (else 30 days) — say when the period reaches further back
  const loadedFrom = list.map((f) => f.input.periodDelays?.from).filter((x): x is string => !!x).sort()[0]
  if (loadedFrom && from < loadedFrom) caveats.push(`توقفات اجرا فقط از ${j(loadedFrom)} در دسترس است.`)
  if (sm.lowConfidence.length) caveats.push(`دادهٔ ${fa(sm.lowConfidence.length)} پروژه کهنه یا ناقص است: ${sm.lowConfidence.slice(0, 4).join('، ')}.`)

  for (const key of cfg.sections) {
    const blocks: Block[] = []
    let empty: string | null = null
    switch (key) {
      case 'summary': {
        const odDec = sm.decisions.filter((d) => d.overdue).length
        const opened = list.flatMap((f) => f.issues ?? []).filter((i) => inP(i.createdAt, from, to)).length
        const closed = list.flatMap((f) => f.issues ?? []).filter((i) => inP(i.closedAt, from, to)).length
        blocks.push({ key: 'k', title: 'شاخص‌های کلیدی', kind: 'kpis', items: [
          { label: multi ? 'پروژه‌ها' : 'پیشرفت واقعی / برنامه', value: multi ? `${fa(list.length)} (${fa(sm.withData)} با شاخص)` : list[0]?.input.metrics ? `${fa(list[0].input.metrics.lifecycle.actual, 1)}٪ / ${fa(list[0].input.metrics.lifecycle.planned, 1)}٪` : 'ثبت نشده', tone: 'none' },
          { label: multi ? 'پروژه با انحراف مهم' : 'انحراف مهم', value: multi ? fa(sm.critical.length) : fa(sm.material.length), tone: sm.material.length ? 'bad' : 'good' },
          { label: 'هشدار با اهمیت بالا', value: fa(sm.warnings.length), tone: sm.warnings.length ? 'warn' : 'good' },
          { label: 'تصمیم معوق', value: fa(odDec), tone: odDec ? 'bad' : 'good' },
          { label: 'مسائل تازه / بسته‌شده در دوره', value: `${fa(opened)} / ${fa(closed)}`, tone: opened > closed ? 'warn' : 'none' },
        ] })
        const lines = multi ? [
          sm.critical.length ? `${fa(sm.critical.length)} پروژه از ${fa(list.length)} دست‌کم یک انحراف مهم دارند؛ بیشترین: ${sm.critical.slice(0, 3).map((c) => c.project).join('، ')}.` : 'انحراف مهمی بر پایهٔ آستانه‌ها دیده نشد.',
          ...sm.patterns.filter((p) => p.escalate).slice(0, 2).map((p) => `موضوع مشترک در ${fa(p.projects.length)} پروژه: ${p.text}.`),
        ] : (list[0]?.report.headline ?? [])
        blocks.push({ key: 'h', title: 'جمع‌بندی', kind: 'list', items: lines.map((t) => ({ text: t })) })
        break
      }
      case 'critical': {
        if (!sm.critical.length) { empty = 'پروژه‌ای با انحراف مهم نیست.'; break }
        blocks.push({ key: 'c', title: SECTION_FA.critical, kind: 'list', note: more(sm.critical.length), items: take(sm.critical).map((c) => ({ text: `${c.project} — ${fa(c.material)} انحراف مهم`, sub: c.reasons.slice(0, 3).join('؛ '), tone: 'bad' as Tone })) })
        break
      }
      case 'deviations': {
        const rows = devs.filter((d) => d.severity === 'material' || d.severity === 'watch').sort((a, b) => (a.severity === b.severity ? (a.variance ?? 0) - (b.variance ?? 0) : a.severity === 'material' ? -1 : 1))
        if (!rows.length) { empty = 'انحرافی بالاتر از آستانه‌ها نیست.'; break }
        const t = take(rows)
        blocks.push({ key: 'd', title: SECTION_FA.deviations, kind: 'table', note: more(rows.length), head: [...(multi ? ['پروژه'] : []), 'حوزه', 'شاخص', 'مقدار', 'مرجع', 'وضعیت', 'منبع'], rows: t.map((d) => [...(multi ? [d.project] : []), DOMAIN_FA[d.domain], d.metric, d.actual, d.reference, SEV_FA[d.severity], d.source]), tones: t.map((d) => tone(d.severity)) })
        break
      }
      case 'engineering': case 'procurement': case 'construction': {
        const k = key as DisciplineKey
        const rows = devs.filter((d) => d.domain === k)
        const withData = rows.filter((d) => d.severity !== 'none')
        if (!withData.length) { empty = `برای ${DISCIPLINE_FA[k]} برنامه یا پیشرفت ثبت‌شده‌ای در این محدوده نیست.`; break }
        const t = take(withData)
        blocks.push({ key: k, title: `پیشرفت ${DISCIPLINE_FA[k]}`, kind: 'table', note: rows.length > withData.length ? `${fa(rows.length - withData.length)} پروژه برای این رشته داده ندارند.` : undefined, head: [...(multi ? ['پروژه'] : []), 'واقعی', 'برنامه', 'فاصله (واحد درصد)', 'وضعیت'], rows: t.map((d) => [...(multi ? [d.project] : []), d.actual, d.reference, d.variance == null ? '—' : fa(d.variance, 1), SEV_FA[d.severity]]), tones: t.map((d) => tone(d.severity)) })
        if (k === 'construction') {
          const items = list.flatMap((f) => (f.input.periodDelays?.items ?? []).filter((i) => inP(i.date, from, to)).map((i) => ({ ...i, project: f.name })))
          const by = new Map<string, number>()
          for (const i of items) by.set(multi ? `${i.project} — ${i.label}` : i.label, (by.get(multi ? `${i.project} — ${i.label}` : i.label) ?? 0) + i.hours)
          const st = [...by].sort((a, b) => b[1] - a[1])
          if (st.length) blocks.push({ key: 'stop', title: 'توقفات اجرا در دوره', kind: 'table', head: ['علت', 'ساعت'], rows: take(st).map(([l, h]) => [l, fa(h)]) })
        }
        break
      }
      case 'contract': {
        const cs = list.flatMap((f) => (f.changes ?? []).map((c) => ({ f, c })))
        if (!cs.length) { empty = 'درخواست تغییری ثبت نشده است.'; break }
        const inPeriod = cs.filter((x) => inP(x.c.submittedAt, from, to)).length
        blocks.push({ key: 'ck', title: 'خلاصهٔ تغییرات', kind: 'kpis', items: [
          { label: 'کل درخواست‌ها', value: fa(cs.length), tone: 'none' },
          { label: 'ثبت‌شده در دوره', value: fa(inPeriod), tone: inPeriod ? 'warn' : 'none' },
          { label: 'اثر زمانی تصویب‌شده', value: `${fa(cs.reduce((n, x) => n + (x.c.approvedDays ?? 0), 0))} روز`, tone: 'none' },
        ] })
        blocks.push({ key: 'cl', title: 'درخواست‌های تغییر', kind: 'table', note: more(cs.length), head: [...(multi ? ['پروژه'] : []), 'شماره', 'عنوان', 'وضعیت', 'مبلغ تصویب‌شده', 'روز تصویب‌شده'], rows: take(cs).map(({ f, c }) => [...(multi ? [f.name] : []), c.number || '—', c.title, c.status, c.approvedCost == null ? '—' : fa(c.approvedCost), c.approvedDays == null ? '—' : fa(c.approvedDays)]) })
        break
      }
      case 'risk': {
        const rs = list.flatMap((f) => (f.input.risks ?? []).filter((r) => r.status !== 'closed' && (r.level === 'critical' || r.level === 'high')).map((r) => ({ f, r }))).sort((a, b) => b.r.score - a.r.score)
        const none = list.filter((f) => !f.input.risks?.length).length
        if (!rs.length) { empty = `ریسک بحرانی یا بالای فعالی ثبت نشده است${none ? ` (${fa(none)} پروژه هیچ ریسکی ثبت نکرده‌اند)` : ''}.`; break }
        blocks.push({ key: 'r', title: 'ریسک‌های بحرانی و بالا', kind: 'table', note: [more(rs.length), none ? `${fa(none)} پروژه ریسکی ثبت نکرده‌اند — به معنای ریسک کم نیست.` : ''].filter(Boolean).join(' ') || undefined, head: [...(multi ? ['پروژه'] : []), 'ریسک', 'امتیاز', 'سطح', 'مالک'], rows: take(rs).map(({ f, r }) => [...(multi ? [f.name] : []), r.title, fa(r.score), r.level === 'critical' ? 'بحرانی' : 'بالا', r.owner ?? '—']), tones: take(rs).map(({ r }) => (r.level === 'critical' ? 'bad' : 'warn') as Tone) })
        break
      }
      case 'issues': {
        const is = list.flatMap((f) => (f.issues ?? []).map((i) => ({ f, i })))
        if (!is.length) { empty = 'مسئله‌ای ثبت نشده است.'; break }
        const open = is.filter((x) => isOpenIssue(x.i.status))
        const od = open.filter((x) => x.i.due && x.i.due.slice(0, 10) < today)
        blocks.push({ key: 'ik', title: 'مسائل در دوره', kind: 'kpis', items: [
          { label: 'باز', value: fa(open.length), tone: 'none' },
          { label: 'معوق', value: fa(od.length), tone: od.length ? 'bad' : 'good' },
          { label: 'تازه در دوره', value: fa(is.filter((x) => inP(x.i.createdAt, from, to)).length), tone: 'none' },
          { label: 'بسته‌شده در دوره', value: fa(is.filter((x) => inP(x.i.closedAt, from, to)).length), tone: 'none' },
        ] })
        const imp = open.filter((x) => x.i.priority === 'critical' || x.i.priority === 'high').sort((a, b) => (a.i.due ?? '9').localeCompare(b.i.due ?? '9'))
        if (imp.length) blocks.push({ key: 'il', title: 'مسائل بحرانی و بالای باز', kind: 'table', note: more(imp.length), head: [...(multi ? ['پروژه'] : []), 'مسئله', 'دسته', 'مهلت', 'مسئول'], rows: take(imp).map(({ f, i }) => [...(multi ? [f.name] : []), i.title, i.category ?? '—', j(i.due), i.owner ?? '—']), tones: take(imp).map(({ i }) => (i.due && i.due.slice(0, 10) < today ? 'bad' : 'warn') as Tone) })
        break
      }
      case 'decisions': {
        if (!sm.decisions.length) { empty = 'تصمیم در انتظاری ثبت نشده است.'; break }
        blocks.push({ key: 'dc', title: SECTION_FA.decisions, kind: 'table', note: more(sm.decisions.length), head: [...(multi ? ['پروژه'] : []), 'تصمیم', 'موعد', 'مرجع', 'وضعیت'], rows: take(sm.decisions).map((d) => [...(multi ? [d.project] : []), d.title, j(d.dueBy), d.owner ?? '—', d.overdue ? 'موعد گذشته' : 'در انتظار']), tones: take(sm.decisions).map((d) => (d.overdue ? 'bad' : 'warn') as Tone) })
        break
      }
      case 'warnings': {
        const ws = list.flatMap(earlyWarnings)
        if (!ws.length) { empty = 'هشدار فعالی نیست.'; break }
        blocks.push({ key: 'w', title: SECTION_FA.warnings, kind: 'list', note: [more(ws.length), 'پیش‌بینی هوش مصنوعی فعال نیست؛ هشدار آماری فقط ادامهٔ خطی روند ثبت‌شده است.'].filter(Boolean).join(' '), items: take(ws).map((w) => ({ text: `${multi ? `${w.project}: ` : ''}${w.title} — ${w.reason}`, sub: `${w.evidence.join(' · ')} · اقدام: ${w.suggestion}`, tone: (w.severity === 'high' ? 'bad' : 'warn') as Tone, tag: `${WARNING_KIND_FA[w.kind]} · اطمینان ${w.confidence === 'high' ? 'بالا' : w.confidence === 'medium' ? 'متوسط' : 'پایین'}` })) })
        break
      }
      case 'causes': {
        const cs = list.flatMap(rootCauses)
        if (!cs.length) { empty = 'علتی با پشتوانهٔ داده پیدا نشد.'; break }
        blocks.push({ key: 'rc', title: SECTION_FA.causes, kind: 'list', note: [more(cs.length), '«شاهد هم‌زمان» علت اثبات‌شده نیست؛ فرضیه‌ها باید بازبینی شوند.'].filter(Boolean).join(' '), items: take(cs).map((c) => ({ text: `${multi ? `${c.project}: ` : ''}${c.text}`, sub: `اثر: ${c.effect} · شواهد: ${c.evidence.slice(0, 2).join('؛ ')} · بررسی: ${c.check}`, tone: (c.basis === 'direct' ? 'bad' : c.basis === 'associated' ? 'warn' : 'none') as Tone, tag: `${BASIS_FA[c.basis]} · اطمینان ${c.confidence === 'high' ? 'بالا' : c.confidence === 'medium' ? 'متوسط' : 'پایین'}` })) })
        break
      }
      case 'actions': {
        const ss = list.flatMap(suggestions)
        if (!ss.length) { empty = 'پیشنهاد اقدامی نیست.'; break }
        blocks.push({ key: 'a', title: SECTION_FA.actions, kind: 'table', note: [more(ss.length), 'پیشنهاد سامانه است، نه مصوبه. تا ثبت توسط مسئول، اقدامی ایجاد نشده است.'].filter(Boolean).join(' '), head: [...(multi ? ['پروژه'] : []), 'اقدام پیشنهادی', 'اولویت', 'مسئول پیشنهادی', 'مهلت پیشنهادی', 'سنجهٔ اثربخشی', 'وضعیت'], rows: take(ss).map((s) => [...(multi ? [s.project] : []), s.action, s.priority === 'critical' ? 'بحرانی' : s.priority === 'high' ? 'بالا' : 'متوسط', s.owner ?? '—', j(s.due), s.kpi, s.existing ? `اقدام موجود: ${s.existing}` : 'پیشنهاد']), tones: take(ss).map((s) => (s.priority === 'critical' ? 'bad' : s.priority === 'high' ? 'warn' : 'none') as Tone) })
        break
      }
      case 'compare': {
        if (!multi) { empty = 'مقایسه برای بیش از یک پروژه معنا دارد.'; break }
        const { rows, patterns } = compareProjects(list)
        const sorted = [...rows].sort((a, b) => a.group.localeCompare(b.group) || (a.rankInGroup ?? 99) - (b.rankInGroup ?? 99))
        blocks.push({ key: 'cmp', title: 'مقایسه در گروه‌های هم‌مرحله', kind: 'table', note: 'رتبه فقط درون گروهِ هم‌مرحله محاسبه می‌شود؛ مقایسهٔ پروژه‌های مراحل مختلف گمراه‌کننده است.', head: ['پروژه', 'گروه', 'فاصله', 'SPI', 'CPI', 'رتبه در گروه'], rows: take(sorted).map((r) => [r.project, r.group, r.gap == null ? '—' : fa(r.gap, 1), r.spi == null ? '—' : fa(r.spi, 2), r.cpi == null ? '—' : fa(r.cpi, 2), r.rankInGroup == null ? '—' : `${fa(r.rankInGroup)} از ${fa(r.groupSize)}`]) })
        if (patterns.length) blocks.push({ key: 'pat', title: 'الگوهای تکرارشونده', kind: 'list', items: take(patterns).map((p) => ({ text: `${p.text} — ${fa(p.projects.length)} پروژه`, sub: `${p.projects.slice(0, 5).join('، ')} · ${p.note}`, tone: (p.escalate ? 'bad' : 'warn') as Tone, tag: p.escalate ? 'نیازمند تصمیم سطح بالاتر' : BASIS_FA[p.basis] })) })
        break
      }
      case 'quality': {
        const rows = list.flatMap((f) => f.report.quality.filter((q) => !q.available || (q.staleDays ?? 0) > f.report.thresholds.staleDays).map((q) => ({ f, q })))
        blocks.push({ key: 'q', title: 'اعتبار داده', kind: 'kpis', items: [
          { label: 'اطمینان بالا', value: fa(list.filter((f) => f.report.confidence === 'high').length), tone: 'good' },
          { label: 'اطمینان متوسط', value: fa(list.filter((f) => f.report.confidence === 'medium').length), tone: 'warn' },
          { label: 'اطمینان پایین', value: fa(list.filter((f) => f.report.confidence === 'low').length), tone: 'bad' },
        ] })
        if (rows.length) blocks.push({ key: 'qs', title: 'منابع کهنه یا خالی', kind: 'table', note: more(rows.length), head: [...(multi ? ['پروژه'] : []), 'منبع', 'آخرین ثبت', 'وضعیت'], rows: take(rows).map(({ f, q }) => [...(multi ? [f.name] : []), q.source, j(q.lastUpdate), q.note]) })
        break
      }
    }
    sections.push({ key, title: SECTION_FA[key], blocks, empty })
  }
  return {
    title: `گزارش ${PERIOD_FA[cfg.period]} ${AUDIENCE_FA[cfg.audience]}`,
    audience: cfg.audience, periodLabel: cfg.period === 'daily' ? j(to) : `${j(from)} تا ${j(to)}`, from, to,
    scopeLabel: label, generatedAt: today, projects: list.length, sections, caveats,
  }
}
