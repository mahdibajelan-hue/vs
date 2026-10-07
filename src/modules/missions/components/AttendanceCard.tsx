import { useRef, useState } from 'react'
import { Camera, CircleCheck, TriangleAlert } from 'lucide-react'
import { useMissionStore } from '../store/useMissionStore'
import { ATTENDANCE_TEXT, MAX_PHOTOS_PER_MISSION, attendanceOf } from '../lib/attendance'
import { preparePhoto } from '../lib/photo'
import { faNum } from '../lib/fa'

/**
 * Proof of attendance: asks for a photo of the meeting or the site. The picture is shrunk in the browser (~150-350 KB),
 * its capture time is read, and the report score drops when there is no photo taken during the mission.
 */
export function AttendanceCard({ missionId }: { missionId: string }) {
  const bundle = useMissionStore((s) => s.bundle)
  const addEvidence = useMissionStore((s) => s.addEvidence)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  if (!bundle || bundle.mission.id !== missionId) return null
  const att = attendanceOf(bundle.evidence, bundle.mission)
  const ok = att.status === 'verified'

  async function pick(file: File) {
    setErr('')
    if (att.photos >= MAX_PHOTOS_PER_MISSION) {
      setErr(`حداکثر ${faNum(MAX_PHOTOS_PER_MISSION)} عکس برای هر مأموریت نگه داشته می‌شود.`)
      return
    }
    setBusy(true)
    try {
      const p = await preparePhoto(file)
      const up = new File([p.blob], 'attendance.jpg', { type: 'image/jpeg' })
      await addEvidence({ kind: 'photo', title: 'عکس حضور در جلسه / بازدید', note: '', topicKey: 'evidence', findingId: null, objectiveId: null, capturedAt: p.capturedAt }, up)
    } catch {
      setErr('این تصویر پردازش نشد؛ یک عکس JPG یا PNG بفرستید.')
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }

  return (
    <div className="ms-card-flat flex flex-col gap-2 p-3.5" style={{ borderColor: ok ? 'color-mix(in srgb, var(--ms-good) 45%, transparent)' : 'color-mix(in srgb, var(--ms-warn) 55%, transparent)' }}>
      <p className="flex items-center gap-2 text-[13px] font-extrabold">
        {ok ? <CircleCheck size={16} style={{ color: 'var(--ms-good)' }} aria-hidden /> : <TriangleAlert size={16} style={{ color: 'var(--ms-warn)' }} aria-hidden />}
        تأیید حضور در مأموریت
      </p>
      <p className="ms-ink2 text-[12px] leading-7">{ATTENDANCE_TEXT[att.status]}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={ref} type="file" accept="image/*" capture="environment" className="sr-only" id="ms-attendance-photo" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
        <label htmlFor="ms-attendance-photo" className={`ms-btn ms-btn-sm ${ok ? '' : 'ms-btn-primary'}`} style={{ cursor: busy ? 'wait' : 'pointer' }}>
          <Camera size={14} aria-hidden /> {busy ? 'در حال آماده‌سازی…' : ok ? 'افزودن عکس دیگر' : 'عکس جلسه / بازدید'}
        </label>
        <span className="ms-muted text-[11px]">{faNum(att.photos)} عکس · حجم هر عکس خودکار کم می‌شود</span>
      </div>
      {err && <p role="alert" className="text-[11.5px]" style={{ color: 'var(--ms-bad)' }}>{err}</p>}
    </div>
  )
}
