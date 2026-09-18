import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { insightServer } from './src/insight/server.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), insightServer()],
})
