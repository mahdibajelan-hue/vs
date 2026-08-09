/**
 * Bigram Dice coefficient — cheap, script-agnostic string similarity (works fine on Persian
 * and English project names alike) used only to SUGGEST a possible match between a source
 * project name and a master project name. Never used to auto-merge — see spec section 31,
 * "the system must NOT automatically merge them" — an admin always confirms or rejects.
 */
export function similarityScore(a: string, b: string): number {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return 0
  if (na === nb) return 100
  const bigramsA = bigrams(na)
  const bigramsB = bigrams(nb)
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0
  let intersection = 0
  for (const bg of bigramsA) if (bigramsB.has(bg)) intersection++
  const dice = (2 * intersection) / (bigramsA.size + bigramsB.size)
  return Math.round(dice * 100)
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْ]/g, '') // strip Arabic/Persian diacritics
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>()
  const collapsed = s.replace(/ /g, '')
  for (let i = 0; i < collapsed.length - 1; i++) out.add(collapsed.slice(i, i + 2))
  return out
}
