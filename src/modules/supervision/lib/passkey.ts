/**
 * The person's own phone as a key (Passkey / WebAuthn), used by «ورود و خروج من».
 * Registering creates a key inside the phone, unlocked only by its fingerprint, face or screen lock; every check-in asks
 * the phone to sign a fresh challenge. The edge function sv-passkey verifies the signature and hands back a one-use
 * token that sv_punch requires where the project demands a registered phone.
 */
import { supabase } from '../../../lib/supabaseClient'

const INSTALL_KEY = 'sv.install.v1'
/** a random id kept by this browser: lets the server notice one phone used for two people */
export function installId(): string {
  try {
    let id = localStorage.getItem(INSTALL_KEY)
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(INSTALL_KEY, id) }
    return id
  } catch { return '' }
}

export async function passkeySupported(): Promise<boolean> {
  try {
    return typeof window !== 'undefined' && !!window.PublicKeyCredential && window.isSecureContext
      && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch { return false }
}

/* base64url ⇄ bytes */
const toBytes = (s: string) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)) }
const toB64 = (buf: ArrayBuffer | null) => { if (!buf) return ''; let s = ''; for (const x of new Uint8Array(buf)) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }

type Json = Record<string, unknown>
type CredDesc = { id: string; type?: string; transports?: AuthenticatorTransport[] }

async function call(action: string, body: Json): Promise<Json> {
  const { data, error } = await supabase.functions.invoke('sv-passkey', { body: { action, ...body } })
  if (error) {
    // the function answers errors as { error: code }; read it from the response when the client wraps it
    let code = error.message
    try { const ctx = (error as { context?: Response }).context; if (ctx) code = ((await ctx.json()) as { error?: string }).error ?? code } catch { /* keep message */ }
    throw new Error(code)
  }
  return data as Json
}

const descs = (list: unknown): PublicKeyCredentialDescriptor[] => ((list ?? []) as CredDesc[]).map((c) => ({ id: toBytes(c.id), type: 'public-key', transports: c.transports }))

/** registers this phone for the person; the head of supervision then approves it */
export async function registerPhone(personId: string, label: string): Promise<{ status: string }> {
  const o = await call('register-options', { personId })
  const user = o.user as { id: string; name: string; displayName: string }
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: toBytes(String(o.challenge)),
      rp: o.rp as PublicKeyCredentialRpEntity,
      user: { id: toBytes(user.id), name: user.name, displayName: user.displayName },
      pubKeyCredParams: o.pubKeyCredParams as PublicKeyCredentialParameters[],
      timeout: o.timeout as number,
      attestation: 'none',
      excludeCredentials: descs(o.excludeCredentials),
      authenticatorSelection: o.authenticatorSelection as AuthenticatorSelectionCriteria,
    },
  }) as PublicKeyCredential | null
  if (!cred) throw new Error('cancelled')
  const r = cred.response as AuthenticatorAttestationResponse
  const response = {
    id: cred.id, rawId: toB64(cred.rawId), type: cred.type, authenticatorAttachment: cred.authenticatorAttachment ?? undefined, clientExtensionResults: cred.getClientExtensionResults(),
    response: { clientDataJSON: toB64(r.clientDataJSON), attestationObject: toB64(r.attestationObject), transports: typeof r.getTransports === 'function' ? r.getTransports() : [] },
  }
  return call('register-verify', { personId, response, installId: installId(), label }) as Promise<{ status: string }>
}

/** asks the phone to sign a fresh challenge (fingerprint / face / screen lock) and returns the one-use check-in token */
export async function punchToken(personId: string): Promise<string> {
  const o = await call('punch-options', { personId })
  const cred = await navigator.credentials.get({
    publicKey: { challenge: toBytes(String(o.challenge)), rpId: o.rpId as string, timeout: o.timeout as number, userVerification: 'required', allowCredentials: descs(o.allowCredentials) },
  }) as PublicKeyCredential | null
  if (!cred) throw new Error('cancelled')
  const r = cred.response as AuthenticatorAssertionResponse
  const response = {
    id: cred.id, rawId: toB64(cred.rawId), type: cred.type, authenticatorAttachment: cred.authenticatorAttachment ?? undefined, clientExtensionResults: cred.getClientExtensionResults(),
    response: { clientDataJSON: toB64(r.clientDataJSON), authenticatorData: toB64(r.authenticatorData), signature: toB64(r.signature), userHandle: r.userHandle ? toB64(r.userHandle) : undefined },
  }
  const v = await call('punch-verify', { personId, response, installId: installId() })
  return String(v.token)
}

/** a short, plain description of the phone for the head's list */
export function phoneLabel(): string {
  const ua = navigator.userAgent
  const m = /\(([^)]+)\)/.exec(ua)?.[1] ?? ''
  const model = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android[^;]*;\s*([^;)]+)/.exec(m)?.[1]?.trim() || (/Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'دستگاه')
  const browser = /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
  return [model, browser].filter(Boolean).join(' · ').slice(0, 80)
}

const ERR: Record<string, string> = {
  cancelled: 'تأیید با اثر انگشت یا قفل گوشی انجام نشد. دوباره بزنید و تأیید را کامل کنید.',
  NotAllowedError: 'تأیید با اثر انگشت یا قفل گوشی لغو شد یا زمانش گذشت. دوباره بزنید.',
  InvalidStateError: 'این گوشی قبلاً برای شما ثبت شده است.',
  device_in_use: 'این گوشی برای فرد دیگری ثبت شده است؛ هر نفر باید با گوشی خودش ثبت کند. اگر گوشی را عوض کرده‌اید به سرپرست نظارت اطلاع دهید.',
  no_active_device: 'گوشی تأییدشده‌ای برای شما ثبت نشده است؛ ابتدا گوشی خود را ثبت کنید تا سرپرست نظارت آن را تأیید کند.',
  device_not_active: 'این گوشی برای شما فعال نیست؛ گوشی فعال شما گوشی دیگری است یا هنوز تأیید نشده است.',
  challenge_expired: 'زمان تأیید گذشت. دوباره بزنید.',
  verify_failed: 'امضای گوشی تأیید نشد. دوباره امتحان کنید؛ اگر تکرار شد گوشی را دوباره ثبت کنید.',
  origin_not_allowed: 'ثبت گوشی فقط از نشانی رسمی سامانه ممکن است.',
  not_linked: 'حساب شما به نفری در این پروژه وصل نیست.',
  already_registered: 'این گوشی قبلاً ثبت شده است.',
}
export function passkeyError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? ''
  const msg = (e as Error)?.message ?? String(e)
  return ERR[name] ?? ERR[msg] ?? Object.entries(ERR).find(([k]) => msg.includes(k))?.[1] ?? 'ارتباط با سرور برای تأیید گوشی برقرار نشد. اینترنت را بررسی کنید و دوباره بزنید.'
}
