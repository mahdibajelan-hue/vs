import { useEffect, useRef, useState } from 'react'
import { Camera, FileAudio, FileText, Mic, Paperclip, Square, StickyNote, Trash2, Upload } from 'lucide-react'
import { useMissionStore } from '../store/useMissionStore'
import { EVIDENCE_KIND_LABEL, type Evidence, type EvidenceKind } from '../types'
import { faNum, timeAgoFa } from '../lib/fa'

const KIND_ICON: Record<EvidenceKind, typeof Paperclip> = { photo: Camera, file: Paperclip, minutes: FileText, letter: FileText, technical: FileText, note: StickyNote, voice: FileAudio }
const MAX_BYTES = 8 * 1024 * 1024

/**
 * Evidence attached to a specific topic (or to the request as a whole): photos, minutes, letters,
 * technical documents, typed notes and voice notes. Each item stores the topic it belongs to, so the
 * report and the manager see "evidence for HSE", not an anonymous folder of files.
 */
export function EvidencePanel({ missionId, kinds, topicKey, findingId = null, compact }: { missionId: string; kinds: EvidenceKind[]; topicKey: string; findingId?: string | null; compact?: boolean }) {
  const bundle = useMissionStore((s) => s.bundle)
  const openMission = useMissionStore((s) => s.openMission)
  const addEvidence = useMissionStore((s) => s.addEvidence)
  const removeEvidence = useMissionStore((s) => s.removeEvidence)
  const repo = useMissionStore((s) => s.repo)
  const [kind, setKind] = useState<EvidenceKind>(kinds[0])
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [recording, setRecording] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const recRef = useRef<{ rec: MediaRecorder; chunks: Blob[]; stream: MediaStream } | null>(null)

  useEffect(() => {
    if (bundle?.mission.id !== missionId) openMission(missionId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId])

  const items = (bundle?.mission.id === missionId ? bundle.evidence : []).filter((e) => (topicKey ? e.topicKey === topicKey : true) && (findingId ? e.findingId === findingId : true))

  async function submit(file: File | Blob | null, kindOverride?: EvidenceKind, fallbackTitle?: string) {
    const k = kindOverride ?? kind
    const t = title.trim() || fallbackTitle || (file instanceof File ? file.name : EVIDENCE_KIND_LABEL[k])
    if (k === 'note' && !note.trim()) return
    if (file && file.size > MAX_BYTES) {
      setErr('حجم فایل بیش از ۸ مگابایت است.')
      return
    }
    setErr('')
    setBusy(true)
    try {
      await addEvidence({ kind: k, title: t, note, topicKey, findingId, objectiveId: null }, file)
      setTitle('')
      setNote('')
      if (fileRef.current) fileRef.current.value = ''
    } finally {
      setBusy(false)
    }
  }

  async function toggleRecord() {
    if (recording && recRef.current) {
      recRef.current.rec.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setRecording(false)
        recRef.current = null
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
        submit(blob, 'voice', 'پیام صوتی')
      }
      recRef.current = { rec, chunks, stream }
      rec.start()
      setRecording(true)
    } catch {
      setErr('دسترسی به میکروفون ممکن نشد.')
    }
  }

  const canRecord = kinds.includes('voice') && typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof MediaRecorder !== 'undefined'
  const fileKinds = kinds.filter((k) => k !== 'note' && k !== 'voice')

  return (
    <div className="flex flex-col gap-3">
      {!compact && <p className="ms-muted text-[11.5px] leading-6">هر مدرک به همین موضوع وصل می‌شود و در گزارش دیده می‌شود.</p>}
      <div className="ms-card-flat flex flex-col gap-2.5 p-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="نوع مدرک">
          {kinds.filter((k) => k !== 'voice').map((k) => {
            const Icon = KIND_ICON[k]
            return (
              <button key={k} className={`ms-chip ${kind === k ? 'is-on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)} style={{ padding: '4px 10px', fontSize: 11.5 }}>
                <Icon size={12} aria-hidden /> {EVIDENCE_KIND_LABEL[k]}
              </button>
            )
          })}
        </div>
        <input className="ms-input" placeholder="عنوان (اختیاری)" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="عنوان مدرک" />
        {kind === 'note' ? (
          <>
            <textarea className="ms-textarea" style={{ minHeight: 64 }} placeholder="توضیح متنی…" value={note} onChange={(e) => setNote(e.target.value)} aria-label="توضیح متنی" />
            <button className="ms-btn ms-btn-sm self-start" disabled={busy || !note.trim()} onClick={() => submit(null)}>ثبت توضیح</button>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" className="sr-only" id={`ev-file-${topicKey || 'req'}`} accept={kind === 'photo' ? 'image/*' : 'image/*,.pdf,.doc,.docx,.xls,.xlsx'} capture={kind === 'photo' ? 'environment' : undefined} onChange={(e) => e.target.files?.[0] && submit(e.target.files[0])} />
            <label htmlFor={`ev-file-${topicKey || 'req'}`} className="ms-btn ms-btn-sm" style={{ cursor: 'pointer' }}>
              <Upload size={13} aria-hidden /> {kind === 'photo' ? 'عکس / دوربین' : 'انتخاب فایل'}
            </label>
            {fileKinds.length === 0 && null}
            {canRecord && (
              <button className={`ms-btn ms-btn-sm ${recording ? 'ms-mic-live' : ''}`} onClick={toggleRecord}>
                {recording ? <><Square size={12} aria-hidden /> پایان ضبط</> : <><Mic size={13} aria-hidden /> ضبط صوت</>}
              </button>
            )}
            {busy && <span className="ms-muted text-[11.5px]">در حال ثبت…</span>}
          </div>
        )}
        {err && <p role="alert" className="text-[11.5px]" style={{ color: 'var(--ms-bad)' }}>{err}</p>}
      </div>

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((e) => (
            <EvidenceRow key={e.id} ev={e} onRemove={() => removeEvidence(e.id)} urlOf={(p) => repo.evidenceUrl(p)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function EvidenceRow({ ev, onRemove, urlOf }: { ev: Evidence; onRemove: () => void; urlOf: (p: string) => Promise<string | null> }) {
  const [url, setUrl] = useState<string | null>(null)
  const Icon = KIND_ICON[ev.kind]
  useEffect(() => {
    let live = true
    if (ev.filePath && (ev.kind === 'photo' || ev.mime.startsWith('image/'))) urlOf(ev.filePath).then((u) => live && setUrl(u))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.filePath])
  return (
    <li className="ms-card-flat flex items-center gap-3 p-2.5">
      {url ? <img src={url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--ms-accent-soft)', color: 'var(--ms-accent)' }}><Icon size={18} aria-hidden /></span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-bold">{ev.title || EVIDENCE_KIND_LABEL[ev.kind]}</span>
        <span className="ms-muted block truncate text-[11px]">
          {EVIDENCE_KIND_LABEL[ev.kind]} · {timeAgoFa(ev.createdAt)}{ev.sizeBytes ? ` · ${faNum(Math.max(1, Math.round(ev.sizeBytes / 1024)))} کیلوبایت` : ''}
        </span>
        {ev.note && <span className="ms-ink2 block truncate text-[11.5px]">{ev.note}</span>}
      </span>
      <button className="ms-btn ms-btn-ghost ms-btn-icon" style={{ minHeight: 32, minWidth: 32 }} aria-label="حذف مدرک" onClick={onRemove}>
        <Trash2 size={14} aria-hidden />
      </button>
    </li>
  )
}
