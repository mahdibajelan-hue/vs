import { X } from 'lucide-react'
import { useMasterDataStore } from '../store/useMasterDataStore'
import { PARTY_ROLES, PARTY_ROLE_HINT_FA, PARTY_ROLE_LABEL_FA, ORG_TYPE_LABEL_FA, type PartyRole } from '../types'
import { initials } from './md'

const SHOWN: PartyRole[] = ['employer', 'contractor', 'design_consultant', 'supervision_consultant', 'partner']

/** The organizations of one project, grouped by the part they play: employer, contractor, design consultant, supervision consultant … */
export function PartiesEditor({ projectId }: { projectId: string }) {
  const parties = useMasterDataStore((s) => s.parties)
  const organizations = useMasterDataStore((s) => s.organizations)
  const add = useMasterDataStore((s) => s.addParty)
  const remove = useMasterDataStore((s) => s.removeParty)
  const mine = parties.filter((p) => p.projectId === projectId)
  void PARTY_ROLES
  return (
    <div className="md-panel overflow-hidden">
      {SHOWN.map((role, i) => {
        const here = mine.filter((p) => p.role === role)
        const taken = new Set(here.map((p) => p.organizationId))
        const free = organizations.filter((o) => o.isActive && !taken.has(o.id))
        return (
          <div key={role} className="md-row md-in" data-hover style={{ '--i': i, alignItems: 'flex-start' } as React.CSSProperties}>
            <div className="w-[190px] shrink-0">
              <p className="text-[13px] font-bold">{PARTY_ROLE_LABEL_FA[role]}</p>
              <p className="md-eyebrow">{PARTY_ROLE_HINT_FA[role]}</p>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {here.map((p) => {
                const o = organizations.find((x) => x.id === p.organizationId)
                return (
                  <span key={p.id} className="md-card" style={{ padding: '5px 6px 5px 10px', gap: 9 }}>
                    <span className="md-avatar" style={{ width: 28, height: 28, borderRadius: 8, fontSize: 11 }} aria-hidden>{initials(o?.shortName || o?.name || '')}</span>
                    <span className="leading-5"><b className="text-[12.5px]">{o?.name ?? 'سازمان حذف‌شده'}</b>{o && <span className="md-eyebrow block">{ORG_TYPE_LABEL_FA[o.orgType]}</span>}</span>
                    <button className="md-btn md-btn-ghost md-btn-icon md-btn-sm" style={{ width: 26, minHeight: 26 }} aria-label={`حذف ${o?.name ?? ''}`} onClick={() => remove(p.id)}><X size={13} /></button>
                  </span>
                )
              })}
              <select className="md-input" style={{ width: 'auto', minWidth: 170, minHeight: 34 }} value="" aria-label={`افزودن ${PARTY_ROLE_LABEL_FA[role]}`} onChange={(e) => e.target.value && add(projectId, e.target.value, role)}>
                <option value="">{here.length ? '+ افزودن دیگر' : '+ انتخاب سازمان'}</option>
                {free.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          </div>
        )
      })}
    </div>
  )
}
