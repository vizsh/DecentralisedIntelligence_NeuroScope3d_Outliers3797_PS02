import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Two real HTML entries, not one: index.html is the static Tumor Lens landing
// page (plain HTML/CSS/JS, no React), app.html is where the actual NeuroScope 3D
// React SPA mounts. The landing page's own CTAs link to /app.html. Both need
// listing here so `vite build` emits app.html's bundle too — without this,
// `npm run build` only produces index.html's output and the "Launch Prototype"
// link would 404 in a production build (dev mode doesn't need this: Vite's dev
// server resolves any .html file's own script graph on request).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
      },
    },
  },
})
