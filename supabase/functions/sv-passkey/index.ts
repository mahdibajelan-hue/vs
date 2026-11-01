// حضور و غیاب دستگاه نظارت — the phone of each person (Passkey / WebAuthn).
//
// The person's own phone signs a fresh challenge with a key that never leaves the phone, after fingerprint, face or the
// screen lock. A check-in made with a password alone (on someone else's phone) cannot produce that signature.
//
// Actions (POST JSON, the caller's session in Authorization):
//   { action: 'register-options', personId }                          → options for navigator.credentials.create
//   { action: 'register-verify', personId, response, installId, label } → stores the phone as «pending» (the head approves)
//   { action: 'punch-options', personId }                              → options for navigator.credentials.get
//   { action: 'punch-verify', personId, response, installId }           → { token }: one use, two minutes, for sv_punch
//
// The relying party is the page's own host (Origin header), limited to SV_PASSKEY_HOSTS (comma list) plus the
// production host and localhost. Writes use the service role; the caller must be the account linked to the person.

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
} from 'npm:@simplewebauthn/server@13'
import { isoBase64URL } from 'npm:@simplewebauthn/server@13/helpers'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
const fail = (code: string, s = 400) => json({ error: code }, s)
const DEFAULT_HOSTS = ['mahdibajelan-hue.github.io', 'localhost']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail('method', 405)
  const env = Deno.env.toObject()
  const url = env.SUPABASE_URL!
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return fail('service_role_not_available', 500)

  // who is calling
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '')
  const userClient = createClient(url, env.SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
  const { data: u } = await userClient.auth.getUser()
  const user = u?.user
  if (!user) return fail('unauthorized', 401)

  // which site is asking: the passkey is bound to that host
  const origin = req.headers.get('Origin') ?? ''
  let host = ''
  try { host = new URL(origin).hostname } catch { /* no origin */ }
  const hosts = new Set([...DEFAULT_HOSTS, ...(env.SV_PASSKEY_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean)])
  if (!host || !hosts.has(host)) return fail('origin_not_allowed', 403)
  const rpID = host

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { return fail('bad_json') }
  const action = String(body.action ?? '')
  const personId = String(body.personId ?? '')
  const installId = String(body.installId ?? '').slice(0, 64)
  const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: person } = await db.from('sv_people').select('id, master_project_id, full_name, user_id, active').eq('id', personId).maybeSingle()
  if (!person || person.user_id !== user.id || !person.active) return fail('not_linked', 403)
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim().slice(0, 60)
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 300)

  const saveChallenge = (kind: 'register' | 'punch', challenge: string) =>
    db.from('sv_passkey_challenges').insert({ user_id: user.id, person_id: person.id, kind, challenge, expires_at: new Date(Date.now() + 5 * 60_000).toISOString() })
  const takeChallenge = async (kind: 'register' | 'punch') => {
    const { data } = await db.from('sv_passkey_challenges').select('id, challenge').eq('user_id', user.id).eq('person_id', person.id).eq('kind', kind)
      .is('used_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (data) await db.from('sv_passkey_challenges').update({ used_at: new Date().toISOString() }).eq('id', data.id)
    return data?.challenge as string | undefined
  }

  if (action === 'register-options') {
    const { data: mine } = await db.from('sv_devices').select('credential_id, transports').eq('person_id', person.id).neq('status', 'revoked')
    const options = await generateRegistrationOptions({
      rpName: 'فرین — حضور و غیاب', rpID,
      userID: new TextEncoder().encode(person.id), userName: user.email ?? person.id, userDisplayName: person.full_name,
      attestationType: 'none',
      excludeCredentials: (mine ?? []).map((d) => ({ id: d.credential_id as string, transports: (d.transports ?? []) as never })),
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' },
      timeout: 120_000,
    })
    await saveChallenge('register', options.challenge)
    return json(options)
  }

  if (action === 'register-verify') {
    const expectedChallenge = await takeChallenge('register')
    if (!expectedChallenge) return fail('challenge_expired')
    // one phone, one person: a browser already holding another person's phone is refused
    if (installId) {
      const { data: other } = await db.from('sv_devices').select('id').eq('install_id', installId).neq('person_id', person.id).neq('status', 'revoked').limit(1)
      if (other?.length) return fail('device_in_use', 409)
    }
    let v
    try {
      v = await verifyRegistrationResponse({ response: body.response as never, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true })
    } catch (e) { return json({ error: 'verify_failed', detail: String((e as Error)?.message ?? e).slice(0, 200) }, 400) }
    if (!v.verified || !v.registrationInfo) return fail('verify_failed')
    const c = v.registrationInfo.credential
    const { data: dev, error } = await db.from('sv_devices').insert({
      master_project_id: person.master_project_id, person_id: person.id, user_id: user.id,
      credential_id: c.id, public_key: isoBase64URL.fromBuffer(c.publicKey), sign_count: c.counter, transports: c.transports ?? [],
      label: String(body.label ?? '').slice(0, 80), user_agent: ua, install_id: installId, ip, status: 'pending',
    }).select('id, status').single()
    if (error) return json({ error: /duplicate/i.test(error.message) ? 'already_registered' : 'save_failed' }, 409)
    return json({ id: dev.id, status: dev.status })
  }

  if (action === 'punch-options') {
    const { data: act } = await db.from('sv_devices').select('credential_id, transports').eq('person_id', person.id).eq('status', 'active')
    if (!act?.length) return fail('no_active_device', 409)
    const options = await generateAuthenticationOptions({
      rpID, userVerification: 'required', timeout: 90_000,
      allowCredentials: act.map((d) => ({ id: d.credential_id as string, transports: (d.transports ?? []) as never })),
    })
    await saveChallenge('punch', options.challenge)
    return json(options)
  }

  if (action === 'punch-verify') {
    const expectedChallenge = await takeChallenge('punch')
    if (!expectedChallenge) return fail('challenge_expired')
    const credId = String((body.response as { id?: string })?.id ?? '')
    const { data: dev } = await db.from('sv_devices').select('id, credential_id, public_key, sign_count, transports').eq('person_id', person.id).eq('status', 'active').eq('credential_id', credId).maybeSingle()
    if (!dev) return fail('device_not_active', 403)
    let v
    try {
      v = await verifyAuthenticationResponse({
        response: body.response as never, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
        credential: { id: dev.credential_id, publicKey: isoBase64URL.toBuffer(dev.public_key), counter: Number(dev.sign_count ?? 0), transports: (dev.transports ?? []) as never },
      })
    } catch (e) { return json({ error: 'verify_failed', detail: String((e as Error)?.message ?? e).slice(0, 200) }, 400) }
    if (!v.verified) return fail('verify_failed')
    await db.from('sv_devices').update({ sign_count: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('id', dev.id)
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
    const { error } = await db.from('sv_punch_tokens').insert({ token, user_id: user.id, person_id: person.id, device_id: dev.id, install_id: installId, expires_at: new Date(Date.now() + 2 * 60_000).toISOString() })
    if (error) return fail('save_failed', 500)
    return json({ token })
  }

  return fail('unknown_action')
})
