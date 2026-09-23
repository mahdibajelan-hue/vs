import { useEffect, useState } from 'react'
import { BrainCircuit, Loader2 } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { JOB_ROLE_LABEL_FA, type JobRole } from '../../competency/types'
import { PERSONALITY_VALIDITY_STATUS_LABEL_FA, type PersonalityValidityStatus } from '../types'

interface PublicDimensionScore {
  scoreKind: string
  traitKey: string | null
  traitLabelFa: string | null
  facetKey: string | null
  facetLabelFa: string | null
  dimensionKey: string | null
  dimensionLabelFa: string | null
  normalizedScore: number | null
  coverageCount: number
  confidence: string
}

interface PublicResultsRow {
  id: string
  job_role: string
  status: string
  submitted_at: string | null
  dimension_scores: PublicDimensionScore[] | null
  validity_status: string | null
}

/** Public, unauthenticated "view results online" link (?p_results=<token>) — analogous to
 * PublicResultsPage. Reads exclusively through personality_public_results_get(), a read-only,
 * non-sensitive projection with no raw answers or reference content. */
export function PersonalityPublicResultsPage({ token }: { token: string }) {
  const [loading, setLoading] = useState(true)
  const [row, setRow] = useState<PublicResultsRow | null>(null)

  useEffect(() => {
    supabase
      .rpc('personality_public_results_get', { p_token: token })
      .then(({ data }) => {
        setLoading(false)
        const r = Array.isArray(data) ? data[0] : data
        setRow((r as PublicResultsRow) ?? null)
      })
  }, [token])

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
        <Loader2 size={26} className="animate-spin text-pink-400" />
      </div>
    )
  }

  if (!row) {
    return (
      <div className="flex h-screen w-screen items-center justify-center p-6 text-center" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
        <p className="max-w-sm text-sm text-secondary">این لینک نامعتبر است یا نتیجه هنوز آماده نشده است.</p>
      </div>
    )
  }

  const scores = row.dimension_scores ?? []
  const traitScores = scores.filter((s) => s.scoreKind === 'TRAIT')
  const dimScores = scores.filter((s) => s.scoreKind === 'BEHAVIORAL_DIMENSION')

  return (
    <div className="min-h-screen p-4 sm:p-6" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="glass-panel flex items-center gap-2.5 rounded-2xl p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-500/15 text-pink-300">
            <BrainCircuit size={16} />
          </div>
          <div>
            <p className="text-sm font-bold">نتیجه ارزیابی شخصیت و رفتاری</p>
            <p className="text-[10.5px] text-muted">{JOB_ROLE_LABEL_FA[row.job_role as JobRole]}</p>
          </div>
        </div>

        {row.validity_status && (
          <div className="glass-panel rounded-2xl p-3.5 text-[11px] text-secondary">
            وضعیت اعتبار پاسخ‌ها: {PERSONALITY_VALIDITY_STATUS_LABEL_FA[row.validity_status as PersonalityValidityStatus]}
          </div>
        )}

        {traitScores.length > 0 && (
          <div className="glass-panel rounded-2xl p-4">
            <p className="mb-3 text-xs font-bold">ویژگی‌های شخصیتی</p>
            <div className="space-y-2.5">
              {traitScores.map((s) => (
                <Bar key={s.traitKey} label={s.traitLabelFa ?? s.traitKey ?? '—'} value={s.normalizedScore} color="#f472b6" />
              ))}
            </div>
          </div>
        )}

        {dimScores.length > 0 && (
          <div className="glass-panel rounded-2xl p-4">
            <p className="mb-3 text-xs font-bold">ابعاد رفتاری</p>
            <div className="space-y-2.5">
              {dimScores.map((s) => (
                <Bar key={s.dimensionKey} label={s.dimensionLabelFa ?? s.dimensionKey ?? '—'} value={s.normalizedScore} color="#38bdf8" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Bar({ label, value, color }: { label: string; value: number | null; color: string }) {
  const pct = Math.max(0, Math.min(100, value ?? 0))
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-medium">{label}</span>
        <span className="num font-bold">{value != null ? Math.round(value).toLocaleString('fa-IR') : '—'}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}
