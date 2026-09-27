import type { AttachmentKind, DocCategory } from '../types'

/** One uploaded document, as both the staff store and the self-service RPC describe it. */
export interface ProfileDocItem {
  id: string
  kind: AttachmentKind
  category: DocCategory
  entryRef: string | null
  fileName: string
  storagePath: string
  fileSize: number | null
  uploadedByCandidate: boolean
}

/**
 * Everything the profile form needs to show and change per-item documents — implemented once for
 * staff (store + comp_add_attachment / comp_remove_attachment) and once for the candidate
 * (comp_self_service_* RPCs with the link's token), so both sides share the same UI and rules.
 */
export interface ProfileDocuments {
  items: ProfileDocItem[]
  /** False once the form is locked (self-service closed / assessment completed / no write standing). */
  editable: boolean
  /** Resolves to a Persian error message, or null on success. */
  upload: (category: DocCategory, entryRef: string | null, file: File) => Promise<string | null>
  remove: (item: ProfileDocItem) => Promise<string | null>
  /** Whether this viewer may remove this particular item (a candidate cannot remove staff uploads). */
  canRemove: (item: ProfileDocItem) => boolean
  signedUrl: (path: string) => Promise<string | null>
}

export function formatFileSizeFa(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes.toLocaleString('fa-IR')} بایت`
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('fa-IR')} کیلوبایت`
}

export function docsFor(docs: ProfileDocuments | undefined, category: DocCategory, entryRef: string | null = null): ProfileDocItem[] {
  if (!docs) return []
  return docs.items.filter((d) => d.category === category && (entryRef == null ? d.entryRef == null : d.entryRef === entryRef))
}

