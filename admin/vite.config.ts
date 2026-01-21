import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Allow importing from web app for shared code
      '@/web': path.resolve(__dirname, '../web/src'),
    }
  },
  server: {
    port: 5174,
    host: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})

