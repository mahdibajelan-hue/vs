import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useSystemStore } from '../../../store/useSystemStore'
import { parseDocx, type ParseReport } from '../lib/contractDocs/docx'
import { buildChunks, type Chunk } from '../lib/contractDocs/chunk'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
/** bump when the Word reader or the clause splitter changes: documents read by an older version are offered for re-reading */
export const PARSER_VERSION = 2
const BUCKET = 'contract-texts'
export interface ContractDoc { id: string; contractId: string | null; title: string; fileName: string; chunkCount: number; byteSize: number; createdAt: string; parserVersion: number; storagePath: string | null; stats: Partial<ParseReport> }
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
const mapDoc = (r: Row): ContractDoc => ({ id: r.id, contractId: r.contract_id, title: r.title, fileName: r.file_name, chunkCount: r.chunk_count, byteSize: r.byte_size, createdAt: r.created_at, parserVersion: r.parser_version ?? 1, storagePath: r.storage_path ?? null, stats: r.stats ?? {} })

async function readFile(buf: ArrayBuffer): Promise<{ chunks: Chunk[]; report: ParseReport } | { error: string }> {
  const report: ParseReport = { paragraphs: 0, tables: 0, tocSkipped: 0, embedded: 0, chars: 0 }
  try {
    const chunks = buildChunks(await parseDocx(buf, report))
    if (!chunks.length) return { error: 'متنی در فایل پیدا نشد (ممکن است فقط تصویر یا اسکن باشد).' }
    return { chunks, report }
  } catch { return { error: 'فایل خوانده نشد؛ مطمئن شوید یک فایل Word معتبر (docx) و بدون رمز است.' } }
}
async function writeChunks(docId: string, chunks: Chunk[]): Promise<string | null> {
  for (let i = 0; i < chunks.length; i += 200) {
    const r = await supabase.from('fin_contract_chunks').insert(chunks.slice(i, i + 200).map((c) => ({ doc_id: docId, ord: c.ord, clause_no: c.clauseNo, heading: c.heading, path: c.path, body: c.text, kind: c.kind })))
    if (r.error) return r.error.message
  }
  return null
}
/** Too little text for the file size: the body is probably scanned pages or pictures. */
export const isLowText = (chars: number, size: number): boolean => size > 150 * 1024 && (chars < 3000 || (chars < 20000 && chars * 200 < size))
const lowText = (rep: ParseReport, size: number): string => (isLowText(rep.chars, size) ? ' — هشدار: متن کمی از این فایل خوانده شد؛ اگر بخشی از متن تصویر/اسکن است، قابل جست‌وجو نیست.' : '')

interface State {
  projectId: string | null; loading: boolean; busy: string
  docs: ContractDoc[]; chunks: StoredChunk[]
  load: (projectId: string) => Promise<void>
  upload: (projectId: string, file: File, contractId: string | null, title: string) => Promise<{ ok: boolean; message?: string }>
  reprocess: (id: string) => Promise<{ ok: boolean; message?: string }>
  originalUrl: (id: string) => Promise<string | null>
  remove: (id: string) => Promise<boolean>
}

/** Uploaded contract Word files of one project, as searchable clause chunks. Parsing happens in the browser; the text and the original file are stored. */
export const useContractDocStore = create<State>((set, get) => ({
  projectId: null, loading: false, busy: '', docs: [], chunks: [],
  load: async (projectId) => {
    set({ projectId, loading: true, docs: [], chunks: [] })
    const d = await supabase.from('fin_contract_docs').select('id, contract_id, title, file_name, chunk_count, byte_size, created_at, parser_version, storage_path, stats').eq('master_project_id', projectId).order('created_at', { ascending: false })
    if (get().projectId !== projectId) return
    if (fail('بارگذاری اسناد قرارداد', d.error)) { set({ loading: false }); return }
    const docs = ((d.data ?? []) as Row[]).map(mapDoc)
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
      const same = (await supabase.from('fin_contract_docs').select('id, parser_version, storage_path').eq('master_project_id', projectId).eq('file_hash', hash).maybeSingle()).data as Row | null
      if (same && (same.parser_version ?? 1) >= PARSER_VERSION) return { ok: false, message: 'همین فایل قبلاً با خوانندهٔ فعلی بارگذاری شده است.' }
      const read = await readFile(buf)
      if ('error' in read) return { ok: false, message: read.error }
      set({ busy: 'save' })
      // the same file read by an older version: replace it
      if (same) { if (same.storage_path) await supabase.storage.from(BUCKET).remove([same.storage_path]); await supabase.from('fin_contract_docs').delete().eq('id', same.id) }
      const ins = await supabase.from('fin_contract_docs').insert({ master_project_id: projectId, contract_id: contractId, title: title.trim() || file.name.replace(/\.docx$/i, ''), file_name: file.name, file_hash: hash, byte_size: file.size, chunk_count: read.chunks.length, parser_version: PARSER_VERSION, stats: read.report }).select('id').single()
      if (ins.error) return { ok: false, message: /row-level|42501/.test(ins.error.message) ? 'اجازهٔ بارگذاری قرارداد برای این پروژه را ندارید.' : ins.error.message.includes('23505') ? 'همین فایل قبلاً بارگذاری شده است.' : ins.error.message }
      const id = (ins.data as Row).id as string
      const err = await writeChunks(id, read.chunks)
      if (err) { await supabase.from('fin_contract_docs').delete().eq('id', id); return { ok: false, message: `ذخیرهٔ بندها ناموفق بود: ${err}` } }
      const path = `${projectId}/${id}.docx`
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: true })
      if (!up.error) await supabase.from('fin_contract_docs').update({ storage_path: path }).eq('id', id)
      await get().load(projectId)
      return { ok: true, message: `${read.chunks.length} بند و ردیف جدول از ${read.report.paragraphs} پاراگراف فهرست شد${read.report.tocSkipped ? ` (${read.report.tocSkipped} سطر فهرست مطالب کنار گذاشته شد)` : ''}${same ? '؛ نسخهٔ قبلی همین فایل جایگزین شد' : ''}${up.error ? '؛ فایل اصلی ذخیره نشد' : ''}.${lowText(read.report, file.size)}` }
    } finally { set({ busy: '' }) }
  },
  reprocess: async (id) => {
    const doc = get().docs.find((d) => d.id === id)
    if (!doc?.storagePath) return { ok: false, message: 'فایل اصلی این سند ذخیره نشده است؛ آن را دوباره بارگذاری کنید.' }
    set({ busy: `re:${id}` })
    try {
      const dl = await supabase.storage.from(BUCKET).download(doc.storagePath)
      if (dl.error || !dl.data) return { ok: false, message: 'دریافت فایل اصلی ممکن نشد.' }
      const read = await readFile(await dl.data.arrayBuffer())
      if ('error' in read) return { ok: false, message: read.error }
      const del = await supabase.from('fin_contract_chunks').delete().eq('doc_id', id)
      if (del.error) return { ok: false, message: del.error.message }
      const err = await writeChunks(id, read.chunks)
      if (err) return { ok: false, message: err }
      await supabase.from('fin_contract_docs').update({ chunk_count: read.chunks.length, parser_version: PARSER_VERSION, stats: read.report }).eq('id', id)
      await get().load(get().projectId!)
      return { ok: true, message: `${read.chunks.length} بند دوباره خوانده شد.${lowText(read.report, doc.byteSize)}` }
    } finally { set({ busy: '' }) }
  },
  originalUrl: async (id) => {
    const doc = get().docs.find((d) => d.id === id)
    if (!doc?.storagePath) return null
    const r = await supabase.storage.from(BUCKET).createSignedUrl(doc.storagePath, 600, { download: doc.fileName })
    return r.data?.signedUrl ?? null
  },
  remove: async (id) => {
    const doc = get().docs.find((d) => d.id === id)
    const { error } = await supabase.from('fin_contract_docs').delete().eq('id', id)
    if (fail('حذف سند قرارداد', error)) return false
    if (doc?.storagePath) await supabase.storage.from(BUCKET).remove([doc.storagePath])
    set({ docs: get().docs.filter((d) => d.id !== id), chunks: get().chunks.filter((c) => c.docId !== id) }); return true
  },
}))
