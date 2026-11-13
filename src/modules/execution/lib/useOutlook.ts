import { useMemo } from 'react'
import { useExecutionModel } from './useExecutionModel'
import { useExecutionStore } from '../store/useExecutionStore'
import { civilDays, outlookInputs } from './outlookData'
import { isClimate, outlook, type ClimateKey } from './engine/outlook'
import { isCivilSection, roleOf } from './engine/civil'
import { useRemembered } from '../../../lib/navMemory'

export const WD_PRESETS: { label: string; days: number[] }[] = [
  { label: 'تقویم پروژه', days: [] }, { label: '۵ روز در هفته', days: [0, 1, 2, 3, 4] }, { label: '۶ روز در هفته', days: [0, 1, 2, 3, 4, 5] }, { label: '۷ روز در هفته', days: [0, 1, 2, 3, 4, 5, 6] },
]
export type SetupKey = 'reports' | 'crews' | 'links' | 'climate' | 'civil'
export interface SetupStep { key: SetupKey; state: 'done' | 'partial' | 'todo'; note: string }

/**
 * Everything the «پیش‌بینی اتمام پروژه» views share: the execution model, the forecast inputs, the forecast under the
 * current scenario (whole-crew changes and work days, remembered per project across the views), the civil machinery
 * days, and how far the project's setup has come.
 */
export function useOutlook(projectId: string) {
  const m = useExecutionModel(projectId)
  const ex = useExecutionStore()
  const canCfg = ex.can(projectId, '*') || ex.can(projectId, 'configure')
  const save = (patch: Parameters<typeof ex.saveSettings>[1]) => ex.saveSettings(projectId, patch)
  const climate: ClimateKey = isClimate(m.settings.climate) ? m.settings.climate : 'west_semi_arid'
  const [delta, setDelta] = useRemembered<Record<string, number>>(`ol-delta-${projectId}`, {}, (v) => !!v && typeof v === 'object')
  const [wdIdx, setWdIdx] = useRemembered<number>(`ol-wd-${projectId}`, 0, (v) => typeof v === 'number' && v >= 0 && v < WD_PRESETS.length)
  const workDays = WD_PRESETS[wdIdx].days.length ? WD_PRESETS[wdIdx].days : m.settings.workDays
  const inputs = useMemo(() => outlookInputs(m), [m])
  const base = useMemo(() => outlook({ ...inputs, groupWeights: m.settings.groupWeights, today: m.today, scenario: { crews: {}, climate, workDays } }), [inputs, m.settings.groupWeights, m.today, climate, workDays])
  const scenCrews = useMemo(() => Object.fromEntries(base.crews.filter((c) => delta[c.crew]).map((c) => [c.crew, Math.max(0, (c.recent ?? 0) + delta[c.crew])])), [base.crews, delta])
  const o = useMemo(() => (Object.keys(scenCrews).length ? outlook({ ...inputs, groupWeights: m.settings.groupWeights, today: m.today, scenario: { crews: scenCrews, climate, workDays } }) : base), [base, scenCrews, inputs, m.settings.groupWeights, m.today, climate, workDays])
  const machines = useMemo(() => civilDays(m, inputs.days), [m, inputs.days])
  const civilSections = useMemo(() => {
    const chosen = m.settings.civilSections
    // a section is civil by its name (حفاری، مسیرسازی، خاکریزی …) or by its machines (بولدوزر، پیکور، بیل، لودر، گریدر)
    const earth = new Set<string>(), all = new Set<string>()
    for (const dm of machines.values()) for (const [sec, ms] of dm) { all.add(sec); if (Object.keys(ms).some((n) => ['dozer', 'breaker', 'excavator', 'loader', 'grader'].includes(roleOf(n)))) earth.add(sec) }
    return chosen && chosen.length ? chosen : [...all].filter((s) => isCivilSection(s) || earth.has(s))
  }, [m.settings.civilSections, machines])

  const setup = useMemo<SetupStep[]>(() => {
    const open = inputs.activities.filter((a) => a.baseQty - a.doneQty > 0)
    const usedCrews = [...new Set(open.map((a) => a.crew).filter((x): x is string => !!x))]
    const withComp = usedCrews.filter((c) => inputs.sections.find((s) => s.name === c)?.composition).length
    const suggested = open.filter((a) => inputs.crewSource[a.id] === 'suggested').length
    const unlinked = open.filter((a) => !a.crew).length
    return [
      { key: 'reports', state: o.historyDays >= 10 ? 'done' : o.historyDays > 0 ? 'partial' : 'todo', note: `${o.historyDays.toLocaleString('fa-IR')} روز گزارش بررسی‌شده` },
      { key: 'crews', state: !usedCrews.length ? 'todo' : withComp === usedCrews.length ? 'done' : withComp ? 'partial' : 'todo', note: `${withComp.toLocaleString('fa-IR')} از ${usedCrews.length.toLocaleString('fa-IR')} نوع اکیپ ترکیب دارد` },
      { key: 'links', state: suggested === 0 && unlinked === 0 ? 'done' : suggested < open.length ? 'partial' : 'todo', note: suggested ? `${suggested.toLocaleString('fa-IR')} فعالیت با اکیپ پیشنهادی، تأییدنشده` : unlinked ? `${unlinked.toLocaleString('fa-IR')} فعالیت بدون اکیپ` : 'همهٔ فعالیت‌ها اکیپ دارند' },
      { key: 'climate', state: m.settings.climate ? 'done' : 'todo', note: m.settings.climate ? 'تعیین شده' : 'هنوز پیش‌فرض (نیمه‌خشک غرب)' },
      { key: 'civil', state: civilSections.length ? (m.settings.civilSections?.length ? 'done' : 'partial') : 'todo', note: civilSections.length ? `${civilSections.length.toLocaleString('fa-IR')} بخش سیویل${m.settings.civilSections?.length ? '' : ' (تشخیص خودکار)'}` : 'بخش ماشین‌آلات سیویلی در گزارش‌ها نیست' },
    ]
  }, [inputs, o.historyDays, m.settings.climate, m.settings.civilSections, civilSections])

  return { m, canCfg, save, climate, delta, setDelta, wdIdx, setWdIdx, workDays, inputs, base, o, machines, civilSections, setup }
}
export type OutlookCtx = ReturnType<typeof useOutlook>
