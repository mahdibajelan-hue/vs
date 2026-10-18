import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Flag, GitCompare, Lock, Star, Trash2 } from 'lucide-react'
import { jalaliText } from '../../execution/lib/periods'
import { Chip, KpiCard, Section } from '../../finance/components/fn'
import { Empty, fa } from '../../execution/components/common'
import { pickCalendar } from '../lib/schedule'
import { compareVersions, type VersionDiff } from '../lib/compare'
import { KIND_LABEL_FA, SOURCE_LABEL_FA, type SchVersion } from '../lib/types'
import { useSchedulingStore } from '../store/useSchedulingStore'
import type { ScheduleModel } from '../store/useScheduleModel'
import { Hint } from '../components/Hint'
import type { SchTab } from '../SchedulingApp'

const ACTION_FA: Record<string, string> = { import: 'ورود نسخه', approve: 'تأیید نسخه', set_baseline: 'تعیین خط مبنا', set_current: 'تعیین برنامهٔ جاری' }

/** versions, the approved baseline, the current schedule and the comparison of any two versions */
export function SchVersions({ m, go }: { projectId: string; m: ScheduleModel; go: (t: SchTab) => void }) {
  const st = useSchedulingStore()
  const versions = [...st.versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const [busy, setBusy] = useState('')
  const [a, setA] = useState(''), [b, setB] = useState('')
  const [diff, setDiff] = useState<VersionDiff | null>(null)
  const [cmpBusy, setCmpBusy] = useState(false)
  useEffect(() => { if (!a && !b && versions.length >= 2) { setA(m.baselineV?.id ?? versions[versions.length - 1].id); setB(m.currentV?.id ?? versions[0].id) } }, [versions.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (id: string, fn: () => Promise<boolean>) => { setBusy(id); await fn(); setBusy('') }
  const nameOf = (id: string) => st.versions.find((v) => v.id === id)?.label ?? '—'

  const runCompare = async () => {
    if (!a || !b || a === b) return
    setCmpBusy(true)
    const [x, y] = await Promise.all([st.loadBundle(a), st.loadBundle(b)])
    setCmpBusy(false)
    if (x && y) setDiff(compareVersions({ activities: x.activities, relations: x.relations, calendar: pickCalendar(x.calendars) }, { activities: y.activities, relations: y.relations, calendar: pickCalendar(y.calendars) }))
  }
  const dateShift = useMemo(() => (diff ? diff.changed.filter((c) => c.changes.some((x) => x.field === 'پایان' && x.shift)).sort((p, q) => Math.abs(q.changes.find((x) => x.field === 'پایان')!.shift!) - Math.abs(p.changes.find((x) => x.field === 'پایان')!.shift!)) : []), [diff])

  if (!versions.length) return <Empty>هنوز نسخه‌ای ثبت نشده است. از «ورود برنامه» شروع کنید.<div style={{ marginTop: 8 }}><button className="im-btn im-btn-primary im-btn-sm" onClick={() => go('import')}>ورود برنامه</button></div></Empty>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Section title={<span>نسخه‌های برنامه <Hint id="baseline" /></span>} hint="خط مبنا و نسخه‌های تأییدشده تغییر نمی‌کنند. ورود فایل جدید هرگز خط مبنا را عوض نمی‌کند." flush>
        <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>برچسب</th><th>نوع / منبع</th><th>تاریخ وضعیت</th><th className="num">فعالیت</th><th>وضعیت</th><th>اقدام</th></tr></thead><tbody>
          {versions.map((v: SchVersion) => (
            <tr key={v.id}>
              <td><b>{v.label}</b>{v.isBaseline && <Chip tone="good"><Star size={11} style={{ verticalAlign: -1 }} /> خط مبنا</Chip>}{v.isCurrent && <Chip tone="neutral"><Flag size={11} style={{ verticalAlign: -1 }} /> جاری</Chip>}<div className="sub">{v.fileName}</div></td>
              <td>{KIND_LABEL_FA[v.kind]} · {SOURCE_LABEL_FA[v.source]}</td>
              <td>{v.dataDate ? jalaliText(v.dataDate) : '—'}</td>
              <td className="num">{fa(Number((v.summary as { activities?: number }).activities ?? 0))}{(v.warnings?.length ?? 0) > 0 && <div className="sub">{fa(v.warnings.length)} هشدار</div>}</td>
              <td>{v.status === 'draft' ? <Chip tone="warn">پیش‌نویس</Chip> : <Chip tone="good"><Lock size={11} style={{ verticalAlign: -1 }} /> تأییدشده</Chip>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {v.status === 'draft' && st.canApprove && <button className="im-btn im-btn-sm im-btn-primary" disabled={busy === v.id} title="قفل‌کردن نسخه؛ برگشت‌پذیر نیست" onClick={() => { if (window.confirm(`نسخهٔ «${v.label}» تأیید و قفل شود؟ پس از آن قابل ویرایش نیست.`)) void act(v.id, () => st.approve(v.id)) }}><CheckCircle2 size={12} /> تأیید</button>}{' '}
                {v.status === 'approved' && !v.isBaseline && st.canApprove && <button className="im-btn im-btn-sm" disabled={busy === v.id} onClick={() => { if (window.confirm(`«${v.label}» خط مبنای پروژه شود؟ خط مبنای فعلی کنار گذاشته می‌شود (برای مقایسه می‌ماند).`)) void act(v.id, () => st.setBaseline(v.id)) }}><Star size={12} /> خط مبنا</button>}{' '}
                {!v.isCurrent && st.canEdit && <button className="im-btn im-btn-sm" disabled={busy === v.id} onClick={() => void act(v.id, () => st.setCurrent(v.id))}><Flag size={12} /> برنامهٔ جاری</button>}{' '}
                {v.status === 'draft' && st.canEdit && <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف پیش‌نویس" disabled={busy === v.id} onClick={() => { if (window.confirm(`پیش‌نویس «${v.label}» حذف شود؟`)) void act(v.id, () => st.deleteDraft(v.id)) }}><Trash2 size={12} /></button>}
              </td>
            </tr>
          ))}
        </tbody></table></div>
        <p className="im-helper" style={{ padding: '6px 12px', margin: 0 }}>برنامهٔ جاری <Hint id="current-schedule" />: همان که گانت و تحلیل بر آن می‌نشیند. تأیید <Hint id="approve" />: قفل نسخه.</p>
      </Section>

      <Section title={<span>مقایسهٔ دو نسخه <Hint id="compare" /></span>}>
        {versions.length < 2 ? <p className="im-helper" style={{ margin: 0 }}>برای مقایسه حداقل دو نسخه لازم است.</p> : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="ex-lab">نسخهٔ قدیمی‌تر<select value={a} onChange={(e) => setA(e.target.value)}>{versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
            <label className="ex-lab">نسخهٔ جدیدتر<select value={b} onChange={(e) => setB(e.target.value)}>{versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
            <button className="im-btn im-btn-primary" disabled={cmpBusy || !a || !b || a === b} onClick={() => void runCompare()}><GitCompare size={14} /> {cmpBusy ? 'در حال مقایسه…' : 'مقایسه'}</button>
          </div>
        )}
      </Section>

      {diff && (
        <>
          <div className="fn-kpis">
            <KpiCard i={0} label="فعالیت جدید" value={fa(diff.counts.added)} tone={diff.counts.added ? 'warn' : 'good'} />
            <KpiCard i={1} label="فعالیت حذف‌شده" value={fa(diff.counts.removed)} tone={diff.counts.removed ? 'warn' : 'good'} />
            <KpiCard i={2} label="تغییر تاریخ" value={fa(diff.counts.datesMoved)} sub={`${fa(diff.counts.durationsChanged)} تغییر مدت`} tone={diff.counts.datesMoved ? 'warn' : 'good'} />
            <KpiCard i={3} label="تغییر روابط" value={fa(diff.counts.relationsAdded + diff.counts.relationsRemoved + diff.counts.relationsChanged)} sub={`+${fa(diff.counts.relationsAdded)} / −${fa(diff.counts.relationsRemoved)} / ~${fa(diff.counts.relationsChanged)}`} />
          </div>
          {diff.calendarChanges.length > 0 && <div className="im-card" style={{ padding: 10 }}><b>تقویم:</b> {diff.calendarChanges.join('؛ ')}</div>}
          {dateShift.length > 0 && (
            <Section title={`جابه‌جایی تاریخ پایان — «${nameOf(a)}» ← «${nameOf(b)}»`} flush>
              <div className="fn-tbl-wrap" style={{ maxHeight: 320 }}><table className="ex-lines"><thead><tr><th>فعالیت</th><th>از</th><th>به</th><th className="num">جابه‌جایی (روز تقویمی)</th></tr></thead><tbody>
                {dateShift.slice(0, 80).map((c) => { const ch = c.changes.find((x) => x.field === 'پایان')!; return <tr key={c.uid}><td><b className="fn-code">{c.code}</b> {c.name}</td><td>{ch.from === '—' ? '—' : jalaliText(ch.from)}</td><td>{ch.to === '—' ? '—' : jalaliText(ch.to)}</td><td className="num" style={{ color: (ch.shift ?? 0) > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>{(ch.shift ?? 0) > 0 ? '+' : ''}{fa(ch.shift ?? 0)}</td></tr> })}
              </tbody></table></div>
            </Section>
          )}
          {diff.changed.length > 0 && (
            <Section title="همهٔ تغییرات فعالیت‌ها" flush>
              <div className="fn-tbl-wrap" style={{ maxHeight: 320 }}><table className="ex-lines"><thead><tr><th>فعالیت</th><th>تغییرات</th></tr></thead><tbody>
                {diff.changed.slice(0, 150).map((c) => <tr key={c.uid}><td><b className="fn-code">{c.code}</b> {c.name}</td><td style={{ whiteSpace: 'normal' }}>{c.changes.map((x) => `${x.field}: ${x.from} ← ${x.to}`).join('  ·  ')}</td></tr>)}
              </tbody></table></div>
            </Section>
          )}
          {(diff.added.length > 0 || diff.removed.length > 0) && (
            <Section title="فعالیت‌های جدید و حذف‌شده" flush>
              <div className="fn-tbl-wrap" style={{ maxHeight: 260 }}><table className="ex-lines"><tbody>
                {diff.added.slice(0, 80).map((x) => <tr key={`a${x.id}`}><td><Chip tone="good">جدید</Chip></td><td><b className="fn-code">{x.code}</b> {x.name}</td></tr>)}
                {diff.removed.slice(0, 80).map((x) => <tr key={`r${x.id}`}><td><Chip tone="bad">حذف‌شده</Chip></td><td><b className="fn-code">{x.code}</b> {x.name}</td></tr>)}
              </tbody></table></div>
            </Section>
          )}
          {diff.counts.relationsAdded + diff.counts.relationsRemoved + diff.counts.relationsChanged > 0 && (
            <Section title="تغییر روابط" flush>
              <div className="fn-tbl-wrap" style={{ maxHeight: 260 }}><table className="ex-lines"><tbody>
                {diff.relationsAdded.slice(0, 60).map((r) => <tr key={`ra${r.key}`}><td><Chip tone="good">افزوده</Chip></td><td dir="ltr">{r.pred} → {r.succ} ({r.type}{r.lag ? `${r.lag > 0 ? '+' : ''}${r.lag}` : ''})</td></tr>)}
                {diff.relationsRemoved.slice(0, 60).map((r) => <tr key={`rr${r.key}`}><td><Chip tone="bad">حذف</Chip></td><td dir="ltr">{r.pred} → {r.succ} ({r.type})</td></tr>)}
                {diff.relationsChanged.slice(0, 60).map((r) => <tr key={`rc${r.key}`}><td><Chip tone="warn">Lag</Chip></td><td dir="ltr">{r.pred} → {r.succ} ({r.type}): {r.from?.lag} → {r.lag}</td></tr>)}
              </tbody></table></div>
            </Section>
          )}
          {diff.counts.added + diff.counts.removed + diff.counts.changed + diff.counts.relationsAdded + diff.counts.relationsRemoved + diff.counts.relationsChanged === 0 && <p className="im-helper">دو نسخه از نظر فعالیت‌ها، تاریخ‌ها، مدت‌ها و روابط یکسان‌اند.</p>}
        </>
      )}

      {st.history.length > 0 && (
        <Section title="تاریخچهٔ تغییرات" flush>
          <div className="fn-tbl-wrap" style={{ maxHeight: 240 }}><table className="ex-lines"><tbody>
            {st.history.slice(0, 30).map((h) => <tr key={h.id}><td>{ACTION_FA[h.action] ?? h.action}</td><td>{String((h.detail as { label?: string }).label ?? nameOf(h.versionId ?? ''))}</td><td className="sub">{new Date(h.at).toLocaleString('fa-IR')}</td></tr>)}
          </tbody></table></div>
        </Section>
      )}
    </div>
  )
}
