import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { fetchPages } from './fetchPages'
import type { Meal, MenuItem } from './svMenu'

/** منوی غذا — the week's menu rows, ratings, and the cook team. Kept out of the attendance store: it has its own life. */
export interface SvMenu extends MenuItem { id: string; cookTeam: string; note: string }
/** `dish` = the main dish when it was rated; a rating counts only while the cell still holds that dish */
export interface SvRating { menuId: string; personId: string; userId: string; score: number; comment: string; at: string; dish: string }
export interface MyMeal { id: string; day: string; meal: Meal; main: string; side: string; dessert: string; fruit: string; mine: number | null }

type Row = Record<string, unknown>
const s = (v: unknown) => (v == null ? '' : String(v))
const toMenu = (r: Row): SvMenu => ({ id: s(r.id), day: s(r.day), meal: r.meal as Meal, main: s(r.main), side: s(r.side), dessert: s(r.dessert), fruit: s(r.fruit), cookTeam: s(r.cook_team), note: s(r.note) })
const msg = (e: { message: string; code?: string } | null) => !e ? undefined : e.code === '42501' || /row-level security/i.test(e.message) ? 'فقط سرپرست نظارت منو را تنظیم می‌کند.' : friendlyErrorMessage(e)

export async function loadMenus(projectId: string, from: string, to: string): Promise<{ menus: SvMenu[]; ratings: SvRating[]; error?: string }> {
  const { data, error } = await fetchPages<Row>((a, b) => supabase.from('sv_menu').select('*').eq('master_project_id', projectId).gte('day', from).lte('day', to).order('day').order('id').range(a, b))
  if (error) return { menus: [], ratings: [], error: msg(error) }
  const menus = data.map(toMenu)
  if (!menus.length) return { menus, ratings: [] }
  // ratings by the menus' project and days (an id list of 90 menus would make a very long URL); paged past 1000 rows
  const mainOf = new Map(menus.map((m) => [m.id, m.main]))
  const r = await fetchPages<Row>((a, b) => supabase.from('sv_meal_ratings').select('menu_id,person_id,user_id,score,comment,at,dish, sv_menu!inner(day)').eq('master_project_id', projectId).gte('sv_menu.day', from).lte('sv_menu.day', to).order('id').range(a, b))
  return { menus, ratings: r.data.filter((x) => mainOf.has(s(x.menu_id)) && s(x.dish) === mainOf.get(s(x.menu_id))).map((x) => ({ menuId: s(x.menu_id), personId: s(x.person_id), userId: s(x.user_id), score: Number(x.score), comment: s(x.comment), at: s(x.at), dish: s(x.dish) })) }
}

/** Upsert the given cells (one row per day+meal); an empty dish removes nothing — it just stores blanks. */
export async function saveMenus(projectId: string, items: (MenuItem & { cookTeam: string })[]): Promise<{ ok: boolean; error?: string }> {
  if (!items.length) return { ok: true }
  const rows = items.map((x) => ({ master_project_id: projectId, day: x.day, meal: x.meal, main: x.main.trim(), side: x.side.trim(), dessert: x.dessert.trim(), fruit: x.fruit.trim(), cook_team: x.cookTeam.trim(), updated_at: new Date().toISOString() }))
  const { error } = await supabase.from('sv_menu').upsert(rows, { onConflict: 'master_project_id,day,meal' })
  return error ? { ok: false, error: msg(error) } : { ok: true }
}

export async function loadCookTeam(projectId: string): Promise<string> {
  const { data } = await supabase.from('sv_settings').select('cook_team').eq('master_project_id', projectId).maybeSingle()
  return s((data as Row | null)?.cook_team)
}
export async function saveCookTeam(projectId: string, team: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('sv_settings').upsert({ master_project_id: projectId, cook_team: team.trim() }, { onConflict: 'master_project_id' })
  return error ? { ok: false, error: msg(error) } : { ok: true }
}

/** My meals in a range, with the score I gave (for «ورود و خروج من»). */
export async function myMenu(personId: string, from: string, to: string): Promise<MyMeal[]> {
  const { data, error } = await supabase.rpc('sv_my_menu', { p_person: personId, p_from: from, p_to: to })
  if (error) return []
  return ((data ?? []) as Row[]).map((r) => ({ id: s(r.id), day: s(r.day), meal: r.meal as Meal, main: s(r.main), side: s(r.side), dessert: s(r.dessert), fruit: s(r.fruit), mine: r.mine == null ? null : Number(r.mine) }))
}

const RATE_ERR: Record<string, string> = { not_linked: 'حساب شما به نفری در این پروژه وصل نیست.', out_of_window: 'هر وعده را فقط همان روز تا دو روز بعد می‌توان نظر داد.', no_menu: 'این وعده در منو نیست.' }
export async function rateMeal(menuId: string, score: number, comment = ''): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('sv_rate_meal', { p_menu: menuId, p_score: score, p_comment: comment })
  if (!error) return { ok: true }
  const k = Object.keys(RATE_ERR).find((x) => error.message.includes(x))
  return { ok: false, error: k ? RATE_ERR[k] : friendlyErrorMessage(error) }
}
