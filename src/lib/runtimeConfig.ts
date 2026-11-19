/**
 * Where the app finds its database. A server that hosts the app writes `config.js` beside index.html
 * (window.__FARIN_CONFIG__ = { supabaseUrl, supabaseAnonKey }) when it installs the files, so one build serves any server;
 * a build made with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (GitHub Pages) still works without it.
 */
interface FarinConfig { supabaseUrl?: string; supabaseAnonKey?: string }
const cfg: FarinConfig = (typeof window !== 'undefined' && (window as unknown as { __FARIN_CONFIG__?: FarinConfig }).__FARIN_CONFIG__) || {}
export const SUPABASE_URL: string | undefined = cfg.supabaseUrl || (import.meta.env.VITE_SUPABASE_URL as string | undefined) || undefined
export const SUPABASE_ANON_KEY: string | undefined = cfg.supabaseAnonKey || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || undefined
