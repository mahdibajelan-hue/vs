// Pure helpers for the notification dispatcher (unit-tested from src/modules/issues/lib/notifyLogic.test.mjs).

export type Channel = 'email' | 'sms' | 'push' | 'messenger'
export const EXTERNAL_CHANNELS: Channel[] = ['email', 'sms', 'push', 'messenger']
export const MAX_ATTEMPTS = 5

/** Exponential back-off: 5, 10, 20, 40 minutes … */
export function backoffMinutes(attempts: number): number {
  return 5 * 2 ** Math.max(0, attempts - 1)
}

export interface ProviderConfig { url: string; token: string }

/** Webhook per channel — any gateway (SMTP relay, SMS provider, FCM bridge, messenger bot) can sit behind it. */
export function providerFor(env: Record<string, string | undefined>, ch: Channel): ProviderConfig | null {
  const key = `IM_${ch.toUpperCase()}_WEBHOOK_URL`
  const url = (env[key] ?? '').trim()
  if (!url || !/^https:\/\//i.test(url)) return null
  return { url, token: (env[`IM_${ch.toUpperCase()}_WEBHOOK_TOKEN`] ?? '').trim() }
}

export type Outcome = { status: 'sent' } | { status: 'skipped'; error: string } | { status: 'retry'; error: string; delayMin: number } | { status: 'failed'; error: string }

/** Decide the next row state from one delivery attempt. `attempts` is the count BEFORE this attempt. */
export function outcomeOf(args: { configured: boolean; hasContact: boolean; ok: boolean; error?: string; attempts: number; channel: Channel }): Outcome {
  if (!args.configured) return { status: 'skipped', error: `provider_not_configured:${args.channel}` }
  if (!args.hasContact) return { status: 'skipped', error: `no_contact:${args.channel}` }
  if (args.ok) return { status: 'sent' }
  const next = args.attempts + 1
  if (next >= MAX_ATTEMPTS) return { status: 'failed', error: (args.error ?? 'unknown').slice(0, 300) }
  return { status: 'retry', error: (args.error ?? 'unknown').slice(0, 300), delayMin: backoffMinutes(next) }
}

/** Per-recipient digest: collapse many queued rows for one channel into a single message. */
export function digest(rows: { title: string; body: string }[], max = 12): { title: string; body: string } {
  const head = rows.slice(0, max).map((r, i) => `${i + 1}. ${r.title}${r.body ? ' — ' + r.body : ''}`)
  const more = rows.length > max ? `\n… و ${rows.length - max} مورد دیگر` : ''
  return { title: `${rows.length} اعلان جدید در مدیریت مسائل`, body: head.join('\n') + more }
}
