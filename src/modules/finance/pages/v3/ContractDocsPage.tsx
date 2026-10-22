import { useEffect, useMemo, useRef, useState } from 'react'
import { FileUp, Search, Trash2, FileText, Quote, Mic, Square, BookOpen, Download, RefreshCw, Copy, X, ScrollText } from 'lucide-react'
import { useFinanceStore } from '../../store/useFinanceStore'
import { isLowText, PARSER_VERSION, useContractDocStore, type StoredChunk } from '../../store/useContractDocStore'
import { articleOf, buildIndex, extractFacts, highlight, search, SUGGESTED, type Hit } from '../../lib/contractDocs/search'
import { useSpeech } from '../../lib/contractDocs/useSpeech'
import { Chip, Section, fmtD, faDigits } from '../../components/fn'
import { ModalPortal } from '../../../../components/common/ModalPortal'

const kb = (n: number) => `${faDigits(String(Math.max(1, Math.round(n / 1024))))} کیلوبایت`
const Marked = ({ text, words }: { text: string; words: string[] }) => <>{highlight(text, words).map(([t, m], i) => (m ? <mark key={i} style={{ background: 'rgba(250,204,21,.38)', color: 'inherit', borderRadius: 3, padding: '0 1px' }}>{t}</mark> : <span key={i}>{t}</span>))}</>

/** Upload the contract as a Word file and ask contract questions in plain language (typed or spoken); answers are quoted clauses with their numbers, never text written by the system. */
export function ContractDocsPage({ masterProjectId }: { masterProjectId: string }) {
  const st = useContractDocStore()
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(''), [contractId, setContractId] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [q, setQ] = useState(''), [asked, setAsked] = useState('')
  const [docF, setDocF] = useState('')
  const [reader, setReader] = useState<{ docId: string; article?: string; focus?: number } | null>(null)
  useEffect(() => { void st.load(masterProjectId) }, [masterProjectId]) // eslint-disable-line react-hooks/exhaustive-deps
  const ask = (text: string) => { setQ(text); setAsked(text.trim()) }
  const speech = useSpeech((t) => ask(t))

  const ix = useMemo(() => buildIndex(st.chunks.filter((c) => !docF || c.docId === docF).map((chunk) => ({ docId: chunk.docId, chunk }))), [st.chunks, docF])
  const res = useMemo(() => (asked ? search(ix, asked, 6) : null), [ix, asked])
  const facts = useMemo(() => (res ? extractFacts(res) : []), [res])
  const docName = (id: string) => st.docs.find((d) => d.id === id)?.title ?? ''
  const onFile = async (f: File | undefined) => {
    if (!f) return
    setMsg(null)
    const r = await st.upload(masterProjectId, f, contractId || null, title)
    setMsg({ ok: r.ok, text: r.message ?? '' })
    if (r.ok) { setTitle(''); setContractId('') }
    if (fileRef.current) fileRef.current.value = ''
  }
  const reprocess = async (id: string) => { setMsg(null); const r = await st.reprocess(id); setMsg({ ok: r.ok, text: r.message ?? '' }) }
  const download = async (id: string) => { const u = await st.originalUrl(id); if (u) window.open(u, '_blank', 'noopener'); else setMsg({ ok: false, text: 'فایل اصلی این سند ذخیره نشده است.' }) }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Section title="بارگذاری قرارداد (Word)" hint="فایل docx در مرورگر خوانده می‌شود، به فصل، ماده، بند و ردیف‌های جدول شکسته و برای جست‌وجو فهرست می‌شود. فهرست مطالب کنار گذاشته می‌شود. فایل اصلی هم نگه داشته می‌شود تا بعداً بتوان دوباره خواندش.">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="ex-lab" style={{ flex: '1 1 200px' }}>عنوان سند (اختیاری)<input value={title} onChange={(e) => setTitle(e.target.value)} dir="auto" placeholder="مثلاً شرایط عمومی پیمان" /></label>
          <label className="ex-lab" style={{ flex: '1 1 200px' }}>مربوط به قرارداد ثبت‌شده (اختیاری)
            <select value={contractId} onChange={(e) => setContractId(e.target.value)}><option value="">—</option>{contracts.map((c) => <option key={c.id} value={c.id}>{c.contractNumber} — {c.title}</option>)}</select></label>
          <input ref={fileRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          <button className="im-btn im-btn-primary" disabled={!!st.busy} onClick={() => fileRef.current?.click()}><FileUp size={14} /> {st.busy === 'parse' ? 'در حال خواندن فایل…' : st.busy === 'save' ? 'در حال ذخیره…' : 'انتخاب فایل Word'}</button>
        </div>
        {msg && <p className="im-helper" role="status" style={{ margin: '8px 0 0', color: msg.ok ? '#16a34a' : '#dc2626' }}>{msg.text}</p>}
        {st.docs.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {st.docs.map((d) => {
              const old = d.parserVersion < PARSER_VERSION
              return (
                <div key={d.id} className="im-card" style={{ padding: 10, display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <FileText size={15} aria-hidden /><b>{d.title}</b><span className="sub">{d.fileName}</span>
                    {contracts.find((c) => c.id === d.contractId) && <Chip tone="neutral">{contracts.find((c) => c.id === d.contractId)!.contractNumber}</Chip>}
                    <span className="sub" style={{ marginInlineStart: 'auto' }}>{faDigits(String(d.chunkCount))} بند/ردیف · {kb(d.byteSize)} · {fmtD(d.createdAt.slice(0, 10))}</span>
                  </div>
                  {old && <p className="im-helper" style={{ margin: 0, color: '#b45309' }}>این سند با نسخهٔ قبلی خواننده فهرست شده و ممکن است متن بدنهٔ مواد آن خوانده نشده باشد. {d.storagePath ? 'دکمهٔ «خواندن دوباره» را بزنید.' : 'همین فایل را دوباره بارگذاری کنید تا با خوانندهٔ جدید جایگزین شود.'}</p>}
                  {!old && d.stats.chars != null && isLowText(d.stats.chars, d.byteSize) && <p className="im-helper" style={{ margin: 0, color: '#b45309' }}>از این فایل {faDigits(d.stats.chars.toLocaleString('en'))} نویسه متن خوانده شد که برای حجم {kb(d.byteSize)} بسیار کم است؛ احتمالاً متن مواد به‌صورت تصویر یا اسکن در فایل آمده و قابل جست‌وجو نیست. نسخه‌ای از قرارداد را بارگذاری کنید که متن آن در Word قابل انتخاب و کپی باشد.</p>}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="im-btn im-btn-sm" onClick={() => setReader({ docId: d.id })}><BookOpen size={13} /> متن کامل سند</button>
                    {d.storagePath && <button className="im-btn im-btn-sm" onClick={() => void download(d.id)}><Download size={13} /> فایل اصلی</button>}
                    {d.storagePath && <button className="im-btn im-btn-sm" disabled={!!st.busy} onClick={() => void reprocess(d.id)}><RefreshCw size={13} /> {st.busy === `re:${d.id}` ? 'در حال خواندن…' : 'خواندن دوباره'}</button>}
                    <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف سند" onClick={() => { if (window.confirm(`سند «${d.title}» و بندهای فهرست‌شده‌اش حذف شود؟`)) void st.remove(d.id) }}><Trash2 size={13} /> حذف</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <Section title="پرسش دربارهٔ قرارداد" hint="سؤال را بنویسید یا با دکمهٔ میکروفون بگویید؛ مثلاً «تعدیل قیمت و کار اضافی» یا «مهلت تجهیز کارگاه». هر موضوعِ سؤال جداگانه جست‌وجو می‌شود و پاسخ‌ها عین متن قرارداد با شمارهٔ ماده و بند هستند.">
        {st.docs.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>{st.loading ? 'در حال بارگذاری…' : 'ابتدا یک قرارداد Word بارگذاری کنید.'}</p> : (
          <>
            <form onSubmit={(e) => { e.preventDefault(); ask(q) }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={speech.listening ? speech.interim || 'در حال شنیدن…' : q} onChange={(e) => setQ(e.target.value)} readOnly={speech.listening} dir="auto" placeholder="پرسش خود را بنویسید یا بگویید…" aria-label="پرسش دربارهٔ قرارداد" style={{ flex: '1 1 260px', minHeight: 40 }} />
              {speech.supported && (
                <button type="button" className="im-btn" onClick={() => (speech.listening ? speech.stop() : speech.start())} aria-pressed={speech.listening} aria-label={speech.listening ? 'پایان ضبط صدا' : 'پرسش با صدا'} title={speech.listening ? 'پایان ضبط' : 'پرسش با صدا'}
                  style={{ minHeight: 40, minWidth: 44, background: speech.listening ? '#dc2626' : undefined, color: speech.listening ? '#fff' : undefined }}>
                  {speech.listening ? <Square size={15} /> : <Mic size={16} />}
                </button>
              )}
              {st.docs.length > 1 && <select value={docF} onChange={(e) => setDocF(e.target.value)} aria-label="سند" style={{ width: 'auto', minHeight: 40 }}><option value="">همهٔ اسناد</option>{st.docs.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>}
              <button className="im-btn im-btn-primary" type="submit" disabled={!q.trim() || speech.listening} style={{ minHeight: 40 }}><Search size={14} /> جست‌وجو</button>
            </form>
            {speech.error && <p className="im-helper" role="alert" style={{ margin: '6px 0 0', color: '#dc2626' }}>{speech.error}</p>}
            {!speech.supported && <p className="im-helper" style={{ margin: '6px 0 0' }}>این مرورگر تشخیص گفتار ندارد؛ برای پرسش صوتی از Chrome، Edge یا Safari استفاده کنید (یا از میکروفون صفحه‌کلید گوشی).</p>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {SUGGESTED.map((s) => <button key={s} type="button" className="im-btn im-btn-sm" onClick={() => ask(s)}>{s}</button>)}
            </div>
          </>
        )}
      </Section>

      {res && (
        <>
          {res.concepts.length + res.terms.length > 0 && <p className="im-helper" style={{ margin: 0 }}>برداشت از پرسش: {res.groups.length ? res.groups.map((g) => `«${g.title}»`).join('، ') : '—'}{res.terms.length ? ` · کلیدواژه‌ها: ${res.terms.join('، ')}` : ''}</p>}
          {facts.length > 0 && (
            <Section title={<span><Quote size={14} aria-hidden /> مقادیر یافت‌شده در متن</span>} hint="جمله‌هایی که عدد مرتبط با پرسش دارند؛ عیناً از قرارداد">
              <ul style={{ margin: 0, paddingInlineStart: 18, display: 'grid', gap: 6 }}>
                {facts.map((f, i) => <li key={i}><b>{faDigits(f.value)}</b> — <Marked text={f.text} words={res.highlight} /><div className="sub">{f.chunk.path || f.chunk.clauseNo || 'بدون عنوان'}{st.docs.length > 1 ? ` · ${docName(f.docId)}` : ''}</div></li>)}
              </ul>
            </Section>
          )}
          {res.hits.length === 0 ? (
            <div className="im-card im-empty" style={{ padding: 18 }}>بندی برای این پرسش پیدا نشد. واژهٔ دیگری امتحان کنید (مثلاً «خاتمه» به‌جای «فسخ»)، یا اگر سند قدیمی است آن را دوباره بخوانید.</div>
          ) : res.groups.map((g) => (
            <Section key={g.title} title={<span><ScrollText size={14} aria-hidden /> {g.title}</span>} hint={g.hits.length ? `${faDigits(String(g.hits.length))} بند` : 'بندی برای این موضوع در قرارداد پیدا نشد'}>
              <div style={{ display: 'grid', gap: 8 }}>
                {g.hits.map((h) => <HitCard key={`${h.docId}:${h.chunk.ord}`} h={h} words={res.highlight} docName={st.docs.length > 1 ? docName(h.docId) : ''} onArticle={() => setReader({ docId: h.docId, article: articleOf(h.chunk.path), focus: h.chunk.ord })} onDoc={() => setReader({ docId: h.docId, focus: h.chunk.ord })} />)}
              </div>
            </Section>
          ))}
          <p className="im-helper" style={{ margin: 0 }}>نتیجه‌ها از جست‌وجو در متن همین قرارداد به‌دست آمده و تفسیر حقوقی نیست؛ پیش از اتکا، بند را در نسخهٔ اصلی و الحاقیه‌ها تطبیق دهید. متن تصویرها و اسکن‌ها خوانده نمی‌شود.</p>
        </>
      )}
      {reader && <Reader chunks={st.chunks.filter((c) => c.docId === reader.docId)} title={docName(reader.docId)} article={reader.article} focus={reader.focus} words={res?.highlight ?? []} onClose={() => setReader(null)} onAll={() => setReader({ docId: reader.docId, focus: reader.focus })} />}
    </div>
  )
}

function HitCard({ h, words, docName, onArticle, onDoc }: { h: Hit; words: string[]; docName: string; onArticle: () => void; onDoc: () => void }) {
  return (
    <div className="im-card" style={{ padding: 12, display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip tone={h.score > 0.6 ? 'good' : h.score > 0.3 ? 'warn' : 'neutral'}>{h.score > 0.6 ? 'ارتباط زیاد' : h.score > 0.3 ? 'ارتباط متوسط' : 'ارتباط کم'}</Chip>
        {h.chunk.kind === 'row' && <Chip tone="neutral">ردیف جدول</Chip>}
        <b style={{ fontSize: 13 }}>{h.chunk.path || h.chunk.clauseNo || 'بدون عنوان'}</b>
        {docName && <span className="sub">{docName}</span>}
      </div>
      <p style={{ margin: 0, lineHeight: 2, whiteSpace: 'pre-wrap' }}><Marked text={h.chunk.text} words={words} /></p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="im-btn im-btn-sm" onClick={onArticle}><BookOpen size={12} /> متن کامل {articleOf(h.chunk.path).split(' ').slice(0, 2).join(' ') || 'بخش'}</button>
        <button className="im-btn im-btn-sm" onClick={onDoc}><FileText size={12} /> نمایش در سند</button>
        <button className="im-btn im-btn-sm" onClick={() => void navigator.clipboard?.writeText(`${h.chunk.path ? `[${h.chunk.path}] ` : ''}${h.chunk.text}`)}><Copy size={12} /> کپی با شمارهٔ بند</button>
      </div>
    </div>
  )
}

/** The full text of one article (or the whole document) with the question's words marked; the clause that was found is scrolled into view. */
function Reader({ chunks, title, article, focus, words, onClose, onAll }: { chunks: StoredChunk[]; title: string; article?: string; focus?: number; words: string[]; onClose: () => void; onAll: () => void }) {
  const list = useMemo(() => [...chunks].sort((a, b) => a.ord - b.ord).filter((c) => !article || articleOf(c.path) === article), [chunks, article])
  const [q, setQ] = useState('')
  const marks = q.trim() ? [...words, q.trim()] : words
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.querySelector(`[data-ord="${focus}"]`)?.scrollIntoView({ block: 'center' }) }, [focus, article])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  let lastHead = ''
  return (
    <ModalPortal>
      <div className="im-overlay" onClick={onClose}>
        <div className="im-modal" style={{ maxWidth: 880, width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '92vh' }} role="dialog" aria-modal="true" aria-label={article || title} onClick={(e) => e.stopPropagation()}>
          <div className="im-modal-head" style={{ marginBottom: 10 }}>
            <div className="im-modal-title" style={{ minWidth: 0 }}>{article || `متن کامل: ${title}`}</div>
            <button className="im-modal-close" onClick={onClose} aria-label="بستن"><X size={15} /></button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} dir="auto" placeholder="جست‌وجو در همین متن…" aria-label="جست‌وجو در متن" style={{ flex: '1 1 200px' }} />
            {article && <button className="im-btn im-btn-sm" onClick={onAll}><BookOpen size={12} /> کل سند</button>}
            <span className="sub">{faDigits(String(list.length))} بند</span>
          </div>
          <div ref={box} style={{ overflowY: 'auto', flex: 1, display: 'grid', gap: 10, paddingInlineEnd: 4 }}>
            {list.length === 0 && <p className="im-helper">متنی برای این بخش ذخیره نشده است.</p>}
            {list.map((c) => {
              const head = c.path !== lastHead ? c.path : ''
              lastHead = c.path
              return (
                <div key={c.ord} data-ord={c.ord} style={{ borderInlineStart: c.ord === focus ? '3px solid #f59e0b' : '3px solid transparent', paddingInlineStart: 10, background: c.ord === focus ? 'rgba(245,158,11,.08)' : undefined, borderRadius: 6 }}>
                  {head && <div className="sub" style={{ fontWeight: 700, marginBottom: 2 }}>{head}</div>}
                  <p style={{ margin: 0, lineHeight: 2.05, whiteSpace: 'pre-wrap' }}>{c.kind === 'row' && <Chip tone="neutral">ردیف جدول</Chip>} <Marked text={c.text} words={marks} /></p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
