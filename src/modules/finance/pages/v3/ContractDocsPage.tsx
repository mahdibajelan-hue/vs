import { useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, Search, Trash2, FileText, Quote, ChevronDown, ChevronUp } from 'lucide-react'
import { useFinanceStore } from '../../store/useFinanceStore'
import { useContractDocStore } from '../../store/useContractDocStore'
import { buildIndex, extractFacts, highlight, search, SUGGESTED } from '../../lib/contractDocs/search'
import { Chip, Section, fmtD } from '../../components/fn'
import { faDigits } from '../../components/fn'

const kb = (n: number) => `${faDigits(String(Math.max(1, Math.round(n / 1024))))} کیلوبایت`

/** Upload the contract as a Word file and ask contract questions in plain language; answers are quoted clauses with their numbers, never text written by the system. */
export function ContractDocsPage({ masterProjectId }: { masterProjectId: string }) {
  const st = useContractDocStore()
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(''), [contractId, setContractId] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [q, setQ] = useState(''), [asked, setAsked] = useState('')
  const [docF, setDocF] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  useEffect(() => { void st.load(masterProjectId) }, [masterProjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const ix = useMemo(() => buildIndex(st.chunks.filter((c) => !docF || c.docId === docF).map((chunk) => ({ docId: chunk.docId, chunk }))), [st.chunks, docF])
  const res = useMemo(() => (asked ? search(ix, asked, 8) : null), [ix, asked])
  const facts = useMemo(() => (res ? extractFacts(res.hits, res.terms, res.intent) : []), [res])
  const docName = (id: string) => st.docs.find((d) => d.id === id)?.title ?? ''
  const ask = (text: string) => { setQ(text); setAsked(text.trim()) }
  const onFile = async (f: File | undefined) => {
    if (!f) return
    setMsg(null)
    const r = await st.upload(masterProjectId, f, contractId || null, title)
    setMsg({ ok: r.ok, text: r.message ?? '' })
    if (r.ok) { setTitle(''); setContractId('') }
    if (fileRef.current) fileRef.current.value = ''
  }
  const around = (docId: string, ord: number) => st.chunks.filter((c) => c.docId === docId && Math.abs(c.ord - ord) <= 1 && c.ord !== ord).sort((a, b) => a.ord - b.ord)
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Section title="بارگذاری قرارداد (Word)" hint="فایل docx بارگذاری می‌شود، به بندها و ردیف‌های جدول شکسته و برای جست‌وجو فهرست می‌شود. خودِ فایل نگهداری نمی‌شود؛ فقط متن آن.">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="ex-lab" style={{ flex: '1 1 200px' }}>عنوان سند (اختیاری)<input value={title} onChange={(e) => setTitle(e.target.value)} dir="auto" placeholder="مثلاً قرارداد اصلی EPC" /></label>
          <label className="ex-lab" style={{ flex: '1 1 200px' }}>مربوط به قرارداد ثبت‌شده (اختیاری)
            <select value={contractId} onChange={(e) => setContractId(e.target.value)}><option value="">—</option>{contracts.map((c) => <option key={c.id} value={c.id}>{c.contractNumber} — {c.title}</option>)}</select></label>
          <input ref={fileRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          <button className="im-btn im-btn-primary" disabled={!!st.busy} onClick={() => fileRef.current?.click()}><FileUp size={14} /> {st.busy === 'parse' ? 'در حال خواندن فایل…' : st.busy === 'save' ? 'در حال ذخیره…' : 'انتخاب فایل Word'}</button>
        </div>
        {msg && <p className="im-helper" role="status" style={{ margin: '8px 0 0', color: msg.ok ? 'var(--im-green, #16a34a)' : 'var(--im-red, #dc2626)' }}>{msg.text}</p>}
        {st.docs.length > 0 && (
          <table className="ex-lines" style={{ marginTop: 10 }}><tbody>
            {st.docs.map((d) => (
              <tr key={d.id}><td><FileText size={13} aria-hidden /> <b>{d.title}</b><div className="sub">{d.fileName}</div></td><td>{contracts.find((c) => c.id === d.contractId)?.contractNumber ?? ''}</td><td className="num">{faDigits(String(d.chunkCount))} بند/ردیف</td><td className="sub">{kb(d.byteSize)} · {fmtD(d.createdAt.slice(0, 10))}</td>
                <td><button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف سند" onClick={() => { if (window.confirm(`سند «${d.title}» و بندهای فهرست‌شده‌اش حذف شود؟`)) void st.remove(d.id) }}><Trash2 size={12} /></button></td></tr>
            ))}
          </tbody></table>
        )}
      </Section>

      <Section title="پرسش دربارهٔ قرارداد" hint="سؤال را ساده بنویسید: مثلاً «مهلت تجهیز کارگاه چند روز است؟» یا «بندهای فسخ». پاسخ‌ها عین متن قرارداد با شمارهٔ بند هستند.">
        {st.docs.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>{st.loading ? 'در حال بارگذاری…' : 'ابتدا یک قرارداد Word بارگذاری کنید.'}</p> : (
          <>
            <form onSubmit={(e) => { e.preventDefault(); ask(q) }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} dir="auto" placeholder="پرسش خود را بنویسید…" aria-label="پرسش دربارهٔ قرارداد" style={{ flex: '1 1 280px' }} />
              {st.docs.length > 1 && <select value={docF} onChange={(e) => setDocF(e.target.value)} aria-label="سند" style={{ width: 'auto' }}><option value="">همهٔ اسناد</option>{st.docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>}
              <button className="im-btn im-btn-primary" type="submit" disabled={!q.trim()}><Search size={14} /> جست‌وجو</button>
            </form>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {SUGGESTED.map((s) => <button key={s} type="button" className="im-btn im-btn-sm" onClick={() => ask(s)}>{s}</button>)}
            </div>
          </>
        )}
      </Section>

      {res && (
        <>
          {facts.length > 0 && (
            <Section title={<span><Quote size={14} aria-hidden /> مقادیر یافت‌شده در متن</span>} hint="جمله‌هایی که عدد مرتبط با پرسش دارند؛ عیناً از قرارداد">
              <ul style={{ margin: 0, paddingInlineStart: 18, display: 'grid', gap: 6 }}>
                {facts.map((f, i) => <li key={i}><b>{faDigits(f.value)}</b> — {f.text}<div className="sub">{f.chunk.path || f.chunk.clauseNo || 'بدون عنوان'}{st.docs.length > 1 ? ` · ${docName(f.docId)}` : ''}</div></li>)}
              </ul>
            </Section>
          )}
          {res.hits.length === 0 ? (
            <div className="im-card im-empty" style={{ padding: 18 }}>بندی با این پرسش پیدا نشد. با کلیدواژه‌های دیگر امتحان کنید (مثلاً «خاتمه» به‌جای «فسخ»، یا نام تجهیز).</div>
          ) : res.hits.map((h) => {
            const key = `${h.docId}:${h.chunk.ord}`
            const isOpen = open.has(key)
            return (
              <div key={key} className="im-card" style={{ padding: 12, display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Chip tone={h.score > 0.6 ? 'good' : h.score > 0.3 ? 'warn' : 'neutral'}>{h.score > 0.6 ? 'ارتباط زیاد' : h.score > 0.3 ? 'ارتباط متوسط' : 'ارتباط کم'}</Chip>
                  {h.chunk.kind === 'row' && <Chip tone="neutral">ردیف جدول</Chip>}
                  <b style={{ fontSize: 13 }}>{h.chunk.path || h.chunk.clauseNo || 'بدون عنوان'}</b>
                  {st.docs.length > 1 && <span className="sub">{docName(h.docId)}</span>}
                </div>
                <p style={{ margin: 0, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{highlight(h.chunk.text, res.terms).map(([t, m], i) => (m ? <mark key={i} style={{ background: 'rgba(250,204,21,.35)', color: 'inherit', borderRadius: 3 }}>{t}</mark> : <span key={i}>{t}</span>))}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="im-btn im-btn-sm" onClick={() => toggle(key)}>{isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />} متن قبل و بعد</button>
                  <button className="im-btn im-btn-sm" onClick={() => void navigator.clipboard?.writeText(`${h.chunk.path ? `[${h.chunk.path}] ` : ''}${h.chunk.text}`)}>کپی با شمارهٔ بند</button>
                </div>
                {isOpen && around(h.docId, h.chunk.ord).map((c) => <p key={c.ord} className="sub" style={{ margin: 0, paddingInlineStart: 10, borderInlineStart: '2px solid var(--im-line)', whiteSpace: 'pre-wrap' }}><b>{c.path}</b><br />{c.text}</p>)}
              </div>
            )
          })}
          <p className="im-helper" style={{ margin: 0 }}>نتیجه‌ها از جست‌وجوی متنی در همین قرارداد به‌دست آمده و تفسیر حقوقی نیست؛ پیش از اتکا، بند را در نسخهٔ اصلی و الحاقیه‌ها تطبیق دهید. ارقام داخل جدول‌ها یا فایل‌هایی که فقط تصویر هستند خوانده نمی‌شوند.</p>
        </>
      )}
    </div>
  )
}
