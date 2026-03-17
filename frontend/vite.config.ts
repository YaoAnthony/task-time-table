import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // if we need deploy to github pages, we need to set base to '/xxxx/'
  server: {
    port: 7777,
    allowedHosts: ['a.h.g191919.com'],
    proxy: {
      '/api': {
        target: 'http://localhost:7778',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
