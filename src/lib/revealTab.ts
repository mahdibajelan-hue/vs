/**
 * Bring the selected tab into view inside its own horizontal tab strip — and only there.
 *
 * `element.scrollIntoView({ inline: 'center' })` scrolls EVERY scrollable ancestor, including
 * module roots with `overflow: hidden` (those are still scrollable from script). On a phone,
 * picking the last tab (e.g. «گزارش و تنظیمات») therefore slid the whole module sideways,
 * leaving a dark strip on one side, a cut-off header and a body that no longer scrolled.
 * This helper moves the strip alone, using physical coordinates so it is correct in RTL too.
 */
export function revealTab(selector: string): void {
  const tab = document.querySelector<HTMLElement>(selector)
  if (!tab) return
  // The strip is the nearest ancestor that is a real horizontal scroller (overflow-x auto/scroll),
  // never an overflow:hidden layout box and never the page itself.
  let strip = tab.parentElement
  while (strip && strip !== document.body && !/(auto|scroll)/.test(getComputedStyle(strip).overflowX)) strip = strip.parentElement
  if (!strip || strip === document.body || strip.scrollWidth <= strip.clientWidth) return
  const t = tab.getBoundingClientRect()
  const s = strip.getBoundingClientRect()
  const delta = t.left + t.width / 2 - (s.left + s.width / 2)
  if (Math.abs(delta) > 1) strip.scrollBy({ left: delta })
}

/** Scroll the module body back to the top without touching any other container. */
export function resetModuleScroll(id = 'im-main'): void {
  document.getElementById(id)?.scrollTo({ top: 0 })
}
