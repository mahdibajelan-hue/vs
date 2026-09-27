import { useEffect, useMemo } from 'react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { getCompDocSignedUrl } from '../lib/compStorage'
import type { ProfileDocuments } from '../lib/profileDocuments'

/** Staff-side ProfileDocuments: the store's attachments for this assessment, written through
 * comp_add_attachment / comp_remove_attachment. Editable for the lead / designer / module admin
 * until the assessment is completed — the same lock the profile form itself follows. */
export function useStaffProfileDocuments(assessmentId: string, assessmentStatus: string | undefined, canManage: boolean): ProfileDocuments {
  const all = useCompetencyStore((s) => s.attachments)
  const fetchAttachments = useCompetencyStore((s) => s.fetchAttachments)
  const addAttachment = useCompetencyStore((s) => s.addAttachment)
  const deleteAttachment = useCompetencyStore((s) => s.deleteAttachment)

  useEffect(() => {
    fetchAttachments(assessmentId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId])

  const items = useMemo(() => all.filter((a) => a.assessmentId === assessmentId), [all, assessmentId])
  const editable = canManage && assessmentStatus != null && assessmentStatus !== 'completed'

  return {
    items,
    editable,
    upload: (category, entryRef, file) => addAttachment(assessmentId, category, entryRef, file),
    remove: (item) => deleteAttachment(item.id),
    canRemove: () => editable,
    signedUrl: (path) => getCompDocSignedUrl(path),
  }
}
