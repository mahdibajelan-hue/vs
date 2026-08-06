import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves this repo under /vs/ (a project site, not a username.github.io root site).
  base: process.env.GH_PAGES ? '/vs/' : '/',
  plugins: [react(), tailwindcss()],
})
