import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { formatJalali } from '../../../lib/jalali'
import { EMPTY_FILTER, type InboxFilter } from '../lib/model'
import type { ActionDef, ActionInput, InboxItem } from '../types'

const SNOOZE_KEY = 'farin.inbox.snooze'
const readSnooze = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? '{}') as Record<string, number> } catch { return {} } }
const writeSnooze = (m: Record<string, number>) => { try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(m)) } catch { /* private mode */ } }
const liveSnooze = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).filter(([, t]) => t > Date.now()))

type Row = Record<string, unknown>
/** The database writes dates as ISO text; people read them in the Jalali calendar. */
const jal = (t: string) => t.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => { try { return formatJalali(m) } catch { return m } })
const fromRow = (r: Row): InboxItem => ({ key: String(r.key), source: r.source as InboxItem['source'], kind: r.kind as InboxItem['kind'], projectId: (r.project_id as string) ?? null, projectName: String(r.project_name ?? ''), title: jal(String(r.title ?? '')), sub: jal(String(r.sub ?? '')), due: (r.due as string) ?? null, since: String(r.since ?? ''), urgent: !!r.urgent, refId: String(r.ref_id), extra: (r.extra as Record<string, unknown>) ?? {} })

interface InboxState {
  items: InboxItem[]
  loading: boolean
  loadedOnce: boolean
  error: string | null
  open: boolean
  /** which part of the overlay is shown: the work list or the system notifications */
  tab: 'inbox' | 'notes'
  setTab: (t: 'inbox' | 'notes') => void
  selected: string | null
  filter: InboxFilter
  /** key → epoch ms until which the item is hidden («بعداً یادآوری کن») */
  snoozed: Record<string, number>
  refresh: () => Promise<void>
  setOpen: (open: boolean, select?: string | null, tab?: 'inbox' | 'notes') => void
  select: (key: string | null) => void
  setFilter: (p: Partial<InboxFilter>) => void
  snooze: (key: string, hours: number) => void
  unsnoozeAll: () => void
  run: (item: InboxItem, action: ActionDef, input: ActionInput) => Promise<string | null>
}

export const useInboxStore = create<InboxState>()((set, get) => ({
  items: [], loading: false, loadedOnce: false, error: null, open: false, tab: 'inbox', setTab: (t) => set({ tab: t }), selected: null, filter: EMPTY_FILTER, snoozed: liveSnooze(readSnooze()),
  refresh: async () => {
    if (get().loading) return
    set({ loading: true })
    const { data, error } = await supabase.rpc('inbox_my_items')
    if (error) { set({ loading: false, loadedOnce: true, error: friendlyErrorMessage(error) }); return }
    const items = ((data ?? []) as Row[]).map(fromRow)
    set((s) => ({ items, loading: false, loadedOnce: true, error: null, selected: s.selected && items.some((i) => i.key === s.selected) ? s.selected : null }))
  },
  setOpen: (open, select, tab) => { set((s) => ({ open, selected: open && select !== undefined ? select : s.selected, tab: open && tab ? tab : s.tab })); if (open) void get().refresh() },
  select: (key) => set({ selected: key }),
  setFilter: (p) => set((s) => ({ filter: { ...s.filter, ...p } })),
  snooze: (key, hours) => { const m = { ...liveSnooze(get().snoozed), [key]: Date.now() + hours * 3600_000 }; writeSnooze(m); set({ snoozed: m, selected: null }) },
  unsnoozeAll: () => { writeSnooze({}); set({ snoozed: {} }) },
  run: async (item, action, input) => {
    const err = await action.run(item, input)
    if (!err) { set({ selected: null }); await get().refresh() }
    return err
  },
}))

/** Items not hidden by a snooze — what the badge and the list are built from. */
export const selectVisible = (s: Pick<InboxState, 'items' | 'snoozed'>): InboxItem[] => s.items.filter((i) => !((s.snoozed[i.key] ?? 0) > Date.now()))
