import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../store/useAuthStore'
import { useSystemStore } from '../../../store/useSystemStore'
import { keyOf, type Period } from './periods'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export interface Photo { id: string; projectId: string; reportId: string | null; takenOn: string; path: string; thumbPath: string; caption: string; subject: string; front: string; km: number | null; byName: string; byUser: string | null; createdAt: string }
export interface Pick { period: Period; key: string; photoId: string; byName: string }
const BUCKET = 'ex-photos'
const fail = (what: string, e: unknown) => { useSystemStore.getState().setStorageError(`خطا در ${what}: ${(e as { message?: string })?.message ?? String(e)}`); return false }

/** a photo scaled to fit `max` px on its long side, as WebP — done in the browser so a phone photo of 8 MB uploads as ~300 KB */
async function scaled(file: File, max: number, q: number): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k)
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.drawImage(bmp, 0, 0, w, h); bmp.close?.()
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/webp', q))
  if (!blob) throw new Error('این تصویر در مرورگر قابل تبدیل نیست')
  return { blob, w, h }
}
const urls = new Map<string, { url: string; at: number }>()
/** short-lived links of the files, fetched together and kept for 50 minutes */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now(), need = [...new Set(paths)].filter((p) => !(urls.get(p) && now - urls.get(p)!.at < 3e6))
  if (need.length) {
    const r = await supabase.storage.from(BUCKET).createSignedUrls(need, 3600)
    for (const x of r.data ?? []) if (x.signedUrl && x.path) urls.set(x.path, { url: x.signedUrl, at: now })
  }
  return Object.fromEntries(paths.map((p) => [p, urls.get(p)?.url ?? '']))
}

interface State {
  projectId: string | null; loading: boolean; photos: Photo[]; picks: Pick[]
  load: (projectId: string, force?: boolean) => Promise<void>
  upload: (files: File[], meta: { reportId?: string | null; takenOn: string; caption?: string; subject?: string; front?: string; km?: number | null }) => Promise<number>
  patch: (id: string, p: { caption?: string; subject?: string }) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  /** choose (or, with the same photo again, clear) the photo of the day / week / month the photo belongs to */
  pick: (photo: Photo, period: Period) => Promise<boolean>
  pickOf: (period: Period, iso: string) => Photo | null
}
const me = () => { const p = useAuthStore.getState().profile; return p?.fullName || p?.email || '' }
export const usePhotoStore = create<State>()((set, get) => ({
  projectId: null, loading: false, photos: [], picks: [],
  load: async (projectId, force) => {
    if (!force && get().projectId === projectId && get().photos.length) return
    set({ loading: true, projectId, ...(get().projectId !== projectId ? { photos: [], picks: [] } : {}) })
    const [a, b] = await Promise.all([
      supabase.from('ex_photos').select('*').eq('project_id', projectId).is('removed_at', null).order('taken_on', { ascending: false }).order('created_at', { ascending: false }).limit(1000),
      supabase.from('ex_photo_picks').select('*').eq('project_id', projectId),
    ])
    if (get().projectId !== projectId) return
    // the tables may not exist yet on an older database: the photo features then simply stay empty
    set({ loading: false, photos: ((a.data ?? []) as Row[]).map((r) => ({ id: r.id, projectId: r.project_id, reportId: r.report_id ?? null, takenOn: r.taken_on, path: r.path, thumbPath: r.thumb_path, caption: r.caption ?? '', subject: r.subject ?? '', front: r.front ?? '', km: r.km == null ? null : Number(r.km), byName: r.by_name ?? '', byUser: r.by_user ?? null, createdAt: r.created_at })), picks: ((b.data ?? []) as Row[]).map((r) => ({ period: r.period, key: r.period_key, photoId: r.photo_id, byName: r.by_name ?? '' })) })
  },
  upload: async (files, meta) => {
    const pid = get().projectId; if (!pid) return 0
    let n = 0
    for (const f of files) {
      try {
        const big = await scaled(f, 1920, 0.82), small = await scaled(f, 480, 0.7), id = crypto.randomUUID()
        const path = `${pid}/${id}.webp`, thumb = `${pid}/${id}.t.webp`
        const u1 = await supabase.storage.from(BUCKET).upload(path, big.blob, { contentType: 'image/webp' }); if (u1.error) throw u1.error
        const u2 = await supabase.storage.from(BUCKET).upload(thumb, small.blob, { contentType: 'image/webp' }); if (u2.error) throw u2.error
        const r = await supabase.from('ex_photos').insert({ project_id: pid, report_id: meta.reportId ?? null, taken_on: meta.takenOn, path, thumb_path: thumb, caption: meta.caption ?? '', subject: meta.subject ?? '', front: meta.front ?? '', km: meta.km ?? null, width: big.w, height: big.h, by_name: me() })
        if (r.error) throw r.error
        n++
      } catch (e) { fail(`بارگذاری عکس «${f.name}»`, e) }
    }
    if (n) await get().load(pid, true)
    return n
  },
  patch: async (id, p) => { const r = await supabase.from('ex_photos').update(p).eq('id', id); if (r.error) return fail('ویرایش عکس', r.error); set({ photos: get().photos.map((x) => (x.id === id ? { ...x, ...p } : x)) }); return true },
  remove: async (id) => { const r = await supabase.from('ex_photos').update({ removed_at: new Date().toISOString() }).eq('id', id); if (r.error) return fail('حذف عکس', r.error); set({ photos: get().photos.filter((x) => x.id !== id), picks: get().picks.filter((x) => x.photoId !== id) }); return true },
  pick: async (photo, period) => {
    const key = keyOf(period, photo.takenOn), cur = get().picks.find((x) => x.period === period && x.key === key)
    if (cur?.photoId === photo.id) return true
    const r = await supabase.from('ex_photo_picks').upsert({ project_id: photo.projectId, period, period_key: key, photo_id: photo.id, by_name: me(), at: new Date().toISOString() }, { onConflict: 'project_id,period,period_key' })
    if (r.error) return fail('انتخاب عکس برگزیده', r.error)
    set({ picks: [...get().picks.filter((x) => !(x.period === period && x.key === key)), { period, key, photoId: photo.id, byName: me() }] }); return true
  },
  pickOf: (period, iso) => { const key = keyOf(period, iso), p = get().picks.find((x) => x.period === period && x.key === key); return p ? get().photos.find((x) => x.id === p.photoId) ?? null : null },
}))
