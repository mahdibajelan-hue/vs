/**
 * Grounded management assistant. It does not calculate anything: every number comes from the facts snapshot built out of the engines'
 * results and stored data. A question outside what the snapshot can answer gets an explicit «پاسخ قطعی ممکن نیست».
 */
export interface AssistantFacts {
  today: string
  projectName: string
  progress: { actual: number; planned: number | null; spi: number | null }
  activities: { id: string; title: string; unit: string; remaining: number; pct: number; plannedEnd: string | null; late: boolean; forecastFinish: string | null; onTimeProb: number | null; lateRisk: string; unreliable: boolean; readiness: string; blockers: string[]; front: string }[]
  stoppages: { category: string; hours: number; critical: boolean }[]
  alerts: { severity: string; title: string; reason: string }[]
  ledger: { title: string; mismatches: string[] }[]
  lookahead: { ppc: number | null; committed: number; missed: { title: string; cause: string }[] }
  pendingReviews: number
  welding: { title: string; remaining: number; perDay: number | null; requiredPerDay: number | null; extraCrews: number | null; reachable: boolean | null; capLabel: string | null; basis: string; confidence: string; workDays: number }[]
}
export interface Answer { text: string; sources: string[]; asOf: string; known: boolean }

const norm = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌‏]/g, ' ').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).toLowerCase()
const has = (q: string, ...w: string[]) => w.some((x) => q.includes(norm(x)))
const faN = (x: number, d = 1) => x.toLocaleString('fa-IR', { maximumFractionDigits: d })
const pc = (x: number | null) => (x == null ? '—' : `${faN(x * 100, 1)}٪`)
const CAT_FA: Record<string, string> = { material: 'کمبود مصالح', drawing: 'نقشه/مدرک', land: 'زمین/جبهه', permit: 'مجوز', weather: 'آب‌وهوا', equipment: 'تجهیزات', manpower: 'نیروی انسانی', hse: 'ایمنی', other: 'سایر' }

export function answer(question: string, f: AssistantFacts): Answer {
  const q = norm(question)
  const asOf = f.today
  const mk = (text: string, sources: string[], known = true): Answer => ({ text, sources, asOf, known })
  if (has(q, 'مغایرت', 'صورت وضعیت', 'صورتوضعیت', 'اندازه گیری')) {
    const bad = f.ledger.filter((l) => l.mismatches.length)
    return mk(bad.length ? `${faN(bad.length, 0)} فعالیت در زنجیرهٔ اجرایی ← تأییدشده ← اندازه‌گیری ← صورت‌وضعیت مغایرت دارند: ${bad.slice(0, 5).map((b) => `${b.title} (${b.mismatches.join('، ')})`).join('؛ ')}. توجه: تأیید فنی مشاور به‌تنهایی به‌معنای استحقاق پرداخت نیست.` : 'در حال حاضر مغایرتی بین مقادیر تأییدشده، اندازه‌گیری‌شده، صورت‌وضعیت‌شده و پرداخت‌شده ثبت نشده است. توجه: تأیید فنی مشاور به‌تنهایی به‌معنای استحقاق پرداخت نیست.', ['صفحهٔ مغایرت اجرایی و صورت‌وضعیت'])
  }
  if (has(q, 'جوش') && has(q, 'جبران', 'منابع', 'سه هفته', 'نیاز')) {
    if (!f.welding.length) return mk('فعالیتی با شمارندهٔ جوش و کار باقیمانده یا نرخ معتبر پیدا نشد؛ پاسخ قطعی ممکن نیست.', ['فعالیت‌ها'], false)
    return mk(f.welding.map((w) => {
      if (w.perDay == null || w.requiredPerDay == null) return `«${w.title}»: لاگ اکیپ کافی برای برآورد نرخ وجود ندارد؛ پاسخ قطعی ممکن نیست.`
      const need = `باقیمانده ${faN(w.remaining, 0)}؛ برای اتمام در ${faN(w.workDays, 0)} روز کاری به ${faN(w.requiredPerDay, 1)} در روز نیاز است در حالی که نرخ فعلی ${faN(w.perDay, 1)} در روز است.`
      const res = w.reachable ? `حدوداً ${faN(w.extraCrews ?? 0, 0)} اکیپ هم‌ترکیب دیگر لازم است (با فرض جبهه و پیش‌نیاز آماده).` : `با شرایط فعلی دست‌یافتنی نیست${w.capLabel ? ` (سقف: ${w.capLabel})` : ''}.`
      return `«${w.title}»: ${need} ${res} مبنای برآورد: ${w.basis === 'observed' ? 'سوابق همین فعالیت' : 'ضریب فرضی'}؛ اطمینان داده: ${w.confidence}.`
    }).join('\n'), ['موتور بهره‌وری و سناریوها'])
  }
  if (has(q, 'مانع', 'مسدود', 'مهندسی', 'تامین', 'پیش نیاز', 'آماده')) {
    const b = f.activities.filter((a) => a.readiness === 'blocked' || a.readiness === 'at_risk')
    return mk(b.length ? b.slice(0, 6).map((a) => `${a.title}: ${a.readiness === 'blocked' ? 'مسدود' : 'در معرض خطر'}${a.blockers.length ? ` — ${a.blockers.join('؛ ')}` : ''}`).join('\n') : 'برای فعالیت‌های دارای پیش‌نیاز تعریف‌شده مانع فعالی ثبت نشده است. فعالیت‌هایی که پیش‌نیاز برایشان تعریف نشده در این بررسی نیستند.', ['آمادگی فعالیت‌ها', 'مدارک مهندسی', 'ماژول تأمین'])
  }
  if (has(q, 'تعهد', 'انجام نشده', 'ppc')) {
    const l = f.lookahead
    return mk(l.committed ? `تحقق تعهدات هفتهٔ گذشته ${pc(l.ppc)} از ${faN(l.committed, 0)} تعهد است.${l.missed.length ? ` تعهدات محقق‌نشده: ${l.missed.slice(0, 5).map((m) => `${m.title}${m.cause ? ` (${m.cause})` : ''}`).join('؛ ')}.` : ''}` : 'تعهد هفتگی ثبت‌شده‌ای برای هفتهٔ گذشته وجود ندارد.', ['برنامهٔ سه‌هفته‌ای'])
  }
  if (has(q, 'تصمیم')) {
    const c = f.alerts.filter((a) => a.severity === 'critical')
    return mk(c.length ? `مواردی که تصمیم یا اقدام مدیریتی می‌خواهند: ${c.slice(0, 6).map((a) => a.title).join('؛ ')}.${f.pendingReviews ? ` همچنین ${faN(f.pendingReviews, 0)} گزارش در انتظار بررسی است.` : ''}` : 'هشدار بحرانی فعالی نیست.', ['هشدارها'])
  }
  if (has(q, 'علت', 'چرا', 'عقب', 'تاخیر', 'بیشترین')) {
    const late = f.activities.filter((a) => a.late || a.lateRisk === 'high').sort((a, b) => (a.onTimeProb ?? 1) - (b.onTimeProb ?? 1))
    const tot = new Map<string, number>(); for (const s of f.stoppages) tot.set(s.category, (tot.get(s.category) ?? 0) + s.hours)
    const top = [...tot].sort((a, b) => b[1] - a[1]).slice(0, 3)
    if (!late.length && !top.length) return mk('عقب‌ماندگی یا توقفی در داده‌ها ثبت نشده است.', ['فعالیت‌ها', 'توقف‌ها'])
    return mk(`${late.length ? `عقب‌ترین فعالیت‌ها: ${late.slice(0, 5).map((a) => `${a.title}${a.front ? ` (جبهه ${a.front})` : ''}`).join('؛ ')}. ` : ''}${top.length ? `بیشترین ساعت توقف ثبت‌شده به‌ترتیب: ${top.map(([c, h]) => `${CAT_FA[c] ?? c} ${faN(h, 0)} ساعت`).join('؛ ')}.` : ''}`, ['فعالیت‌ها', 'توقف‌های گزارش روزانه'])
  }
  if (has(q, 'وضعیت', 'پیشرفت', 'برنامه', 'امروز')) {
    const p = f.progress
    return mk(`${f.projectName}: پیشرفت واقعی (تأییدشده) ${pc(p.actual)}${p.planned != null ? `، برنامه‌ای ${pc(p.planned)}` : ''}${p.spi != null ? `، شاخص عملکرد برنامه ${faN(p.spi, 2)}` : ''}. ${faN(f.activities.filter((a) => a.late).length, 0)} فعالیت از موعد برنامه‌ای عقب است.`, ['پیشرفت فیزیکی'])
  }
  return mk('پاسخ قطعی به این پرسش با داده‌های موجود ممکن نیست. می‌توانم دربارهٔ وضعیت نسبت به برنامه، عقب‌ماندگی و علت آن، منابع لازم برای جبران جوشکاری، موانع مهندسی/تأمین، تعهدات انجام‌نشده، مغایرت اجرایی با صورت‌وضعیت و تصمیم‌های موردنیاز پاسخ بدهم.', [], false)
}
