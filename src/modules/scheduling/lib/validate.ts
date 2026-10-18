import { topoOrder } from '../../lifecycle/lib/cpm'
import type { ImportIssue, ParsedSchedule } from './types'

/** Checks that apply to every source (Excel, XER, XML) once parsed. Adds issues; never changes the data. */
export function validateParsed(p: ParsedSchedule): ImportIssue[] {
  const out: ImportIssue[] = []
  const tasks = p.activities.filter((a) => a.type === 'task' || a.type === 'milestone')
  const codes = new Set(p.activities.map((a) => a.code))
  // logic cycles
  const { cycle } = topoOrder([...codes], p.relations.filter((r) => codes.has(r.predCode) && codes.has(r.succCode)).map((r) => ({ from: r.predCode, to: r.succCode, type: r.type, lag: r.lag })))
  if (cycle) out.push({ level: 'error', message: `منطق شبکه چرخه دارد؛ فعالیت‌های درگیر: ${cycle.slice(0, 8).join('، ')}${cycle.length > 8 ? ' …' : ''}` })
  // open ends
  const hasPred = new Set(p.relations.map((r) => r.succCode)), hasSucc = new Set(p.relations.map((r) => r.predCode))
  const noPred = tasks.filter((a) => !hasPred.has(a.code) && a.type !== 'loe'), noSucc = tasks.filter((a) => !hasSucc.has(a.code) && a.type !== 'loe')
  if (p.relations.length === 0 && tasks.length > 1) out.push({ level: 'warning', message: 'هیچ رابطهٔ منطقی وجود ندارد؛ مسیر بحرانی و شناوری قابل‌اتکا محاسبه نمی‌شود.' })
  else {
    if (noPred.length > 1) out.push({ level: 'warning', message: `${noPred.length} فعالیت پیش‌نیاز ندارند (انتظار می‌رود فقط شروع پروژه چنین باشد).` })
    if (noSucc.length > 1) out.push({ level: 'warning', message: `${noSucc.length} فعالیت پس‌نیاز ندارند (انتظار می‌رود فقط پایان پروژه چنین باشد).` })
  }
  for (const a of tasks) {
    if (a.plannedStart && a.plannedFinish && a.plannedStart > a.plannedFinish) out.push({ level: 'error', code: a.code, row: a.row, message: `تاریخ شروع «${a.code}» بعد از پایان است.` })
    if (p.dataDate) {
      if (a.actualStart && a.actualStart > p.dataDate) out.push({ level: 'warning', code: a.code, row: a.row, message: `شروع واقعی «${a.code}» بعد از تاریخ وضعیت (${p.dataDate}) است.` })
      if (a.actualFinish && a.actualFinish > p.dataDate) out.push({ level: 'warning', code: a.code, row: a.row, message: `پایان واقعی «${a.code}» بعد از تاریخ وضعیت است.` })
    }
    if ((a.pctComplete ?? 0) > 0 && !a.actualStart) out.push({ level: 'warning', code: a.code, row: a.row, message: `«${a.code}» درصد پیشرفت دارد ولی شروع واقعی ندارد.` })
    if (a.actualFinish && a.pctComplete != null && a.pctComplete < 100) out.push({ level: 'warning', code: a.code, row: a.row, message: `«${a.code}» پایان واقعی دارد ولی پیشرفت کمتر از ۱۰۰٪ است.` })
    if (a.type === 'milestone' && a.origDuration > 0) out.push({ level: 'warning', code: a.code, row: a.row, message: `نقطه عطف «${a.code}» مدت دارد؛ صفر در نظر گرفته می‌شود.` })
  }
  if (p.calendars.length) {
    const known = new Set(p.calendars.map((c) => c.sourceId))
    const unknown = new Set(p.activities.map((a) => a.calendarSourceId).filter((c) => c && !known.has(c)))
    if (unknown.size) out.push({ level: 'warning', message: `تقویم‌های ناشناخته: ${[...unknown].slice(0, 5).join('، ')}؛ تقویم پیش‌فرض استفاده می‌شود.` })
  }
  if (p.calendars.length > 1 || new Set(p.activities.map((a) => a.calendarSourceId).filter(Boolean)).size > 1) out.push({ level: 'info', message: 'چند تقویم در فایل هست؛ محاسبات روی تقویم پیش‌فرض پروژه انجام می‌شود (محدودیت شناخته‌شده).' })
  return out
}

export const countIssues = (issues: ImportIssue[]) => ({ errors: issues.filter((i) => i.level === 'error').length, warnings: issues.filter((i) => i.level === 'warning').length, infos: issues.filter((i) => i.level === 'info').length })
