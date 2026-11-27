import { useEffect, useRef, useState } from 'react'

/**
 * The address bar as a picture of where the user is: module → tab → sub-view, plus the project (p), an open
 * record (r) and how the module was opened (w = project | portfolio). Every page gets its own address, so the
 * browser's back / forward buttons move between screens, a refresh stays put and a copied link opens the same page.
 *
 *   server (base "/", Caddy/nginx send every path to index.html):  /execution/review?p=<project>&r=<report>
 *   GitHub Pages and plain file hosts (no rewrites):                 /vs/#/execution/review?p=<project>&r=<report>
 *
 * This file only knows the address. The module shell (module store, project context) is plugged in by
 * lib/urlNav.ts, and the in-module state by `useUrlBind` / `useRemembered(…, url)`, so nothing here imports a store.
 */
export type UrlKind = 'tab' | 'sub' | 'p' | 'r'
export interface Loc { module: string | null; radar: boolean; tab: string; sub: string; p: string; r: string; w: string }
const EMPTY: Loc = { module: null, radar: false, tab: '', sub: '', p: '', r: '', w: '' }
const OWN = ['p', 'r', 'w']

let BASE: string = import.meta.env?.BASE_URL || '/'
/** clean paths need the server to answer every path with index.html — true for the root build (server, dev), not for /vs/ or ./ */
let PATH_MODE = BASE === '/'
export const usesPaths = () => PATH_MODE
/** tests only: pretend the app was built for another base */
export function setBaseForTests(b: string) { BASE = b; PATH_MODE = b === '/' }

/** an auth redirect (magic link, password reset) carries its tokens in the address: leave it alone until supabase has read it */
export function authInUrl(l: { hash: string; search: string } = location): boolean {
  return /(^|[#&?])(access_token|refresh_token|error_description|error_code)=/.test(l.hash) || /[?&](code|token_hash)=/.test(l.search) || /type=(recovery|signup|invite|magiclink)/.test(l.hash + l.search)
}

let moduleOk: (m: string) => boolean = () => false
export const setModuleCheck = (f: (m: string) => boolean) => { moduleOk = f }

/** read an address (defaults to the current one) */
export function parseLoc(l: { pathname: string; search: string; hash: string } = location): Loc {
  let path: string, query: string
  if (PATH_MODE) { path = l.pathname.slice(BASE.length - 1); query = l.search }
  else { const h = l.hash.replace(/^#/, ''); const i = h.indexOf('?'); path = i < 0 ? h : h.slice(0, i); query = i < 0 ? '' : h.slice(i) }
  if (!path.startsWith('/')) return { ...EMPTY }
  const seg = path.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s) } catch { return s } })
  const q = new URLSearchParams(query)
  if (seg[0] === 'radar') return { ...EMPTY, radar: true }
  if (!seg[0] || !moduleOk(seg[0])) return { ...EMPTY }
  return { module: seg[0], radar: false, tab: seg[1] ?? '', sub: seg[2] ?? '', p: q.get('p') ?? '', r: q.get('r') ?? '', w: q.get('w') ?? '' }
}

/** whether the address names no place (the bare address, or a path from an old link): then the tab's session decides */
export const locIsBare = (l: { pathname: string; search: string; hash: string } = location) => { const x = parseLoc(l); return !x.module && !x.radar }

/** the address for a place, keeping any query the app does not own (a candidate link, an auth code) */
export function buildRel(x: Loc, l: { pathname: string; search: string; hash: string } = location): string {
  const seg = !x.module ? (x.radar ? ['radar'] : []) : [x.module, ...(x.tab ? [x.tab, ...(x.sub ? [x.sub] : [])] : [])]
  const path = '/' + seg.map(encodeURIComponent).join('/')
  const own = new URLSearchParams()
  if (x.module) { if (x.p) own.set('p', x.p); if (x.r) own.set('r', x.r); if (x.w) own.set('w', x.w) }
  const qs = own.toString()
  if (PATH_MODE) {
    const keep = new URLSearchParams(l.search); for (const k of OWN) keep.delete(k)
    const all = [keep.toString(), qs].filter(Boolean).join('&')
    return BASE.slice(0, -1) + path + (all ? `?${all}` : '') + l.hash
  }
  return l.pathname + l.search + (seg.length ? `#${path}${qs ? `?${qs}` : ''}` : '')
}

/* ── the module the remembered state belongs to (set by the module store) ─────────────────────── */
let currentModule = 'hub'
export const getNavModule = () => currentModule
export const setNavModule = (m: string | null) => { currentModule = m ?? 'hub' }
/**
 * Whether the address describes the screen being built: true after a page load and after back / forward, false from
 * the user's next click or key press (from then on the screen moves ahead of the address until the next write).
 * Screens that mount later — a module whose code is still downloading, a page waiting for its data — still read it.
 */
let fresh = true
export const invalidateUrl = () => { fresh = false }

/**
 * The value the address holds for this slot of the module that is mounting: a string, null when the address
 * names this module but not this slot, undefined when the address is about something else (then the remembered
 * value or the default applies). For `r` an absent value means "nothing open".
 */
export function urlInit(kind: UrlKind): string | null | undefined {
  if (!fresh || authInUrl()) return undefined
  const x = parseLoc()
  if (!x.module || x.module !== currentModule) return undefined
  const v = x[kind]
  return v ? v : kind === 'r' ? null : undefined
}

/* ── bindings: in-module state that is part of the address ─────────────────────────────────────── */
type Bind = { kind: UrlKind; value: string; apply: (v: string | null, loc: Loc) => void }
const binds = new Map<number, Bind>()
let seq = 0
export function bindValue(kind: UrlKind): string {
  let v = ''
  for (const b of binds.values()) if (b.kind === kind && b.value) v = b.value // the innermost (last mounted) wins
  return v
}

/**
 * Put a piece of state in the address. `value` is what the address shows ('' = nothing); `apply` sets the state
 * back when the user goes back / forward to an address with a different value (null = the address has none).
 */
export function useUrlBind(kind: UrlKind | null, value: string | null | undefined, apply: (v: string | null, loc: Loc) => void) {
  const [id] = useState(() => ++seq)
  const ref = useRef(apply)
  useEffect(() => { ref.current = apply })
  const v = value ?? ''
  useEffect(() => { if (!kind) return; binds.set(id, { kind, value: v, apply: (x, l) => ref.current(x, l) }); schedule() }, [id, kind, v])
  useEffect(() => () => { if (binds.delete(id)) schedule() }, [id])
}
const bound = (kind: UrlKind) => { for (const b of binds.values()) if (b.kind === kind) return true; return false }

/* ── leaving a screen with unsaved work ─────────────────────────────────────────────────────── */
const guards = new Map<number, string>()
/** while `active`, the browser's back button and a refresh ask before leaving (message shown in the confirm) */
export function useLeaveGuard(active: boolean, message: string) {
  const [id] = useState(() => ++seq)
  useEffect(() => { if (!active) return; guards.set(id, message); return () => { guards.delete(id) } }, [id, active, message])
}
const guardMessage = () => [...guards.values()].pop()

/* ── the shell (module, radar, workspace) — provided by urlNav.ts ──────────────────────────────── */
export interface Shell { read: () => Pick<Loc, 'module' | 'radar' | 'w'> & { ctxProject: string }; apply: (x: Loc) => void }
let shell: Shell | null = null

/** the address the current state should have */
export function currentTarget(): Loc {
  if (!shell) return { ...EMPTY }
  const s = shell.read()
  if (!s.module) return { ...EMPTY, radar: s.radar }
  // while the address still describes the screen being built, a part whose screen has not mounted yet (a page
  // waiting for its data) keeps its value instead of being dropped before that screen can read it
  const here = fresh ? parseLoc() : null
  const keep = (k: UrlKind) => (here && here.module === s.module && !bound(k) ? here[k] : '')
  const tab = bindValue('tab') || keep('tab')
  return { module: s.module, radar: false, tab, sub: tab ? bindValue('sub') || keep('sub') : '', p: bindValue('p') || keep('p') || (s.w === 'project' ? s.ctxProject : ''), r: bindValue('r') || keep('r'), w: s.w }
}

/* A change the user caused (a click or key press just before it) gets its own history entry; a change the app
   made by itself (a module filling in its first tab after loading, a default project picked once the list
   arrives) replaces the current entry — otherwise «back» would land on a half-built address and bounce. */
let inputAt = -1e9, writtenAt = 0, timer: ReturnType<typeof setTimeout> | null = null, applying = false
let lastRel = ''
export function schedule() { if (!shell || timer) return; timer = setTimeout(flush, 0) }
export function flush() {
  timer = null
  if (!shell || applying || authInUrl()) return
  const rel = buildRel(currentTarget())
  const cur = location.pathname + location.search + location.hash
  if (rel === cur) { lastRel = cur; return }
  const now = performance.now()
  const user = inputAt > writtenAt && now - inputAt < 1200
  try { if (user) history.pushState(null, '', rel); else history.replaceState(history.state, '', rel) } catch { /* sandboxed frame: the address just won't follow */ }
  writtenAt = now; lastRel = rel
}

function onPop() {
  if (authInUrl()) return
  const msg = guardMessage()
  if (msg && !window.confirm(msg)) { try { history.pushState(null, '', lastRel) } catch { /* ignore */ } return }
  const x = parseLoc()
  fresh = true
  applying = true
  try {
    shell!.apply(x)
    if (x.module && x.module === shell!.read().module) for (const b of binds.values()) {
      const v = x[b.kind] || null
      if (v !== (b.value || null) && (v !== null || b.kind === 'r' || b.kind === 'sub')) b.apply(v, x)
    }
  } finally { applying = false }
  writtenAt = performance.now(); lastRel = location.pathname + location.search + location.hash
  schedule() // values the restored screen corrects (a tab that no longer exists) replace this entry
}

/** go to a place as if its address had just been opened (a link opened before signing in) */
export function openPlace(x: Loc) {
  if (!shell) return
  try { history.replaceState(history.state, '', buildRel(x)) } catch { /* ignore */ }
  fresh = true
  shell.apply(x)
  lastRel = location.pathname + location.search + location.hash
  schedule()
}

/** wire the address to the app once, before the first render */
export function installUrlState(s: Shell) {
  if (shell) return
  shell = s
  const mark = () => { inputAt = performance.now(); fresh = false }
  window.addEventListener('pointerdown', mark, true)
  window.addEventListener('keydown', mark, true)
  window.addEventListener('popstate', onPop)
  window.addEventListener('beforeunload', (e) => { if (guardMessage()) { e.preventDefault(); e.returnValue = '' } })
  lastRel = location.pathname + location.search + location.hash
  writtenAt = performance.now()
}
