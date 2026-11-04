import { create } from 'zustand'
import * as repo from '../repo'
import { DEFAULT_SP_SETTINGS, type Drawing, type PipeLine, type SpSettings, type StationRec, type TwinAsset } from '../repo'
import type { Item, Log, Weld } from '../lib/spCore'

const msg = (e: unknown) => (e as { message?: string })?.message ?? 'خطای نامشخص'

interface State {
  projectId: string | null; loading: boolean; error: string | null; flash: string | null
  stations: StationRec[]; items: Item[]; logs: Log[]; drawings: Drawing[]; lines: PipeLine[]; welds: Weld[]; settings: SpSettings
  saveSettings: (x: SpSettings, by: string) => Promise<boolean>
  load: (pid: string) => Promise<void>
  twinAssets: () => Promise<TwinAsset[]>
  saveStation: (x: Partial<StationRec> & { code: string }, by: string) => Promise<StationRec | null>
  archiveStation: (id: string) => Promise<boolean>
  saveItems: (rows: Parameters<typeof repo.saveItems>[1]) => Promise<boolean>
  archiveItem: (id: string) => Promise<boolean>
  addLogs: (rows: Parameters<typeof repo.addLogs>[1], by: string) => Promise<boolean>
  archiveLog: (id: string) => Promise<boolean>
  saveWeld: (x: Partial<Weld> & { stationId: string; weldNo: string }, by: string) => Promise<Weld | null>
  upsertWelds: (rows: (Partial<Weld> & { stationId: string; weldNo: string })[], by: string) => Promise<boolean>
  patchWelds: (ids: string[], patch: Record<string, unknown>, done?: string) => Promise<boolean>
  archiveWeld: (id: string) => Promise<boolean>
  saveLine: (x: Partial<PipeLine> & { stationId: string; lineNo: string }) => Promise<boolean>
  archiveLine: (id: string) => Promise<boolean>
  saveDrawing: (x: Partial<Drawing> & { stationId: string }, file: File | null, by: string) => Promise<Drawing | null>
  archiveDrawing: (id: string) => Promise<boolean>
}

const upsert = <T extends { id: string }>(list: T[], xs: T[]) => { const ids = new Set(xs.map((x) => x.id)); return [...list.filter((x) => !ids.has(x.id)), ...xs] }

export const useSpStore = create<State>()((set, get) => {
  const run = async (f: () => Promise<void>, done?: string) => { try { await f(); if (done) set({ flash: done }); return true } catch (e) { set({ error: msg(e) }); return false } }
  const pid = () => get().projectId!
  return {
    projectId: null, loading: false, error: null, flash: null, stations: [], items: [], logs: [], drawings: [], lines: [], welds: [], settings: DEFAULT_SP_SETTINGS,
    saveSettings: (x, by) => run(async () => { set({ settings: await repo.saveSettings(pid(), x, by) }) }, 'تنظیمات پیشرفت EPC ذخیره شد'),
    load: async (p) => {
      set({ loading: get().projectId !== p, projectId: p, error: null })
      try { set({ ...(await repo.loadAll(p)), loading: false }) }
      catch (e) { set({ loading: false, error: /sp_|relation|schema cache/i.test(msg(e)) ? 'جدول‌های ماژول ایستگاه‌ها ساخته نشده‌اند (supabase/stationpiping/001_stationpiping.sql).' : msg(e) }) }
    },
    twinAssets: async () => { try { return await repo.twinAssets(pid()) } catch { return [] } },
    saveStation: async (x, by) => {
      try { const r = await repo.saveStation(pid(), x, by); set({ stations: upsert(get().stations, [r]).sort((a, b) => (a.km ?? 0) - (b.km ?? 0)), flash: 'ایستگاه ذخیره شد' }); return r }
      catch (e) { set({ error: /duplicate|unique/i.test(msg(e)) ? 'این کد ایستگاه قبلاً ثبت شده است.' : msg(e) }); return null }
    },
    archiveStation: (id) => run(async () => { await repo.archive('sp_stations', id); set({ stations: get().stations.filter((x) => x.id !== id) }) }, 'ایستگاه بایگانی شد'),
    saveItems: (rows) => run(async () => { const r = await repo.saveItems(pid(), rows); set({ items: upsert(get().items, r) }) }, 'محدودهٔ کار ذخیره شد'),
    archiveItem: (id) => run(async () => { await repo.archive('sp_items', id); set({ items: get().items.filter((x) => x.id !== id), logs: get().logs.filter((l) => l.itemId !== id) }) }),
    addLogs: (rows, by) => run(async () => { const r = await repo.addLogs(pid(), rows, by); set({ logs: [...get().logs, ...r] }) }, 'کارکرد روزانه ثبت شد'),
    archiveLog: (id) => run(async () => { await repo.archive('sp_logs', id); set({ logs: get().logs.filter((x) => x.id !== id) }) }, 'ردیف کارکرد حذف شد'),
    saveWeld: async (x, by) => {
      try { const r = await repo.saveWeld(pid(), x, by); set({ welds: upsert(get().welds, [r]), flash: 'جوش ذخیره شد' }); return r }
      catch (e) { set({ error: /duplicate|unique/i.test(msg(e)) ? 'این شمارهٔ جوش در این ایستگاه قبلاً ثبت شده است.' : msg(e) }); return null }
    },
    upsertWelds: (rows, by) => run(async () => { const r = await repo.upsertWelds(pid(), rows, by); set({ welds: upsert(get().welds, r) }) }, `${rows.length.toLocaleString('fa-IR')} جوش وارد شد`),
    patchWelds: (ids, patch, done) => run(async () => { const r = await repo.patchWelds(ids, patch); set({ welds: upsert(get().welds, r) }) }, done ?? 'جوش‌ها به‌روز شد'),
    archiveWeld: (id) => run(async () => { await repo.archive('sp_welds', id); set({ welds: get().welds.filter((x) => x.id !== id) }) }, 'جوش حذف شد'),
    saveLine: (x) => run(async () => { const r = await repo.saveLine(pid(), x); set({ lines: upsert(get().lines, [r]) }) }, 'خط لوله ذخیره شد'),
    archiveLine: (id) => run(async () => { await repo.archive('sp_lines', id); set({ lines: get().lines.filter((x) => x.id !== id) }) }),
    saveDrawing: async (x, file, by) => {
      try { const r = await repo.saveDrawing(pid(), x, file, by); set({ drawings: upsert(get().drawings, [r]), flash: 'نقشه ذخیره شد' }); return r }
      catch (e) { set({ error: msg(e) }); return null }
    },
    archiveDrawing: (id) => run(async () => { await repo.archive('sp_drawings', id); set({ drawings: get().drawings.filter((x) => x.id !== id) }) }, 'نقشه بایگانی شد'),
  }
})
