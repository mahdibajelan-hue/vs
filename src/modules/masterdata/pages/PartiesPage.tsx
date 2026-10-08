import { useState } from 'react'
import { Link2 } from 'lucide-react'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { PARTY_ROLE_LABEL_FA, type PartyRole } from '../types'
import { LEVEL_COLOR, PARTY_COLOR } from '../lib/colors'
import { Empty, PageHead, initials } from '../components/md'
import { PartiesEditor } from '../components/PartiesEditor'

const MATRIX: PartyRole[] = ['employer', 'contractor', 'design_consultant', 'supervision_consultant']

/** Phase 5 of the set-up: connect each project with the organizations around it. Pick a project on the right, or read the whole picture in the table. */
export function PartiesPage({ onOpen }: { onOpen: (id: string) => void }) {
  const projects = useMasterDataStore((s) => s.projects)
  const parties = useMasterDataStore((s) => s.parties)
  const organizations = useMasterDataStore((s) => s.organizations)
  const [view, setView] = useState<'edit' | 'table'>('edit')
  const [pid, setPid] = useState<string | null>(null)
  const current = projects.find((p) => p.id === (pid ?? projects[0]?.id))
  const names = (projectId: string, role: PartyRole) => parties.filter((x) => x.projectId === projectId && x.role === role).map((x) => organizations.find((o) => o.id === x.organizationId)?.shortName || organizations.find((o) => o.id === x.organizationId)?.name || '')
  const complete = (projectId: string) => MATRIX.every((r) => names(projectId, r).length > 0)

  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHead title="ارکان پروژه‌ها" hint="مثلاً پروژهٔ X: پیمانکار A، مشاور طراحی B، مشاور نظارت C، کارفرما N. هر نقش می‌تواند چند سازمان داشته باشد." actions={<div className="md-segmented" role="group" aria-label="نما"><button aria-pressed={view === 'edit'} onClick={() => setView('edit')}>ویرایش</button><button aria-pressed={view === 'table'} onClick={() => setView('table')}>جدول کلی</button></div>} />
      {projects.length === 0 ? <div className="md-panel"><Empty icon={<Link2 size={20} />} title="ابتدا پروژه تعریف کنید" text="ارکان به پروژه‌ها وصل می‌شوند." /></div> : view === 'table' ? (
        <div className="md-panel overflow-x-auto">
          <table className="w-full text-[12.5px]" style={{ borderCollapse: 'collapse' }}>
            <thead><tr style={{ color: 'var(--md-ink-3)' }}><th className="px-4 py-3 text-right font-semibold">پروژه</th>{MATRIX.map((r) => <th key={r} className="px-4 py-3 text-right font-semibold" style={{ color: PARTY_COLOR[r], boxShadow: `inset 0 -2px 0 ${PARTY_COLOR[r]}` }}>{PARTY_ROLE_LABEL_FA[r].split(' (')[0]}</th>)}</tr></thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="cursor-pointer" style={{ borderTop: '1px solid var(--md-line)' }} onClick={() => { setPid(p.id); setView('edit') }}>
                  <td className="px-4 py-3 font-bold">{p.shortName || p.officialName}</td>
                  {MATRIX.map((r) => <td key={r} className="px-4 py-3">{names(p.id, r).length ? names(p.id, r).join('، ') : <span className="md-badge" data-tone="warn">تعیین نشده</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[280px_1fr]">
          <div className="md-panel overflow-hidden lg:sticky lg:top-0">
            {projects.map((p, i) => (
              <button key={p.id} className="md-row md-in" style={{ '--i': i, background: current?.id === p.id ? 'var(--md-hover)' : undefined } as React.CSSProperties} onClick={() => setPid(p.id)} aria-current={current?.id === p.id}>
                <span className="md-avatar" style={{ width: 32, height: 32, borderRadius: 9, fontSize: 11, '--c': LEVEL_COLOR.project } as React.CSSProperties} aria-hidden>{initials(p.shortName || p.officialName)}</span>
                <span className="min-w-0 flex-1"><b className="block truncate text-[12.5px]">{p.shortName || p.officialName}</b><span className="md-eyebrow block">{complete(p.id) ? 'ارکان کامل' : 'ناقص'}</span></span>
                <span className="md-badge" data-tone={complete(p.id) ? 'ok' : 'warn'} aria-hidden style={{ padding: '0 6px' }}>{complete(p.id) ? '✓' : '!'}</span>
              </button>
            ))}
          </div>
          {current && (
            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3"><h3 className="truncate text-[15px] font-extrabold">{current.officialName}</h3><button className="md-btn md-btn-sm" onClick={() => onOpen(current.id)}>باز کردن شناسنامه</button></div>
              <PartiesEditor key={current.id} projectId={current.id} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
