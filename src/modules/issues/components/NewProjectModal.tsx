import { useState } from 'react'
import { useIssuesStore } from '../store/useIssuesStore'

export function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const createProject = useIssuesStore((s) => s.createProject)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim()) {
      setError('نام پروژه را وارد کن')
      return
    }
    setBusy(true)
    try {
      const id = await createProject(name.trim(), description.trim())
      onClose()
      onCreated(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ایجاد پروژه')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="im-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="im-modal">
        <div className="im-modal-head">
          <div className="im-modal-title">پروژه جدید</div>
          <button className="im-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="im-field">
          <label>نام پروژه</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً پروژه سایت فروشگاهی" autoFocus />
        </div>
        <div className="im-field">
          <label>توضیحات (اختیاری)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="توضیح کوتاه درباره پروژه" />
        </div>
        {error && (
          <p style={{ color: 'var(--im-coral)', fontSize: 12, marginBottom: 12 }}>{error}</p>
        )}
        <button className="im-btn im-btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={submit} disabled={busy}>
          {busy ? 'در حال ذخیره...' : 'ذخیره پروژه'}
        </button>
      </div>
    </div>
  )
}
