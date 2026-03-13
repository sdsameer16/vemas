import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const normalizeProxyTarget = (rawValue) => {
  const value = String(rawValue || '').trim()

  if (!value) return 'http://localhost:5000'

  // Support non-standard value: localhost://5000
  if (/^localhost:\/\//i.test(value)) {
    return value
      .replace(/^localhost:\/\//i, 'http://localhost:')
      .replace(/\/api\/?$/, '')
  }

  if (/^https?:\/\//i.test(value)) {
    return value.replace(/\/api\/?$/, '')
  }

  if (/^localhost(:\d+)?$/i.test(value)) {
    return `http://${value}`
  }

  return `http://${value.replace(/\/api\/?$/, '')}`
}

const proxySource = process.env.VITE_API_PROXY_TARGET || process.env.VITE_API_URL || 'http://localhost:5000/api'
const proxyTarget = normalizeProxyTarget(proxySource)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
})
