// Mission & Visit Debrief — AI gateway (schema.sql Section 61).
//
// ONE narrow, provider-independent endpoint for the four things the module may ask a language model to
// do: analyse an interview answer, phrase the next follow-up question, polish the management report's
// wording, and transcribe a spoken answer (voice input on browsers without a built-in recogniser). The browser never talks to a model vendor — it talks to this function, and THIS function talks
// to whichever provider the deployment is configured for:
//
//   MISSION_AI_PROVIDER = gemini   (default)  → Google Gemini REST, key GEMINI_API_KEY, model MISSION_AI_MODEL | GEMINI_MODEL
//   MISSION_AI_PROVIDER = openai              → any OpenAI-compatible chat-completions endpoint — OpenAI itself,
//                                               or an on-premise / internal model server (vLLM, Ollama, LM Studio,
//                                               a corporate gateway): MISSION_AI_BASE_URL, MISSION_AI_API_KEY (optional
//                                               for on-prem), MISSION_AI_MODEL
//
// Adding another provider means adding one adapter to PROVIDERS below; nothing in the app changes. When no
// provider is configured, or a call fails, the function answers { available:false } and the client silently
// falls back to its built-in rule engine — AI is an enrichment, never a dependency.
//
// Same trust model as the competency functions: the caller's own JWT is required (verified with
// auth.getUser) and no service-role key is used.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// ------------------------------------------------------------------------------------------ providers

type Json = Record<string, unknown>
interface Provider {
  id: string
  configured(): boolean
  /** Returns the model's JSON object for the given system+user prompt. */
  generateJson(system: string, user: string, schemaHint: string): Promise<Json>
  /** Speech → text. `audio` is base64 of a 16 kHz mono PCM WAV recorded in the browser. */
  transcribe(audio: string, mime: string, lang: string): Promise<string>
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      last = err
      const msg = err instanceof Error ? err.message : String(err)
      if (!/\b(503|429)\b|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(msg) || i === attempts) throw err
      await new Promise((r) => setTimeout(r, 800 * 2 ** (i - 1)))
    }
  }
  throw last
}

function parseJsonLoose(text: string): Json {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  return JSON.parse(cleaned) as Json
}

const gemini: Provider = {
  id: 'gemini',
  configured: () => !!Deno.env.get('GEMINI_API_KEY'),
  async generateJson(system, user) {
    const key = Deno.env.get('GEMINI_API_KEY')!
    const model = Deno.env.get('MISSION_AI_MODEL') || Deno.env.get('GEMINI_MODEL') || 'gemini-3.6-flash'
    return withRetry(async () => {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
      })
      if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
      return parseJsonLoose(text)
    })
  },
  transcribe: (a, m, l) => geminiTranscribe(a, m, l),
}

const TRANSCRIBE_PROMPT = (lang: string) =>
  `Transcribe this audio recording exactly as spoken. The language is ${lang === 'fa' ? 'Persian (Farsi)' : lang}. ` +
  'Write it in Persian script with natural punctuation, keep numbers as digits where they were clearly said as numbers, ' +
  'do not translate, summarise, or add anything. If there is no intelligible speech, return an empty string. Return ONLY the transcript text.'

// Audio-capable models tried in order (first that answers wins). A model that rejects audio input or does
// not exist answers 400/404 and we move on to the next; load errors (429/503) are retried inside withRetry.
const AUDIO_MODELS = (): string[] =>
  [...new Set([Deno.env.get('MISSION_AI_AUDIO_MODEL'), Deno.env.get('MISSION_AI_MODEL'), Deno.env.get('GEMINI_MODEL'), 'gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'].filter((m): m is string => !!m))]

const geminiTranscribe: Provider['transcribe'] = async (audio, mime, lang) => {
  const key = Deno.env.get('GEMINI_API_KEY')!
  const errors: string[] = []
  for (const model of AUDIO_MODELS()) {
    try {
      return await withRetry(async () => {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: TRANSCRIBE_PROMPT(lang) }, { inline_data: { mime_type: mime, data: audio } }] }],
            generationConfig: { temperature: 0 },
          }),
        })
        if (!res.ok) throw new Error(`${model} ${res.status}: ${(await res.text()).slice(0, 220)}`)
        const data = await res.json()
        const text = (data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '').trim()
        if (!text && data?.promptFeedback?.blockReason) throw new Error(`${model} blocked: ${data.promptFeedback.blockReason}`)
        return text
      })
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }
  throw new Error(errors.join(' | '))
}

const openaiTranscribe: Provider['transcribe'] = async (audio, mime, lang) => {
  const base = (Deno.env.get('MISSION_AI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/$/, '')
  const key = Deno.env.get('MISSION_AI_API_KEY') ?? ''
  const model = Deno.env.get('MISSION_AI_TRANSCRIBE_MODEL') || 'whisper-1'
  const bytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0))
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mime }), 'voice.wav')
  form.append('model', model)
  form.append('language', lang)
  form.append('response_format', 'json')
  return withRetry(async () => {
    const res = await fetch(`${base}/audio/transcriptions`, { method: 'POST', headers: key ? { Authorization: `Bearer ${key}` } : {}, body: form })
    if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`)
    return String((await res.json())?.text ?? '').trim()
  })
}

const openaiCompatible: Provider = {
  id: 'openai',
  configured: () => !!Deno.env.get('MISSION_AI_BASE_URL') || !!Deno.env.get('MISSION_AI_API_KEY'),
  async generateJson(system, user, schemaHint) {
    const base = (Deno.env.get('MISSION_AI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/$/, '')
    const key = Deno.env.get('MISSION_AI_API_KEY') ?? ''
    const model = Deno.env.get('MISSION_AI_MODEL') || 'gpt-4o-mini'
    return withRetry(async () => {
      const res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: `${system}\n\nReturn ONLY a JSON object. ${schemaHint}` },
            { role: 'user', content: user },
          ],
        }),
      })
      if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`)
      const data = await res.json()
      return parseJsonLoose(data?.choices?.[0]?.message?.content ?? '{}')
    })
  },
  transcribe: (a, m, l) => openaiTranscribe(a, m, l),
}

const PROVIDERS: Record<string, Provider> = { gemini, openai: openaiCompatible }

function activeProvider(): Provider | null {
  const wanted = (Deno.env.get('MISSION_AI_PROVIDER') || 'gemini').toLowerCase()
  const p = PROVIDERS[wanted]
  return p && p.configured() ? p : null
}

// ------------------------------------------------------------------------------------------ prompts

const SYSTEM_ANALYZE = `You are the analysis engine of a Persian-language project-visit debrief assistant for EPC oil & gas projects.
A project manager just answered one interview question. Extract ONLY what the answer actually says — never invent facts, names, dates or numbers.
Write all text values in Persian. Dates must be ISO (YYYY-MM-DD) resolved against "today"; use null when no date is stated.
Classify each distinct statement as exactly one kind:
- issue: a problem that already exists (delay, shortage, defect, stoppage, dispute)
- risk: something that MAY happen (uncertain, conditional, concern)
- action: something that should be done
- commitment: someone promised to do/deliver something
- decision: something was agreed or decided
A continuation sentence that only adds cause/impact/owner/date to the previous statement must be merged into that finding's "details", not returned as a new finding.
If the answer says there is nothing to report, return no findings and nothingToReport=true. If the person does not know, unknown=true.
"details" keys you may fill: cause, impact, status, party, newDate, needAction, probability (کم|متوسط|زیاد), mitigation, owner, due.
If "target" is given, the answer responds to a follow-up about that finding/slot: return it in slotFills as {findingKey, slot, value}.
If "wantedFollowUp" is given, write ONE short, natural Persian question (followUpText) that asks for exactly that missing fact about that finding, in a polite colleague tone.
severity: low|medium|high|critical based on impact on schedule/cost/safety/quality as stated (note: "مسیر بحرانی" means critical path, not "critical severity").`

const SCHEMA_ANALYZE =
  'Schema: {"findings":[{"kind":"issue|risk|action|commitment|decision","title":"short Persian title","description":"the supporting sentence","details":{},"severity":"low|medium|high|critical","ownerText":"","dueDate":null,"confidence":0.0}],"slotFills":[{"findingKey":"","slot":"","value":""}],"metrics":{"planned":null,"actual":null},"sentiment":"positive|neutral|negative","nothingToReport":false,"unknown":false,"vague":false,"summary":"one-line Persian paraphrase","followUpText":""}'

const SYSTEM_REPORT = `You are editing the wording of a Persian management report about a project site visit, for senior managers.
You receive a deterministic DRAFT built from verified data. Improve clarity and tone ONLY: do not add, remove or change any fact, number, name, date or finding.
Return a concise executive summary (4-6 sentences, Persian) and a prioritised list of recommendations (max 8, Persian, imperative, each tied to a finding/objective in the draft).`

const SCHEMA_REPORT = 'Schema: {"executiveSummary":"","recommendations":[""]}'

// ------------------------------------------------------------------------------------------ handler

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'unauthorized' }, 401)
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401)

    const body = (await req.json()) as { task?: string; payload?: Json }
    const provider = activeProvider()
    if (body.task === 'ping') return json({ available: !!provider, provider: provider?.id ?? null })
    if (!provider) return json({ available: false })

    if (body.task === 'analyze_answer') {
      const out = await provider.generateJson(SYSTEM_ANALYZE, JSON.stringify(body.payload), SCHEMA_ANALYZE)
      return json({ available: true, provider: provider.id, result: out })
    }
    if (body.task === 'transcribe') {
      const p = body.payload as { audio?: string; mime?: string; lang?: string } | undefined
      // ~2 minutes of 16 kHz mono PCM is ~3.8 MB (~5.1 MB base64); refuse anything larger.
      if (!p?.audio || p.audio.length > 6_500_000) return json({ error: 'bad_audio' }, 400)
      try {
        const text = await provider.transcribe(p.audio, p.mime || 'audio/wav', p.lang || 'fa')
        return json({ available: true, provider: provider.id, text })
      } catch (err) {
        console.error('mission-ai transcribe', err)
        // Unlike the analysis tasks, a failed transcription has no rule-based fallback, so say why (no secrets in these messages).
        return json({ available: true, provider: provider.id, error: 'transcribe_failed', detail: (err instanceof Error ? err.message : String(err)).slice(0, 500) })
      }
    }
    if (body.task === 'compose_report') {
      const out = await provider.generateJson(SYSTEM_REPORT, JSON.stringify(body.payload), SCHEMA_REPORT)
      return json({ available: true, provider: provider.id, result: out })
    }
    return json({ error: 'unknown_task' }, 400)
  } catch (err) {
    console.error('mission-ai', err)
    // Never surface model/vendor errors to the user: the client falls back to its rules.
    return json({ available: false, error: 'provider_error' })
  }
})
