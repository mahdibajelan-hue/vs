/** Persian digits for the whole app — one definition instead of one per file. */

/** `n` with Persian digits and at most `d` decimals (default: whole numbers) */
export const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })

/** `n` with Persian digits and the locale's default decimals (up to three) */
export const faRaw = (n: number) => n.toLocaleString('fa-IR')
