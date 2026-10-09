// Issue Management — AI gateway. One narrow, provider-independent endpoint (same adapter idea as mission-ai).
//
//   IM_AI_PROVIDER = gemini (default) | openai      — falls back to the MISSION_AI_* / GEMINI_API_KEY secrets already used by mission-ai
//   gemini : GEMINI_API_KEY, model IM_AI_MODEL | MISSION_AI_MODEL | GEMINI_MODEL
//   openai : any OpenAI-compatible endpoint (incl. on-prem): IM_AI_BASE_URL | MISSION_AI_BASE_URL, IM_AI_API_KEY | MISSION_AI_API_KEY, IM_AI_MODEL
//
// Rules of the road:
//  * the caller's JWT is required; no service-role key is used — the model only sees what the user typed/selected (redacted + truncated);
//  * every answer is clamped to known enums (validate.ts) and returned as a PROPOSAL; the client must show it to a person for approval;
//  * no provider configured, or any failure → { available:false } and the client uses its built-in rule engine.
//
// Tasks: ping · suggest · summarize · extract · nl_query

import { createClient } from 'npm:@supabase/supabase-js@2'
import { CATEGORIES, SEVERITIES, redact, sanitizeCandidates, sanitizeFilter, sanitizeSuggestion, sanitizeSummary } from './validate.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
type Json = Record<string, unknown>
const env = (...k: string[]) => k.map((x) => Deno.env.get(x)).find((v) => !!v) ?? ''

function parseJsonLoose(t: string): Json { return JSON.parse(t.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()) as Json }
async function withRetry<T>(fn: () => Promise<T>, n = 2): Promise<T> {
  let last: unknown
  for (let i = 1; i <= n; i++) { try { return await fn() } catch (e) { last = e; if (i === n || !/\b(503|429)\b/.test(String(e))) throw e; await new Promise((r) => setTimeout(r, 700 * i)) } }
  throw last
}

interface Provider { id: string; configured(): boolean; generateJson(system: string, user: string): Promise<Json> }
const gemini: Provider = {
  id: 'gemini',
  configured: () => !!env('GEMINI_API_KEY'),
  generateJson: (system, user) => withRetry(async () => {
    const model = env('IM_AI_MODEL', 'MISSION_AI_MODEL', 'GEMINI_MODEL') || 'gemini-3.6-flash'
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } }),
    })
    if (!res.ok) throw new Error(`gemini ${res.status}`)
    const d = await res.json()
    return parseJsonLoose(d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '{}')
  }),
}
const openai: Provider = {
  id: 'openai',
  configured: () => !!env('IM_AI_BASE_URL', 'MISSION_AI_BASE_URL') || !!env('IM_AI_API_KEY', 'MISSION_AI_API_KEY'),
  generateJson: (system, user) => withRetry(async () => {
    const base = (env('IM_AI_BASE_URL', 'MISSION_AI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/$/, '')
    const key = env('IM_AI_API_KEY', 'MISSION_AI_API_KEY')
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model: env('IM_AI_MODEL', 'MISSION_AI_MODEL') || 'gpt-4o-mini', temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system + '\nReturn ONLY a JSON object.' }, { role: 'user', content: user }] }),
    })
    if (!res.ok) throw new Error(`openai ${res.status}`)
    return parseJsonLoose((await res.json())?.choices?.[0]?.message?.content ?? '{}')
  }),
}
const active = (): Provider | null => { const p = { gemini, openai }[(env('IM_AI_PROVIDER', 'MISSION_AI_PROVIDER') || 'gemini').toLowerCase() as 'gemini' | 'openai']; return p?.configured() ? p : null }

const BASE = `You assist project controllers of EPC (oil, gas, pipeline) projects with an issue-management system. Write Persian. Use ONLY the supplied text; never invent facts, names, dates or numbers. Your output is a proposal reviewed by a human. Categories: ${CATEGORIES.join(', ')}. Severities: ${SEVERITIES.join(', ')}.`
const SYS = {
  suggest: `${BASE} Given an issue title/description return JSON {"category": one category or null, "severity": one severity, "acceptance_criteria": "how to verify the issue is truly resolved, one sentence", "tasks": ["up to 4 concrete first actions"], "reasons": ["why you chose category/severity, quoting words from the text"]}.`,
  summarize: `${BASE} Given an issue record, its open tasks and recent events return JSON {"summary": "3-4 sentence executive status", "next_actions": ["up to 3"], "risks": ["up to 3"]}. State facts from the data only.`,
  extract: `${BASE} Given free text (meeting minutes / visit notes) extract distinct problems that need follow-up. JSON {"candidates":[{"title":"short","description":"quote or paraphrase","category":...,"severity":...}]}. Skip attendance lists, greetings and already-solved items.`,
  nl_query: `${BASE} Convert the user's question into a filter over an issue register. JSON {"q": free-text keywords or omitted, "stage": one of active|all|registered|validated|analysis|action_plan|in_progress|resolution_review|effectiveness_check|closed|returned|reopened|cancelled|duplicate, "severity":..., "category":..., "overdueOnly": bool, "blockedOnly": bool, "explanation": ["how you read the question"]}. Omit fields you are not sure about. Never output SQL.`,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'unauthorized' }, 401)
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: u, error } = await sb.auth.getUser()
    if (error || !u.user) return json({ error: 'unauthorized' }, 401)
    const body = (await req.json()) as { task?: string; payload?: Json }
    const provider = active()
    if (body.task === 'ping') return json({ available: !!provider, provider: provider?.id ?? null })
    if (!provider) return json({ available: false })
    const text = redact(JSON.stringify(body.payload ?? {}), 6000)
    if (body.task === 'suggest') return json({ available: true, provider: provider.id, result: sanitizeSuggestion(await provider.generateJson(SYS.suggest, text)) })
    if (body.task === 'summarize') return json({ available: true, provider: provider.id, result: sanitizeSummary(await provider.generateJson(SYS.summarize, text)) })
    if (body.task === 'extract') return json({ available: true, provider: provider.id, result: sanitizeCandidates(await provider.generateJson(SYS.extract, text)) })
    if (body.task === 'nl_query') return json({ available: true, provider: provider.id, result: sanitizeFilter(await provider.generateJson(SYS.nl_query, text)) })
    return json({ error: 'unknown_task' }, 400)
  } catch (e) {
    console.error('im-ai', e)
    return json({ available: false, error: 'provider_error' })
  }
})
