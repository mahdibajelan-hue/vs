import { useEffect, useMemo, useRef, useState } from 'react'
import { Boxes, CornerDownLeft, Inbox, LayoutGrid, Search, X } from 'lucide-react'
import { create } from 'zustand'
import { supabase } from '../../lib/supabaseClient'
import { useAuthStore } from '../../store/useAuthStore'
import { useDeepLinkStore } from '../../store/useDeepLinkStore'
import { useModuleStore } from '../../store/useModuleStore'
import { hasModuleAccess, useModuleAccessStore } from '../../store/useModuleAccessStore'
import { useNotificationStore } from '../../store/useNotificationStore'
import { KINDS } from '../../modules/inbox/lib/catalog'
import { SOURCE_COLOR, SOURCE_ICON } from '../../modules/inbox/lib/look'
import { useInboxStore } from '../../modules/inbox/store/useInboxStore'
import { ModalPortal } from '../common/ModalPortal'
import { ToolbarButton } from '../common/ToolbarButton'
import { TOOLBAR_ACCENTS } from '../common/ToolbarGuide'
import { MODULE_CATALOG } from './moduleCatalog'
import './search.css'

interface SearchState { open: boolean; setOpen: (v: boolean) => void }
export const useSearchStore = create<SearchState>()((set) => ({ open: false, setOpen: (open) => set({ open }) }))

/** Header shortcut: opens the global search (also Ctrl/⌘ + K, or «/» when nothing is being typed). */
export function SearchButton() {
  const setOpen = useSearchStore((s) => s.setOpen)
  return <ToolbarButton label="جستجو در سامانه (Ctrl+K)" caption="جستجو" accent={TOOLBAR_ACCENTS.search} onClick={() => setOpen(true)}><Search size={16} /></ToolbarButton>
}

type Hit = { id: string; group: string; title: string; sub: string; color: string; icon: 'mod' | 'inbox' | 'note' | 'project'; run: () => void }
const norm = (s: string) => s.replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[ً-ٟ‌]/g, '').toLowerCase()
const DEEP = new Set(['issues', 'risk', 'missions', 'change'])

/** One search box for the whole system: modules, my inbox items, notifications and projects. */
export function GlobalSearch() {
  const open = useSearchStore((s) => s.open)
  const setOpen = useSearchStore((s) => s.setOpen)
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin) ?? false
  const access = useModuleAccessStore((s) => s.accessibleModules)
  const items = useInboxStore((s) => s.items)
  const notes = useNotificationStore((s) => s.items)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const [projects, setProjects] = useState<{ id: string; name: string; code: string }[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement | null)?.isContentEditable
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (isAuthed) setOpen(!useSearchStore.getState().open) }
      else if (e.key === '/' && !typing && isAuthed) { e.preventDefault(); setOpen(true) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isAuthed, setOpen])
  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 30) } }, [open])

  // projects are looked up on the server (RLS decides what this person may see)
  useEffect(() => {
    const t = q.trim()
    if (!open || t.length < 2) { setProjects([]); return }
    let live = true
    const h = setTimeout(async () => {
      const like = `%${t.replace(/[%_,]/g, ' ')}%`
      const { data } = await supabase.from('master_projects').select('id,official_name,short_name,project_code').or(`official_name.ilike.${like},short_name.ilike.${like},project_code.ilike.${like}`).limit(6)
      if (live) setProjects((data ?? []).map((p) => ({ id: p.id as string, name: (p.short_name as string) || (p.official_name as string), code: (p.project_code as string) ?? '' })))
    }, 220)
    return () => { live = false; clearTimeout(h) }
  }, [q, open])

  const hits = useMemo<Hit[]>(() => {
    const t = norm(q.trim())
    const match = (...s: string[]) => !t || t.split(/\s+/).every((w) => s.some((x) => norm(x).includes(w)))
    const close = () => setOpen(false)
    const out: Hit[] = []
    for (const m of MODULE_CATALOG) {
      if (m.key !== 'radar' && (!hasModuleAccess(access, m.key) || (m.key === 'admin' && !isAdmin))) continue
      if (!match(m.fa, m.en, m.words)) continue
      out.push({ id: 'm:' + m.key, group: 'ماژول‌ها', title: m.fa, sub: m.en, color: '#38bdf8', icon: 'mod', run: () => { close(); if (m.key === 'radar') useModuleStore.getState().backToRadar(); else useModuleStore.getState().enterModule(m.key) } })
    }
    for (const i of items) {
      if (!t || !match(i.title, i.sub, i.projectName, KINDS[i.kind].label)) continue
      out.push({ id: 'i:' + i.key, group: 'کارتابل من', title: i.title, sub: `${KINDS[i.kind].label}${i.projectName ? ' · ' + i.projectName : ''}`, color: SOURCE_COLOR[i.source], icon: 'inbox', run: () => { close(); useInboxStore.getState().setOpen(true, i.key, 'inbox') } })
    }
    for (const n of notes) {
      if (!t || !match(n.title, n.body)) continue
      out.push({ id: 'n:' + n.id, group: 'اعلان‌ها', title: n.title, sub: n.body, color: '#f59e0b', icon: 'note', run: () => { close(); if (n.recordId && DEEP.has(n.module)) useDeepLinkStore.getState().request({ module: n.module as 'issues' | 'risk' | 'missions' | 'change', recordId: n.recordId }); useModuleStore.getState().enterModule(n.module) } })
    }
    for (const p of projects) out.push({ id: 'p:' + p.id, group: 'پروژه‌ها', title: p.name, sub: p.code ? `کد ${p.code} — نمایش در رادار پروژه‌ها` : 'نمایش در رادار پروژه‌ها', color: '#34d399', icon: 'project', run: () => { close(); useModuleStore.getState().backToRadar() } })
    const cap: Record<string, number> = { 'ماژول‌ها': t ? 6 : 15, 'کارتابل من': 6, 'اعلان‌ها': 4, 'پروژه‌ها': 6 }
    const seen: Record<string, number> = {}
    return out.filter((h) => (seen[h.group] = (seen[h.group] ?? 0) + 1) <= (cap[h.group] ?? 6))
  }, [q, items, notes, projects, access, isAdmin, setOpen])

  useEffect(() => { setIdx(0) }, [q])
  useEffect(() => { document.querySelector('.gs-hit.on')?.scrollIntoView({ block: 'nearest' }) }, [idx])
  if (!open || !isAuthed) return null

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(hits.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); hits[idx]?.run() }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }
  let last = ''
  return (
    <ModalPortal>
      <div className="gs-layer" role="dialog" aria-modal="true" aria-label="جستجو در سامانه" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
        <div className="gs-box" onKeyDown={onKey}>
          <label className="gs-input"><Search size={17} /><input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="ماژول، کار در کارتابل، اعلان یا پروژه را جست‌وجو کنید…" aria-label="جست‌وجو" autoComplete="off" /><button type="button" className="gs-x" onClick={() => setOpen(false)} aria-label="بستن"><X size={15} /></button></label>
          <div className="gs-list" role="listbox">
            {hits.length === 0 && <p className="gs-empty">{q.trim().length < 2 ? 'عبارتی بنویسید…' : 'نتیجه‌ای پیدا نشد. نام ماژول، عنوان یک کار یا نام پروژه را امتحان کنید.'}</p>}
            {hits.map((h, i) => {
              const head = h.group !== last ? <p className="gs-group" key={'g' + h.group}>{h.group}</p> : null
              last = h.group
              const Icon = h.icon === 'inbox' ? Inbox : h.icon === 'project' ? Boxes : h.icon === 'note' ? SOURCE_ICON.issues : LayoutGrid
              return (
                <div key={h.id}>
                  {head}
                  <button role="option" aria-selected={i === idx} className={`gs-hit${i === idx ? ' on' : ''}`} onMouseEnter={() => setIdx(i)} onClick={h.run}>
                    <span className="gs-ico" style={{ ['--c' as string]: h.color }}><Icon size={15} /></span>
                    <span className="gs-t"><b>{h.title}</b><small>{h.sub}</small></span>
                    {i === idx && <CornerDownLeft size={13} aria-hidden />}
                  </button>
                </div>
              )
            })}
          </div>
          <footer className="gs-foot"><span>↑ ↓ حرکت</span><span>Enter انتخاب</span><span>Esc بستن</span><span className="gs-kbd" dir="ltr">Ctrl K</span></footer>
        </div>
      </div>
    </ModalPortal>
  )
}
