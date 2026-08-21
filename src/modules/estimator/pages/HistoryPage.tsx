import { Clock, Eye, Trash2 } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import type { EstEstimateRecord, EstProject } from '../types'
import { fmtEUR, fmtRialBn, STEEL_DARK } from '../lib/theme'
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
    <div className="h-full overflow-y-auto est-font" style={{ background: '#F3F5F7' }}>
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
        <div>
          <p className="text-sm font-bold" style={{ color: STEEL_DARK }}>تاریخچه محاسبات</p>
          <p className="text-[11px] text-slate-500 mt-0.5">پروژه: {project.name}</p>
        </div>

        {loading ? (
          <div className="text-center py-10 text-sm text-slate-400">در حال بارگذاری...</div>
        ) : estimates.length === 0 ? (
          <Card className="text-center py-10">
            <Clock size={28} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500">هنوز محاسبه‌ای برای این پروژه ذخیره نشده است</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {estimates.map((e) => (
              <div key={e.id} className="est-card flex items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 p-3.5">
                <button onClick={() => onOpen(e)} className="flex-1 text-right">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 est-mono mb-1">
                    <Clock size={11} /> {formatJalali(e.createdAt)}
                  </div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-bold est-mono" style={{ color: STEEL_DARK }}>{fmtEUR(e.grandTotalEur)}</span>
                    <span className="text-xs text-slate-400 est-mono">≈ {fmtRialBn(e.grandTotalRial)}</span>
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => onOpen(e)} className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="مشاهده">
                    <Eye size={15} />
                  </button>
                  <button
                    onClick={() => { if (confirm('این رکورد از تاریخچه حذف شود؟')) onDelete(e.id) }}
                    className="rounded-md p-2 text-slate-300 hover:bg-red-50 hover:text-red-500" title="حذف"
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
