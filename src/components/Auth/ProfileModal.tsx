import { Modal } from '../common/Modal'
import { ProfileForm } from './ProfileForm'

export function ProfileModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="پروفایل من" subtitle="مشخصات و رمز عبور حساب کاربری" onClose={onClose} width="max-w-sm">
      <ProfileForm mode="edit" onSaved={onClose} />
    </Modal>
  )
}
