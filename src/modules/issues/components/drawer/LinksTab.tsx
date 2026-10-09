import { useRef, useState } from 'react'
import { FileText, Link2, Paperclip, Trash2, Upload } from 'lucide-react'
import { formatJalali } from '../../../../lib/jalali'
import type { ImIssue } from '../../types'
import { useIssueWorkStore } from '../../store/useIssueWorkStore'
import type { ImAttachment, ImLink } from '../../lib/issueDataV2'
import { ProposeChangeButton } from '../../../changeManagement/components/ProposeChangeButton'

const TYPES: [string, string][] = [['change', 'درخواست تغییر'], ['mission', 'بازدید/مأموریت'], ['risk', 'ریسک'], ['lifecycle', 'چرخه عمر'], ['land', 'تملک اراضی'], ['document', 'مدرک/نامه'], ['decision', 'تصمیم'], ['issue', 'مسئلهٔ دیگر'], ['other', 'سایر']]
const REL: [string, string][] = [['related', 'مرتبط'], ['derived_from', 'منشأ'], ['blocks', 'مانع'], ['duplicate_of', 'تکراری'], ['caused_by', 'ناشی از']]

export function LinksTab({ issue, links, attachments, roles }: { issue: ImIssue; links: ImLink[]; attachments: ImAttachment[]; roles: string[] }) {
  const w = useIssueWorkStore()
  const canEdit = roles.some((r) => ['admin', 'owner', 'follow_up', 'pursuer'].includes(r))
  const [f, setF] = useState({ targetType: 'document', targetLabel: '', targetId: '', relation: 'related' })
  const [kind, setKind] = useState<'resolution_evidence' | 'attachment'>('attachment')
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  const upload = async (fl: FileList | null) => {
    if (!fl?.length) return
    setBusy(true)
    for (const x of Array.from(fl)) await w.uploadEvidence(issue.id, x, kind)
    setBusy(false)
    if (file.current) file.current.value = ''
  }
  const open = async (a: ImAttachment) => { const u = await w.evidenceUrl(a); if (u) window.open(u, '_blank', 'noopener') }

  return (
    <div className="im-grid" style={{ gap: 16 }}>
      <div className="im-card">
        <div className="im-section-title">پیوست‌ها و شواهد رفع</div>
        <div className="im-helper" style={{ marginBottom: 8 }}>برای دسته‌هایی که «شاهد رفع» الزامی دارند، بدون بارگذاری شاهد امکان بستن مسئله نیست.</div>
        <div className="im-grid" style={{ gap: 8 }}>
          {attachments.length === 0 && <div className="im-helper">پیوستی ثبت نشده است.</div>}
          {attachments.map((a) => (
            <button key={a.id} className="im-check" style={{ textAlign: 'right', cursor: 'pointer', justifyContent: 'space-between' }} onClick={() => open(a)}>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><FileText size={14} /> {a.fileName}</span>
              <span className="im-helper">{a.kind === 'resolution_evidence' ? 'شاهد رفع' : 'پیوست'} · {formatJalali(a.uploadedAt.slice(0, 10))} · {Math.max(1, Math.round(a.sizeBytes / 1024))} KB</span>
            </button>
          ))}
        </div>
        {canEdit && (
          <div className="im-row" style={{ marginTop: 10, alignItems: 'center' }}>
            <select value={kind} onChange={(e) => setKind(e.target.value as 'resolution_evidence' | 'attachment')}><option value="attachment">پیوست عمومی</option><option value="resolution_evidence">شاهد رفع</option></select>
            <input ref={file} type="file" multiple onChange={(e) => upload(e.target.files)} style={{ display: 'none' }} id="im-file" />
            <label htmlFor="im-file" className="im-btn im-btn-ghost im-btn-sm" style={{ margin: 0, justifyContent: 'center' }}><Upload size={13} /> {busy ? 'در حال بارگذاری…' : 'انتخاب فایل'}</label>
          </div>
        )}
      </div>

      <div className="im-card">
        <div className="im-section-title">پیوندها <Link2 size={14} /> {canEdit && <ProposeChangeButton type="issue" id={issue.id} />}</div>
        <div className="im-grid" style={{ gap: 8 }}>
          {links.length === 0 && <div className="im-helper">پیوندی ثبت نشده است.</div>}
          {links.map((l) => (
            <div key={l.id} className="im-check" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span><Paperclip size={12} style={{ display: 'inline', marginLeft: 6 }} />{l.targetLabel || l.targetId} <span className="im-helper">({TYPES.find((t) => t[0] === l.targetType)?.[1] ?? l.targetType} · {REL.find((r) => r[0] === l.relation)?.[1] ?? l.relation})</span></span>
              {canEdit && <button aria-label="حذف پیوند" onClick={() => w.removeLink(issue.id, l.id)}><Trash2 size={13} /></button>}
            </div>
          ))}
        </div>
        {canEdit && (
          <div style={{ marginTop: 10 }}>
            <div className="im-row">
              <div className="im-field"><label>نوع</label><select value={f.targetType} onChange={(e) => setF({ ...f, targetType: e.target.value })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
              <div className="im-field"><label>رابطه</label><select value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })}>{REL.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            </div>
            <div className="im-row">
              <div className="im-field"><label>عنوان / شماره</label><input value={f.targetLabel} onChange={(e) => setF({ ...f, targetLabel: e.target.value })} /></div>
              <div className="im-field"><label>شناسه (اختیاری)</label><input value={f.targetId} onChange={(e) => setF({ ...f, targetId: e.target.value })} /></div>
            </div>
            <button className="im-btn im-btn-ghost im-btn-sm" disabled={!f.targetLabel.trim()} onClick={async () => { const r = await w.addLink(issue.id, { ...f, targetLabel: f.targetLabel.trim(), targetId: f.targetId.trim() || f.targetLabel.trim() }); if (r.ok) setF({ ...f, targetLabel: '', targetId: '' }) }}>افزودن پیوند</button>
          </div>
        )}
      </div>
    </div>
  )
}
