import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// /api calls are forwarded to the ASP.NET backend during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:5080',
    },
  },
})
