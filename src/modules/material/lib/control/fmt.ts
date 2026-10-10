import { formatJalali } from '../../../../lib/jalali'

const D = '۰۱۲۳۴۵۶۷۸۹'
/** Persian digits for a number or any text that carries digits (dates, codes inside sentences). */
export const faNum = (n: number | string, maxFrac = 1): string => (typeof n === 'number' ? n.toLocaleString('fa-IR', { maximumFractionDigits: maxFrac }) : n.replace(/[0-9]/g, (d) => D[+d]))
/** An ISO date as a Jalali date in Persian digits (falls back to the text itself). */
export const faDate = (iso: string | null | undefined): string => (iso ? faNum(formatJalali(iso) || iso) : '—')
