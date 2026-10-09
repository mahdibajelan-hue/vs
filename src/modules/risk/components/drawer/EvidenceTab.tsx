import { useEffect, useState } from 'react'
import { ExternalLink, Trash2 } from 'lucide-react'
import { formatJalali } from '../../../../lib/jalali'
import { useRiskStore } from '../../store/useRiskStore'
import { useRiskDirectory } from '../../lib/useRiskData'
import { RM_EVIDENCE_KIND_LABEL_FA, type RmEvidence } from '../../types'
import { Field } from '../rk'
import type { TabProps } from './common'

export function EvidenceTab({ risk, canEdit }: TabProps) {
  const load = useRiskStore((s) => s.loadRiskExtras)
  const list = useRiskStore((s) => s.evidenceByRisk[risk.id])
  const add = useRiskStore((s) => s.addEvidence)
  const remove = useRiskStore((s) => s.removeEvidence)
  const dir = useRiskDirectory()
  const [f, setF] = useState<{ kind: RmEvidence['kind']; title: string; note: string; url: string }>({ kind: 'document', title: '', note: '', url: '' })
  const [err, setErr] = useState('')
  useEffect(() => { if (!list) load(risk.id) }, [list, load, risk.id])
  const submit = async () => {
    if (f.title.trim().length < 3) { setErr('عنوان مدرک/شاهد را بنویسید'); return }
    if (f.url && !/^https?:\/\//i.test(f.url)) { setErr('نشانی باید با http:// یا https:// شروع شود'); return }
    const r = await add(risk.id, { ...f, title: f.title.trim() })
    if (!r.ok) { setErr(r.error ?? ''); return }
    setErr(''); setF({ kind: 'document', title: '', note: '', url: '' })
  }
  return (
    <div>
      {(risk.assumptions || risk.assessmentBasis) && (
        <div className="im-card-flat" style={{ marginBottom: 12 }}>
          {risk.assessmentBasis && <p style={{ margin: '0 0 6px' }}><b>مبنای ارزیابی:</b> {risk.assessmentBasis}</p>}
          {risk.assumptions && <p style={{ margin: 0 }}><b>فرضیات:</b> {risk.assumptions}</p>}
        </div>
      )}
      {canEdit && (
        <div className="im-card-flat" style={{ marginBottom: 14 }}>
          <div className="rk-grid3">
            <Field label="نوع"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as RmEvidence['kind'] })}>{Object.entries(RM_EVIDENCE_KIND_LABEL_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="عنوان *"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Field label="نشانی (اختیاری)"><input dir="ltr" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://" /></Field>
          </div>
          <Field label="توضیح"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          {err && <div className="im-err">{err}</div>}
          <button className="im-btn im-btn-primary im-btn-sm" onClick={submit}>افزودن شاهد</button>
        </div>
      )}
      {!list ? <div className="im-skeleton" style={{ height: 80 }} /> : list.length === 0 ? <div className="im-empty">هنوز مدرک یا شاهدی ثبت نشده است.</div> : (
        <div className="im-grid" style={{ gap: 8 }}>
          {list.map((e) => (
            <div key={e.id} className="im-task" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div><span className="rk-flag">{RM_EVIDENCE_KIND_LABEL_FA[e.kind]}</span> <b>{e.title}</b>{e.note && <div className="im-helper">{e.note}</div>}<div className="im-helper">{dir.name(e.createdBy)} · {formatJalali(e.createdAt.slice(0, 10))}</div></div>
              <div className="im-actions">{e.url && <a className="im-ghostlink" href={e.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> باز کردن</a>}{canEdit && <button className="im-ghostlink" style={{ color: 'var(--im-coral)' }} aria-label="حذف شاهد" onClick={() => remove(e.id, risk.id)}><Trash2 size={12} /></button>}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
