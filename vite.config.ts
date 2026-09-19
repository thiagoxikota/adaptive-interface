import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { insightServer } from './server/insight.ts'

// https://vite.dev/config/
export default defineConfig({
  build: { chunkSizeWarningLimit: 700 },
  plugins: [react(), insightServer()],
})
