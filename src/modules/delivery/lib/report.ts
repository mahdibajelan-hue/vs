import { BEARER_FA, CRITERIA, CRITERION, METHOD, METHODS, type MethodKey } from './bank'
import { GROUPS, PROJECT_TYPE_FA, QUESTIONS, QUESTION, type Answers, type ProjectType } from './questions'
import type { Result } from './engine'
import { openPrintDocument } from '../../../lib/printWindow'

/**
 * گزارش توجیهی — the fourteen sections of the management report, built only from the engine's result and the study's
 * answers (deterministic). The optional machine-written summary is shown beside the engine's own text, with the ids of
 * the findings it rests on, and never replaces it.
 */
export type Block = { p: string } | { ul: string[] } | { table: { head: string[]; rows: string[][]; num?: number[] } } | { bars: { label: string; value: number; max: number; tone?: 'good' | 'bad' | 'mute' }[] } | { note: string }
export interface Section { n: number; title: string; blocks: Block[] }
export interface ReportMeta { projectName: string; studyTitle: string; version: number; status: string; date: string; engine: string; createdName: string; decision?: { text: string; by: string; at: string } | null; contracts?: { title: string; type: string }[] }

const fa = (n: number | null | undefined, d = 0) => (n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('fa-IR', { maximumFractionDigits: d }))
const opt = (r: Result, k: MethodKey | null) => (k ? r.options.find((o) => o.key === k) ?? null : null)
const label = (r: Result, k: MethodKey | null) => opt(r, k)?.fa ?? '—'
const ans = (a: Answers, k: string) => {
  const q = QUESTION[k]; const v = a[k]
  if (v === null || v === undefined || v === '') return 'نامشخص'
  if (q?.type === 'bool') return v ? 'بله' : 'خیر'
  if (q?.type === 'choice') return q.options?.find((o) => o.v === v)?.fa ?? String(v)
  if (q?.type === 'scale') return `${fa(Number(v))} از ۵`
  return `${fa(Number(v))}${q?.unit ? ` ${q.unit}` : ''}`
}
const CONTRACT_FA: Record<string, string> = { epc: 'EPC', equipment_supply: 'تأمین تجهیزات', supervision: 'نظارت', other: 'سایر' }
const range = (x: [number, number] | null, unit: string) => (x ? `${fa(x[0])} تا ${fa(x[1])} ${unit}` : '—')

export function prerequisites(r: Result, a: Answers): string[] {
  const k = r.recommendation?.method, out: string[] = []
  const m = a.scopeMaturity == null ? null : Number(a.scopeMaturity)
  if (!k) return out
  if (['epc', 'turnkey', 'db', 'pc'].includes(k) || (k === 'hybrid' && /EPC|PC/.test(label(r, 'hybrid')))) {
    if (m != null && m < 2) out.push('تکمیل و تصویب طراحی پایه (FEED) و انجماد محدوده پیش از مناقصهٔ قیمت مقطوع.')
    out.push('تهیهٔ مشخصات عملکردی، ماتریس مسئولیت‌ها و شرایط عمومی و خصوصی پیمان با تخصیص صریح ریسک‌ها.')
    if (Number(a.inflation) >= 4) out.push('درج سازوکار تعدیل قیمت مصالح و ارز در پیمان برای کاهش صرف ریسک.')
    if (Number(a.landRisk) >= 3 || Number(a.permitRisk) >= 3) out.push('تملک اراضی و اخذ مجوزهای اصلی پیش از ابلاغ، خارج از تعهد پیمانکار.')
  }
  if (k === 'epcm' || k === 'multi') {
    out.push('تشکیل تیم کنترل هزینه، برنامه و فصل مشترک کارفرما با اختیارات و رویه‌های تأیید سریع.')
    out.push('تدوین برنامهٔ مدیریت فصل مشترک‌ها و ماتریس تقسیم کار میان بسته‌ها.')
    if (k === 'epcm') out.push('انتخاب پیمانکار EPCM بر پایهٔ کیفیت (QBS) و تعیین سقف حق‌الزحمه و شاخص‌های عملکرد.')
  }
  if (k === 'dbb' || k === 'pc') out.push('تکمیل طراحی تفصیلی و فهرست مقادیر توسط مشاور و بازبینی مستقل آن پیش از مناقصه.')
  if (k === 'bot') out.push('تدوین چارچوب امتیاز، قرارداد خرید تضمینی یا تعرفه و ضمانت‌های دولتی؛ انتخاب رقابتی سرمایه‌گذار.')
  if (k === 'direct') out.push('اخذ مجوز اجرای امانی، تأمین نیرو و ماشین‌آلات و برنامهٔ خرید مستقیم.')
  if (k === 'hybrid') out.push('تعیین صریح مسئول یکپارچه‌سازی و ماتریس فصل مشترک میان قراردادهای ترکیب.')
  if (r.procurement.find((p) => p.key === 'ofe' && p.recommended)) out.push('تصویب بودجه و آغاز خرید زودهنگام اقلام بلندمدت پیش از انتخاب پیمانکار.')
  const crit = r.gaps.filter((g) => g.critical)
  if (crit.length) out.push(`تکمیل اطلاعات کلیدی نامشخص: ${crit.slice(0, 6).map((g) => g.fa).join('؛ ')}.`)
  return out
}
export function decisionsNeeded(r: Result, a: Answers): string[] {
  const out: string[] = []
  if (!r.recommendation) return ['تکمیل اطلاعات پایه برای امکان تحلیل.']
  if (r.confidence.decisive) out.push(`تصویب روش اجرای «${r.recommendation.methodFa}».`)
  else out.push(`انتخاب میان «${label(r, r.winner)}» و «${label(r, r.runnerUp)}» با داوری مدیریت، یا دستور تکمیل اطلاعات و تحلیل مجدد.`)
  const pr = r.pricing.filter((p) => p.recommended).map((p) => p.fa)
  if (pr.length) out.push(`تصویب سازوکار قیمت‌گذاری: ${pr.join('، ')}.`)
  if (r.procurement.find((p) => p.key === 'ofe' && p.recommended)) out.push('تصویب تأمین مالی و آغاز خرید زودهنگام اقلام بلندمدت.')
  if (a.openTender === true && ['epcm', 'bot', 'direct'].includes(r.recommendation.method)) out.push('اخذ مجوز استثنا یا تشریفات خاص از مرجع مناقصات برای روش پیشنهادی.')
  if (['epcm', 'multi', 'dbb', 'ep', 'direct'].includes(r.recommendation.method) && Number(a.ownerPm) <= 3) out.push('تخصیص نیرو و اختیارات لازم به تیم کارفرما برای مدیریت قراردادهای متعدد.')
  const own = r.risks.filter((x) => x.severity >= 4 && (x.bearer[r.recommendation!.method as MethodKey] === 'O'))
  if (own.length) out.push(`پذیرش آگاهانهٔ نگه‌داشت ریسک‌های ${own.map((x) => `«${x.fa}»`).join('، ')} نزد کارفرما و تخصیص ذخیرهٔ احتمالی.`)
  return out
}

export function buildReport(r: Result, a: Answers, meta: ReportMeta): Section[] {
  const w = r.winner ? opt(r, r.winner)! : null
  const viable = r.options.filter((o) => o.status !== 'excluded').sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99))
  const excluded = r.options.filter((o) => o.status === 'excluded')
  const conf = r.confidence
  const S: Section[] = []
  const push = (title: string, blocks: Block[]) => S.push({ n: S.length + 1, title, blocks })

  push('خلاصهٔ مدیریتی', [
    { p: r.recommendation?.statement ?? 'اطلاعات برای تحلیل کافی نیست.' },
    { p: `درجهٔ اطمینان تحلیل ${fa(conf.score)} از ۱۰۰ (${conf.level === 'high' ? 'بالا' : conf.level === 'medium' ? 'متوسط' : 'پایین'}) است${conf.reasons.length ? `؛ ${conf.reasons.join('؛ ')}` : ''}.` },
    ...(r.recommendation ? [{ ul: [
      `روش تحویل: ${r.recommendation.methodFa}`,
      `سازوکار قیمت‌گذاری: ${r.pricing.filter((p) => p.recommended).map((p) => p.fa).join('، ') || '—'}`,
      `راهبرد تأمین: ${r.procurement.filter((p) => p.recommended).map((p) => p.fa).join('، ') || '—'}`,
      `راهبرد اجرا: ${r.execution.filter((p) => p.recommended).map((p) => p.fa).join('، ') || '—'}`,
    ] } as Block] : []),
    { note: 'این گزارش نتیجهٔ موتور تصمیم‌یار است و تا تصویب مرجع ذی‌صلاح، تصمیم نهایی محسوب نمی‌شود.' },
  ])
  push('معرفی و مشخصات پروژه', [
    { table: { head: ['مشخصه', 'مقدار'], rows: [['پروژه', meta.projectName], ['نوع', PROJECT_TYPE_FA[(a.projectType as ProjectType) ?? 'other'] ?? '—'], ['برآورد سرمایه‌گذاری', ans(a, 'capex')], ['مدت برنامه‌ریزی‌شده', ans(a, 'durationMonths')], ...(a.projectType === 'pipeline' ? [['طول خط', ans(a, 'lengthKm')]] : []), ['منبع تأمین مالی', ans(a, 'funding')], ['بلوغ طراحی', ans(a, 'scopeMaturity')]] } },
    ...(meta.contracts?.length ? [{ p: `قراردادهای ثبت‌شده در ماژول قراردادها: ${meta.contracts.map((c) => `${c.title} (${CONTRACT_FA[c.type] ?? (c.type || '—')})`).join('، ')}.` } as Block] : []),
  ])
  const grp = (g: string) => QUESTIONS.filter((q) => q.group === g && q.key !== 'projectType').map((q) => [q.fa, ans(a, q.key)])
  push('تحلیل ویژگی‌های پروژه', [
    { table: { head: ['عامل', 'ارزیابی'], rows: [...grp('technical'), ...grp('schedule')] } },
    { p: `مهم‌ترین عوامل اثرگذار بر نتیجه (بیشترین وزن): ${CRITERIA.map((c) => ({ c, v: r.weights[c.key] })).sort((x, y) => y.v - x.v).slice(0, 4).map((x) => `${x.c.fa} (${fa(x.v)}٪)`).join('، ')}.` },
  ])
  push('تحلیل شرایط سازمان و بازار', [
    { table: { head: ['عامل', 'ارزیابی'], rows: [...grp('owner'), ...grp('market'), ...grp('finance'), ...grp('legal')] } },
  ])
  push('گزینه‌های مورد بررسی', [
    { table: { head: ['گزینه', 'وضعیت', 'شرح'], rows: r.options.map((o) => [o.fa, o.status === 'ok' ? 'قابل بررسی' : o.status === 'conditional' ? 'مشروط' : 'حذف‌شده', o.summary]) } },
    ...(excluded.length ? [{ ul: excluded.map((o) => `${o.fa}: ${o.reasonsAgainst.join(' ') || o.constraints.map((c) => c.why).join(' ')}`) } as Block] : []),
  ])
  push('ماتریس ارزیابی و امتیازدهی', [
    { p: 'امتیاز هر گزینه در هر معیار از ۱ تا ۵ است (پس از اعمال قواعد زمینه‌ای) و امتیاز کل، مجموع وزنی آن‌ها از ۱۰۰ است. عدد به‌تنهایی مبنای تصمیم نیست و باید همراه با محدودیت‌ها، ریسک و تحلیل حساسیت خوانده شود.' },
    { table: { head: ['معیار', 'وزن٪', ...viable.slice(0, 6).map((o) => METHOD[o.key as Exclude<MethodKey, 'hybrid'>]?.en ?? 'Hybrid')], rows: CRITERIA.map((c) => [c.fa, fa(r.weights[c.key]), ...viable.slice(0, 6).map((o) => fa(o.profile[c.key], 1))]), num: [1, 2, 3, 4, 5, 6, 7] } },
    { bars: viable.map((o) => ({ label: o.fa, value: o.score, max: 100, tone: o.key === r.winner ? 'good' : o.status === 'conditional' ? 'mute' : undefined })) },
  ])
  push('مقایسهٔ سناریوها', [
    { table: { head: ['سناریو', 'گزینهٔ برتر', 'دومین گزینه'], rows: r.scenarios.map((s) => [s.fa, label(r, s.winner), label(r, s.ranking[1]?.key ?? null)]) } },
    { p: `گزینهٔ برتر وضع پایه در ${fa(r.scenarios.filter((s) => s.winner === r.winner).length)} از ${fa(r.scenarios.length)} سناریو برتر می‌ماند.` },
    { p: `تحلیل حساسیت: ${r.sensitivity.filter((s) => s.flipTo).slice(0, 4).map((s) => `تغییر وزن «${s.fa}» ${s.flipUp ? `به ${fa(s.flipUp, 2)} برابر` : `به ${fa(s.flipDown, 2)} برابر`} گزینهٔ برتر را به «${label(r, s.flipTo)}» تغییر می‌دهد`).join('؛ ') || 'تغییر هیچ وزنی در بازهٔ صفر تا سه برابر، گزینهٔ برتر را تغییر نمی‌دهد'}.` },
    { p: r.inputUncertainty.unknownScales ? `با ${fa(r.inputUncertainty.unknownScales)} پاسخ نامشخص، در فرض بدبینانه «${label(r, r.inputUncertainty.pessimistic)}» و در فرض خوش‌بینانه «${label(r, r.inputUncertainty.optimistic)}» برتر است${r.inputUncertainty.stable ? '؛ نتیجه پایدار است' : '؛ نتیجه به این پاسخ‌ها حساس است'}.` : 'همهٔ پاسخ‌های مقیاسی مشخص است.' },
  ])
  push('تحلیل ریسک', [
    { table: { head: ['خانوادهٔ ریسک', 'شدت', 'اثر', ...(w ? [`تحمل‌کننده در «${METHOD[w.key as Exclude<MethodKey, 'hybrid'>]?.en ?? 'Hybrid'}»`] : [])], rows: r.risks.map((x) => [x.fa, fa(x.severity), fa(x.impact), ...(w ? [x.bearer[w.key] ? BEARER_FA[x.bearer[w.key]!] : 'بر پایهٔ ترکیب'] : [])]) } },
    ...(r.registerRisks.length ? [{ p: `${fa(r.registerRisks.length)} ریسک باز از ماژول مدیریت ریسک در این تحلیل لحاظ شده است.` } as Block] : []),
    { table: { head: ['گزینه', 'تناسب تخصیص ریسک (از ۵)', 'سهم ریسک‌های بد تخصیص‌یافته'], rows: viable.filter((o) => o.key !== 'hybrid').map((o) => [o.fa, fa(o.riskFit, 1), `${fa(o.riskExposure)}٪`]) } },
  ])
  push('تحلیل زمان و هزینه', [
    { p: 'بازه‌ها نسبی و بر پایهٔ شاخص‌های تجربی هر روش نسبت به روش سه‌عاملی است و جایگزین برآورد تفصیلی ماژول «برآورد هزینه» و برنامهٔ زمان‌بندی نیست.' },
    { table: { head: ['گزینه', 'مدت اجرا', 'هزینهٔ تمام‌شدهٔ مورد انتظار'], rows: viable.map((o) => [o.fa, range(o.duration, 'ماه'), range(o.cost, 'میلیارد ریال')]) } },
  ])
  push('استراتژی پیشنهادی', r.recommendation ? [
    { p: `${r.recommendation.definitive ? 'پیشنهاد' : 'جهت‌گیری'}: ${r.recommendation.methodFa}.` },
    ...(w?.components ? [{ ul: w.components } as Block] : []),
    { table: { head: ['بخش راهبرد', 'گزینه', 'تناسب', 'دلیل'], rows: [
      ...r.pricing.filter((p) => p.recommended).map((p) => ['قیمت‌گذاری و قرارداد', p.fa, `${fa(p.score)}٪`, p.reasons.join(' ')]),
      ...r.procurement.filter((p) => p.recommended).map((p) => ['تأمین و مناقصه', p.fa, `${fa(p.score)}٪`, p.reasons.join(' ')]),
      ...r.execution.filter((p) => p.recommended).map((p) => ['اجرا و ساخت', p.fa, `${fa(p.score)}٪`, `${p.reasons.join(' ')}${p.caution ? ` — احتیاط: ${p.caution}` : ''}`]),
    ] } },
    ...(w ? [{ ul: [...w.strengths.map((x) => `نقطهٔ قوت: ${x}`), ...w.weaknesses.map((x) => `نقطهٔ ضعف: ${x}`), ...w.constraints.filter((c) => c.kind === 'caution').map((c) => `احتیاط: ${c.why}`)] } as Block] : []),
  ] : [{ p: 'پیشنهادی ارائه نمی‌شود.' }])
  push('دلایل انتخاب و رد سایر گزینه‌ها', [
    ...(w ? [{ p: `دلایل برتری «${w.fa}»: ${w.strengths.join('، ') || '—'}.` } as Block, { ul: w.adjustments.filter((x) => x.delta > 0).slice(0, 6).map((x) => `${CRITERION[x.crit].fa}: ${x.why}`) } as Block] : []),
    { table: { head: ['گزینه', 'رتبه', 'امتیاز', 'دلیل رتبهٔ پایین‌تر یا حذف'], rows: r.options.filter((o) => o.key !== r.winner).sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99)).map((o) => [o.fa, o.rank ? fa(o.rank) : 'حذف', o.status === 'excluded' ? '—' : fa(o.score, 1), o.reasonsAgainst.join(' ') || '—']) } },
  ])
  push('پیش‌نیازهای اجرایی', [{ ul: prerequisites(r, a) }])
  push('تصمیمات موردنیاز مدیریت', [{ ul: decisionsNeeded(r, a) }])
  push('جمع‌بندی و پیشنهاد نهایی', [
    { p: r.recommendation ? (r.recommendation.definitive ? `با توجه به ویژگی‌های فنی، شرایط مالی، توان کارفرما، بازار و ریسک‌های طرح، روش «${r.recommendation.methodFa}» همراه با راهبردهای قراردادی و اجرایی بالا پیشنهاد می‌شود. این پیشنهاد در ${fa(r.scenarios.filter((s) => s.winner === r.winner).length)} از ${fa(r.scenarios.length)} سناریو پایدار است.` : `تحلیل جهت‌گیری «${r.recommendation.methodFa}» را نشان می‌دهد، اما پیشنهاد قطعی نیست. پیشنهاد می‌شود پیش از تصمیم، موارد زیر رفع شود: ${conf.reasons.join('؛ ')}.`) : 'اطلاعات کافی برای جمع‌بندی وجود ندارد.' },
    ...(r.contradictions.length ? [{ ul: r.contradictions.map((c) => `${c.blocking ? 'تعارض اساسی' : 'تعارض'}: ${c.fa}`) } as Block] : []),
    ...(meta.decision ? [{ p: `تصمیم ثبت‌شده: ${meta.decision.text} — ${meta.decision.by}، ${meta.decision.at}.` } as Block] : []),
  ])
  return S
}

/** findings the narrative service may rephrase (each with a stable id it must cite) */
export function narrativeItems(r: Result): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = []
  const w = r.winner ? opt(r, r.winner) : null, ru = r.runnerUp ? opt(r, r.runnerUp) : null
  if (w) out.push({ id: 'f-top', text: `گزینهٔ برتر: ${w.fa} با امتیاز ${fa(w.score, 1)} از ۱۰۰.` })
  if (ru) out.push({ id: 'f-second', text: `گزینهٔ دوم: ${ru.fa} با امتیاز ${fa(ru.score, 1)}؛ فاصله ${fa(r.gap, 1)} امتیاز.` })
  out.push({ id: 'f-conf', text: `اطمینان تحلیل ${fa(r.confidence.score)} از ۱۰۰؛ ${r.confidence.decisive ? 'پیشنهاد قطعی است' : 'پیشنهاد قطعی نیست'}. ${r.confidence.reasons.join('؛ ')}` })
  if (w) out.push({ id: 'f-strength', text: `نقاط قوت گزینهٔ برتر: ${w.strengths.join('، ')}.` })
  if (w?.weaknesses.length) out.push({ id: 'f-weak', text: `نقاط ضعف گزینهٔ برتر: ${w.weaknesses.join('، ')}.` })
  const ex = r.options.filter((o) => o.status === 'excluded' && o.key !== 'hybrid')
  if (ex.length) out.push({ id: 'f-excl', text: `گزینه‌های حذف‌شده: ${ex.map((o) => `${o.fa} (${o.reasonsAgainst[0] ?? ''})`).join('؛ ')}` })
  const top = [...r.risks].sort((a, b) => b.severity * b.impact - a.severity * a.impact).slice(0, 3)
  out.push({ id: 'f-risk', text: `ریسک‌های اصلی: ${top.map((x) => `${x.fa} (شدت ${fa(x.severity)}، اثر ${fa(x.impact)})`).join('، ')}.` })
  out.push({ id: 'f-scen', text: `گزینهٔ برتر در ${fa(r.scenarios.filter((s) => s.winner === r.winner).length)} از ${fa(r.scenarios.length)} سناریو برتر می‌ماند.` })
  const pr = r.pricing.filter((p) => p.recommended), ex2 = r.execution.filter((p) => p.recommended)
  if (pr.length) out.push({ id: 'f-pricing', text: `قیمت‌گذاری پیشنهادی: ${pr.map((p) => p.fa).join('، ')}.` })
  if (ex2.length) out.push({ id: 'f-exec', text: `راهبرد اجرای پیشنهادی: ${ex2.map((p) => p.fa).join('، ')}.` })
  return out
}

// ── printable A4 document (the browser's «Save as PDF» makes the PDF)
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
function blockHtml(b: Block): string {
  if ('p' in b) return `<p>${esc(b.p)}</p>`
  if ('note' in b) return `<p class="note">${esc(b.note)}</p>`
  if ('ul' in b) return b.ul.length ? `<ul>${b.ul.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''
  if ('bars' in b) return `<div class="bars">${b.bars.map((x) => `<div class="bar ${x.tone ?? ''}"><span>${esc(x.label)}</span><i><b style="width:${Math.max(2, (x.value / x.max) * 100)}%"></b></i><em>${fa(x.value, 1)}</em></div>`).join('')}</div>`
  const t = b.table
  return `<table><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => `<td${t.num?.includes(i) ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}
export function reportHtml(sections: Section[], meta: ReportMeta, narrative: { sentences: { text: string; refs: string[] }[] } | null): string {
  const ai = narrative?.sentences.length ? `<section class="ai"><h3>خلاصهٔ جمله‌بندی‌شده توسط دستیار هوشمند</h3><p class="note">این متن فقط یافته‌های موتور تصمیم را بازنویسی می‌کند و هر جمله به شناسهٔ یافته ارجاع دارد؛ مبنای اعداد، جدول‌های همین گزارش است.</p>${narrative.sentences.map((s) => `<p>${esc(s.text)} <small>[${s.refs.map(esc).join('، ')}]</small></p>`).join('')}</section>` : ''
  const body = `<header><div><small>${esc(meta.projectName)}</small><h1>گزارش توجیهی انتخاب روش و راهبرد اجرای پروژه</h1><b>PROJECT DELIVERY STRATEGY & EXECUTION METHOD SELECTION</b></div>
<div class="id"><strong>نسخهٔ ${fa(meta.version)}</strong><span>${esc(meta.status)}</span><span>${esc(meta.date)}</span></div></header>
<p class="meta">${esc(meta.studyTitle)} · تهیه‌کننده: ${esc(meta.createdName || '—')} · موتور تصمیم ${esc(meta.engine)}</p>
${sections.map((s) => `<section><h2>${fa(s.n)}. ${esc(s.title)}</h2>${s.n === 1 ? ai : ''}${s.blocks.map(blockHtml).join('')}</section>`).join('')}
<footer>صادرشده از سامانه — ماژول راهبرد و روش اجرای پروژه. این گزارش محرمانه است و فقط برای مراجع تصمیم‌گیری طرح تهیه شده است.</footer>`
  return `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>Delivery strategy — v${meta.version}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;800&display=swap">
<style>
@page{size:A4;margin:14mm 13mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font:10.6px/1.85 Vazirmatn,Tahoma,sans-serif;color:#0f172a}
header{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;padding:12px 16px;border-radius:10px;background:#0b1220;color:#f8fafc}
header small{color:#94a3b8}h1{margin:3px 0;font-size:17px;font-weight:800}header b{font:600 9px/1 sans-serif;letter-spacing:.14em;color:#5eead4}
.id{display:grid;gap:2px;text-align:center}.id strong{font-size:15px}.id span{font-size:9.5px;color:#cbd5e1}
.meta{color:#475569;margin:8px 2px}
section{margin-top:12px;break-inside:auto}h2{margin:0 0 6px;font-size:12.5px;font-weight:800;padding:4px 10px;border-inline-start:4px solid #0d9488;background:#f1f5f9;border-radius:4px;break-after:avoid}
p{margin:4px 2px}.note{color:#64748b;font-size:9.5px}ul{margin:4px 16px;padding:0}li{margin:2px 0}
table{width:100%;border-collapse:collapse;margin:5px 0;font-size:9.8px}th,td{border:1px solid #cbd5e1;padding:3px 6px;text-align:right;vertical-align:top}thead th{background:#e2e8f0;font-weight:800}td.n{text-align:center;white-space:nowrap}
tr{break-inside:avoid}.bars{display:grid;gap:4px;margin:6px 0}.bar{display:grid;grid-template-columns:42% 1fr 44px;gap:8px;align-items:center}.bar i{height:9px;background:#e2e8f0;border-radius:9px;overflow:hidden}.bar b{display:block;height:100%;background:#64748b;border-radius:9px}
.bar.good b{background:#0d9488}.bar.mute b{background:#cbd5e1}.bar em{font-style:normal;font-weight:800;text-align:left}
.ai{border:1px dashed #a78bfa;border-radius:8px;padding:6px 10px;margin-bottom:6px;background:#faf5ff}.ai h3{margin:0;font-size:11px;color:#6d28d9}.ai small{color:#7c3aed}
footer{margin-top:14px;font-size:8.6px;color:#64748b;text-align:center;border-top:1px solid #e2e8f0;padding-top:6px}
</style></head><body>${body}</body></html>`
}
export function openReport(sections: Section[], meta: ReportMeta, narrative: { sentences: { text: string; refs: string[] }[] } | null): boolean {
  return openPrintDocument(reportHtml(sections, meta, narrative), { print: true, delay: 500 })
}
export const GROUP_LABELS = GROUPS
export const ALL_METHODS = METHODS
