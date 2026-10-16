import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Camera, Undo2 } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { COATER_CARD_FIELDS, COATER_SCOPE, KIND_FA, WELDER_CARD_EXTRA, cardData, testConfig, testProblems, type PField } from '../lib/personnelForms'
import type { PersonSig, Welder, WelderQual } from '../lib/registers'
import { Chip, fmtD } from '../../finance/components/fn'
import { fa } from './common'
import { IdCard } from './IdCard'
import { jdLatin, photoFromFile } from './PersonSheet'
import { cardPayload } from '../lib/registers'
import type { Rank, WelderQuality } from '../lib/welderQuality'

function Field({ f, v, set, dis }: { f: PField; v: string; set: (x: string) => void; dis: boolean }) {
  if (f.kind === 'multi') {
    const on = new Set(v.split(',').filter(Boolean))
    return (
      <div className="wide" style={{ display: 'grid', gap: 4 }}><span>{f.label}</span>
        {COATER_SCOPE.map((o) => <label key={o.value} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} disabled={dis} checked={on.has(o.value)} onChange={(e) => { const n = new Set(on); if (e.target.checked) n.add(o.value); else n.delete(o.value); set(COATER_SCOPE.filter((x) => n.has(x.value)).map((x) => x.value).join(',')) }} />{o.label}</label>)}
      </div>
    )
  }
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
function SignSlot({ label, sig, expected, mine, canSign, onSign, disabledWhy, busy }: { label: string; sig: PersonSig | null; expected: string; mine: boolean; canSign: boolean; onSign: () => void; disabledWhy?: string; busy?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 10px', border: '1px solid var(--im-line, #cbd5e1)', borderRadius: 8, minWidth: 230 }}>
      <div style={{ flex: 1 }}><div className="sub">{label}</div>{sig ? <b>{sig.name} <small className="sub">{jdLatin(sig.at.slice(0, 10))}</small></b> : <span className="sub">{expected ? `منتظر امضای ${expected}` : 'منتظر امضا'}</span>}</div>
      {sig ? <BadgeCheck size={18} color="#10b981" /> : <button className="im-btn im-btn-sm im-btn-primary" disabled={!canSign || !mine || busy} title={disabledWhy ?? (mine ? undefined : 'امضاکنندهٔ این مرحله شما نیستید')} onClick={onSign}>{busy ? 'در حال امضا…' : 'امضا'}</button>}
    </div>
  )
}

export function WelderProfile({ w, projectId, can, tests, projectName, quality, rank }: { w: Welder; projectId: string; can: boolean; tests: WelderQual[]; projectName: string; quality?: WelderQuality; rank?: Rank }) {
  const epc = useEpcStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const me = useAuthStore((s) => s.profile?.id)
  const settings = useExecutionStore((s) => s.settingsByProject.get(projectId)) as unknown as { personnelSigners?: Record<string, string> } | undefined
  const canReview = useExecutionStore((s) => s.can(projectId, 'review') || s.can(projectId, '*') || s.can(projectId, 'configure'))
  const people = useExecutionStore((s) => s.people)
  const [busy, setBusy] = useState('')
  const run = async (k: string, f: () => Promise<unknown>) => { setBusy(k); try { await f() } finally { setBusy('') } }
  const signers = settings?.personnelSigners ?? {}
  const mine = (key: string) => (signers[key] ? signers[key] === me : canReview)
  const who = (key: string) => (signers[key] ? people.get(signers[key]) ?? '' : '')

  // ── 1. identity (typed once; the card and the test read it from here)
  const [id, setId] = useState({ fullName: w.fullName, nationalId: w.nationalId, orgId: w.orgId ?? '', status: w.status })
  const [photo, setPhoto] = useState(w.photo)
  useEffect(() => { setId({ fullName: w.fullName, nationalId: w.nationalId, orgId: w.orgId ?? '', status: w.status }); setPhoto(w.photo) }, [w.id, w.fullName, w.nationalId, w.orgId, w.status, w.photo])
  const locked = w.cardStatus !== 'draft'
  // lists carry no images: load this person's photo and signature images once when the file is opened (and after a card is issued)
  const photoLoaded = !w.hasPhoto || w.photo !== ''
  useEffect(() => { if ((w.hasPhoto && !w.photo) || (w.cardSignA && !w.cardSignA.image) || (w.cardSignB && !w.cardSignB.image)) void epc.loadPersonImages(w.id) }, [w.id, w.cardStatus, w.hasPhoto]) // eslint-disable-line react-hooks/exhaustive-deps
  const idDirty = id.fullName !== w.fullName || id.nationalId !== w.nationalId || (id.orgId || null) !== w.orgId || id.status !== w.status || (photoLoaded && photo !== w.photo)

  // ── 2. test (welders only)
  const cfg = testConfig(w.kind)
  const sorted = useMemo(() => [...tests].sort((a, b) => (b.issueDate ?? '').localeCompare(a.issueDate ?? '')), [tests])
  const [tid, setTid] = useState('')
  const cur = sorted.find((t) => t.id === tid) ?? sorted[0]
  const [fresh, setFresh] = useState(false)
  const base = (t?: WelderQual) => ({ ...cfg.defaults, ...(t?.wqt ?? {}) } as Record<string, string>)
  const [d, setD] = useState<Record<string, string>>(base(cur))
  useEffect(() => { setD(base(fresh ? undefined : cur)) }, [cur?.id, cur?.wqt, fresh]) // eslint-disable-line react-hooks/exhaustive-deps
  const testLocked = !fresh && cur?.wqtStatus === 'confirmed'
  const testDirty = fresh ? true : JSON.stringify(d) !== JSON.stringify(base(cur))
  const tProblems = testProblems(d, w.kind)
  const qualifying = useMemo(() => sorted.find((t) => t.wqtStatus === 'confirmed' && t.wqt.qualified === 'YES' && t.status === 'valid'), [sorted])

  // ── 3. card
  const extraFields: PField[] = w.kind === 'welder' ? WELDER_CARD_EXTRA : COATER_CARD_FIELDS
  const cardBase = () => Object.fromEntries(extraFields.filter((f) => f.def).map((f) => [f.key, f.def as string])) as Record<string, string>
  const [card, setCard] = useState<Record<string, string>>({ ...cardBase(), ...w.card })
  useEffect(() => setCard({ ...cardBase(), ...w.card }), [w.id, w.card]) // eslint-disable-line react-hooks/exhaustive-deps
  const cardDirty = JSON.stringify(card) !== JSON.stringify({ ...cardBase(), ...w.card })
  const data = cardData({ kind: w.kind, fullName: w.fullName, nationalId: w.nationalId, raw: w.raw, card: w.card }, qualifying?.wqt, jdLatin)
  const cardReady = !!qualifying
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
        {can && idDirty && <div><button className="im-btn im-btn-primary im-btn-sm" disabled={busy === 'id'} onClick={() => void run('id', () => epc.saveWelder({ ...w, projectId, raw: w.raw, fullName: id.fullName, nationalId: id.nationalId, orgId: id.orgId || null, status: id.status, photo: photoLoaded ? photo : undefined, card: w.card }))}>{busy === 'id' ? 'در حال ذخیره…' : 'ذخیرهٔ مشخصات'}</button></div>}
      </Step>

      {(
        <Step n={2} title={w.kind === 'welder' ? 'فرم آزمون صلاحیت (WQT)' : 'آزمون صلاحیت عایق‌کار (تست پوشش سرجوش)'} state={cur && !fresh ? <Chip tone={cur.wqtStatus === 'confirmed' ? 'good' : 'warn'}>{cur.wqtStatus === 'confirmed' ? (cur.wqt.qualified === 'YES' ? 'تأیید شد — واجد صلاحیت' : 'تأیید شد — فاقد صلاحیت') : 'پیش‌نویس'}</Chip> : <Chip tone="warn">آزمون جدید</Chip>}>
          {(sorted.length > 0 || fresh) && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {sorted.map((t) => <button key={t.id} className={`im-btn im-btn-sm${!fresh && cur?.id === t.id ? ' im-btn-primary' : ''}`} onClick={() => { setFresh(false); setTid(t.id) }}>آزمون {t.wqtNo || 'بدون شماره'}</button>)}
            {can && !fresh && <button className="im-btn im-btn-sm" onClick={() => setFresh(true)}>+ آزمون جدید</button>}
            {fresh && sorted.length > 0 && <button className="im-btn im-btn-sm" onClick={() => setFresh(false)}>انصراف</button>}
          </div>}
          {cfg.groups.map((g) => {
            const fields = g.keys.map((k) => cfg.fields.find((f) => f.key === k)!)
            const grid = <div className="ex-sheet-grid">{fields.map((f) => <Field key={f.key} f={f} v={d[f.key] ?? ''} set={(x) => setD({ ...d, [f.key]: x })} dis={!can || testLocked} />)}</div>
            return g.folded ? <details key={g.title}><summary className="im-helper">{g.title}</summary>{grid}</details> : <div key={g.title}><div className="im-helper" style={{ margin: '0 0 4px', fontWeight: 700 }}>{g.title}</div>{grid}</div>
          })}
          {tProblems.length > 0 && !testLocked && <p className="im-helper" style={{ margin: 0 }}>برای امضا لازم است: {tProblems.join('، ')}.</p>}
          {can && !testLocked && <div><button className="im-btn im-btn-primary im-btn-sm" disabled={!testDirty || !w.fullName || busy === 'test'} title={!w.fullName ? 'ابتدا نام را در مرحلهٔ ۱ ذخیره کنید' : undefined} onClick={() => void run('test', async () => { const sid = await epc.saveQual({ id: fresh ? undefined : cur?.id, projectId, welderId: w.id, wqt: { ...d, welderName: w.fullName, welderId: w.nationalId, stamp: w.raw } }); if (sid) { setFresh(false); setTid(sid) } })}>{busy === 'test' ? 'در حال ذخیره…' : 'ذخیرهٔ فرم آزمون'}</button></div>}
          {cur && !fresh && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <SignSlot label={w.kind === 'welder' ? 'ناظر جوش' : 'ناظر'} sig={cur.wqtSignA} expected={who(w.kind === 'welder' ? 'weld_inspector' : 'coat_supervisor')} mine={mine(w.kind === 'welder' ? 'weld_inspector' : 'coat_supervisor')} canSign={!testDirty && tProblems.length === 0} disabledWhy={testDirty ? 'ابتدا فرم را ذخیره کنید' : tProblems[0]} busy={busy === 'wa'} onSign={() => void run('wa', () => epc.personSign('wqt', cur.id, 'a'))} />
              <SignSlot label={w.kind === 'welder' ? 'مفسر عیوب جوش' : 'نماینده پیمانکار'} sig={cur.wqtSignB} expected={who(w.kind === 'welder' ? 'defect_interpreter' : 'coat_contractor')} mine={mine(w.kind === 'welder' ? 'defect_interpreter' : 'coat_contractor')} canSign={!testDirty && tProblems.length === 0} disabledWhy={testDirty ? 'ابتدا فرم را ذخیره کنید' : tProblems[0]} busy={busy === 'wb'} onSign={() => void run('wb', () => epc.personSign('wqt', cur.id, 'b'))} />
              {canReview && cur.wqtStatus === 'confirmed' && <button className="im-btn im-btn-sm" onClick={() => { if (window.confirm('آزمون بازگشایی و امضاها پاک شود؟')) void epc.personReopen('wqt', cur.id) }}><Undo2 size={13} /> بازگشایی</button>}
            </div>
          )}
        </Step>
      )}

      <Step n={3} title={`کارت صلاحیت ${KIND_FA[w.kind]}`} state={<Chip tone={w.cardStatus === 'issued' ? 'good' : 'warn'}>{w.cardStatus === 'issued' ? `صادر شد · ${w.cardNo}` : 'صادر نشده'}</Chip>}>
        {!cardReady ? <p className="im-helper" style={{ margin: 0 }}>کارت پس از تأیید آزمون (دو امضا) با نتیجهٔ «YES» صادر می‌شود. {w.kind === 'welder' ? 'فرایند، وضعیت جوش، الکترود و محدودهٔ صلاحیت' : 'سیستم پوشش و نوع عایق‌کاری مجاز'} از همان آزمون خوانده می‌شود و دوباره پرسیده نمی‌شود.</p> : (
          <>
            {qualifying && <p className="im-helper" style={{ margin: 0 }}>از آزمون {qualifying.wqtNo}: {data.scope?.length ? `${data.scope.join('، ')} · ` : ''}{data.rows.slice(0, 4).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>}
            <div className="ex-sheet-grid">
              <label>اعتبار کارت *<select disabled={!can || locked} value={validityMode} onChange={(e) => setCard({ ...card, validity: e.target.value === 'END' ? 'END' : e.target.value === 'DATE' ? new Date().toISOString().slice(0, 10) : '' })}><option value="">—</option><option value="END">تا پایان پروژه</option><option value="DATE">تا تاریخ مشخص</option></select></label>
              {validityMode === 'DATE' && <label>تاریخ انقضا<JalaliDateInput value={card.validity} onChange={(x) => !locked && setCard({ ...card, validity: x })} /></label>}
              {extraFields.map((f) => <Field key={f.key} f={f} v={card[f.key] ?? ''} set={(x) => setCard({ ...card, [f.key]: x })} dis={!can || locked} />)}
            </div>
            {can && !locked && <div><button className="im-btn im-btn-primary im-btn-sm" disabled={!cardDirty || busy === 'card'} onClick={() => void run('card', () => epc.saveWelder({ ...w, projectId, raw: w.raw, card, photo: undefined }))}>{busy === 'card' ? 'در حال ذخیره…' : 'ذخیرهٔ اطلاعات کارت'}</button></div>}
            {!w.fullName || !w.nationalId ? <p className="im-helper" style={{ margin: 0, color: 'var(--im-amber)' }}>برای صدور، نام و کد ملی را در مرحلهٔ ۱ ذخیره کنید.</p> : null}
            {!locked && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <SignSlot label="سرپرست کارگاه" sig={w.cardSignA} expected={who('site_head')} mine={mine('site_head')} canSign={!cardDirty && !!w.fullName && !!w.nationalId && !!w.card.validity} disabledWhy={cardDirty ? 'ابتدا اطلاعات کارت را ذخیره کنید' : !w.card.validity ? 'اعتبار کارت را مشخص و ذخیره کنید' : undefined} busy={busy === 'ca'} onSign={() => void run('ca', () => epc.personSign('card', w.id, 'a'))} />
              <SignSlot label="سرپرست نظارت" sig={w.cardSignB} expected={who('supervision_head')} mine={mine('supervision_head')} canSign={!cardDirty && !!w.fullName && !!w.nationalId && !!w.card.validity} disabledWhy={cardDirty ? 'ابتدا اطلاعات کارت را ذخیره کنید' : !w.card.validity ? 'اعتبار کارت را مشخص و ذخیره کنید' : undefined} busy={busy === 'cb'} onSign={() => void run('cb', () => epc.personSign('card', w.id, 'b'))} />
            </div>}
            {canReview && locked && <div><button className="im-btn im-btn-sm" onClick={() => { if (window.confirm('کارت بازگشایی شود؟ امضاها پاک می‌شود و کارت تا امضای دوبارهٔ دو سرپرست معتبر نیست.')) void epc.personReopen('card', w.id) }}><Undo2 size={13} /> بازگشایی کارت</button></div>}
          </>
        )}
        {w.cardStatus === 'issued' && <IdCard kind={w.kind} data={data} photo={w.photo} cardNo={w.cardNo} projectName={projectName} payload={cardPayload(w.cardNo, w.raw)} sigA={w.cardSignA} sigB={w.cardSignB} labelA="Site Head" labelB="Supervision Head" />}
      </Step>
      {w.kind === 'welder' && (
        <Step n={4} title="عملکرد کیفیت (از سامانهٔ کیفیت)" state={rank?.rank ? <Chip tone={rank.rank <= Math.max(1, Math.ceil(rank.of / 3)) ? 'good' : rank.rank > Math.ceil((rank.of * 2) / 3) ? 'bad' : 'neutral'}>رتبه {fa(rank.rank)} از {fa(rank.of)} · نمره {fa(rank.score ?? 0, 1)}</Chip> : <Chip tone="neutral">بدون رتبه (نمونهٔ کم)</Chip>}>
          {!quality || quality.tested === 0 ? <p className="im-helper" style={{ margin: 0 }}>هنوز سرجوشی از این جوشکار رادیوگرافی نشده است. درصد ریپیر خودکار از گزارش‌های جوشکاری و رادیوگرافی محاسبه می‌شود و جایی تایپ نمی‌شود.</p> : (
            <>
              <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
                <div><div className="sub">ریپیر کل دوره</div><b style={{ fontSize: 22 }}>{fa(quality.rate, 1)}٪</b></div>
                <div><div className="sub">سرجوش دارای RT</div><b style={{ fontSize: 22 }}>{fa(quality.tested)}</b></div>
                <div><div className="sub">نیازمند تعمیر</div><b style={{ fontSize: 22 }}>{fa(quality.repaired)}</b></div>
              </div>
              <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>ماه</th><th className="num">سرجوش دارای RT</th><th className="num">ریپیر</th><th className="num">٪ ریپیر</th><th style={{ width: '30%' }} /></tr></thead>
                <tbody>{[...quality.months].reverse().map((m) => <tr key={m.key}><td>{m.label}</td><td className="num">{fa(m.tested)}</td><td className="num">{fa(m.repaired)}</td><td className="num"><b>{fa(m.rate, 1)}٪</b></td><td><div style={{ height: 8, borderRadius: 4, background: 'rgba(148,163,184,.25)' }}><div style={{ height: 8, borderRadius: 4, width: `${Math.min(100, m.rate)}%`, background: m.rate <= 5 ? '#10b981' : m.rate <= 10 ? '#f59e0b' : '#ef4444' }} /></div></td></tr>)}</tbody></table></div>
              <p className="im-helper" style={{ margin: 0 }}>روش: نتیجهٔ اولین RT هر سرجوش (در ماه همان RT) به همهٔ جوشکاران نام‌برده در ردیف جوشکاری آن سرجوش نسبت داده می‌شود؛ RT مجدد پس از تعمیر دوباره شمرده نمی‌شود. نمره = ۱۰۰ − ٪ ریپیر.</p>
            </>
          )}
        </Step>
      )}
      {w.cardIssuedAt && <p className="im-helper" style={{ margin: 0 }}>تاریخ صدور: {fmtD(w.cardIssuedAt.slice(0, 10))}</p>}
    </div>
  )
}
