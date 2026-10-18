import type { ScheduleResult } from './schedule'
import type { SchActivity, SchRelation } from './types'

/** Schedule-quality checks in the spirit of the DCMA 14-point assessment, on the CURRENT schedule. Thresholds are the commonly used ones; each check lists the activities it found. */
export interface QualityCheck { id: string; title: string; count: number; total: number; pct: number; limitPct: number | null; status: 'good' | 'warn' | 'bad'; codes: string[]; hint: string }
const HARD = new Set(['MSO', 'MFO', 'SNLT', 'FNLT'])

export function qualityChecks(acts: SchActivity[], rels: SchRelation[], forecast: ScheduleResult, dataDate: string): QualityCheck[] {
  const tasks = acts.filter((a) => a.type === 'task' || a.type === 'milestone')
  const open = tasks.filter((a) => !a.actualFinish && (a.pctComplete ?? 0) < 100)
  const byId = new Map(tasks.map((a) => [a.id, a]))
  const preds = new Map<string, SchRelation[]>(), succs = new Map<string, SchRelation[]>()
  for (const r of rels) { if (!byId.has(r.predId) || !byId.has(r.succId)) continue; preds.set(r.succId, [...(preds.get(r.succId) ?? []), r]); succs.set(r.predId, [...(succs.get(r.predId) ?? []), r]) }
  const mk = (id: string, title: string, list: SchActivity[], total: number, limitPct: number | null, hint: string, bad?: boolean): QualityCheck => {
    const pct = total ? (list.length / total) * 100 : 0
    const status: QualityCheck['status'] = list.length === 0 ? 'good' : limitPct == null ? 'bad' : pct <= limitPct ? 'warn' : 'bad'
    return { id, title, count: list.length, total, pct, limitPct, status: bad === false ? 'good' : status, codes: list.slice(0, 20).map((a) => a.code), hint }
  }
  const minStart = tasks.map((a) => a.plannedStart).filter((x): x is string => !!x).sort()[0], maxFin = tasks.map((a) => a.plannedFinish).filter((x): x is string => !!x).sort().pop()
  const noPred = open.filter((a) => !preds.get(a.id)?.length && a.plannedStart !== minStart)
  const noSucc = open.filter((a) => !succs.get(a.id)?.length && a.plannedFinish !== maxFin)
  const lags = rels.filter((r) => r.lag > 0), leads = rels.filter((r) => r.lag < 0)
  const nonFs = rels.filter((r) => r.type !== 'FS')
  const hard = open.filter((a) => HARD.has(a.constraintType))
  const highFloat = open.filter((a) => (forecast.byId.get(a.id)?.totalFloat ?? 0) > 44)
  const negFloat = open.filter((a) => (forecast.byId.get(a.id)?.totalFloat ?? 0) < 0)
  const longDur = open.filter((a) => a.type === 'task' && a.origDuration > 44)
  const badDates = tasks.filter((a) => (a.actualStart && a.actualStart > dataDate) || (a.actualFinish && a.actualFinish > dataDate) || (a.actualStart && a.actualFinish && a.actualFinish < a.actualStart))
  // out of sequence: started although an FS predecessor has not finished
  const oos = tasks.filter((a) => a.actualStart && !a.actualFinish ? (preds.get(a.id) ?? []).some((r) => r.type === 'FS' && !byId.get(r.predId)?.actualFinish) : false)
  const noBudget = tasks.filter((a) => a.type === 'task' && a.budgetCost <= 0)
  const hasBudgets = tasks.some((a) => a.budgetCost > 0)
  const out: QualityCheck[] = [
    mk('no_pred', 'فعالیت بدون پیش‌نیاز', noPred, open.length, 5, 'هر فعالیت (جز شروع پروژه) باید پیش‌نیاز داشته باشد؛ وگرنه تاریخ آن را منطق شبکه نمی‌سازد.'),
    mk('no_succ', 'فعالیت بدون پس‌نیاز', noSucc, open.length, 5, 'فعالیت بی‌پس‌نیاز تاخیرش به پایان پروژه نمی‌رسد؛ منطق ناقص است.'),
    { ...mk('lags', 'رابطه با تأخیر مثبت (Lag)', [], rels.length, 5, 'Lag زیاد منطق را پنهان می‌کند؛ به‌جای آن فعالیت واقعی تعریف کنید.'), count: lags.length, pct: rels.length ? (lags.length / rels.length) * 100 : 0, status: !lags.length ? 'good' : lags.length / Math.max(1, rels.length) <= 0.05 ? 'warn' : 'bad' },
    { ...mk('leads', 'رابطه با پیشی (Lead، Lag منفی)', [], rels.length, 0, 'Lead مسیر بحرانی را مبهم می‌کند و مجاز نیست مگر با دلیل.'), count: leads.length, pct: rels.length ? (leads.length / rels.length) * 100 : 0, status: leads.length ? 'bad' : 'good' },
    { ...mk('non_fs', 'سهم روابط غیر FS', [], rels.length, 10, 'حداقل ۹۰٪ روابط باید FS باشد؛ SS/FF زیاد برنامه را شکننده می‌کند.'), count: nonFs.length, pct: rels.length ? (nonFs.length / rels.length) * 100 : 0, status: !rels.length || nonFs.length / rels.length <= 0.1 ? 'good' : nonFs.length / rels.length <= 0.25 ? 'warn' : 'bad' },
    mk('hard', 'قید سخت (MSO/MFO/SNLT/FNLT)', hard, open.length, 5, 'قید سخت منطق شبکه را نادیده می‌گیرد؛ فقط با دلیل قراردادی.'),
    mk('high_float', 'شناوری بیش از ۴۴ روز کاری', highFloat, open.length, 5, 'شناوری بسیار زیاد یعنی منطق ناقص یا فعالیت بی‌اثر.'),
    mk('neg_float', 'شناوری منفی', negFloat, open.length, null, 'پیش‌بینی از قید یا تاریخ تعهدی عقب‌تر است؛ نیاز به تصمیم دارد.'),
    mk('long_dur', 'مدت بیش از ۴۴ روز کاری', longDur, open.filter((a) => a.type === 'task').length, 5, 'فعالیت‌های طولانی را بشکنید تا پیشرفتشان قابل اندازه‌گیری باشد.'),
    mk('bad_dates', 'تاریخ واقعی نامعتبر', badDates, tasks.length, null, 'تاریخ واقعی بعد از تاریخ وضعیت، یا پایان قبل از شروع.'),
    mk('oos', 'کار خارج از توالی', oos, tasks.length, null, 'فعالیتی شروع شده در حالی که پیش‌نیاز FS آن تمام نشده؛ یا منطق اشتباه است یا پیشرفت خارج از توالی ثبت شده.'),
  ]
  if (hasBudgets) out.push(mk('no_budget', 'فعالیت بدون بودجه', noBudget, tasks.filter((a) => a.type === 'task').length, 5, 'برای ارزش کسب‌شده و جریان نقدی هر فعالیت بودجه لازم است.'))
  return out
}

export const qualityScore = (cs: QualityCheck[]): number => (cs.length ? Math.round((cs.reduce((s, c) => s + (c.status === 'good' ? 1 : c.status === 'warn' ? 0.5 : 0), 0) / cs.length) * 100) : 100)
