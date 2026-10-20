import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useSystemStore } from '../../../store/useSystemStore'
import { parseDocx } from '../lib/contractDocs/docx'
import { buildChunks, type Chunk } from '../lib/contractDocs/chunk'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export interface ContractDoc { id: string; contractId: string | null; title: string; fileName: string; chunkCount: number; byteSize: number; createdAt: string }
export interface StoredChunk extends Chunk { docId: string }

const fail = (what: string, e: { message: string } | null): boolean => {
  if (!e) return false
  useSystemStore.getState().setStorageError(`خطا در ${what}: ${/row-level|42501/.test(e.message) ? 'اجازهٔ این کار را ندارید.' : e.message}`)
  return true
}
/** SHA-256 where the browser offers it (https / localhost); a 2×53-bit mix of the bytes elsewhere — only used to spot the same file uploaded twice */
const sha256 = async (b: ArrayBuffer): Promise<string> => {
  if (globalThis.crypto?.subtle) return [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map((x) => x.toString(16).padStart(2, '0')).join('')
  const u = new Uint8Array(b)
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < u.length; i++) { h1 = Math.imul(h1 ^ u[i], 2654435761); h2 = Math.imul(h2 ^ u[i], 1597334677) }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return `fx${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}${u.length.toString(16)}`
}

interface State {
  projectId: string | null; loading: boolean; busy: string
  docs: ContractDoc[]; chunks: StoredChunk[]
  load: (projectId: string) => Promise<void>
  upload: (projectId: string, file: File, contractId: string | null, title: string) => Promise<{ ok: boolean; message?: string }>
  remove: (id: string) => Promise<boolean>
}

/** Uploaded contract Word files of one project, as searchable clause chunks. Parsing happens in the browser; only the text is stored. */
export const useContractDocStore = create<State>((set, get) => ({
  projectId: null, loading: false, busy: '', docs: [], chunks: [],
  load: async (projectId) => {
    set({ projectId, loading: true, docs: [], chunks: [] })
    const d = await supabase.from('fin_contract_docs').select('id, contract_id, title, file_name, chunk_count, byte_size, created_at').eq('master_project_id', projectId).order('created_at', { ascending: false })
    if (get().projectId !== projectId) return
    if (fail('بارگذاری اسناد قرارداد', d.error)) { set({ loading: false }); return }
    const docs = ((d.data ?? []) as Row[]).map((r): ContractDoc => ({ id: r.id, contractId: r.contract_id, title: r.title, fileName: r.file_name, chunkCount: r.chunk_count, byteSize: r.byte_size, createdAt: r.created_at }))
    const chunks: StoredChunk[] = []
    for (const doc of docs) {
      for (let from = 0; ; from += 1000) {
        const c = await supabase.from('fin_contract_chunks').select('ord, clause_no, heading, path, body, kind').eq('doc_id', doc.id).order('ord').range(from, from + 999)
        if (fail('بارگذاری بندهای قرارداد', c.error)) break
        for (const r of (c.data ?? []) as Row[]) chunks.push({ docId: doc.id, ord: r.ord, clauseNo: r.clause_no, heading: r.heading, path: r.path, text: r.body, kind: r.kind })
        if (!c.data || c.data.length < 1000) break
      }
    }
    if (get().projectId !== projectId) return
    set({ docs, chunks, loading: false })
  },
  upload: async (projectId, file, contractId, title) => {
    if (!/\.docx$/i.test(file.name)) return { ok: false, message: 'فقط فایل Word با پسوند docx پذیرفته می‌شود (فایل doc قدیمی را در Word با «Save As → docx» ذخیره کنید).' }
    if (file.size > 25 * 1024 * 1024) return { ok: false, message: 'حجم فایل از ۲۵ مگابایت بیشتر است.' }
    set({ busy: 'parse' })
    try {
      const buf = await file.arrayBuffer()
      const hash = await sha256(buf)
      if (get().docs.length && (await supabase.from('fin_contract_docs').select('id').eq('master_project_id', projectId).eq('file_hash', hash).maybeSingle()).data) return { ok: false, message: 'همین فایل قبلاً برای این پروژه بارگذاری شده است.' }
      let chunks: Chunk[]
      try { chunks = buildChunks(await parseDocx(buf)) } catch { return { ok: false, message: 'فایل خوانده نشد؛ مطمئن شوید یک فایل Word معتبر (docx) و بدون رمز است.' } }
      if (chunks.length === 0) return { ok: false, message: 'متنی در فایل پیدا نشد (ممکن است فقط تصویر یا اسکن باشد).' }
      set({ busy: 'save' })
      const ins = await supabase.from('fin_contract_docs').insert({ master_project_id: projectId, contract_id: contractId, title: title.trim() || file.name.replace(/\.docx$/i, ''), file_name: file.name, file_hash: hash, byte_size: file.size, chunk_count: chunks.length }).select('id').single()
      if (ins.error) return { ok: false, message: /row-level|42501/.test(ins.error.message) ? 'اجازهٔ بارگذاری قرارداد برای این پروژه را ندارید.' : ins.error.message.includes('23505') ? 'همین فایل قبلاً بارگذاری شده است.' : ins.error.message }
      const id = (ins.data as Row).id as string
      for (let i = 0; i < chunks.length; i += 200) {
        const r = await supabase.from('fin_contract_chunks').insert(chunks.slice(i, i + 200).map((c) => ({ doc_id: id, ord: c.ord, clause_no: c.clauseNo, heading: c.heading, path: c.path, body: c.text, kind: c.kind })))
        if (r.error) { await supabase.from('fin_contract_docs').delete().eq('id', id); return { ok: false, message: `ذخیرهٔ بندها ناموفق بود: ${r.error.message}` } }
      }
      await get().load(projectId)
      return { ok: true, message: `${chunks.length} بند و ردیف جدول فهرست شد.` }
    } finally { set({ busy: '' }) }
  },
  remove: async (id) => {
    const { error } = await supabase.from('fin_contract_docs').delete().eq('id', id)
    if (fail('حذف سند قرارداد', error)) return false
    set({ docs: get().docs.filter((d) => d.id !== id), chunks: get().chunks.filter((c) => c.docId !== id) }); return true
  },
}))
