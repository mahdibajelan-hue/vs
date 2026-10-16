/** Code 39 barcode (read by every handheld scanner and phone reader): letters A–Z, digits and - . space $ / + %. Pure functions; the SVG is drawn by the card. */
const P: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn',
  '*': 'nwnnwnwnn', $: 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn',
}
export const code39Supported = (text: string) => text.length > 0 && text.length <= 24 && [...text.toUpperCase()].every((c) => c !== '*' && c in P)
/** run lengths (in narrow-module units, wide = 3) alternating bar, space, bar … for `*TEXT*`; null when a character cannot be encoded */
export function code39Runs(text: string): number[] | null {
  const t = text.toUpperCase()
  if (!code39Supported(t)) return null
  const runs: number[] = []
  ;[...`*${t}*`].forEach((ch, i) => { if (i) runs.push(1); for (const e of P[ch]) runs.push(e === 'w' ? 3 : 1) })
  return runs
}
/** the same as a 0/1 module string (1 = bar) — handy for tests */
export function code39Modules(text: string): string | null {
  const r = code39Runs(text); if (!r) return null
  return r.map((n, i) => (i % 2 === 0 ? '1' : '0').repeat(n)).join('')
}
