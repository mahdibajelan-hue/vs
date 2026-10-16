import { useEffect, useMemo, useRef, useState } from 'react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useProjectContextStore } from '../../../store/useProjectContextStore'
import { usePersonnelStore } from '../store/usePersonnelStore'
import { CompetencySidebarShell, type CompetencySection } from '../components/CompetencySidebarShell'
import { IssuedCard, WelderProfile } from '../components/personnel/WelderProfile'
import type { Welder } from '../lib/personnel'
import { KIND_FA, type PersonKind } from '../lib/personnelForms'
import { Chip, Section } from '../../finance/components/fn'

const fa = (n: number | string) => String(n).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])
const ST_FA = { active: 'فعال', suspended: 'معلق', left: 'ترک کار' } as const
const today = () => new Date().toISOString().slice(0, 10)
const plus = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10)
type St = 'valid' | 'soon' | 'expired' | 'none'
const ST_CHIP: Record<St, { tone: 'good' | 'warn' | 'bad'; label: string }> = { valid: { tone: 'good', label: 'معتبر' }, soon: { tone: 'warn', label: 'رو به انقضا' }, expired: { tone: 'bad', label: 'منقضی' }, none: { tone: 'bad', label: 'کارت ندارد' } }
const normKey = (v: string) => v.trim().toUpperCase().replace(/\s+/g, ' ')
/** the codes a QR / barcode reader delivers: «RASTA|WC|<card no>|<stamp>» or a plain number */
const scanTokens = (text: string): string[] => { const t = text.trim(); if (!t) return []; return t.startsWith('RASTA|') ? t.split('|').slice(2).reverse() : [t] }
const findByCode = (code: string, people: Welder[]): Welder | undefined => { const k = normKey(code); if (!k) return undefined; return people.find((p) => p.key === k) ?? people.find((p) => p.cardNo && normKey(p.cardNo) === k) ?? people.find((p) => p.nationalId && normKey(p.nationalId) === k) }

/** «صلاحیت جوشکاران و عایق‌کاران»: introduce → qualification test signed by two people → card signed by the site head and the supervision head → printable card with QR. The Execution module reads the issued cards of each project. */
export function PersonnelPage({ onExitToHub, nav }: { onExitToHub: () => void; nav: Partial<Record<CompetencySection, () => void>> }) {
  const projects = useMasterDataStore((s) => s.projects)
  const mdLoaded = useMasterDataStore((s) => s.loaded)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  // this module never loads the project list by itself: fetch it when the section opens
  useEffect(() => { if (!mdLoaded) fetchMasterData() }, [mdLoaded]) // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = useProjectContextStore((s) => s.projectId)
  const st = usePersonnelStore()
  const [projectId, setProjectId] = useState<string>('')
  useEffect(() => { if (!projectId && projects.length) setProjectId(ctx && projects.some((p) => p.id === ctx) ? ctx : projects[0].id) }, [projects, ctx, projectId])
  useEffect(() => { if (projectId) void st.load(projectId) }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  const projectName = projects.find((p) => p.id === projectId)?.officialName ?? ''
  return (
    <CompetencySidebarShell active="personnel" nav={nav} title="صلاحیت جوشکاران و عایق‌کاران" onExitToHub={onExitToHub}
      headerRight={<select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="پروژه" className="im-select-pill">{projects.map((p) => <option key={p.id} value={p.id}>{p.officialName}</option>)}</select>}>
      {!mdLoaded && !projects.length ? <div className="im-skeleton" style={{ height: 160 }} /> : !projectId ? <div className="im-card im-empty" style={{ padding: 26 }}>پروژه‌ای تعریف نشده است.</div> : <Body projectName={projectName} />}
    </CompetencySidebarShell>
  )
}

function Body({ projectName }: { projectName: string }) {
  const st = usePersonnelStore()
  const { caps } = st
  const can = caps.register
  const [kind, setKind] = useState<PersonKind>('welder')
  const [sel, setSel] = useState('')
  const [adding, setAdding] = useState(false)
  const [nw, setNw] = useState({ raw: '', fullName: '', nationalId: '' })
  const [q, setQ] = useState('')
  const all = st.welders
  const list = useMemo(() => all.filter((w) => w.kind === kind && (!q || `${w.raw} ${w.fullName} ${w.nationalId}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true })), [all, kind, q])
  const testsOf = (id: string) => st.quals.filter((x) => x.welderId === id)
  const qualifying = (id: string) => testsOf(id).some((t) => t.wqtStatus === 'confirmed' && t.wqt.qualified === 'YES' && t.status === 'valid')
  const on = today()
  const stateOf = (w: Welder): St => {
    if (w.cardStatus !== 'issued') return 'none'
    const v = w.card.validity
    if (/^\d{4}-\d{2}-\d{2}$/.test(v ?? '')) return v < on ? 'expired' : v <= plus(on, 30) ? 'soon' : 'valid'
    return 'valid'
  }
  const cur = all.find((w) => w.id === sel)
  const add = async () => { const id = await st.saveWelder({ kind, raw: nw.raw, fullName: nw.fullName, nationalId: nw.nationalId }); if (id) { setNw({ raw: '', fullName: '', nationalId: '' }); setAdding(false); setSel(id) } }
  const testChip = (w: Welder) => { const t = testsOf(w.id); if (!t.length) return <Chip tone="bad">ثبت نشده</Chip>; if (qualifying(w.id)) return <Chip tone="good">واجد صلاحیت</Chip>; if (t.some((x) => x.wqtStatus === 'confirmed')) return <Chip tone="bad">فاقد صلاحیت</Chip>; return <Chip tone="warn">در انتظار امضا</Chip> }
  if (st.loading) return <div className="im-skeleton" style={{ height: 200 }} />
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['welder', 'coater'] as PersonKind[]).map((k) => <button key={k} className={`im-btn im-btn-sm${kind === k ? ' im-btn-primary' : ''}`} onClick={() => { setKind(k); setSel('') }}>{KIND_FA[k]}ان ({fa(all.filter((w) => w.kind === k).length)})</button>)}
        <input placeholder="جست‌وجوی نشانه، نام یا کد ملی…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220, marginInlineStart: 'auto' }} aria-label="جست‌وجو" />
        {can && <button className="im-btn im-btn-primary im-btn-sm" onClick={() => setAdding((x) => !x)}>{adding ? 'انصراف' : `+ ${KIND_FA[kind]} جدید`}</button>}
      </div>
      {!can && <p className="im-helper" style={{ margin: 0 }}>در این پروژه دسترسی ثبت ندارید؛ فقط مشاهده می‌کنید.</p>}
      {adding && (
        <Section title={`${KIND_FA[kind]} جدید`} hint="فقط سه مورد؛ بقیه (عکس، آزمون، کارت) در مراحل بعد در پروندهٔ همین فرد می‌آید.">
          <div className="ex-sheet-grid">
            <label>شمارهٔ نشانه / پلاک *<input dir="ltr" value={nw.raw} onChange={(e) => setNw({ ...nw, raw: e.target.value })} placeholder="همان که در فرم‌ها نوشته می‌شود، مثلاً 35" /></label>
            <label>نام و نام‌خانوادگی *<input dir="auto" value={nw.fullName} onChange={(e) => setNw({ ...nw, fullName: e.target.value })} /></label>
            <label>کد ملی (Welder ID) *<input dir="ltr" value={nw.nationalId} onChange={(e) => setNw({ ...nw, nationalId: e.target.value })} /></label>
          </div>
          <div style={{ marginTop: 8 }}><button className="im-btn im-btn-primary im-btn-sm" disabled={!nw.raw.trim() || !nw.fullName.trim() || !nw.nationalId.trim()} onClick={() => void add()}>ثبت و ادامه</button></div>
        </Section>
      )}
      {list.length === 0 ? <div className="im-card im-empty" style={{ padding: 20 }}>هنوز {KIND_FA[kind]}ی برای این پروژه ثبت نشده است.</div> : (
        <div className="fn-tbl-wrap" style={{ maxHeight: 300 }}><table className="ex-lines"><thead><tr><th>نشانه</th><th>نام</th><th>کد ملی</th><th>آزمون</th><th>کارت</th><th>وضعیت</th></tr></thead>
          <tbody>{list.map((w) => { const s = stateOf(w); return (
            <tr key={w.id} onClick={() => setSel(w.id)} style={{ cursor: 'pointer', background: w.id === sel ? 'rgba(14,165,233,.12)' : undefined }}>
              <td dir="ltr"><b>{w.raw}</b></td><td>{w.fullName || '—'}</td><td dir="ltr">{w.nationalId || '—'}</td><td>{testChip(w)}</td>
              <td><Chip tone={ST_CHIP[s].tone}>{ST_CHIP[s].label}</Chip></td>
              <td>{w.status === 'active' ? <span className="sub">{ST_FA.active}</span> : <Chip tone="bad">{ST_FA[w.status]}</Chip>}</td></tr>) })}</tbody></table></div>
      )}
      {cur ? (
        <>
          {cur.cardStatus === 'issued' && <IssuedCard key={`c${cur.id}`} w={cur} tests={testsOf(cur.id)} projectName={projectName} />}
          <details open={cur.cardStatus !== 'issued'} key={`d${cur.id}${cur.cardStatus === 'issued'}`} className="im-card" style={{ padding: '10px 14px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 800 }}>اطلاعات تفصیلی{cur.cardStatus !== 'issued' ? ' (کارت هنوز صادر نشده)' : ''}</summary>
            <div style={{ marginTop: 10 }}><WelderProfile w={cur} tests={testsOf(cur.id)} /></div>
          </details>
        </>
      ) : list.length > 0 && <p className="im-helper" style={{ margin: 0 }}>یک ردیف را انتخاب کنید تا پرونده‌اش باز شود.</p>}
      <ScanBox people={all} onFound={(w) => { setKind(w.kind); setSel(w.id) }} stateOf={stateOf} />
      {caps.admin && <SignerSettings />}
    </div>
  )
}

/** Scan or type a code from the welder's plate: a hand scanner types the code and presses Enter; on phones the camera reader is used when the browser has one. */
function ScanBox({ people, onFound, stateOf }: { people: Welder[]; onFound: (w: Welder) => void; stateOf: (w: Welder) => St }) {
  const [code, setCode] = useState('')
  const [res, setRes] = useState<{ w?: Welder; code: string } | null>(null)
  const [cam, setCam] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const look = (c: string) => { const v = c.trim(); if (!v) return; const w = scanTokens(v).map((t) => findByCode(t, people)).find(Boolean); setRes({ w, code: v }); if (w) { onFound(w); void usePersonnelStore.getState().loadImages(w.id) } setCode('') }
  useEffect(() => {
    if (!cam) return
    let stop = false, stream: MediaStream | null = null
    const Det = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector
    void (async () => {
      try {
        if (!Det) return
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (video.current) { video.current.srcObject = stream; await video.current.play() }
        const det = new Det({ formats: ['code_39', 'code_128', 'qr_code'] })
        while (!stop && video.current) { const r = await det.detect(video.current).catch(() => []); if (r[0]) { look(r[0].rawValue); setCam(false); break } await new Promise((x) => setTimeout(x, 250)) }
      } catch { setCam(false) }
    })()
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()) }
  }, [cam]) // eslint-disable-line react-hooks/exhaustive-deps
  const hasCam = typeof window !== 'undefined' && 'BarcodeDetector' in window
  return (
    <Section title="اسکن QR کارت">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input dir="ltr" autoComplete="off" placeholder="QR کارت را اسکن کنید یا نشانه/کد ملی را بنویسید و Enter بزنید" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); look(code) } }} style={{ minWidth: 280 }} aria-label="اسکن بارکد" />
        <button className="im-btn im-btn-sm" onClick={() => look(code)}>جست‌وجو</button>
        {hasCam ? <button className="im-btn im-btn-sm" onClick={() => setCam((x) => !x)}>{cam ? 'بستن دوربین' : 'اسکن با دوربین'}</button> : <span className="sub">دوربین‌خوان در این مرورگر نیست؛ از اسکنر دستی استفاده کنید.</span>}
      </div>
      {cam && <video ref={video} muted playsInline style={{ marginTop: 8, width: 'min(100%, 360px)', borderRadius: 8, background: '#000' }} />}
      {res && (res.w ? (
        <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(16,185,129,.1)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {res.w.photo && <img src={res.w.photo} alt="" style={{ width: 44, height: 56, objectFit: 'cover', borderRadius: 4 }} />}
          <b>{res.w.fullName || res.w.raw}</b><span dir="ltr">{res.w.raw}</span><span>{KIND_FA[res.w.kind]}</span>
          <Chip tone={res.w.status === 'active' ? 'good' : 'bad'}>{ST_FA[res.w.status]}</Chip>
          <Chip tone={ST_CHIP[stateOf(res.w)].tone}>{ST_CHIP[stateOf(res.w)].label}</Chip>
          {res.w.cardStatus !== 'issued' && <span className="sub">کارت صادر نشده</span>}
        </div>
      ) : <p style={{ marginTop: 8, color: 'var(--im-coral, #dc2626)' }}>«{res.code}» در رجیستر این پروژه نیست.</p>)}
    </Section>
  )
}

/** who signs the test and the card (per project); a slot left empty may be signed by any reviewer */

/** who signs the tests and the cards of this project (a slot left empty may be signed by any reviewer) */
function SignerSettings() {
  const st = usePersonnelStore()
  const team = useMasterDataStore((s) => s.team).filter((t) => t.projectId === st.projectId && t.userId)
  const cur = st.caps.signers
  const slots: [string, string][] = [['weld_inspector', 'ناظر جوش (آزمون جوشکار)'], ['defect_interpreter', 'مفسر عیوب جوش (آزمون جوشکار)'], ['coat_supervisor', 'ناظر (آزمون عایق‌کار)'], ['coat_contractor', 'نماینده پیمانکار (آزمون عایق‌کار)'], ['site_head', 'سرپرست کارگاه (کارت)'], ['supervision_head', 'سرپرست نظارت (کارت)']]
  return (
    <details><summary className="im-helper">تعیین امضاکنندگان فرم آزمون و کارت این پروژه</summary>
      <div className="ex-sheet-grid" style={{ marginTop: 8 }}>{slots.map(([k, l]) => (
        <label key={k}>{l}<select value={cur[k] ?? ''} onChange={(e) => void st.setSigners({ ...cur, [k]: e.target.value })}><option value="">هر بررسی‌کننده</option>{team.map((t) => <option key={t.id} value={t.userId!}>{t.personName || '—'}</option>)}</select></label>
      ))}</div>
      <p className="im-helper">امضا با نمونهٔ امضای ثبت‌شدهٔ همان کاربر در پروفایلش انجام می‌شود.</p>
    </details>
  )
}
