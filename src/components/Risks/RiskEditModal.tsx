import { useState } from 'react'
import { Modal } from '../common/Modal'
import type { Risk, RiskCategory, RiskStatus } from '../../types'
import { RISK_CATEGORY_LABEL_FA, RISK_STATUS_LABEL_FA } from '../../types'
import { useStore } from '../../store/useStore'
import { riskScore, riskScoreColor, riskScoreLabel } from '../../lib/risk'

const CATEGORIES = Object.keys(RISK_CATEGORY_LABEL_FA) as RiskCategory[]
const STATUSES = Object.keys(RISK_STATUS_LABEL_FA) as RiskStatus[]

export function RiskEditModal({ projectId, risk, onClose }: { projectId: string; risk: Risk | null; onClose: () => void }) {
  const addRisk = useStore((s) => s.addRisk)
  const updateRisk = useStore((s) => s.updateRisk)
  const deleteRisk = useStore((s) => s.deleteRisk)

  const [title, setTitle] = useState(risk?.title ?? '')
  const [description, setDescription] = useState(risk?.description ?? '')
  const [category, setCategory] = useState<RiskCategory>(risk?.category ?? 'schedule')
  const [probability, setProbability] = useState(risk?.probability ?? 3)
  const [impact, setImpact] = useState(risk?.impact ?? 3)
  const [status, setStatus] = useState<RiskStatus>(risk?.status ?? 'open')
  const [mitigationPlan, setMitigationPlan] = useState(risk?.mitigationPlan ?? '')
  const [owner, setOwner] = useState(risk?.owner ?? '')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const score = riskScore({ probability, impact })

  const save = () => {
    if (!title.trim()) {
      setError('عنوان ریسک را وارد کنید')
      return
    }
    const data = { title: title.trim(), description, category, probability, impact, status, mitigationPlan, owner }
    if (risk) updateRisk(projectId, risk.id, data)
    else addRisk(projectId, data)
    onClose()
  }

  return (
    <Modal title={risk ? 'ویرایش ریسک' : 'ثبت ریسک جدید'} subtitle="احتمال وقوع و شدت تاثیر را از ۱ (کم) تا ۵ (زیاد) مشخص کنید" onClose={onClose} width="max-w-xl">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">عنوان ریسک / مشکل</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="مثلاً تاخیر در تامین شیرآلات" />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-secondary">شرح</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input" rows={2} />
        </label>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">دسته‌بندی</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as RiskCategory)} className="input">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {RISK_CATEGORY_LABEL_FA[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">وضعیت</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as RiskStatus)} className="input">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RISK_STATUS_LABEL_FA[s]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-xs text-secondary">
              <span>احتمال وقوع</span> <span className="num">{probability}</span>
            </span>
            <input type="range" min={1} max={5} value={probability} onChange={(e) => setProbability(parseInt(e.target.value, 10))} className="w-full accent-brand-500" />
          </label>
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-xs text-secondary">
              <span>شدت تاثیر</span> <span className="num">{impact}</span>
            </span>
            <input type="range" min={1} max={5} value={impact} onChange={(e) => setImpact(parseInt(e.target.value, 10))} className="w-full accent-brand-500" />
          </label>
        </div>

        <div className="flex items-center gap-2 rounded-xl p-2.5" style={{ background: `${riskScoreColor(score)}22`, border: `1px solid ${riskScoreColor(score)}55` }}>
          <span className="h-3 w-3 rounded-full shrink-0" style={{ background: riskScoreColor(score) }} />
          <p className="text-xs font-medium">
            امتیاز ریسک: <span className="num font-bold">{score}</span> از ۲۵ — سطح {riskScoreLabel(score)}
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs text-secondary">برنامه کنترل / اقدام اصلاحی</span>
          <textarea value={mitigationPlan} onChange={(e) => setMitigationPlan(e.target.value)} className="input" rows={2} />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-secondary">مسئول پیگیری</span>
          <input value={owner} onChange={(e) => setOwner(e.target.value)} className="input" />
        </label>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex items-center justify-between pt-2">
          {risk ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    deleteRisk(projectId, risk.id)
                    onClose()
                  }}
                  className="text-xs text-red-400 hover:underline"
                >
                  تایید حذف
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-secondary hover:underline">
                  انصراف
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-xs text-muted hover:text-red-400 transition-colors">
                حذف ریسک
              </button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
              انصراف
            </button>
            <button onClick={save} className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-400 transition-colors">
              ذخیره
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
