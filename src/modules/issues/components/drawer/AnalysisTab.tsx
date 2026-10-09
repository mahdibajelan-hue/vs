import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { JalaliDateInput } from '../../../../components/common/JalaliDateInput'
import { formatJalali } from '../../../../lib/jalali'
import type { ImIssue } from '../../types'
import { useIssueWorkStore } from '../../store/useIssueWorkStore'
import { useUserDirectory } from '../../lib/useUsers'
import type { ImRca } from '../../lib/issueDataV2'

const FISHBONE = [['man', 'نیروی انسانی'], ['method', 'روش و فرآیند'], ['machine', 'تجهیزات'], ['material', 'مصالح/مواد'], ['measurement', 'اندازه‌گیری/اطلاعات'], ['environment', 'محیط و شرایط']] as const

export function AnalysisTab({ issue, roles }: { issue: ImIssue; roles: string[] }) {
  const w = useIssueWorkStore()
  const users = useUserDirectory()
  const rca = w.rcaByIssue[issue.id] ?? null
  const capas = w.capaByIssue[issue.id] ?? []
  const canEdit = roles.some((r) => ['admin', 'owner', 'follow_up', 'pursuer'].includes(r))
  const canConfirm = roles.some((r) => ['admin', 'follow_up', 'approver'].includes(r))
  const [method, setMethod] = useState<ImRca['method']>('five_whys')
  const [whys, setWhys] = useState<string[]>(['', '', '', '', ''])
  const [fish, setFish] = useState<Record<string, string>>({})
  const [free, setFree] = useState('')
  const [root, setRoot] = useState('')
  const [capaForm, setCapaForm] = useState({ kind: 'corrective' as 'corrective' | 'preventive', description: '', ownerId: '', dueDate: '' })
  const [addingCapa, setAddingCapa] = useState(false)

  useEffect(() => {
    if (!rca) return
    setMethod(rca.method); setRoot(rca.rootCause)
    const d = rca.data as { whys?: string[]; fish?: Record<string, string>; text?: string }
    if (d.whys) setWhys([...d.whys, '', '', '', '', ''].slice(0, 5))
    if (d.fish) setFish(d.fish)
    if (d.text) setFree(d.text)
  }, [rca])

  const save = (confirmed: boolean) => w.saveRca(issue.id, { method, data: { whys, fish, text: free }, rootCause: root, confirmed })

  return (
    <div className="im-grid" style={{ gap: 16 }}>
      <div className="im-card">
        <div className="im-section-title">تحلیل علت ریشه‌ای (RCA)
          {rca?.confirmed ? <span className="im-chip" style={{ color: 'var(--im-mint)' }}>تأییدشده</span> : <span className="im-chip" style={{ color: 'var(--im-amber)' }}>تأییدنشده</span>}
        </div>
        <div className="im-seg" style={{ marginBottom: 12 }}>
          {([['five_whys', '۵ چرا'], ['fishbone', 'استخوان ماهی'], ['free', 'متن آزاد']] as const).map(([k, l]) => <button key={k} className={method === k ? 'on' : ''} onClick={() => setMethod(k)} disabled={!canEdit}>{l}</button>)}
        </div>
        {method === 'five_whys' && whys.map((v, i) => (
          <div className="im-field" key={i}><label>چرا؟ {i + 1}</label><input value={v} disabled={!canEdit} onChange={(e) => setWhys(whys.map((x, j) => (j === i ? e.target.value : x)))} /></div>
        ))}
        {method === 'fishbone' && FISHBONE.map(([k, l]) => (
          <div className="im-field" key={k}><label>{l}</label><textarea style={{ minHeight: 50 }} disabled={!canEdit} value={fish[k] ?? ''} onChange={(e) => setFish({ ...fish, [k]: e.target.value })} /></div>
        ))}
        {method === 'free' && <div className="im-field"><label>تحلیل</label><textarea value={free} disabled={!canEdit} onChange={(e) => setFree(e.target.value)} /></div>}
        <div className="im-field"><label>علت ریشه‌ای (جمع‌بندی)</label><textarea style={{ minHeight: 60 }} value={root} disabled={!canEdit} onChange={(e) => setRoot(e.target.value)} /></div>
        {canEdit && (
          <div className="im-row">
            <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => save(false)} disabled={!root.trim()}>ذخیره پیش‌نویس</button>
            {canConfirm && <button className="im-btn im-btn-primary im-btn-sm" onClick={() => save(true)} disabled={!root.trim()}>تأیید علت ریشه‌ای</button>}
          </div>
        )}
        {!canConfirm && canEdit && <div className="im-helper">تأیید نهایی علت ریشه‌ای با پیگیری‌کننده، مسئول تأیید یا مدیر است.</div>}
      </div>

      <div className="im-card">
        <div className="im-section-title">اقدامات اصلاحی و پیشگیرانه (CAPA)</div>
        {capas.length === 0 && <div className="im-helper" style={{ marginBottom: 8 }}>اقدام اصلاحی، علت را برطرف می‌کند؛ اقدام پیشگیرانه از تکرار در پروژه‌های دیگر جلوگیری می‌کند.</div>}
        <div className="im-grid" style={{ gap: 8 }}>
          {capas.map((c) => (
            <div key={c.id} className="im-task">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{c.description}</div>
                <span className="im-chip" style={{ color: c.kind === 'corrective' ? 'var(--im-amber)' : 'var(--im-violet)' }}>{c.kind === 'corrective' ? 'اصلاحی' : 'پیشگیرانه'}</span>
              </div>
              <div className="im-issue-meta"><span className="im-chip">{users.name(c.ownerId)}</span>{c.dueDate && <span className="im-chip">{formatJalali(c.dueDate)}</span>}<span className="im-chip">{c.status === 'done' ? 'انجام شد' : c.status === 'open' ? 'باز' : c.status}</span>{c.effectiveness && <span className="im-chip" style={{ color: c.effectiveness === 'effective' ? 'var(--im-mint)' : 'var(--im-coral)' }}>{c.effectiveness === 'effective' ? 'اثربخش' : 'غیراثربخش'}</span>}</div>
              {canEdit && c.status !== 'done' && <div><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => w.setCapaStatus(c.id, 'done')}>ثبت انجام</button></div>}
              {canConfirm && c.status === 'done' && !c.effectiveness && (
                <div className="im-row"><button className="im-btn im-btn-primary im-btn-sm" onClick={() => w.setCapaStatus(c.id, 'done', 'effective')}>اثربخش بود</button><button className="im-btn im-btn-danger im-btn-sm" onClick={() => w.setCapaStatus(c.id, 'done', 'ineffective')}>اثربخش نبود</button></div>
              )}
            </div>
          ))}
        </div>
        {canEdit && (addingCapa ? (
          <div style={{ marginTop: 10 }}>
            <div className="im-row">
              <div className="im-field"><label>نوع</label><select value={capaForm.kind} onChange={(e) => setCapaForm({ ...capaForm, kind: e.target.value as 'corrective' | 'preventive' })}><option value="corrective">اصلاحی</option><option value="preventive">پیشگیرانه</option></select></div>
              <div className="im-field"><label>مسئول</label><select value={capaForm.ownerId} onChange={(e) => setCapaForm({ ...capaForm, ownerId: e.target.value })}><option value="">—</option>{users.forProject(issue.projectId).map((u) => <option key={u.userId} value={u.userId}>{u.name}</option>)}</select></div>
            </div>
            <div className="im-field"><label>شرح اقدام</label><textarea style={{ minHeight: 56 }} value={capaForm.description} onChange={(e) => setCapaForm({ ...capaForm, description: e.target.value })} /></div>
            <div className="im-field"><label>سررسید</label><JalaliDateInput value={capaForm.dueDate} onChange={(iso) => setCapaForm({ ...capaForm, dueDate: iso })} /></div>
            <div className="im-row"><button className="im-btn im-btn-primary im-btn-sm" disabled={!capaForm.description.trim()} onClick={async () => { const r = await w.addCapa(issue.id, { kind: capaForm.kind, description: capaForm.description.trim(), ownerId: capaForm.ownerId || null, dueDate: capaForm.dueDate || null }); if (r.ok) { setAddingCapa(false); setCapaForm({ kind: 'corrective', description: '', ownerId: '', dueDate: '' }) } }}>افزودن</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setAddingCapa(false)}>انصراف</button></div>
          </div>
        ) : <button className="im-btn im-btn-ghost im-btn-sm" style={{ marginTop: 10 }} onClick={() => setAddingCapa(true)}><Plus size={13} /> اقدام جدید</button>)}
      </div>
    </div>
  )
}
