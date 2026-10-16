/** Where a weld stands in the quality chain, DERIVED from its form rows in date order: fit-up → weld (+VT) → RT request → RT → (repair → RT again)* → field-joint coating → coating test. Nothing is stored; nothing is typed twice. */
export interface WEvent { formKey: string; date: string; result?: string; vt?: string; repairDone?: string; lineId?: string }
export type WState = 'none' | 'fitup' | 'welded' | 'rt_requested' | 'rt_accepted' | 'needs_repair' | 'repaired' | 'coated' | 'coat_tested' | 'coat_failed'
export const WSTATE_FA: Record<WState, string> = { none: '—', fitup: 'فیت‌آپ شده', welded: 'جوش شده', rt_requested: 'در انتظار نتیجهٔ RT', rt_accepted: 'RT پذیرفته', needs_repair: 'نیازمند تعمیر', repaired: 'تعمیر شده — نیازمند RT مجدد', coated: 'پوشش‌شده — نیازمند تست', coat_tested: 'پوشش تست‌شده ✓', coat_failed: 'تست پوشش مردود' }
export const WSTATE_NEXT_FA: Partial<Record<WState, string>> = { fitup: 'جوشکاری', welded: 'درخواست RT', rt_requested: 'ثبت نتیجهٔ RT', needs_repair: 'ثبت تعمیر', repaired: 'درخواست RT مجدد', rt_accepted: 'پوشش سرجوش', coated: 'تست پوشش', coat_failed: 'اصلاح پوشش و تست مجدد' }
const RANK: Record<string, number> = { fitup: 1, welding: 2, tie_in: 2, rt_request: 3, rt_request_rp: 3, rt_report: 4, weld_repair: 5, fj_coating: 6, bond_test: 7 }

export function weldLifecycle(events: WEvent[]): { state: WState; cycle: number; anomalies: string[]; next: string | null } {
  const ev = events.filter((e) => e.formKey in RANK).sort((a, b) => a.date.localeCompare(b.date) || RANK[a.formKey] - RANK[b.formKey])
  let state: WState = 'none', cycle = 0, accepted = false
  const anomalies: string[] = []
  for (const e of ev) {
    switch (e.formKey) {
      case 'fitup': if (state === 'none') state = 'fitup'; break
      case 'welding': case 'tie_in': state = e.vt === 'rej' ? 'needs_repair' : 'welded'; accepted = false; break
      case 'rt_request': case 'rt_request_rp': if (state === 'none' || state === 'fitup') anomalies.push('درخواست RT پیش از ثبت جوشکاری'); if (['none', 'fitup', 'welded', 'repaired'].includes(state)) state = 'rt_requested'; break
      case 'rt_report':
        if (state === 'none' || state === 'fitup') anomalies.push('نتیجهٔ RT پیش از ثبت جوشکاری')
        if (e.result === 'acc') { state = 'rt_accepted'; accepted = true } else if (e.result === 'rep') { state = 'needs_repair'; accepted = false }
        break
      case 'weld_repair': if (e.repairDone === 'done') { state = 'repaired'; cycle++; accepted = false } else state = 'needs_repair'; break
      case 'fj_coating':
        if (!accepted) anomalies.push('پوشش سرجوش پیش از پذیرفته‌شدن RT')
        state = e.result === 'rej' ? 'coat_failed' : 'coated'; break
      case 'bond_test': state = e.result === 'rej' ? 'coat_failed' : state === 'none' ? 'none' : 'coat_tested'; if (!accepted) anomalies.push('تست پوشش پیش از پذیرفته‌شدن RT'); break
    }
  }
  return { state, cycle, anomalies: [...new Set(anomalies)], next: WSTATE_NEXT_FA[state] ?? null }
}
