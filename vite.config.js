import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

import tailwindConfig from './tailwind.config.js'

// PostCSS lives here so the Tailwind config is a Vite config dependency and the
// dev server restarts when it changes.
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built page also loads from file:// in Electron.
  base: './',
  css: { postcss: { plugins: [tailwindcss(tailwindConfig), autoprefixer()] } },
  // 5173 is the licence dashboard, so the demo product sits alongside it.
  server: { port: 5174 },
})
