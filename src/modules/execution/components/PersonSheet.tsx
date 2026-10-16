import { useMemo } from 'react'
import { fmtD } from '../../finance/components/fn'
import { BUNDLED_TEMPLATES } from '../forms/bundled'
import { GridSheet, printPlan } from '../forms/GridTemplate'
import type { GridTemplate } from '../forms/gridTypes'
import { useEpcStore } from '../store/useEpcStore'

/** ISO date → «1404/07/25» with Latin digits, the style printed on the sheets */
export const jdLatin = (iso: string) => (iso ? fmtD(iso).replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))) : '')

/** the approved sheet of the library, or — until one is approved — the layout shipped with the app (a preview, marked as such) */
export function useSheet(formKey: string): { layout: GridTemplate | undefined; approved: boolean } {
  const approved = useEpcStore((s) => s.templates.find((t) => t.formKey === formKey && t.status === 'approved'))
  return { layout: (approved?.layout ?? BUNDLED_TEMPLATES.find((b) => b.formKey === formKey)?.layout) as GridTemplate | undefined, approved: !!approved }
}

/** Draws one sheet with cell values; an optional photo fills the merged photo block (rows 3–8, columns A–C of the card). */
export function PersonSheet({ formKey, values, photo, note }: { formKey: string; values: Record<string, string>; photo?: string; note?: string }) {
  const { layout, approved } = useSheet(formKey)
  const lay = useMemo(() => (layout && photo ? { ...layout, logos: [...layout.logos, { kind: 'pic' as const, media: '__photo', from: [2, 0] as [number, number], to: [7, 2] as [number, number], text: null }] } : layout), [layout, photo])
  if (!lay) return <p className="im-helper">قالب این فرم پیدا نشد.</p>
  const logos: Record<string, string> = {}
  lay.logos.forEach((l) => { if (l.from && l.kind === 'pic' && l.media !== '__photo') logos[`${l.from[0]},${l.from[1]}`] = `${import.meta.env.BASE_URL}form-logo-welding-original.png` })
  if (photo) logos['2,0'] = photo
  const plan = printPlan(lay)
  return (
    <div className="mt-printable gt-paper" dir="ltr">
      {(note || !approved) && <p className="no-print" style={{ margin: '0 0 4px', fontSize: 11, textAlign: 'center' }}>{note ?? 'پیش‌نمایش با قالب همراه برنامه؛ برای چاپ رسمی، قالب را در «تنظیمات ← کتابخانهٔ قالب‌ها» تأیید کنید.'}</p>}
      <style>{`${plan.css} @media print { .gt-page { zoom: ${plan.scale}; } }`}</style>
      <div className="gt-page" style={{ width: 'fit-content', margin: '0 auto', maxWidth: '100%', overflow: 'auto' }}><GridSheet tpl={lay} values={values} logos={logos} /></div>
    </div>
  )
}

/** a JPEG data URL no larger than the box (a card photo is a few tens of kilobytes) */
export async function photoFromFile(file: File, maxW = 260, maxH = 340): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image')); i.src = url })
    const k = Math.min(1, maxW / img.width, maxH / img.height), c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k))
    c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.82)
  } finally { URL.revokeObjectURL(url) }
}
