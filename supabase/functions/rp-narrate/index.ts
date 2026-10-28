// Reporting — optional machine phrasing of an evidence report (council phase 3).
//
// The model only rephrases the report's own items; it never sees raw records. Every sentence must cite item ids and
// may only use numbers present in the cited items. The same guard runs here and again in the browser
// (src/modules/reporting/lib/narrativeGuard.ts); a rejected sentence is dropped, never shown.
//
//   RP_AI_PROVIDER = gemini (default) | openai — falls back to the IM_AI_* / MISSION_AI_* / GEMINI_API_KEY secrets
// No provider configured, or any failure → { available:false } and the page keeps the engine's own text only.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
type Json = Record<string, unknown>
const env = (...k: string[]) => k.map((x) => Deno.env.get(x)).find((v) => !!v) ?? ''
const parse = (t: string): Json => JSON.parse(t.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()) as Json

async function withRetry<T>(fn: () => Promise<T>, n = 3): Promise<T> {
  let last: unknown
  for (let i = 1; i <= n; i++) { try { return await fn() } catch (e) { last = e; if (i === n || !/\b(503|429)\b/.test(String(e))) throw e; await new Promise((r) => setTimeout(r, 900 * i)) } }
  throw last
}
const gemini = (system: string, user: string) => withRetry(() => geminiOnce(system, user))
async function geminiOnce(system: string, user: string): Promise<Json> {
  const model = env('RP_AI_MODEL', 'IM_AI_MODEL', 'MISSION_AI_MODEL', 'GEMINI_MODEL') || 'gemini-3.6-flash'
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } }),
  })
  if (!res.ok) throw new Error(`gemini ${res.status}`)
  const d = await res.json()
  return parse(d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '{}')
}
async function openai(system: string, user: string): Promise<Json> {
  const base = (env('RP_AI_BASE_URL', 'IM_AI_BASE_URL', 'MISSION_AI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/$/, '')
  const key = env('RP_AI_API_KEY', 'IM_AI_API_KEY', 'MISSION_AI_API_KEY')
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model: env('RP_AI_MODEL', 'IM_AI_MODEL', 'MISSION_AI_MODEL') || 'gpt-4o-mini', temperature: 0.1, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system + '\nReturn ONLY a JSON object.' }, { role: 'user', content: user }] }),
  })
  if (!res.ok) throw new Error(`openai ${res.status}`)
  return parse((await res.json())?.choices?.[0]?.message?.content ?? '{}')
}
function provider(): ((s: string, u: string) => Promise<Json>) | null {
  const which = (env('RP_AI_PROVIDER', 'IM_AI_PROVIDER', 'MISSION_AI_PROVIDER') || 'gemini').toLowerCase()
  if (which === 'openai') return env('RP_AI_BASE_URL', 'IM_AI_BASE_URL', 'MISSION_AI_BASE_URL', 'RP_AI_API_KEY', 'IM_AI_API_KEY', 'MISSION_AI_API_KEY') ? openai : null
  return env('GEMINI_API_KEY') ? gemini : null
}

const SYSTEM = `You rephrase a project management report for a senior manager. Write Persian, plain and short.
You get {"items":[{"id","text"}]}. Each item is a verified fact, cause, projection, action or decision.
Write 3 to 6 sentences that summarise the most important items in order of importance.
STRICT RULES: use ONLY the items; every sentence lists the ids it rests on in "refs"; use only numbers that appear in those items;
never state certainty about causes (no قطعاً، حتماً، تضمین); keep "شاهد مرتبط" as association, not cause; do not add advice that is not an item.
Return {"sentences":[{"text":"...","refs":["f-spi"]}]}.`

const DIG: Record<string, string> = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' }
const nums = (s: string) => (s.replace(/[۰-۹]/g, (c) => DIG[c]).replace(/٫/g, '.').replace(/[٬,](?=\d{3})/g, '').match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)))
const OVER = /(قطعاً|قطعا|حتماً|حتما|تضمین|بدون شک|بی‌تردید|یقیناً|اثبات شده|ثابت شده)/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'unauthorized' }, 401)
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: u, error } = await sb.auth.getUser()
    if (error || !u.user) return json({ error: 'unauthorized' }, 401)
    const body = (await req.json()) as { task?: string; items?: { id: string; text: string }[] }
    const gen = provider()
    if (body.task === 'ping') return json({ available: !!gen })
    if (!gen) return json({ available: false })
    const items = (body.items ?? []).filter((i) => i && typeof i.id === 'string' && typeof i.text === 'string').slice(0, 40).map((i) => ({ id: i.id.slice(0, 40), text: i.text.slice(0, 600) }))
    if (!items.length) return json({ available: true, sentences: [], rejected: 0 })
    const out = await gen(SYSTEM, JSON.stringify({ items }))
    const byId = new Map(items.map((i) => [i.id, i.text]))
    const raw = Array.isArray(out.sentences) ? out.sentences as { text?: unknown; refs?: unknown }[] : []
    const sentences: { text: string; refs: string[] }[] = []
    let rejected = 0
    for (const s of raw.slice(0, 8)) {
      const text = typeof s.text === 'string' ? s.text.trim() : ''
      const refs = Array.isArray(s.refs) ? (s.refs as unknown[]).filter((x): x is string => typeof x === 'string') : []
      const pool = new Set(refs.flatMap((id) => nums(byId.get(id) ?? '')))
      const ok = text && text.length <= 320 && refs.length && refs.every((id) => byId.has(id)) && !OVER.test(text) && nums(text).every((n) => pool.has(n))
      if (ok) sentences.push({ text, refs }); else rejected++
    }
    return json({ available: true, sentences, rejected })
  } catch (e) {
    return json({ available: false, error: String(e).slice(0, 200) })
  }
})
