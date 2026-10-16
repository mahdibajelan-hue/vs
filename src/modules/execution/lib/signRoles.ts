import type { SignParty } from '../epcTypes'

/** Signing roles of a project (e.g. «مسئول دفتر فنی» prepares, «سرپرست کارگاه» approves, «ناظر مربوطه» reviews, «سرپرست دستگاه نظارت» approves): defined once with the person and the forms they sign.
 *  The per-form signature slots used by the database (ex_sign_slots) are DERIVED from them. */
export interface SignRole { key: string; label: string; party: SignParty; userId: string | null; sort: number; required: boolean; forms: string[] }
export interface SlotRow { formKey: string; slotKey: string; label: string; party: SignParty; userId: string | null; sort: number; required: boolean }
export interface ExistingSlot extends SlotRow { id: string }

export const SUGGESTED_ROLES: Omit<SignRole, 'userId' | 'forms'>[] = [
  { key: 'prep', label: 'تهیه‌کننده — مسئول دفتر فنی', party: 'contractor', sort: 1, required: true },
  { key: 'appr', label: 'تأییدکننده — سرپرست کارگاه', party: 'contractor', sort: 2, required: true },
  { key: 'rev', label: 'بررسی‌کننده — ناظر مربوطه', party: 'consultant', sort: 3, required: false },
  { key: 'sup', label: 'تأییدکننده — سرپرست دستگاه نظارت', party: 'consultant', sort: 4, required: false },
]

export const desiredSlots = (roles: SignRole[]): SlotRow[] => roles.flatMap((r) => [...new Set(r.forms)].map((f) => ({ formKey: f, slotKey: r.key, label: r.label, party: r.party, userId: r.userId, sort: r.sort, required: r.required })))
const same = (a: SlotRow, b: SlotRow) => a.label === b.label && a.party === b.party && a.userId === b.userId && a.sort === b.sort && a.required === b.required
/** what must change in the slot table so it equals the roles: rows to write, ids to remove */
export function diffSlots(existing: ExistingSlot[], desired: SlotRow[]): { upsert: SlotRow[]; remove: string[] } {
  const key = (s: { formKey: string; slotKey: string }) => `${s.formKey}|${s.slotKey}`
  const have = new Map(existing.map((e) => [key(e), e])), want = new Map(desired.map((d) => [key(d), d]))
  return { upsert: desired.filter((d) => { const e = have.get(key(d)); return !e || !same(e, d) }), remove: existing.filter((e) => !want.has(key(e))).map((e) => e.id) }
}
