import { useState } from 'react'
import { Modal } from '../common/Modal'
import { useStore } from '../../store/useStore'
import { RolePicker } from '../Auth/AuthGate'
import { useAuthStore } from '../../store/useAuthStore'
import { assignableRoles } from '../../lib/permissions'
import type { UserRole } from '../../types'

export function NewProjectModal({
  onClose,
  onCreated,
  project,
}: {
  onClose: () => void
  onCreated?: (id: string) => void
  /** When provided, the modal edits this project's metadata instead of creating a new one. */
  project?: { id: string; name: string; client: string; location: string; unit: string }
}) {
  const createProject = useStore((s) => s.createProject)
  const updateProjectMeta = useStore((s) => s.updateProjectMeta)
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const myAssignableRoles = assignableRoles(isAdmin)
  const [name, setName] = useState(project?.name ?? '')
  const [client, setClient] = useState(project?.client ?? '')
  const [location, setLocation] = useState(project?.location ?? '')
  const [unit, setUnit] = useState(project?.unit ?? '')
  const [role, setRole] = useState<UserRole>('contractor')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      if (project) {
        await updateProjectMeta(project.id, { name: name.trim(), client, location, unit })
      } else {
        const id = await createProject({ name: name.trim(), client, location, unit, role })
        onCreated?.(id)
      }
      onClose()
    } catch {
      // error already surfaced via the storage-error banner
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={project ? 'ویرایش پروژه' : 'پروژه جدید'} subtitle="اطلاعات کلی پروژه را وارد کنید" onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">نام پروژه *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="مثلاً ایستگاه تقویت فشار گاز شماره ۳" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">کارفرما</span>
          <input value={client} onChange={(e) => setClient(e.target.value)} className="input" placeholder="شرکت ملی گاز ایران" />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">موقعیت</span>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="input" placeholder="پارس جنوبی" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">واحد / فاز</span>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} className="input" placeholder="واحد ۱۰۰" />
          </label>
        </div>
        {!project && (
          <div>
            <p className="mb-1.5 text-xs text-secondary">نقش شما در این پروژه</p>
            <RolePicker value={role} onChange={setRole} roles={myAssignableRoles} />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || busy}
            className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-400 disabled:opacity-40 transition-colors"
          >
            {busy ? 'در حال ذخیره...' : project ? 'ذخیره تغییرات' : 'ایجاد پروژه'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
