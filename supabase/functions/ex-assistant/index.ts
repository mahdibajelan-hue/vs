// Execution assistant — optional wording layer. The numbers are computed by the app's engines and arrive here already inside `answer`;
// the model may only re-phrase it for a manager. If the rewritten text drops or invents any number, the original answer is returned unchanged.
//
//   EX_AI_BASE_URL | MISSION_AI_BASE_URL   OpenAI-compatible endpoint (e.g. https://api.openai.com/v1 or an on-premise server)
//   EX_AI_API_KEY  | MISSION_AI_API_KEY    key kept server-side only
//   EX_AI_MODEL    | MISSION_AI_MODEL
//
// Security: the caller's JWT is required; no service-role key is used; nothing but the question and the already-computed answer is sent out
// (no tables, no contract documents). Without configuration the function answers { available:false } and the client keeps the rule-based text.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
const env = (...k: string[]) => k.map((x) => Deno.env.get(x)).find((v) => !!v) ?? ''
const digits = (s: string) => (s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).match(/\d+(?:[.,٫]\d+)?/g) ?? []).map((x) => x.replace('٫', '.').replace(',', '.')).sort()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const auth = req.headers.get('Authorization') ?? ''
  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } })
  const { data: u } = await sb.auth.getUser()
  if (!u?.user) return json({ error: 'unauthorized' }, 401)
  let body: { task?: string; question?: string; answer?: string }
  try { body = await req.json() } catch { return json({ error: 'bad_request' }, 400) }
  const base = env('EX_AI_BASE_URL', 'MISSION_AI_BASE_URL'), key = env('EX_AI_API_KEY', 'MISSION_AI_API_KEY'), model = env('EX_AI_MODEL', 'MISSION_AI_MODEL')
  if (!base || !key || !model) return json({ available: false })
  if (body.task === 'ping') return json({ available: true })
  const question = String(body.question ?? '').slice(0, 500), answer = String(body.answer ?? '').slice(0, 3000)
  if (!answer) return json({ error: 'bad_request' }, 400)
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0.2, messages: [
        { role: 'system', content: 'You rewrite an already-computed answer for a senior project manager, in clear concise Persian. Rules: keep EVERY number, date and name exactly as given; add no number, fact, cause or recommendation that is not in the answer; keep warnings and assumptions; if the answer says a definite reply is not possible, keep saying so. Output only the rewritten text.' },
        { role: 'user', content: `پرسش: ${question}\n\nپاسخ محاسبه‌شده:\n${answer}` },
      ] }),
    })
    if (!r.ok) return json({ available: true, text: answer, rewritten: false })
    const text = String((await r.json())?.choices?.[0]?.message?.content ?? '').trim()
    const a = digits(answer), b = digits(text)
    const same = a.length === b.length && a.every((x, i) => x === b[i])
    return json({ available: true, text: same && text ? text : answer, rewritten: same && !!text })
  } catch { return json({ available: true, text: answer, rewritten: false }) }
})
