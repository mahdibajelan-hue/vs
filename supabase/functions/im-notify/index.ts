// Issue Management — notification dispatcher.
//
// Pipeline: SQL generator (im_generate_notifications) fills im_notif_outbox → this function delivers the non-in-app rows.
// In-app rows are read straight from the outbox by my_notifications(); they never pass through here.
//
// Honest by design: a channel is only used when its provider is configured (webhook URL secret). Without it the rows
// are marked `skipped` (error `provider_not_configured:<channel>`) — the UI shows that state; nothing is pretended to be sent.
//
//   IM_EMAIL_WEBHOOK_URL / IM_SMS_WEBHOOK_URL / IM_PUSH_WEBHOOK_URL / IM_MESSENGER_WEBHOOK_URL   (https only)
//   IM_<CHANNEL>_WEBHOOK_TOKEN   optional bearer token for the gateway
//   IM_CRON_SECRET               lets a scheduler (pg_cron + pg_net, GitHub Actions, any cron) call this function without a user session
//
// Actions (POST JSON): { action: 'status' } · { action: 'dispatch' }   — callers: an admin JWT, or header x-cron-secret.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { EXTERNAL_CHANNELS, outcomeOf, providerFor, type Channel } from './logic.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const env = Deno.env.toObject()
  const url = env.SUPABASE_URL!
  const service = env.SUPABASE_SERVICE_ROLE_KEY
  let body: { action?: string } = {}
  try { body = await req.json() } catch { /* empty */ }

  // ---- auth: cron secret OR an admin user
  const cron = env.IM_CRON_SECRET && req.headers.get('x-cron-secret') === env.IM_CRON_SECRET
  if (!cron) {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '')
    const userClient = createClient(url, env.SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
    const { data: u } = await userClient.auth.getUser()
    if (!u?.user) return json({ error: 'unauthorized' }, 401)
    const { data: isAdmin } = await userClient.rpc('is_admin_user')
    if (!isAdmin) return json({ error: 'admin_only' }, 403)
  }

  const channels = Object.fromEntries(EXTERNAL_CHANNELS.map((c) => [c, !!providerFor(env, c)])) as Record<Channel, boolean>
  if (body.action === 'status') return json({ channels, cron: !!env.IM_CRON_SECRET })
  if (!service) return json({ error: 'service_role_not_available' }, 500)
  const db = createClient(url, service)

  // 1) generate (idempotent) — only needs the service role
  const gen = await db.rpc('im_generate_notifications')
  const genRisk = await db.rpc('rm_generate_notifications') // Risk module (same outbox, scope 'risk'); failure must not block delivery

  // 2) deliver due rows
  const { data: rows } = await db.from('im_notif_outbox').select('*').neq('channel', 'in_app').eq('status', 'queued').lte('scheduled_at', new Date().toISOString()).lt('attempts', 5).order('level', { ascending: false }).limit(200)
  const stats = { sent: 0, skipped: 0, retry: 0, failed: 0 }
  const profiles = new Map<string, { email: string; phone: string; messenger: string }>()
  for (const r of rows ?? []) {
    const ch = r.channel as Channel
    if (!profiles.has(r.recipient_id)) {
      const [{ data: p }, { data: pref }] = await Promise.all([db.from('profiles').select('email').eq('id', r.recipient_id).maybeSingle(), db.from('im_notif_prefs').select('contact').eq('user_id', r.recipient_id).maybeSingle()])
      const c = (pref?.contact ?? {}) as Record<string, string>
      profiles.set(r.recipient_id, { email: p?.email ?? '', phone: c.phone ?? '', messenger: c.messenger_id ?? '' })
    }
    const who = profiles.get(r.recipient_id)!
    const to = ch === 'email' ? who.email : ch === 'sms' ? who.phone : ch === 'messenger' ? who.messenger : r.recipient_id
    const prov = providerFor(env, ch)
    let ok = false, error = ''
    if (prov && to) {
      try {
        const res = await fetch(prov.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(prov.token ? { Authorization: `Bearer ${prov.token}` } : {}) }, body: JSON.stringify({ channel: ch, to, title: r.title, body: r.body, issue_id: r.issue_id, risk_id: r.risk_id, code: r.payload?.code, level: r.level, severity: r.severity }) })
        ok = res.ok
        if (!ok) error = `http_${res.status}`
      } catch (e) { error = e instanceof Error ? e.message : 'network_error' }
    }
    const o = outcomeOf({ configured: !!prov, hasContact: !!to, ok, error, attempts: r.attempts, channel: ch })
    const patch = o.status === 'sent' ? { status: 'sent', sent_at: new Date().toISOString(), attempts: r.attempts + 1, last_error: '' }
      : o.status === 'skipped' ? { status: 'skipped', last_error: o.error }
      : o.status === 'failed' ? { status: 'failed', attempts: r.attempts + 1, last_error: o.error }
      : { attempts: r.attempts + 1, last_error: o.error, scheduled_at: new Date(Date.now() + o.delayMin * 60000).toISOString() }
    await db.from('im_notif_outbox').update(patch).eq('id', r.id)
    stats[o.status]++
  }
  return json({ channels, generated: gen.data ?? null, generated_risk: genRisk.data ?? null, delivered: stats, picked: rows?.length ?? 0 })
})
