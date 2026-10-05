import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribeViaGateway } from '../ai/gatewayProvider'
import { blobToWavBase64 } from '../lib/wav'

/** Minimal typing for the (still vendor-prefixed) Web Speech API. */
interface SpeechRec {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type SpeechCtor = new () => SpeechRec

function nativeCtor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const canRecord = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
const MAX_SECONDS = 120

export type VoiceState = 'idle' | 'listening' | 'transcribing'

export interface VoiceInput {
  /** A usable voice path exists (browser recogniser, or recording + server transcription). */
  supported: boolean
  /** Why voice is unavailable, in Persian, when it is. */
  unsupportedReason: string
  state: VoiceState
  listening: boolean
  error: string
  start: () => void
  stop: () => void
}

/**
 * Persian voice input with two independent paths, so it works on every phone:
 *
 *  1. The browser's own recogniser (Web Speech API) — live text as you speak. Available in Chrome on
 *     Android/desktop and Safari; NOT in Chrome/Firefox on iOS and not in some in-app browsers.
 *  2. Record → decode → 16 kHz WAV → `mission-ai` gateway (Gemini audio / OpenAI-compatible transcription).
 *     Works on any browser with a microphone; the text appears a few seconds after you stop.
 *
 * The native path is tried first; if it is missing or fails (offline recogniser, unsupported language,
 * permission quirks) the cloud path takes over automatically. `cloudAvailable` comes from the AI status.
 */
export function useSpeech(onText: (finalChunk: string, interim: string) => void, cloudAvailable: boolean): VoiceInput {
  const [state, setState] = useState<VoiceState>('idle')
  const [error, setError] = useState('')
  const recRef = useRef<SpeechRec | null>(null)
  const mediaRef = useRef<{ rec: MediaRecorder; stream: MediaStream; chunks: Blob[]; timer: number } | null>(null)
  const nativeBroken = useRef(false)
  const gotNativeText = useRef(false)
  const cb = useRef(onText)
  cb.current = onText

  const native = nativeCtor() !== null && !nativeBroken.current
  const cloud = cloudAvailable && canRecord()
  const secure = typeof window === 'undefined' || window.isSecureContext
  const supported = secure && (native || cloud)
  const unsupportedReason = !secure
    ? 'میکروفون فقط روی نشانی امن (https) کار می‌کند.'
    : !native && !canRecord()
      ? 'این مرورگر به میکروفون دسترسی ندارد. از دکمه میکروفون روی صفحه‌کلید گوشی (دیکته) استفاده کنید.'
      : !native && !cloudAvailable
        ? 'تبدیل گفتار این مرورگر پشتیبانی نمی‌شود و سرویس تبدیل صدا فعال نیست. از دکمه میکروفون روی صفحه‌کلید گوشی (دیکته) استفاده کنید.'
        : ''

  const stopMedia = useCallback(() => {
    const m = mediaRef.current
    if (!m) return
    window.clearTimeout(m.timer)
    if (m.rec.state !== 'inactive') m.rec.stop()
  }, [])

  const startCloud = useCallback(async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
      const rec = new MediaRecorder(stream)
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        mediaRef.current = null
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/mp4' })
        if (blob.size < 1500) {
          setState('idle')
          setError('صدایی ضبط نشد؛ دوباره تلاش کنید و نزدیک‌تر به میکروفون صحبت کنید.')
          return
        }
        setState('transcribing')
        let stage = 'decode'
        try {
          const { base64 } = await blobToWavBase64(blob)
          stage = 'transcribe'
          const text = await transcribeViaGateway(base64)
          if (text) cb.current(text, '')
          else setError('صدایی تشخیص داده نشد؛ دوباره تلاش کنید.')
        } catch (e) {
          const why = (e instanceof Error ? e.message : String(e)).slice(0, 240)
          setError(
            stage === 'decode'
              ? `پردازش صدای ضبط‌شده در این مرورگر ممکن نبود (${why}). پاسخ را تایپ کنید.`
              : `تبدیل صدا به متن انجام نشد (${why}). دوباره تلاش کنید یا پاسخ را تایپ کنید.`,
          )
        } finally {
          setState('idle')
        }
      }
      const timer = window.setTimeout(() => rec.state !== 'inactive' && rec.stop(), MAX_SECONDS * 1000)
      mediaRef.current = { rec, stream, chunks, timer }
      rec.start()
      setState('listening')
    } catch (e) {
      setState('idle')
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
      setError(denied ? 'دسترسی به میکروفون مجاز نشد. در تنظیمات مرورگر اجازه میکروفون را فعال کنید.' : 'میکروفون در دسترس نیست.')
    }
  }, [])

  const startNative = useCallback(() => {
    const C = nativeCtor()
    if (!C) return
    setError('')
    gotNativeText.current = false
    const rec = new C()
    rec.lang = 'fa-IR'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      let finalChunk = ''
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalChunk += r[0].transcript
        else interim += r[0].transcript
      }
      if (finalChunk || interim) gotNativeText.current = true
      cb.current(finalChunk, interim)
    }
    rec.onerror = (e) => {
      recRef.current = null
      setState('idle')
      if (e.error === 'not-allowed') {
        setError('دسترسی به میکروفون مجاز نشد. در تنظیمات مرورگر اجازه میکروفون را فعال کنید.')
        return
      }
      if (e.error === 'aborted') return
      // Recogniser unusable here (network, service-not-allowed, language-not-supported, audio-capture…):
      // fall back to recording + server transcription for this and later presses.
      nativeBroken.current = true
      if (cloud) {
        setError('تشخیص گفتار مرورگر کار نکرد؛ در حال استفاده از سرویس تبدیل صدا…')
        void startCloud()
      } else setError(e.error === 'no-speech' ? 'صدایی شنیده نشد؛ دوباره تلاش کنید.' : 'تشخیص گفتار مرورگر کار نکرد. از دیکته صفحه‌کلید گوشی استفاده کنید.')
    }
    rec.onend = () => {
      const heard = gotNativeText.current
      recRef.current = null
      setState((s) => (s === 'listening' ? 'idle' : s))
      // Some mobile browsers start and end instantly without delivering any text: use the cloud path next time.
      if (!heard && cloud) {
        nativeBroken.current = true
        setError('متنی دریافت نشد. دوباره روی میکروفون بزنید؛ این بار از سرویس تبدیل صدا استفاده می‌شود.')
      }
    }
    recRef.current = rec
    try {
      rec.start()
      setState('listening')
    } catch {
      nativeBroken.current = true
      setState('idle')
      if (cloud) void startCloud()
    }
  }, [cloud, startCloud])

  const start = useCallback(() => {
    if (state !== 'idle') return
    if (nativeCtor() && !nativeBroken.current) startNative()
    else if (cloud) void startCloud()
  }, [state, startNative, startCloud, cloud])

  const stop = useCallback(() => {
    recRef.current?.stop()
    stopMedia()
  }, [stopMedia])

  useEffect(
    () => () => {
      recRef.current?.stop()
      const m = mediaRef.current
      if (m) {
        window.clearTimeout(m.timer)
        m.stream.getTracks().forEach((t) => t.stop())
      }
    },
    [],
  )

  return { supported, unsupportedReason, state, listening: state === 'listening', error, start, stop }
}
