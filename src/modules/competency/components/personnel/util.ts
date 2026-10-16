import { fmtD } from '../../../finance/components/fn'

/** ISO date → «1404/07/25» with Latin digits, the style printed on cards */
export const jdLatin = (iso: string) => (iso ? fmtD(iso).replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))) : '')

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
