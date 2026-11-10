const FA = '۰۱۲۳۴۵۶۷۸۹', AR = '٠١٢٣٤٥٦٧٨٩'
/** Parses what a person typed: Persian/Arabic digits, thousands separators and the Persian decimal mark. */
export const parseNum = (s: string): number => { const t = s.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d))).replace(/[٠-٩]/g, (d) => String(AR.indexOf(d))).replace(/[٬,\s]/g, '').replace('٫', '.'); const n = Number(t); return Number.isFinite(n) ? n : 0 }
