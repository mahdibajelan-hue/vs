import { useState } from 'react'
import { Modal } from '../../../components/common/Modal'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { useRiskStore } from '../store/useRiskStore'
import { useRiskMembersStore } from '../store/useRiskMembersStore'
import {
  RM_CATEGORIES,
  RM_CATEGORY_LABEL_FA,
  RM_PROJECT_PHASES,
  RM_PROJECT_PHASE_LABEL_FA,
  RM_RESPONSE_STRATEGIES,
  RM_RESPONSE_STRATEGY_LABEL_FA,
  RM_RISK_TYPE_LABEL_FA,
  type RmProjectPhase,
  type RmResponseStrategy,
  type RmRiskCategory,
  type RmRiskType,
} from '../types'
import { riskLevel, riskScore, RISK_LEVEL_COLOR, RISK_LEVEL_LABEL_FA } from '../lib/riskScore'

export function RiskFormModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const addRisk = useRiskStore((s) => s.addRisk)
  const members = useRiskMembersStore((s) => s.members)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<RmRiskCategory>('technical')
  const [riskType, setRiskType] = useState<RmRiskType>('threat')
  const [ownerId, setOwnerId] = useState('')
  const [probability, setProbability] = useState(3)
  const [impact, setImpact] = useState(3)
  const [responseStrategy, setResponseStrategy] = useState<RmResponseStrategy>('mitigate')
  const [projectPhase, setProjectPhase] = useState<RmProjectPhase | ''>('')
  const [timeToImpactDays, setTimeToImpactDays] = useState('')
  const [identifiedDate, setIdentifiedDate] = useState(new Date().toISOString().slice(0, 10))
  const [mitigationAction, setMitigationAction] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const score = riskScore(probability, impact)
  const level = riskLevel(score)

  const submit = async () => {
    if (!title.trim()) {
      setError('عنوان ریسک را وارد کنید')
      return
    }
    setBusy(true)
    try {
      await addRisk(projectId, {
        title: title.trim(),
        description: description.trim(),
        category,
        riskType,
        ownerId: ownerId || null,
        probability,
        impact,
        responseStrategy,
        projectPhase: projectPhase || null,
        timeToImpactDays: timeToImpactDays ? parseInt(timeToImpactDays, 10) : null,
        mitigationAction: mitigationAction.trim(),
      })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="ثبت ریسک جدید" subtitle="اطلاعات را وارد کنید — امتیاز و سطح ریسک به‌صورت خودکار محاسبه می‌شود" onClose={onClose} width="max-w-2xl">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">عنوان ریسک</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="عنوان کوتاه و گویا" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">توضیحات</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="input resize-none" placeholder="شرح کامل ریسک و پیامدهای احتمالی..." />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">دسته‌بندی</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as RmRiskCategory)} className="input">
              {RM_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {RM_CATEGORY_LABEL_FA[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">نوع</span>
            <select value={riskType} onChange={(e) => setRiskType(e.target.value as RmRiskType)} className="input">
              {(['threat', 'opportunity'] as RmRiskType[]).map((t) => (
                <option key={t} value={t}>
                  {RM_RISK_TYPE_LABEL_FA[t]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">مالک ریسک</span>
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="input">
              <option value="">تعیین‌نشده</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.fullName || m.email}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">تاریخ شناسایی</span>
            <JalaliDateInput value={identifiedDate} onChange={setIdentifiedDate} />
          </label>
        </div>

        <div className="rounded-xl border border-white/10 p-3">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-[11px] text-secondary">
                <span>احتمال وقوع</span>
                <span className="num">{probability} / 5</span>
              </span>
              <input type="range" min={1} max={5} value={probability} onChange={(e) => setProbability(parseInt(e.target.value, 10))} className="w-full accent-red-500" />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-[11px] text-secondary">
                <span>شدت پیامد</span>
                <span className="num">{impact} / 5</span>
              </span>
              <input type="range" min={1} max={5} value={impact} onChange={(e) => setImpact(parseInt(e.target.value, 10))} className="w-full accent-red-500" />
            </label>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg px-3 py-2" style={{ background: `${RISK_LEVEL_COLOR[level]}15` }}>
            <span className="text-xs text-secondary">امتیاز ریسک (احتمال × شدت)</span>
            <span className="flex items-center gap-2">
              <span className="num text-lg font-extrabold" style={{ color: RISK_LEVEL_COLOR[level] }}>
                {score}
              </span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${RISK_LEVEL_COLOR[level]}22`, color: RISK_LEVEL_COLOR[level] }}>
                {RISK_LEVEL_LABEL_FA[level]}
              </span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">استراتژی پاسخ</span>
            <select value={responseStrategy} onChange={(e) => setResponseStrategy(e.target.value as RmResponseStrategy)} className="input">
              {RM_RESPONSE_STRATEGIES.map((r) => (
                <option key={r} value={r}>
                  {RM_RESPONSE_STRATEGY_LABEL_FA[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">فاز پروژه</span>
            <select value={projectPhase} onChange={(e) => setProjectPhase(e.target.value as RmProjectPhase | '')} className="input">
              <option value="">تعیین‌نشده</option>
              {RM_PROJECT_PHASES.map((p) => (
                <option key={p} value={p}>
                  {RM_PROJECT_PHASE_LABEL_FA[p]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-secondary">زمان تا وقوع پیامد (روز) — برای پروژه‌های Fast-track</span>
          <input
            type="number"
            min={0}
            value={timeToImpactDays}
            onChange={(e) => setTimeToImpactDays(e.target.value)}
            className="input num"
            placeholder="مثلاً 10"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-secondary">اقدام کنترلی اولیه (اختیاری)</span>
          <textarea
            value={mitigationAction}
            onChange={(e) => setMitigationAction(e.target.value)}
            rows={2}
            className="input resize-none"
            placeholder="اولین اقدام برنامه‌ریزی‌شده برای این ریسک..."
          />
        </label>

        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button onClick={submit} disabled={busy} className="rounded-lg bg-red-500 px-5 py-2 text-sm font-medium text-white hover:bg-red-400 disabled:opacity-50 transition-colors">
            {busy ? 'در حال ثبت...' : 'ثبت ریسک'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
