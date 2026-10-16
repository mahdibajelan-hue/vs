import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useSystemStore } from '../../../store/useSystemStore'
import { mapPipe, type Pipe } from '../../execution/lib/registers'

/** Pipes received into the site warehouse: every entry is recorded as an MRS (warehouse receipt, MRS-####) with its pipes. The Execution module reads the same records. */
export interface Mrs { id: string; number: string; date: string; notes: string }
export interface PipeInput { raw: string; heatNo?: string; odIn?: number | null; wtIn?: number | null; lengthM?: number | null; grade?: string; supplier?: string; wayBill?: string; materialId?: string | null }
type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const fail = (what: string, error: { message: string } | null): boolean => {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${what}: ${error.message.includes('not_allowed') ? 'اجازهٔ این کار را ندارید.' : error.message}`)
  return true
}
interface State {
  projectId: string | null; loading: boolean; pipes: Pipe[]; receipts: Mrs[]
  load: (projectId: string) => Promise<void>
  receive: (date: string, rows: PipeInput[], note: string) => Promise<{ added: number; skipped: string[]; number?: string } | null>
  setStatus: (id: string, status: Pipe['status']) => Promise<boolean>
}
export const usePipeStore = create<State>((set, get) => ({
  projectId: null, loading: false, pipes: [], receipts: [],
  load: async (projectId) => {
    set({ projectId, loading: true })
    const [p, r] = await Promise.all([supabase.from('ex_pipes').select('*').eq('project_id', projectId).order('entry_date', { ascending: false }), supabase.from('mtl_warehouse_receipts').select('id, receipt_number, receipt_date, notes').eq('master_project_id', projectId).like('receipt_number', 'MRS-%').order('receipt_date', { ascending: false })])
    if (get().projectId !== projectId) return
    if (!p.error) set({ pipes: ((p.data ?? []) as Row[]).map(mapPipe) })
    if (!r.error) set({ receipts: ((r.data ?? []) as Row[]).map((x): Mrs => ({ id: x.id, number: x.receipt_number, date: x.receipt_date, notes: x.notes ?? '' })) })
    fail('بارگذاری لوله‌های ورودی', p.error ?? r.error)
    set({ loading: false })
  },
  receive: async (date, rows, note) => {
    const pid = get().projectId; if (!pid) return null
    const { data, error } = await supabase.rpc('mtl_pipe_receive', { p_project: pid, p_date: date, p_rows: rows, p_note: note })
    if (fail('ثبت ورود لوله (MRS)', error)) return null
    await get().load(pid)
    const d = data as { added: number; skipped: string[]; receipt_number?: string }
    return { added: d.added, skipped: d.skipped ?? [], number: d.receipt_number }
  },
  setStatus: async (id, status) => {
    const { error } = await supabase.from('ex_pipes').update({ status }).eq('id', id)
    if (fail('تغییر وضعیت لوله', error)) return false
    set({ pipes: get().pipes.map((p) => (p.id === id ? { ...p, status } : p)) }); return true
  },
}))
