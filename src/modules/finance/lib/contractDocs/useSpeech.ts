import { useCallback, useEffect, useRef, useState } from 'react'

/** Persian dictation with the browser's own speech recognition (Chrome / Edge / Safari). The audio is processed by the browser vendor's service, not by FARIN. */
interface Rec { lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number; start: () => void; stop: () => void; abort: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null }
const Ctor = (): (new () => Rec) | null => { const w = globalThis as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }; return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null }

export function useSpeech(onFinal: (text: string) => void) {
  const supported = typeof window !== 'undefined' && !!Ctor()
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')
  const rec = useRef<Rec | null>(null)
  const finalCb = useRef(onFinal); finalCb.current = onFinal
  useEffect(() => () => rec.current?.abort(), [])
  const start = useCallback(() => {
    const C = Ctor(); if (!C) return
    setError(''); setInterim('')
    const r = new C(); rec.current = r
    r.lang = 'fa-IR'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1
    let finalText = ''
    r.onresult = (e) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) { const res = e.results[i]; if (res.isFinal) finalText += res[0].transcript; else live += res[0].transcript }
      setInterim((finalText + ' ' + live).trim())
    }
    r.onerror = (e) => setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'اجازهٔ میکروفون داده نشده است.' : e.error === 'no-speech' ? 'صدایی شنیده نشد؛ دوباره امتحان کنید.' : e.error === 'network' ? 'سرویس تشخیص گفتار مرورگر در دسترس نیست (اتصال اینترنت).' : 'تشخیص گفتار متوقف شد.')
    r.onend = () => { setListening(false); const t = finalText.trim(); if (t) finalCb.current(t); setInterim('') }
    try { r.start(); setListening(true) } catch { setError('شروع ضبط ممکن نشد.') }
  }, [])
  const stop = useCallback(() => { rec.current?.stop() }, [])
  return { supported, listening, interim, error, start, stop }
}
