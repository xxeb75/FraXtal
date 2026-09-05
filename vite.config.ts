import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Tauri-recommended tweaks: don't let Vite's watcher trip over cargo's
// target/ output (Windows throws EBUSY on the build-script exes there),
// and keep the fixed dev port Tauri expects.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
})
