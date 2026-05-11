import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/transaction': {
        target: 'http://localhost:8083',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:8083',
        changeOrigin: true,
      },
    },
  },
})
