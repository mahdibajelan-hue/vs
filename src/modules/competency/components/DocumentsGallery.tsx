import { FolderOpen } from 'lucide-react'
import { AttachmentPreviewCard } from './AttachmentPreviewCard'
import { formatFileSizeFa, type ProfileDocItem } from '../lib/profileDocuments'
import { DOC_CATEGORY_LABEL_FA, type CertificationEntry, type DocCategory, type EducationEntry, type EmploymentEntry } from '../types'

const ORDER: DocCategory[] = ['NATIONAL_ID', 'RESUME', 'EDUCATION', 'EMPLOYMENT', 'CERTIFICATION', 'OTHER']

interface EntryGroup {
  key: string
  label: string
  items: ProfileDocItem[]
}

function joinLabel(parts: string[], fallback: string): string {
  const text = parts.map((p) => p.trim()).filter(Boolean).join(' — ')
  return text || fallback
}

/**
 * Every document of one candidate, grouped by category and — for education / employment / courses —
 * by the entry it documents, as small preview cards. Entries without a document are listed too (so a
 * reviewer sees what is missing), and a document whose entry was later removed from the form is kept
 * visible under «ردیف حذف‌شده» instead of disappearing. Attachments from before per-item documents
 * existed are all in «سایر».
 */
export function DocumentsGallery({
  items,
  education,
  employment,
  certifications,
  onDelete,
  signedUrl,
}: {
  items: ProfileDocItem[]
  education: EducationEntry[]
  employment: EmploymentEntry[]
  certifications: CertificationEntry[]
  onDelete?: (item: ProfileDocItem) => void
  signedUrl?: (path: string) => Promise<string | null>
}) {
  const entryGroups = (category: DocCategory, entries: { id: string; label: string }[]): EntryGroup[] => {
    const inCategory = items.filter((d) => d.category === category)
    const known = new Set(entries.map((e) => e.id))
    const groups: EntryGroup[] = entries.map((e) => ({ key: e.id, label: e.label, items: inCategory.filter((d) => d.entryRef === e.id) }))
    const orphans = inCategory.filter((d) => !d.entryRef || !known.has(d.entryRef))
    if (orphans.length > 0) groups.push({ key: '__orphan', label: 'ردیف حذف‌شده یا ثبت‌نشده در فرم', items: orphans })
    return groups
  }

  const groupsFor = (category: DocCategory): EntryGroup[] => {
    switch (category) {
      case 'EDUCATION':
        return entryGroups(
          category,
          education.map((e) => ({ id: e.id, label: joinLabel([`${e.degree} ${e.field}`, e.institution], 'مدرک تحصیلی بدون عنوان') })),
        )
      case 'EMPLOYMENT':
        return entryGroups(
          category,
          employment.map((e) => ({ id: e.id, label: joinLabel([e.employer, e.position], 'سابقه بدون عنوان') })),
        )
      case 'CERTIFICATION':
        return entryGroups(
          category,
          certifications.map((e) => ({ id: e.id, label: joinLabel([e.title, e.issuer], 'دوره بدون عنوان') })),
        )
      default:
        return [{ key: category, label: '', items: items.filter((d) => d.category === category) }]
    }
  }

  const total = items.length

  return (
    <div className="space-y-3">
      {total === 0 && <p className="text-[11px] text-muted">مدرکی بارگذاری نشده است.</p>}
      {ORDER.map((category) => {
        const groups = groupsFor(category)
        const count = groups.reduce((n, g) => n + g.items.length, 0)
        // «سایر» only shows up when something is in it; every other category is always listed so a
        // missing national ID / résumé / entry document is visible at a glance.
        if (category === 'OTHER' && count === 0) return null
        if (groups.length === 0 && count === 0) return null
        return (
          <div key={category} className="space-y-1.5 rounded-xl border border-white/10 p-3">
            <p className="flex items-center gap-1.5 text-[12px] font-bold">
              <FolderOpen size={13} className="text-purple-300" /> {DOC_CATEGORY_LABEL_FA[category]}
              <span className="num text-[10px] font-normal text-muted">({count.toLocaleString('fa-IR')})</span>
            </p>
            {category === 'OTHER' && <p className="text-[10px] text-muted">مدارکی که پیش از بارگذاری تفکیکی ثبت شده‌اند یا دسته‌ی خاصی ندارند.</p>}
            {groups.map((g) => (
              <div key={g.key} className="space-y-1">
                {g.label && <p className="text-[10.5px] text-secondary">{g.label}</p>}
                {g.items.length === 0 ? (
                  <p className="text-[10px] text-muted">— مدرکی پیوست نشده</p>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {g.items.map((d) => (
                      <AttachmentPreviewCard
                        key={d.id}
                        kind={d.kind}
                        fileName={d.fileName}
                        storagePath={d.storagePath}
                        uploadedByCandidate={d.uploadedByCandidate}
                        detail={formatFileSizeFa(d.fileSize)}
                        signedUrl={signedUrl}
                        onDelete={onDelete ? () => onDelete(d) : undefined}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
