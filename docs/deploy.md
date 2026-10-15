# Deployment (GitHub Pages)

- Workflow: `.github/workflows/deploy-pages.yml` builds with `GH_PAGES=true` (base `/vs/`) on every push to `claude/piping-isometric-tracker-x8y5i1` and publishes `dist/` to the `gh-pages` branch.
- Pages setting: Settings → Pages → Deploy from a branch → `gh-pages` / `(root)`. Live URL: `https://mahdibajelan-hue.github.io/vs/` (trailing `/vs/` is required).
- Required repository secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable key only — never a service-role key).
- GitHub Pages needs a public repo on the free plan. Keep the repo private and host elsewhere (Cloudflare Pages / Netlify / Vercel, build `npm run build`, output `dist`, **no** `GH_PAGES` variable) if the code or history must not be public.

## Custom domain (not enabled)
Do not add a `CNAME` file or set a custom domain in Pages until DNS exists, otherwise GitHub issues a permanent 301 to the domain and browsers cache it (this happened with `farin-pmis.com`: users saw "server IP address could not be found" until they cleared site data).
1. DNS: four `A` records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`; `CNAME` `www` → `mahdibajelan-hue.github.io`.
2. Settings → Pages → Custom domain → enable "Enforce HTTPS".
3. Build with base `/` for a domain root (not `/vs/`), and ship `public/CNAME` so each deploy keeps it.

## Incident follow-up (2026-10)
History scan: only the commit `36dd3da` (project-data backup, formerly on the deleted `data-backups` branch) is sensitive. Ask GitHub Support to purge cached/unreachable commits and check forks; no keys/secrets were found in history. Restrict the Cesium ion token to the site's domain.
