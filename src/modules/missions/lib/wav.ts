/**
 * Browser audio → 16 kHz mono 16-bit PCM WAV.
 *
 * MediaRecorder produces WebM/Opus on Chrome/Android and MP4/AAC on Safari/iOS — formats a transcription
 * model does not reliably accept. Decoding with Web Audio and re-encoding as plain WAV works on every
 * browser and is accepted by every speech model, at ~32 KB per second of speech.
 */
export const WAV_RATE = 16000

export function encodeWav(samples: Float32Array, sampleRate = WAV_RATE): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  let o = 44
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buf
}

/** Linear-interpolation resample of a mono channel. */
export function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input
  const ratio = from / to
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, input.length - 1)
    out[i] = input[i0] + (input[i1] - input[i0]) * (pos - i0)
  }
  return out
}

/** Decodes a recorded Blob to a 16 kHz mono WAV, base64-encoded for the gateway. */
export async function blobToWavBase64(blob: Blob): Promise<{ base64: string; seconds: number }> {
  const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
  const ctx = new Ctx()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    // Mix down to mono.
    const mono = new Float32Array(decoded.length)
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const ch = decoded.getChannelData(c)
      for (let i = 0; i < mono.length; i++) mono[i] += ch[i] / decoded.numberOfChannels
    }
    const wav = encodeWav(resample(mono, decoded.sampleRate, WAV_RATE))
    const bytes = new Uint8Array(wav)
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return { base64: btoa(bin), seconds: decoded.duration }
  } finally {
    void ctx.close()
  }
}
