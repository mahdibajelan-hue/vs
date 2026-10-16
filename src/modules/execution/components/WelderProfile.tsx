import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Camera, Undo2 } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { COATER_CARD_FIELDS, KIND_FA, WELDER_CARD_EXTRA, WQT_FIELDS, WQT_GROUPS, cardData, testProblems, wqtDefaults, type PField } from '../lib/personnelForms'
import type { PersonSig, Welder, WelderQual } from '../lib/registers'
import { Chip, fmtD } from '../../finance/components/fn'
import { fa } from './common'
import { IdCard } from './IdCard'
import { jdLatin, photoFromFile } from './PersonSheet'
import { code39Supported } from '../lib/code39'

function Field({ f, v, set, dis }: { f: PField; v: string; set: (x: string) => void; dis: boolean }) {
  return (
    <label className={f.wide ? 'wide' : undefined}>{f.label}
      {f.kind === 'select' ? <select disabled={dis} value={v} onChange={(e) => set(e.target.value)}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : f.kind === 'date' ? <JalaliDateInput value={v} onChange={(x) => !dis && set(x)} />
        : <input disabled={dis} dir="auto" inputMode={f.kind === 'num' ? 'decimal' : undefined} value={v} onChange={(e) => set(e.target.value)} placeholder={f.hint} />}
    </label>
  )
}
const Step = ({ n, title, state, children }: { n: number; title: string; state?: React.ReactNode; children: React.ReactNode }) => (
  <section className="im-card" style={{ padding: 14, display: 'grid', gap: 10 }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b style={{ background: 'var(--im-accent, #0ea5e9)', color: '#fff', borderRadius: 12, width: 22, height: 22, display: 'inline-grid', placeItems: 'center', fontSize: 12 }}>{fa(n)}</b><b>{title}</b>{state}</div>
    {children}
  </section>
)

/** one signature slot: who signed, or the button for the person who may */
function SignSlot({ label, sig, expected, mine, canSign, onSign, disabledWhy }: { label: string; sig: PersonSig | null; expected: string; mine: boolean; canSign: boolean; onSign: () => void; disabledWhy?: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 10px', border: '1px solid var(--im-line, #cbd5e1)', borderRadius: 8, minWidth: 230 }}>
      <div style={{ flex: 1 }}><div className="sub">{label}</div>{sig ? <b>{sig.name} <small className="sub">{jdLatin(sig.at.slice(0, 10))}</small></b> : <span className="sub">{expected ? `منتظر امضای ${expected}` : 'منتظر امضا'}</span>}</div>
      {sig ? <BadgeCheck size={18} color="#10b981" /> : <button className="im-btn im-btn-sm im-btn-primary" disabled={!canSign || !mine} title={disabledWhy ?? (mine ? undefined : 'امضاکنندهٔ این مرحله شما نیستید')} onClick={onSign}>امضا</button>}
    </div>
  )
}

export function WelderProfile({ w, projectId, can, tests, projectName }: { w: Welder; projectId: string; can: boolean; tests: WelderQual[]; projectName: string }) {
  const epc = useEpcStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const me = useAuthStore((s) => s.profile?.id)
  const settings = useExecutionStore((s) => s.settingsByProject.get(projectId)) as unknown as { personnelSigners?: Record<string, string> } | undefined
  const canReview = useExecutionStore((s) => s.can(projectId, 'review') || s.can(projectId, '*') || s.can(projectId, 'configure'))
  const people = useExecutionStore((s) => s.people)
  const signers = settings?.personnelSigners ?? {}
  const mine = (key: string) => (signers[key] ? signers[key] === me : canReview)
  const who = (key: string) => (signers[key] ? people.get(signers[key]) ?? '' : '')

  // ── 1. identity (typed once; the card and the test read it from here)
  const [id, setId] = useState({ fullName: w.fullName, nationalId: w.nationalId, orgId: w.orgId ?? '', status: w.status })
  const [photo, setPhoto] = useState(w.photo)
  useEffect(() => { setId({ fullName: w.fullName, nationalId: w.nationalId, orgId: w.orgId ?? '', status: w.status }); setPhoto(w.photo) }, [w.id, w.fullName, w.nationalId, w.orgId, w.status, w.photo])
  const locked = w.cardStatus !== 'draft'
  const idDirty = id.fullName !== w.fullName || id.nationalId !== w.nationalId || (id.orgId || null) !== w.orgId || id.status !== w.status || photo !== w.photo

  // ── 2. test (welders only)
  const sorted = useMemo(() => [...tests].sort((a, b) => (b.issueDate ?? '').localeCompare(a.issueDate ?? '')), [tests])
  const [tid, setTid] = useState('')
  const cur = sorted.find((t) => t.id === tid) ?? sorted[0]
  const [fresh, setFresh] = useState(false)
  const base = (t?: WelderQual) => ({ ...wqtDefaults(), ...(t?.wqt ?? {}) } as Record<string, string>)
  const [d, setD] = useState<Record<string, string>>(base(cur))
  useEffect(() => { setD(base(fresh ? undefined : cur)) }, [cur?.id, cur?.wqt, fresh]) // eslint-disable-line react-hooks/exhaustive-deps
  const testLocked = !fresh && cur?.wqtStatus === 'confirmed'
  const testDirty = fresh ? true : JSON.stringify(d) !== JSON.stringify(base(cur))
  const tProblems = testProblems(d)
  const qualifying = useMemo(() => sorted.find((t) => t.wqtStatus === 'confirmed' && t.wqt.qualified === 'YES' && t.status === 'valid'), [sorted])

  // ── 3. card
  const extraFields = w.kind === 'welder' ? WELDER_CARD_EXTRA : COATER_CARD_FIELDS
  const cardBase = () => Object.fromEntries(extraFields.filter((f) => f.def).map((f) => [f.key, f.def as string])) as Record<string, string>
  const [card, setCard] = useState<Record<string, string>>({ ...cardBase(), ...w.card })
  useEffect(() => setCard({ ...cardBase(), ...w.card }), [w.id, w.card]) // eslint-disable-line react-hooks/exhaustive-deps
  const cardDirty = JSON.stringify(card) !== JSON.stringify({ ...cardBase(), ...w.card })
  const data = cardData({ kind: w.kind, fullName: w.fullName, nationalId: w.nationalId, raw: w.raw, card: w.card }, qualifying?.wqt, jdLatin)
  const cardReady = w.kind === 'coater' || !!qualifying
  const barcode = code39Supported(w.raw.toUpperCase()) ? w.raw.toUpperCase() : w.cardNo
  const validityMode = card.validity === 'END' ? 'END' : card.validity ? 'DATE' : ''

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Step n={1} title={`مشخصات ${KIND_FA[w.kind]}`} state={<span className="sub">شمارهٔ نشانه / پلاک: <b dir="ltr">{w.raw}</b>{w.nationalId ? '' : ' — کد ملی را وارد کنید'}</span>}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
            <div style={{ width: 110, height: 140, border: '1px dashed var(--im-line, #94a3b8)', borderRadius: 6, display: 'grid', placeItems: 'center', overflow: 'hidden', background: 'rgba(148,163,184,.08)' }}>
              {photo ? <img src={photo} alt={`عکس ${w.fullName || w.raw}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span className="sub">بدون عکس</span>}
            </div>
            {can && !locked && <label className="im-btn im-btn-sm" style={{ cursor: 'pointer' }}><Camera size={13} /> عکس<input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { setPhoto(await photoFromFile(f)) } catch { window.alert('این فایل تصویر قابل خواندن نیست.') } } e.target.value = '' }} /></label>}
          </div>
          <div className="ex-sheet-grid" style={{ flex: 1, minWidth: 280 }}>
            <label>نام و نام‌خانوادگی *<input disabled={!can || locked} dir="auto" value={id.fullName} onChange={(e) => setId({ ...id, fullName: e.target.value })} /></label>
            <label>کد ملی (Welder ID) *<input disabled={!can || locked} dir="ltr" value={id.nationalId} onChange={(e) => setId({ ...id, nationalId: e.target.value })} /></label>
            <label>شرکت<select disabled={!can} value={id.orgId} onChange={(e) => setId({ ...id, orgId: e.target.value })}><option value="">—</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
            <label>وضعیت<select disabled={!can} value={id.status} onChange={(e) => setId({ ...id, status: e.target.value as Welder['status'] })}><option value="active">فعال</option><option value="suspended">معلق</option><option value="left">ترک کار</option></select></label>
          </div>
        </div>
        {can && idDirty && <div><button className="im-btn im-btn-primary im-btn-sm" onClick={() => void epc.saveWelder({ ...w, projectId, raw: w.raw, fullName: id.fullName, nationalId: id.nationalId, orgId: id.orgId || null, status: id.status, photo, card: w.card })}>ذخیرهٔ مشخصات</button></div>}
      </Step>

      {w.kind === 'welder' && (
        <Step n={2} title="فرم آزمون صلاحیت (WQT)" state={cur && !fresh ? <Chip tone={cur.wqtStatus === 'confirmed' ? 'good' : 'warn'}>{cur.wqtStatus === 'confirmed' ? (cur.wqt.qualified === 'YES' ? 'تأیید شد — واجد صلاحیت' : 'تأیید شد — فاقد صلاحیت') : 'پیش‌نویس'}</Chip> : <Chip tone="warn">آزمون جدید</Chip>}>
          {(sorted.length > 0 || fresh) && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {sorted.map((t) => <button key={t.id} className={`im-btn im-btn-sm${!fresh && cur?.id === t.id ? ' im-btn-primary' : ''}`} onClick={() => { setFresh(false); setTid(t.id) }}>آزمون {t.wqtNo || 'بدون شماره'}</button>)}
            {can && !fresh && <button className="im-btn im-btn-sm" onClick={() => setFresh(true)}>+ آزمون جدید</button>}
            {fresh && sorted.length > 0 && <button className="im-btn im-btn-sm" onClick={() => setFresh(false)}>انصراف</button>}
          </div>}
          {WQT_GROUPS.map((g) => {
            const fields = g.keys.map((k) => WQT_FIELDS.find((f) => f.key === k)!)
            const grid = <div className="ex-sheet-grid">{fields.map((f) => <Field key={f.key} f={f} v={d[f.key] ?? ''} set={(x) => setD({ ...d, [f.key]: x })} dis={!can || testLocked} />)}</div>
            return g.folded ? <details key={g.title}><summary className="im-helper">{g.title}</summary>{grid}</details> : <div key={g.title}><div className="im-helper" style={{ margin: '0 0 4px', fontWeight: 700 }}>{g.title}</div>{grid}</div>
          })}
          {tProblems.length > 0 && !testLocked && <p className="im-helper" style={{ margin: 0 }}>برای امضا لازم است: {tProblems.join('، ')}.</p>}
          {can && !testLocked && <div><button className="im-btn im-btn-primary im-btn-sm" disabled={!testDirty || !w.fullName} title={!w.fullName ? 'ابتدا نام جوشکار را ذخیره کنید' : undefined} onClick={async () => { const sid = await epc.saveQual({ id: fresh ? undefined : cur?.id, projectId, welderId: w.id, wqt: { ...d, welderName: w.fullName, welderId: w.nationalId, stamp: w.raw } }); if (sid) { setFresh(false); setTid(sid) } }}>ذخیرهٔ فرم آزمون</button></div>}
          {cur && !fresh && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <SignSlot label="ناظر جوش" sig={cur.wqtSignA} expected={who('weld_inspector')} mine={mine('weld_inspector')} canSign={!testDirty && tProblems.length === 0} disabledWhy={testDirty ? 'ابتدا فرم را ذخیره کنید' : tProblems[0]} onSign={() => void epc.personSign('wqt', cur.id, 'a')} />
              <SignSlot label="مفسر عیوب جوش" sig={cur.wqtSignB} expected={who('defect_interpreter')} mine={mine('defect_interpreter')} canSign={!testDirty && tProblems.length === 0} disabledWhy={testDirty ? 'ابتدا فرم را ذخیره کنید' : tProblems[0]} onSign={() => void epc.personSign('wqt', cur.id, 'b')} />
              {canReview && cur.wqtStatus === 'confirmed' && <button className="im-btn im-btn-sm" onClick={() => { if (window.confirm('آزمون بازگشایی و امضاها پاک شود؟')) void epc.personReopen('wqt', cur.id) }}><Undo2 size={13} /> بازگشایی</button>}
            </div>
          )}
        </Step>
      )}

      <Step n={w.kind === 'welder' ? 3 : 2} title={`کارت صلاحیت ${KIND_FA[w.kind]}`} state={<Chip tone={w.cardStatus === 'issued' ? 'good' : 'warn'}>{w.cardStatus === 'issued' ? `صادر شد · ${w.cardNo}` : 'صادر نشده'}</Chip>}>
        {!cardReady ? <p className="im-helper" style={{ margin: 0 }}>کارت پس از تأیید آزمون با نتیجهٔ «YES» صادر می‌شود. نام، کد ملی، فرایند، وضعیت جوش، الکترود و محدودهٔ صلاحیت از همان آزمون خوانده می‌شود و دوباره پرسیده نمی‌شود.</p> : (
          <>
            {w.kind === 'welder' && qualifying && <p className="im-helper" style={{ margin: 0 }}>از آزمون {qualifying.wqtNo}: {data.rows.slice(0, 5).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>}
            <div className="ex-sheet-grid">
              <label>اعتبار کارت *<select disabled={!can || locked} value={validityMode} onChange={(e) => setCard({ ...card, validity: e.target.value === 'END' ? 'END' : e.target.value === 'DATE' ? new Date().toISOString().slice(0, 10) : '' })}><option value="">—</option><option value="END">تا پایان پروژه</option><option value="DATE">تا تاریخ مشخص</option></select></label>
              {validityMode === 'DATE' && <label>تاریخ انقضا<JalaliDateInput value={card.validity} onChange={(x) => !locked && setCard({ ...card, validity: x })} /></label>}
              {extraFields.map((f) => <Field key={f.key} f={f} v={card[f.key] ?? ''} set={(x) => setCard({ ...card, [f.key]: x })} dis={!can || locked} />)}
            </div>
            {can && !locked && <div><button className="im-btn im-btn-primary im-btn-sm" disabled={!cardDirty} onClick={() => void epc.saveWelder({ ...w, projectId, raw: w.raw, card })}>ذخیرهٔ اطلاعات کارت</button></div>}
            {!w.fullName || !w.nationalId ? <p className="im-helper" style={{ margin: 0, color: 'var(--im-amber)' }}>برای صدور، نام و کد ملی را در مرحلهٔ ۱ ذخیره کنید.</p> : null}
            {!locked && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <SignSlot label="سرپرست کارگاه" sig={w.cardSignA} expected={who('site_head')} mine={mine('site_head')} canSign={!cardDirty && !!w.fullName && !!w.nationalId && !!w.card.validity} disabledWhy={cardDirty ? 'ابتدا اطلاعات کارت را ذخیره کنید' : !w.card.validity ? 'اعتبار کارت را مشخص و ذخیره کنید' : undefined} onSign={() => void epc.personSign('card', w.id, 'a')} />
              <SignSlot label="سرپرست نظارت" sig={w.cardSignB} expected={who('supervision_head')} mine={mine('supervision_head')} canSign={!cardDirty && !!w.fullName && !!w.nationalId && !!w.card.validity} disabledWhy={cardDirty ? 'ابتدا اطلاعات کارت را ذخیره کنید' : !w.card.validity ? 'اعتبار کارت را مشخص و ذخیره کنید' : undefined} onSign={() => void epc.personSign('card', w.id, 'b')} />
            </div>}
            {canReview && locked && <div><button className="im-btn im-btn-sm" onClick={() => { if (window.confirm('کارت بازگشایی شود؟ امضاها پاک می‌شود و کارت تا امضای دوبارهٔ دو سرپرست معتبر نیست.')) void epc.personReopen('card', w.id) }}><Undo2 size={13} /> بازگشایی کارت</button></div>}
          </>
        )}
        {w.cardStatus === 'issued' && <IdCard kind={w.kind} data={data} photo={w.photo} cardNo={w.cardNo} projectName={projectName} barcodeText={barcode} sigA={w.cardSignA} sigB={w.cardSignB} labelA="Site Head" labelB="Supervision Head" />}
      </Step>
      {w.cardIssuedAt && <p className="im-helper" style={{ margin: 0 }}>تاریخ صدور: {fmtD(w.cardIssuedAt.slice(0, 10))}</p>}
    </div>
  )
}
