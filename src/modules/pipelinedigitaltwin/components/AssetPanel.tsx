import { useMemo, useState, type CSSProperties } from 'react'
import { Boxes, CheckCircle2, ClipboardCheck, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { usePdtStore } from '../store/usePdtStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { formatJalali } from '../../../lib/jalali'
import { formatChainage } from '../lib/chainage'
import { ASSET_KIND_FA, assetPicture, CONDITION_COLOR, CONDITION_FA, CRIT_FA, dueState, EVENT_FA, OPSTATE_FA, type Asset, type AssetCondition, type AssetEvent, type AssetKind, type OpState } from '../lib/twinCore'

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const today = () => new Date().toISOString().slice(0, 10)
const jd = (d: string | null) => (d ? formatJalali(d.slice(0, 10)) : '—')
export const DUE_FA = { overdue: 'بازرسی عقب‌افتاده', soon: 'بازرسی نزدیک', ok: 'به‌موقع', none: 'بدون برنامهٔ بازرسی' } as const
export const DUE_COLOR = { overdue: '#ef4444', soon: '#f59e0b', ok: '#22c55e', none: '#64748b' } as const
const km = (a: Asset) => formatChainage(a.km * 1000)

/** For the physical-asset manager: the register of everything installed on the line, filterable, with condition and inspection due state. */
export function AssetPanel({ onNew }: { onNew: () => void }) {
  const st = usePdtStore()
  const [kind, setKind] = useState<AssetKind | 'all' | 'attention'>('all')
  const pic = assetPicture(st.assets, today())
  const list = useMemo(() => st.assets.filter((a) => kind === 'all' ? true : kind === 'attention' ? (dueState(a, today()) === 'overdue' || a.condition === 'poor' || a.condition === 'failed') : a.kind === kind), [st.assets, kind])
  const kinds = (Object.keys(ASSET_KIND_FA) as AssetKind[]).filter((k) => pic.byKind[k] > 0)
  return (
    <div className="tw-panel glass-panel">
      <div className="tw-ph"><span className="tw-ph-ico"><Boxes size={16} /></span><h3>دارایی‌های فیزیکی</h3><small>{fa(pic.total)} مورد</small></div>
      <button type="button" className="tw-cta" onClick={onNew}><Plus size={16} /> ثبت دارایی جدید</button>
      <div className="tw-dual">
        <div className="tw-num"><small>نیازمند توجه</small><b style={{ color: pic.overdue + pic.poor ? 'var(--bad)' : undefined }}>{fa(pic.overdue + pic.poor)}</b><em>{fa(pic.overdue)} بازرسی عقب‌افتاده · {fa(pic.poor)} وضعیت ضعیف</em></div>
        <div className="tw-num"><small>بحرانیِ ضعیف</small><b style={{ color: pic.criticalPoor ? 'var(--bad)' : 'var(--ok)' }}>{fa(pic.criticalPoor)}</b><em>{fa(pic.soon)} بازرسی تا ۳۰ روز آینده</em></div>
      </div>
      <div className="tw-filters" role="group" aria-label="نوع">
        <button type="button" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>همه</button>
        <button type="button" aria-pressed={kind === 'attention'} onClick={() => setKind('attention')}>نیازمند توجه</button>
        {kinds.map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{ASSET_KIND_FA[k].split(' (')[0]} {fa(pic.byKind[k])}</button>)}
      </div>
      {list.length ? (
        <div className="tw-list">
          {list.map((a) => {
            const due = dueState(a, today())
            return (
              <button key={a.id} type="button" className={`tw-row ${st.selectedAssetId === a.id ? 'is-on' : ''}`} onClick={() => st.selectAsset(a.id)}>
                <span className="tw-dot" style={{ '--c': CONDITION_COLOR[a.condition] } as CSSProperties} title={CONDITION_FA[a.condition]} />
                <span><b><span className="tw-tag" dir="ltr">{a.tag}</span> {a.name}</b><small>{ASSET_KIND_FA[a.kind].split(' (')[0]} · <span dir="ltr">{km(a)}</span>{a.kind === 'valve' ? ` · ${OPSTATE_FA[a.opState]}` : ''}</small></span>
                {due !== 'ok' && due !== 'none' ? <span className="tw-pill" style={{ '--c': DUE_COLOR[due] } as CSSProperties}>{DUE_FA[due]}</span> : <span className="tw-pill" style={{ '--c': CONDITION_COLOR[a.condition] } as CSSProperties}>{CONDITION_FA[a.condition]}</span>}
              </button>
            )
          })}
        </div>
      ) : <div className="tw-empty"><Boxes size={22} />{st.assets.length ? 'دارایی‌ای با این فیلتر نیست.' : 'هنوز دارایی‌ای ثبت نشده است. شیرها، ایستگاه‌ها، تقاطع‌ها، تله‌های پیگ و پست‌های حفاظت کاتدی را ثبت کنید تا روی مسیر دیده شوند.'}</div>}
    </div>
  )
}

/** Left drawer: one asset — its record, its history, and the form to log an inspection / repair / valve operation / failure. */
export function AssetDrawer({ asset, onEdit, onClose }: { asset: Asset; onEdit: () => void; onClose: () => void }) {
  const st = usePdtStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const events = st.events.filter((e) => e.assetId === asset.id)
  const due = dueState(asset, today())
  const [f, setF] = useState<{ kind: AssetEvent['kind']; at: string; result: string; condition: AssetCondition | ''; opState: OpState | ''; note: string }>({ kind: asset.kind === 'valve' ? 'operation' : 'inspection', at: today(), result: '', condition: '', opState: '', note: '' })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const ok = await st.addAssetEvent({ assetId: asset.id, kind: f.kind, at: f.at, result: f.result, condition: f.condition || null, opState: f.opState || null, note: f.note, by: email })
    setBusy(false)
    if (ok) setF({ ...f, result: '', condition: '', opState: '', note: '' })
  }
  return (
    <aside className="tw-drawer glass-panel" aria-label={`دارایی ${asset.tag}`}>
      <header>
        <span className="tw-dot" style={{ '--c': CONDITION_COLOR[asset.condition] } as CSSProperties} />
        <div><h3><span className="tw-tag" dir="ltr">{asset.tag}</span> {asset.name}</h3><p>{ASSET_KIND_FA[asset.kind]} · <span dir="ltr">{km(asset)}</span></p></div>
        <button type="button" className="tw-x" onClick={onClose} aria-label="بستن"><X size={16} /></button>
      </header>
      <div className="tw-body tw-form">
        <div className="tw-grid2">
          <Kv k="وضعیت فنی" v={<span className="tw-pill" style={{ '--c': CONDITION_COLOR[asset.condition] } as CSSProperties}>{CONDITION_FA[asset.condition]}</span>} />
          <Kv k="اهمیت" v={CRIT_FA[asset.criticality]} />
          {asset.kind === 'valve' && <Kv k="وضعیت شیر" v={<b>{OPSTATE_FA[asset.opState]}</b>} />}
          <Kv k="بازرسی بعدی" v={<span className="tw-pill" style={{ '--c': DUE_COLOR[due] } as CSSProperties}>{jd(asset.nextInspection)}</span>} />
          {asset.size && <Kv k="سایز / کلاس" v={asset.size} />}
          {asset.make && <Kv k="سازنده" v={asset.make} />}
          <Kv k="تاریخ نصب" v={jd(asset.installDate)} />
          {asset.inspectEveryDays && <Kv k="دورهٔ بازرسی" v={`هر ${fa(asset.inspectEveryDays)} روز`} />}
        </div>
        {asset.note && <p className="tw-hint">{asset.note}</p>}
        <button type="button" className="tw-btn" onClick={onEdit}><Pencil size={13} /> ویرایش شناسنامه</button>

        <section className="tw-sec">
          <h4><ClipboardCheck size={13} /> ثبت رویداد</h4>
          <div className="tw-seg" role="group" aria-label="نوع رویداد">
            {(Object.keys(EVENT_FA) as AssetEvent['kind'][]).filter((k) => k !== 'operation' || asset.kind === 'valve').map((k) => <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => setF({ ...f, kind: k })}>{EVENT_FA[k]}</button>)}
          </div>
          <div className="tw-grid2">
            <label className="tw-field"><small>تاریخ</small><input type="date" value={f.at} max={today()} onChange={(e) => setF({ ...f, at: e.target.value })} /></label>
            {f.kind === 'operation'
              ? <label className="tw-field"><small>وضعیت شیر پس از عملیات</small><select value={f.opState} onChange={(e) => setF({ ...f, opState: e.target.value as OpState })}><option value="">—</option>{(['open', 'closed', 'throttled'] as OpState[]).map((s) => <option key={s} value={s}>{OPSTATE_FA[s]}</option>)}</select></label>
              : <label className="tw-field"><small>وضعیت فنی پس از رویداد</small><select value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value as AssetCondition })}><option value="">بدون تغییر</option>{(Object.keys(CONDITION_FA) as AssetCondition[]).map((c) => <option key={c} value={c}>{CONDITION_FA[c]}</option>)}</select></label>}
          </div>
          <label className="tw-field"><small>{f.kind === 'inspection' ? 'نتیجهٔ بازرسی' : 'شرح'}</small><input value={f.result} onChange={(e) => setF({ ...f, result: e.target.value })} placeholder={f.kind === 'inspection' ? 'مثلاً: نشتی ندارد، گریس‌کاری شد' : ''} /></label>
          {(f.kind === 'inspection' || f.kind === 'maintenance') && asset.inspectEveryDays && <small className="tw-hint">بازرسی بعدی خودکار {fa(asset.inspectEveryDays)} روز پس از این تاریخ تنظیم می‌شود.</small>}
          <button type="button" className="tw-cta" disabled={busy || (f.kind === 'operation' && !f.opState) || (!f.result.trim() && f.kind !== 'operation')} onClick={save}>{busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} ثبت {EVENT_FA[f.kind]}</button>
        </section>

        <section className="tw-sec">
          <h4>سوابق ({fa(events.length)})</h4>
          {events.length ? (
            <ul className="tw-list">
              {events.map((e) => (
                <li key={e.id} className="tw-row" style={{ cursor: 'default' }}>
                  <span className="tw-dot" style={{ '--c': e.kind === 'failure' ? '#ef4444' : e.kind === 'operation' ? '#38bdf8' : '#22c55e' } as CSSProperties} />
                  <span><b>{EVENT_FA[e.kind]}{e.opState ? ` → ${OPSTATE_FA[e.opState]}` : ''}{e.condition ? ` · ${CONDITION_FA[e.condition]}` : ''}</b><small>{e.result || e.note || '—'} · {e.by}</small></span>
                  <small>{jd(e.at)}</small>
                </li>
              ))}
            </ul>
          ) : <p className="tw-hint">هنوز رویدادی ثبت نشده است.</p>}
        </section>
      </div>
    </aside>
  )
}

/** Left drawer: create / edit an asset's record. */
export function AssetForm({ asset, onClose }: { asset: Asset | null; onClose: (saved: Asset | null) => void }) {
  const st = usePdtStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const isAdmin = useAuthStore((s) => !!s.profile?.isAdmin)
  const routeEnd = st.startKm + st.route.lengthMeters / 1000
  const [f, setF] = useState({ tag: asset?.tag ?? '', kind: asset?.kind ?? 'valve' as AssetKind, name: asset?.name ?? '', km: asset?.km?.toString() ?? '', size: asset?.size ?? '', make: asset?.make ?? '', installDate: asset?.installDate ?? '', condition: asset?.condition ?? 'good' as AssetCondition, opState: asset?.opState ?? 'open' as OpState, criticality: asset?.criticality ?? 'medium' as Asset['criticality'], every: asset?.inspectEveryDays?.toString() ?? '180', next: asset?.nextInspection ?? '', note: asset?.note ?? '' })
  const [busy, setBusy] = useState(false)
  const kmNum = Number(f.km)
  const kmBad = f.km !== '' && (!Number.isFinite(kmNum) || kmNum < st.startKm || kmNum > routeEnd)
  const dupTag = st.assets.some((a) => a.tag.trim().toLowerCase() === f.tag.trim().toLowerCase() && a.id !== asset?.id)
  const ok = f.tag.trim() && f.km !== '' && !kmBad && !dupTag
  const save = async () => {
    setBusy(true)
    const saved = await st.saveAsset({ id: asset?.id, tag: f.tag, kind: f.kind, name: f.name, km: kmNum, size: f.size, make: f.make, installDate: f.installDate || null, condition: f.condition, opState: f.kind === 'valve' ? f.opState : 'na', criticality: f.criticality, inspectEveryDays: f.every ? Number(f.every) : null, nextInspection: f.next || null, note: f.note }, email)
    setBusy(false)
    if (saved) onClose(saved)
  }
  return (
    <aside className="tw-drawer glass-panel" aria-label="شناسنامهٔ دارایی">
      <header>
        <span className="tw-ph-ico"><Boxes size={16} /></span>
        <div><h3>{asset ? 'ویرایش شناسنامهٔ دارایی' : 'دارایی جدید'}</h3><p>هر چیزی که روی خط نصب شده و باید نگهداری شود</p></div>
        <button type="button" className="tw-x" onClick={() => onClose(null)} aria-label="بستن"><X size={16} /></button>
      </header>
      <div className="tw-body tw-form">
        <div className="tw-field"><span>نوع</span>
          <div className="tw-seg" role="group" aria-label="نوع">{(Object.keys(ASSET_KIND_FA) as AssetKind[]).map((k) => <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => setF({ ...f, kind: k })}>{ASSET_KIND_FA[k].split(' (')[0]}</button>)}</div>
        </div>
        <div className="tw-grid2">
          <label className="tw-field"><span>برچسب (Tag) *</span><input value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} placeholder="مثلاً MLV-03" dir="ltr" aria-invalid={dupTag} />{dupTag && <small className="tw-err">این برچسب قبلاً ثبت شده است.</small>}</label>
          <label className="tw-field"><span>کیلومتر *</span><input type="number" inputMode="decimal" step={0.001} value={f.km} onChange={(e) => setF({ ...f, km: e.target.value })} dir="ltr" aria-invalid={kmBad} />{kmBad ? <small className="tw-err">بین {fa(st.startKm, 1)} و {fa(routeEnd, 1)}</small> : <small>{f.km !== '' ? <span dir="ltr">{formatChainage(kmNum * 1000)}</span> : 'محل روی مسیر'}</small>}</label>
        </div>
        <label className="tw-field"><span>نام / شرح</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="مثلاً شیر خط‌شکن ورودی ایستگاه" /></label>
        <div className="tw-grid2">
          <label className="tw-field"><span>سایز / کلاس</span><input value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })} placeholder='48" #600' dir="ltr" /></label>
          <label className="tw-field"><span>سازنده</span><input value={f.make} onChange={(e) => setF({ ...f, make: e.target.value })} /></label>
          <label className="tw-field"><span>تاریخ نصب</span><input type="date" value={f.installDate} onChange={(e) => setF({ ...f, installDate: e.target.value })} /></label>
          <label className="tw-field"><span>اهمیت</span><select value={f.criticality} onChange={(e) => setF({ ...f, criticality: e.target.value as Asset['criticality'] })}>{(['high', 'medium', 'low'] as const).map((c) => <option key={c} value={c}>{CRIT_FA[c]}</option>)}</select></label>
          <label className="tw-field"><span>وضعیت فنی</span><select value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value as AssetCondition })}>{(Object.keys(CONDITION_FA) as AssetCondition[]).map((c) => <option key={c} value={c}>{CONDITION_FA[c]}</option>)}</select></label>
          {f.kind === 'valve' && <label className="tw-field"><span>وضعیت شیر</span><select value={f.opState} onChange={(e) => setF({ ...f, opState: e.target.value as OpState })}>{(['open', 'closed', 'throttled'] as OpState[]).map((s) => <option key={s} value={s}>{OPSTATE_FA[s]}</option>)}</select></label>}
          <label className="tw-field"><span>دورهٔ بازرسی (روز)</span><input type="number" min={1} value={f.every} onChange={(e) => setF({ ...f, every: e.target.value })} /></label>
          <label className="tw-field"><span>بازرسی بعدی</span><input type="date" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></label>
        </div>
        <label className="tw-field"><span>یادداشت</span><textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      </div>
      <footer>
        <button type="button" className="tw-cta" disabled={!ok || busy} onClick={save}>{busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} {asset ? 'ذخیرهٔ تغییرات' : 'ثبت دارایی'}</button>
        {asset && isAdmin && <button type="button" className="tw-btn is-bad" onClick={async () => { if (window.confirm(`دارایی ${asset.tag} و همهٔ سوابقش حذف شود؟`) && await st.deleteAsset(asset.id)) onClose(null) }}><Trash2 size={14} /> حذف</button>}
      </footer>
    </aside>
  )
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="tw-field"><small>{k}</small><span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{v}</span></div>
}
