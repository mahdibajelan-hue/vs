/**
 * Management assistant (reporting phase 4): a Persian question → the intent, the scope (project, program, portfolio,
 * region word or the previous answer's projects) → an answer computed by analyticsCore over the facts the user can
 * read. Every line carries its evidence; when the facts do not answer the question the reply says so.
 *
 * The language model is not in this path. It can only re-phrase a finished answer on request (rp-narrate, with the
 * number and reference guard), so no figure in a reply can come from the model.
 */
import { DOMAIN_FA, DISCIPLINE_FA, BASIS_FA, jd, deviations, earlyWarnings, rootCauses, suggestions, compareProjects, type Domain, type ProjectFacts } from './analyticsCore'

export type Intent = 'top_schedule' | 'top_cost' | 'causes' | 'issues_impact' | 'brief' | 'decisions' | 'suggest' | 'risks' | 'warnings' | 'changes' | 'discipline' | 'compare' | 'status' | 'unknown'
export type View = 'deviations' | 'causes' | 'warnings' | 'compare' | 'actions' | 'evidence'

export interface AssistantContext { projectIds: string[] | null; scopeLabel: string | null; intent: Intent | null }
export interface AnswerLine { id: string; text: string; evidence: string[] }
export interface Answer {
  intent: Intent
  understood: string
  scope: { label: string; projectIds: string[]; matchedBy: 'project' | 'program' | 'portfolio' | 'region' | 'context' | 'all' }
  lines: AnswerLine[]
  table: { head: string[]; rows: string[][] } | null
  links: { label: string; projectId: string | null; view: View }[]
  caveats: string[]
  context: AssistantContext
}

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: d })
const NUM_WORDS: Record<string, number> = { یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10 }

/** Arabic letters, Persian/Arabic digits and half-spaces folded so matching is not defeated by keyboard layout */
export function normalise(s: string): string {
  return s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[ۀة]/g, 'ه').replace(/[أإآ]/g, 'ا').replace(/ؤ/g, 'و')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[‌‏‎]/g, ' ').replace(/[«»"'؟?!.,،:؛()]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

const STOP = new Set(['پروژه', 'پروژه‌ها', 'احداث', 'خط', 'لوله', 'اینچ', 'واحد', 'فاز', 'سامانه', 'توسعه', 'قطعه', 'شماره', 'و', 'از', 'تا', 'کیلومتر', 'ایستگاه', 'هوشمند', 'گاز', 'طرح'])
const tokens = (s: string) => normalise(s).split(' ').filter((w) => w.length >= 2 && !STOP.has(w))

const REGIONS: Record<string, RegExp> = { غرب: /غرب/, شرق: /شرق/, شمال: /شمال/, جنوب: /جنوب/, مرکز: /مرکز/ }

function topN(q: string): number | null {
  const m = q.match(/\b(\d{1,2})\b/)
  if (m) return Math.min(20, Number(m[1]))
  for (const [w, n] of Object.entries(NUM_WORDS)) if (new RegExp(`(^| )${w}( |$)`).test(q)) return n
  return null
}

export function detectIntent(q: string): Intent {
  const n = normalise(q)
  if (/تصمیم/.test(n)) return 'decisions'
  if (/پیشنهاد|راهکار|راه حل|چه (کار|اقدام)|اقدام(ات|ها)? (اصلاحی|لازم)|کاهش|جبران/.test(n)) return 'suggest'
  if (/علت|علل|چرا|دلیل|ریشه/.test(n)) return 'causes'
  if (/مسائل|مسئله|موانع|مانع|مشکلات باز/.test(n)) return 'issues_impact'
  if (/خلاصه|جلسه|مدیرعامل|مدیر عامل|گزارش کوتاه/.test(n)) return 'brief'
  if (/هشدار|پیش بینی|پیشبینی|آینده|زنگ خطر/.test(n)) return 'warnings'
  if (/ریسک/.test(n)) return 'risks'
  if (/تغییرات|درخواست تغییر|تغییر /.test(`${n} `)) return 'changes'
  if (/مقایسه/.test(n)) return 'compare'
  if (/هزینه|بودجه|cpi|مالی|بیش هزینه|eac/.test(n)) return 'top_cost'
  if (/مهندسی|مدارک|تامین|تأمین|کالا|تدارکات|خرید/.test(n)) return 'discipline'
  if (/انحراف|عقب|تاخیر|تأخیر|زمان|برنامه|spi|پیشرفت/.test(n)) return 'top_schedule'
  if (/وضعیت|چطور|چگونه/.test(n)) return 'status'
  return 'unknown'
}

/** which projects the question is about; follow-ups («همین پروژه‌ها»، «آن‌ها») reuse the previous answer's scope */
export function resolveScope(q: string, list: ProjectFacts[], ctx: AssistantContext | null): Answer['scope'] {
  const n = normalise(q)
  if (ctx?.projectIds?.length && /(همین|همان|این|آن) ?(پروژه|ها|موارد)|^(آن|اون)ها|آنها|اونها|این ها|اینها/.test(n)) return { label: ctx.scopeLabel ?? 'پروژه‌های پاسخ قبل', projectIds: ctx.projectIds, matchedBy: 'context' }
  // a full name, then a program or portfolio name, then distinctive words of a project name
  const exact = list.filter((f) => n.includes(normalise(f.name)))
  if (exact.length) return { label: exact.map((f) => f.name).join('، '), projectIds: exact.map((f) => f.id), matchedBy: 'project' }
  const progs = new Map<string, { name: string; ids: string[] }>()
  for (const f of list) if (f.program && n.includes(normalise(f.program.name))) progs.set(f.program.id, { name: f.program.name, ids: [...(progs.get(f.program.id)?.ids ?? []), f.id] })
  if (progs.size) { const v = [...progs.values()]; return { label: `طرح ${v.map((x) => x.name).join('، ')}`, projectIds: v.flatMap((x) => x.ids), matchedBy: 'program' } }
  const pfs = new Map<string, { name: string; ids: string[] }>()
  for (const f of list) if (f.portfolio && n.includes(normalise(f.portfolio.name))) pfs.set(f.portfolio.id, { name: f.portfolio.name, ids: [...(pfs.get(f.portfolio.id)?.ids ?? []), f.id] })
  if (pfs.size) { const v = [...pfs.values()]; return { label: `پورتفولیوی ${v.map((x) => x.name).join('، ')}`, projectIds: v.flatMap((x) => x.ids), matchedBy: 'portfolio' } }
  const qt = new Set(n.split(' '))
  const scored = list.map((f) => ({ f, hit: tokens(f.name).filter((w) => qt.has(w)).length })).filter((x) => x.hit >= 2)
  if (scored.length) { const best = Math.max(...scored.map((x) => x.hit)); const pick = scored.filter((x) => x.hit === best).map((x) => x.f); return { label: pick.map((f) => f.name).join('، '), projectIds: pick.map((f) => f.id), matchedBy: 'project' } }
  for (const [word, re] of Object.entries(REGIONS)) {
    if (!new RegExp(`${word}( |$)`).test(n)) continue
    const hit = list.filter((f) => re.test(normalise(`${f.name} ${f.location} ${f.program?.name ?? ''} ${f.portfolio?.name ?? ''}`)))
    return { label: `پروژه‌های «${word}»`, projectIds: hit.map((f) => f.id), matchedBy: 'region' }
  }
  return { label: 'همهٔ پروژه‌های در دسترس شما', projectIds: list.map((f) => f.id), matchedBy: 'all' }
}

const UNDERSTOOD: Record<Intent, string> = {
  top_schedule: 'پروژه‌ها با بیشترین انحراف زمانی', top_cost: 'پروژه‌ها با بیشترین انحراف هزینه', causes: 'علل انحراف و عقب‌ماندگی', issues_impact: 'مسائل باز اثرگذار بر پیشرفت',
  brief: 'خلاصهٔ وضعیت برای جلسهٔ مدیریت', decisions: 'تصمیم‌های گرفته‌نشده یا اجرانشده', suggest: 'اقدامات اصلاحی پیشنهادی', risks: 'ریسک‌های بحرانی و بالا',
  warnings: 'هشدارهای پیش‌نگر', changes: 'درخواست‌های تغییر', discipline: 'انحراف رشته‌ها (مهندسی، تأمین کالا، اجرا)', compare: 'مقایسهٔ پروژه‌ها', status: 'وضعیت کلی', unknown: '',
}

export const EXAMPLES = [
  'سه پروژه با بیشترین انحراف زمانی کدام‌اند؟',
  'مهم‌ترین علل عقب‌ماندگی پروژه‌های غرب کشور چیست؟',
  'کدام مسائل باز بیشترین تأثیر را بر پیشرفت پروژه‌ها دارند؟',
  'وضعیت پروژه‌های بحرانی را برای جلسه مدیرعامل خلاصه کن.',
  'چه تصمیماتی هنوز اجرا نشده‌اند و چه پیامدی دارند؟',
  'چه اقداماتی برای کاهش انحراف پروژه پیشنهاد می‌شود؟',
]

export function answer(question: string, all: ProjectFacts[], ctx: AssistantContext | null = null): Answer {
  const intent = detectIntent(question)
  const scope = resolveScope(question, all, ctx)
  const list = all.filter((f) => scope.projectIds.includes(f.id))
  const n = topN(normalise(question))
  const lines: AnswerLine[] = []
  const caveats: string[] = []
  const links: Answer['links'] = []
  let table: Answer['table'] = null
  const line = (id: string, text: string, evidence: string[] = []) => lines.push({ id, text, evidence })
  const out = (): Answer => ({ intent, understood: UNDERSTOOD[intent], scope, lines, table, links, caveats, context: { projectIds: scope.projectIds, scopeLabel: scope.label, intent } })

  if (scope.matchedBy === 'region') caveats.push('منطقه از روی نام، موقعیت، طرح و پورتفولیوی ثبت‌شدهٔ پروژه تشخیص داده شد؛ پروژه‌ای که موقعیتش ثبت نشده ممکن است جا مانده باشد.')
  if (/(ماه|هفته|امسال|سال) (گذشته|قبل|پیش)|دیروز/.test(normalise(question)) && intent !== 'brief') caveats.push('پاسخ بر پایهٔ آخرین وضعیت ثبت‌شده است، نه وضعیت آن دوره.')
  if (intent === 'unknown') {
    line('help', 'پرسش را با موضوعات قابل پاسخ تطبیق ندادم. می‌توانم دربارهٔ انحراف زمان و هزینه، علت عقب‌ماندگی، مسائل باز، ریسک، تغییرات، تصمیم‌های معوق، هشدارها و اقدام پیشنهادی پاسخ بدهم.')
    for (const e of EXAMPLES.slice(0, 3)) line(`ex-${e.length}`, `نمونه: ${e}`)
    return out()
  }
  if (!list.length) {
    line('none', scope.matchedBy === 'all' ? 'هیچ پروژه‌ای در دسترس شما بارگذاری نشده است.' : `پروژه‌ای با «${scope.label}» در پروژه‌های در دسترس شما پیدا نشد.`)
    return out()
  }

  const withMetrics = list.filter((f) => f.input.metrics)
  if (withMetrics.length < list.length && ['top_schedule', 'top_cost', 'brief', 'status', 'compare'].includes(intent)) caveats.push(`${fa(list.length - withMetrics.length)} پروژه از ${fa(list.length)} شاخص پیشرفت ندارند و در رتبه‌بندی نیستند.`)
  const low = list.filter((f) => f.report.confidence === 'low').length
  if (low) caveats.push(`دادهٔ ${fa(low)} پروژه کهنه یا ناقص است (اطمینان پایین).`)

  switch (intent) {
    case 'top_schedule': {
      const rows = withMetrics.map((f) => ({ f, gap: (f.input.metrics as NonNullable<ProjectFacts['input']['metrics']>).lifecycle.actual - (f.input.metrics as NonNullable<ProjectFacts['input']['metrics']>).lifecycle.planned, spi: f.input.metrics?.evm?.spi ?? null }))
        .sort((a, b) => a.gap - b.gap).slice(0, n ?? 5)
      if (!rows.length) { line('none', 'هیچ‌یک از پروژه‌های این محدوده شاخص پیشرفت ثبت‌شده ندارند.'); break }
      rows.forEach((r, i) => line(`g-${r.f.id}`, `${fa(i + 1)}. ${r.f.name}: ${r.gap < 0 ? `${fa(Math.abs(r.gap), 1)} واحد درصد عقب از برنامه` : 'مطابق یا جلوتر از برنامه'}${r.spi != null ? ` · SPI ${fa(r.spi, 2)}` : ''}`, [`پیشرفت واقعی ${fa(r.f.input.metrics!.lifecycle.actual, 1)}٪ در برابر برنامه ${fa(r.f.input.metrics!.lifecycle.planned, 1)}٪`, `موتور شاخص پروژه — ${jd(r.f.input.metrics!.asOf)}`]))
      table = { head: ['پروژه', 'واقعی', 'برنامه', 'فاصله', 'SPI', 'مرحله'], rows: rows.map((r) => [r.f.name, `${fa(r.f.input.metrics!.lifecycle.actual, 1)}٪`, `${fa(r.f.input.metrics!.lifecycle.planned, 1)}٪`, fa(r.gap, 1), r.spi == null ? '—' : fa(r.spi, 2), r.f.phase?.title ?? '—']) }
      caveats.push('فاصله = پیشرفت واقعی − برنامه‌ای کل چرخهٔ عمر. پروژه‌های مراحل مختلف کنار هم آمده‌اند؛ برای مقایسهٔ منصفانه «مقایسهٔ بین‌پروژه‌ای» را ببینید.')
      links.push({ label: 'جدول کامل انحرافات', projectId: null, view: 'deviations' }, { label: 'مقایسه در گروه‌های هم‌مرحله', projectId: null, view: 'compare' })
      break
    }
    case 'top_cost': {
      const rows = list.filter((f) => !!f.input.metrics?.evm?.cpi).map((f) => ({ f, cpi: f.input.metrics!.evm!.cpi as number, vac: f.input.metrics!.evm!.vac, bac: f.input.metrics!.evm!.bac })).sort((a, b) => a.cpi - b.cpi).slice(0, n ?? 5)
      if (!rows.length) { line('none', 'برای پروژه‌های این محدوده CPI قابل محاسبه نیست: هزینهٔ تأییدشدهٔ EPC (صورت‌وضعیت) یا ارزش کسب‌شده ثبت نشده است.'); break }
      rows.forEach((r, i) => line(`c-${r.f.id}`, `${fa(i + 1)}. ${r.f.name}: CPI ${fa(r.cpi, 2)}${r.vac != null && r.bac > 0 ? ` · انحراف در پایان ${fa((r.vac / r.bac) * 100, 1)}٪ بودجه` : ''}`, ['موتور شاخص پروژه (EVM) + صورت‌وضعیت‌های مالی']))
      if (rows.length < list.length) caveats.push(`${fa(list.length - rows.length)} پروژه دادهٔ هزینهٔ کافی ندارند.`)
      links.push({ label: 'انحرافات هزینه', projectId: null, view: 'deviations' })
      break
    }
    case 'causes': {
      const cs = list.flatMap(rootCauses)
      if (!cs.length) { line('none', 'در این محدوده علتی با پشتوانهٔ داده پیدا نشد — یا انحراف مهمی نیست، یا داده‌های مرتبط (توقفات، مسائل، گیت‌ها) ثبت نشده‌اند.'); break }
      // the same cause across projects first, then the strongest single ones
      const group = new Map<string, { text: string; basis: string; projects: string[]; ev: string[] }>()
      for (const c of cs) {
        const k = c.key.replace(/^(stop|share|issues):/, '$1:').split('|')[0]
        const g = group.get(k) ?? { text: c.key.startsWith('stop:') ? `توقف «${c.key.slice(5)}»` : c.key.startsWith('share:') ? `عقب‌ماندگی ${DISCIPLINE_FA[c.key.slice(6) as keyof typeof DISCIPLINE_FA]}` : c.key.startsWith('issues:') ? `مسائل مهمِ معوق حوزهٔ ${DISCIPLINE_FA[c.key.slice(7) as keyof typeof DISCIPLINE_FA]}` : c.text, basis: BASIS_FA[c.basis], projects: [], ev: [] }
        g.projects.push(c.project); g.ev.push(`${c.project}: ${c.text}`)
        group.set(k, g)
      }
      const ranked = [...group.values()].sort((a, b) => b.projects.length - a.projects.length).slice(0, n ?? 5)
      ranked.forEach((g, i) => line(`k-${i}`, `${fa(i + 1)}. ${g.text} — در ${fa(g.projects.length)} پروژه (${g.basis})`, g.ev.slice(0, 4)))
      caveats.push('«شاهد هم‌زمان» یعنی هم‌زمانی با انحراف دیده شده، نه اینکه علت اثبات شده باشد. علت‌ها تا بازبینی کارشناس قطعی نیستند.')
      links.push({ label: 'تحلیل علل ریشه‌ای و بازبینی', projectId: list.length === 1 ? list[0].id : null, view: 'causes' })
      break
    }
    case 'issues_impact': {
      const today = list[0].input.today
      // impact = an important open issue in the area of a lagging discipline, or blocking a gate, overdue first
      const rows = list.flatMap((f) => (f.issues ?? []).filter((i) => !['approved', 'rejected', 'closed'].includes(i.status) && (i.priority === 'critical' || i.priority === 'high')).map((i) => {
        const lag = f.disciplines.filter((d) => d.planned != null && d.actual - d.planned <= -3).map((d) => d.key)
        const area = lag.find((k) => ({ engineering: /مهندسی|مدرک|نقشه|طراحی/, procurement: /تأمین|تامین|خرید|کالا|سفارش|حمل/, construction: /اجرا|نصب|جوش|کارگاه/ })[k].test(`${i.category ?? ''} ${i.title}`))
        const od = !!i.due && i.due.slice(0, 10) < today
        return { f, i, area, od, score: (i.priority === 'critical' ? 2 : 1) + (od ? 2 : 0) + (area ? 2 : 0) }
      })).sort((a, b) => b.score - a.score).slice(0, n ?? 7)
      if (!rows.length) { line('none', 'مسئلهٔ باز بحرانی یا بالایی در این محدوده ثبت نشده است.'); break }
      rows.forEach((r, i) => line(`i-${r.i.id}`, `${fa(i + 1)}. «${r.i.title}» — ${r.f.name}${r.od ? ' · معوق' : ''}${r.area ? ` · در حوزهٔ ${DISCIPLINE_FA[r.area]} که از برنامه عقب است` : ''}`, [`اولویت ${r.i.priority === 'critical' ? 'بحرانی' : 'بالا'}${r.i.due ? ` · مهلت ${jd(r.i.due)}` : ''}${r.i.owner ? ` · ${r.i.owner}` : ''}`, 'مدیریت مسائل']))
      caveats.push('«اثر بر پیشرفت» از اولویت، معوق بودن و هم‌حوزه بودن مسئله با رشتهٔ عقب‌افتاده سنجیده شده است؛ پیوند مستقیم مسئله با فعالیت در داده ثبت نمی‌شود.')
      links.push({ label: 'هشدارهای مسائل', projectId: null, view: 'warnings' })
      break
    }
    case 'brief': {
      const devs = list.flatMap(deviations).filter((d) => d.severity === 'material')
      const by = new Map<string, string[]>()
      for (const d of devs) by.set(d.project, [...(by.get(d.project) ?? []), `${DOMAIN_FA[d.domain]} (${d.metric}: ${d.actual})`])
      const crit = [...by].sort((a, b) => b[1].length - a[1].length)
      line('b-0', `${fa(list.length)} پروژه بررسی شد؛ ${fa(crit.length)} پروژه دست‌کم یک انحراف مهم دارند.`, ['آستانه‌های گزارش (تنظیمات)'])
      crit.slice(0, n ?? 5).forEach(([p, ds], i) => line(`b-p${i}`, `${p}: ${ds.slice(0, 3).join('؛ ')}`, ['جدول انحرافات']))
      const decisions = list.flatMap((f) => f.input.decisions.filter((d) => (d.status === 'pending' || d.status === 'in_review') && d.requiredBy && d.requiredBy.slice(0, 10) < f.input.today).map((d) => `${d.title} (${f.name})`))
      if (decisions.length) line('b-d', `تصمیم معوق: ${fa(decisions.length)} مورد — ${decisions.slice(0, 3).join('، ')}`, ['مرکز تصمیم'])
      const warns = list.flatMap(earlyWarnings).filter((w) => w.severity === 'high' && w.kind === 'statistical')
      if (warns.length) line('b-w', `هشدار روند: ${warns.slice(0, 2).map((w) => `${w.project} — ${w.reason}`).join('؛ ')}`, warns[0].evidence)
      const pat = compareProjects(list).patterns.filter((p) => p.escalate)
      if (pat.length) line('b-x', `موضوع مشترک برای تصمیم سطح بالاتر: ${pat.slice(0, 2).map((p) => `${p.text} (${fa(p.projects.length)} پروژه)`).join('؛ ')}`, ['تحلیل بین‌پروژه‌ای'])
      links.push({ label: 'ساخت گزارش مدیرعامل', projectId: null, view: 'evidence' })
      break
    }
    case 'decisions': {
      const today = list[0].input.today
      const pending = list.flatMap((f) => f.input.decisions.filter((d) => d.status === 'pending' || d.status === 'in_review').map((d) => ({ f, d, overdue: !!d.requiredBy && d.requiredBy.slice(0, 10) < today })))
        .sort((a, b) => Number(b.overdue) - Number(a.overdue))
      // approved decisions whose carrying actions are still open — decided but not executed
      const unexecuted = list.flatMap((f) => f.input.decisions.filter((d) => d.status === 'approved').map((d) => ({ f, d, open: f.input.actions.filter((a) => a.sourceDecisionId === d.id && a.status !== 'completed' && a.status !== 'cancelled') })).filter((x) => x.open.length))
      if (!pending.length && !unexecuted.length) { line('none', 'تصمیم در انتظار یا مصوبهٔ اجرانشده‌ای در این محدوده ثبت نشده است.'); break }
      pending.slice(0, n ?? 8).forEach((x, i) => {
        const blocked = x.f.input.actions.filter((a) => a.sourceDecisionId === x.d.id).length
        line(`d-${x.d.id}`, `${fa(i + 1)}. «${x.d.title}» — ${x.f.name}${x.overdue ? ` · موعد ${jd(x.d.requiredBy)} گذشته` : x.d.requiredBy ? ` · موعد ${jd(x.d.requiredBy)}` : ''}${x.d.owner ? ` · مرجع: ${x.d.owner}` : ''}`, [x.overdue ? 'پیامد: کار وابسته به این تصمیم متوقف است و تأخیر آن روی برنامه می‌نشیند' : 'در انتظار تصمیم', ...(blocked ? [`${fa(blocked)} اقدام به این تصمیم وابسته است`] : [])])
      })
      unexecuted.slice(0, 5).forEach((x) => line(`u-${x.d.id}`, `مصوب ولی اجرانشده: «${x.d.title}» — ${x.f.name} · ${fa(x.open.length)} اقدام باز`, x.open.slice(0, 3).map((a) => `«${a.title}»${a.dueDate ? ` — سررسید ${jd(a.dueDate)}` : ''}`)))
      caveats.push('پیامد از وضعیت ثبت‌شده استنتاج شده است (موعد گذشته، اقدام‌های وابسته)؛ اثر کمّی تأخیر تصمیم در داده ثبت نمی‌شود.')
      links.push({ label: 'مرکز تصمیم', projectId: list.length === 1 ? list[0].id : null, view: 'actions' })
      break
    }
    case 'suggest': {
      const s = list.flatMap(suggestions).filter((x) => !x.existing).slice(0, n ?? 6)
      if (!s.length) { line('none', 'پیشنهاد تازه‌ای نیست: یا انحراف مهمی دیده نشد، یا برای موارد موجود اقدام باز ثبت شده است.'); break }
      s.forEach((x, i) => line(`s-${x.projectId}-${x.key}`, `${fa(i + 1)}. ${x.project}: ${x.action} — اولویت ${x.priority === 'critical' ? 'بحرانی' : x.priority === 'high' ? 'بالا' : 'متوسط'}، مهلت پیشنهادی ${jd(x.due)}${x.owner ? `، مسئول پیشنهادی: ${x.owner}` : ''}`, [`مسئله: ${x.problem}`, ...(x.cause ? [`علت (${x.causeBasis ? BASIS_FA[x.causeBasis] : ''}): ${x.cause}`] : []), `سنجهٔ اثربخشی: ${x.kpi}`, `پیامد عدم اقدام: ${x.consequence}`]))
      caveats.push('این‌ها پیشنهاد سامانه‌اند، نه تصمیم. ثبت هر پیشنهاد به‌عنوان اقدام فقط با تأیید شما در «پیشنهاد اقدام» انجام می‌شود.')
      links.push({ label: 'پیشنهاد اقدام و ثبت', projectId: list.length === 1 ? list[0].id : null, view: 'actions' })
      break
    }
    case 'risks': {
      const rs = list.flatMap((f) => (f.input.risks ?? []).filter((r) => r.status !== 'closed' && (r.level === 'critical' || r.level === 'high')).map((r) => ({ f, r }))).sort((a, b) => b.r.score - a.r.score).slice(0, n ?? 8)
      const none = list.filter((f) => !f.input.risks?.length).length
      if (!rs.length) line('none', 'ریسک بحرانی یا بالای فعالی در این محدوده ثبت نشده است.')
      rs.forEach((x, i) => line(`r-${x.r.id}`, `${fa(i + 1)}. «${x.r.title}» — ${x.f.name} · امتیاز ${fa(x.r.score)} (${x.r.level === 'critical' ? 'بحرانی' : 'بالا'})`, [`ثبت ریسک${x.r.owner ? ` · مالک: ${x.r.owner}` : ''}`]))
      if (none) caveats.push(`${fa(none)} پروژه هیچ ریسکی ثبت نکرده‌اند — به معنای ریسک کم نیست.`)
      break
    }
    case 'warnings': {
      const ws = list.flatMap(earlyWarnings).slice(0, n ?? 8)
      if (!ws.length) { line('none', 'هشدار فعالی در این محدوده نیست.'); break }
      ws.forEach((w, i) => line(`w-${w.projectId}-${w.key}`, `${fa(i + 1)}. ${w.project}: ${w.title} — ${w.reason} (${w.kind === 'rule' ? 'قاعده‌محور' : 'آماری'}، اطمینان ${w.confidence === 'high' ? 'بالا' : w.confidence === 'medium' ? 'متوسط' : 'پایین'})`, w.evidence))
      caveats.push('پیش‌بینی هوش مصنوعی فعال نیست؛ هشدارهای آماری فقط ادامهٔ خطی روند ثبت‌شده‌اند و با داده‌ای کمتر از حد لازم صادر نمی‌شوند.')
      links.push({ label: 'هشدارهای پیش‌نگر', projectId: null, view: 'warnings' })
      break
    }
    case 'changes': {
      const cs = list.flatMap((f) => (f.changes ?? []).map((c) => ({ f, c })))
      if (!cs.length) { line('none', 'درخواست تغییری در این محدوده ثبت نشده است.'); break }
      const approved = cs.filter((x) => x.c.approvedCost != null || x.c.approvedDays != null)
      line('ch-0', `${fa(cs.length)} درخواست تغییر؛ ${fa(approved.length)} مورد با اثر تصویب‌شده: ${fa(approved.reduce((n2, x) => n2 + (x.c.approvedDays ?? 0), 0))} روز`, ['مدیریت تغییرات'])
      const by = new Map<string, number>()
      for (const x of cs) by.set(x.f.name, (by.get(x.f.name) ?? 0) + 1)
      ;[...by].sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([p, k], i) => line(`ch-${i + 1}`, `${p}: ${fa(k)} درخواست`))
      break
    }
    case 'discipline': {
      const qn = normalise(question)
      const key: Domain | null = /مهندسی|مدارک/.test(qn) ? 'engineering' : /تامین|تأمین|کالا|تدارکات|خرید/.test(qn) ? 'procurement' : /اجرا/.test(qn) ? 'construction' : null
      const ds = list.flatMap(deviations).filter((d) => (key ? d.domain === key : ['engineering', 'procurement', 'construction'].includes(d.domain)) && d.variance != null).sort((a, b) => (a.variance as number) - (b.variance as number)).slice(0, n ?? 6)
      if (!ds.length) { line('none', `برای ${key ? DOMAIN_FA[key] : 'رشته‌ها'} برنامه یا پیشرفت ثبت‌شده‌ای در این محدوده نیست.`); break }
      ds.forEach((d, i) => line(`ds-${d.projectId}-${d.key}`, `${fa(i + 1)}. ${d.project} — ${d.metric}: ${d.actual} در برابر ${d.reference} (${fa(d.variance as number, 1)} واحد)`, [d.source, d.definition]))
      links.push({ label: 'انحرافات به تفکیک حوزه', projectId: null, view: 'deviations' })
      break
    }
    case 'compare': {
      const { rows } = compareProjects(list)
      table = { head: ['پروژه', 'گروه', 'فاصله', 'SPI', 'CPI', 'رتبه در گروه'], rows: rows.map((r) => [r.project, r.group, r.gap == null ? '—' : fa(r.gap, 1), r.spi == null ? '—' : fa(r.spi, 2), r.cpi == null ? '—' : fa(r.cpi, 2), r.rankInGroup == null ? '—' : `${fa(r.rankInGroup)} از ${fa(r.groupSize)}`]) }
      line('cmp', `${fa(rows.length)} پروژه در ${fa(new Set(rows.map((r) => r.group)).size)} گروه هم‌مرحله مقایسه شدند. رتبه فقط درون هر گروه معنا دارد.`, ['تحلیل بین‌پروژه‌ای'])
      links.push({ label: 'مقایسهٔ کامل و الگوها', projectId: null, view: 'compare' })
      break
    }
    case 'status': {
      for (const f of list.slice(0, n ?? 6)) {
        const m = f.input.metrics
        line(`st-${f.id}`, `${f.name}: ${m ? `پیشرفت ${fa(m.lifecycle.actual, 1)}٪ در برابر ${fa(m.lifecycle.planned, 1)}٪ برنامه` : 'شاخص پیشرفت ثبت نشده'}${f.phase ? ` · مرحلهٔ ${f.phase.title}` : ''}${f.report.headline[0] ? ` · ${f.report.headline[0]}` : ''}`, [`گزارش شواهدمحور — اطمینان ${f.report.confidence === 'high' ? 'بالا' : f.report.confidence === 'medium' ? 'متوسط' : 'پایین'}`])
      }
      if (list.length > (n ?? 6)) caveats.push(`فقط ${fa(n ?? 6)} پروژهٔ اول نشان داده شد؛ برای فهرست کامل محدوده را دقیق‌تر کنید.`)
      break
    }
  }
  return out()
}
