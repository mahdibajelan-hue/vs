import { useCallback, useEffect, useRef, useState } from 'react'

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

function ctor(): SpeechCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Persian speech-to-text through the browser's own recogniser (no audio leaves the app for a vendor we
 * control). `onText(finalText, interimText)` fires continuously while listening. Where the browser has
 * none (Firefox, some in-app webviews) `supported` is false and the UI falls back to typing — phone
 * keyboards' built-in dictation still works in the text box.
 */
export function useSpeech(onText: (finalChunk: string, interim: string) => void) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const recRef = useRef<SpeechRec | null>(null)
  const cb = useRef(onText)
  cb.current = onText
  const supported = ctor() !== null

  const stop = useCallback(() => {
    recRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const C = ctor()
    if (!C) return
    setError('')
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
      cb.current(finalChunk, interim)
    }
    rec.onerror = (e) => {
      setError(e.error === 'not-allowed' ? 'دسترسی به میکروفون مجاز نشد.' : e.error === 'no-speech' ? 'صدایی شنیده نشد.' : 'تشخیص گفتار متوقف شد.')
      setListening(false)
    }
    rec.onend = () => {
      setListening(false)
      recRef.current = null
    }
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }, [])

  useEffect(() => () => recRef.current?.stop(), [])
  return { supported, listening, error, start, stop }
}
