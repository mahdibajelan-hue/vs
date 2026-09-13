import { Clock, Eye, Trash2 } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import type { EstEstimateRecord, EstProject } from '../types'
import { BORDER, fmtEUR, fmtRialBn, INK, MUTED_FG, SURFACE } from '../lib/theme'
import { Card } from '../components/ui'

export function HistoryPage({
  project, estimates, loading, onOpen, onDelete,
}: {
  project: EstProject
  estimates: EstEstimateRecord[]
  loading: boolean
  onOpen: (e: EstEstimateRecord) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="h-full overflow-y-auto est-font">
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <div>
          <p className="text-sm font-bold" style={{ color: INK }}>تاریخچه محاسبات</p>
          <p className="text-[11px] mt-0.5" style={{ color: MUTED_FG }}>پروژه: {project.name}</p>
        </div>

        {loading ? (
          <div className="text-center py-10 text-sm" style={{ color: MUTED_FG }}>در حال بارگذاری...</div>
        ) : estimates.length === 0 ? (
          <Card className="text-center py-10">
            <Clock size={28} className="mx-auto mb-3" style={{ color: MUTED_FG }} />
            <p className="text-sm" style={{ color: MUTED_FG }}>هنوز محاسبه‌ای برای این پروژه ذخیره نشده است</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {estimates.map((e) => (
              <div key={e.id} className="est-card flex items-center justify-between gap-3 rounded-xl p-3.5" style={{ background: SURFACE, border: `1px solid ${BORDER}` }}>
                <button onClick={() => onOpen(e)} className="flex-1 text-right">
                  <div className="flex items-center gap-2 text-[11px] est-mono mb-1" style={{ color: MUTED_FG }}>
                    <Clock size={11} /> {formatJalali(e.createdAt)}
                  </div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-bold est-mono" style={{ color: INK }}>{fmtEUR(e.grandTotalEur)}</span>
                    <span className="text-xs est-mono" style={{ color: MUTED_FG }}>≈ {fmtRialBn(e.grandTotalRial)}</span>
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => onOpen(e)} className="rounded-md p-2" style={{ color: MUTED_FG }} title="مشاهده">
                    <Eye size={15} />
                  </button>
                  <button
                    onClick={() => { if (confirm('این رکورد از تاریخچه حذف شود؟')) onDelete(e.id) }}
                    className="rounded-md p-2" style={{ color: MUTED_FG }} title="حذف"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
