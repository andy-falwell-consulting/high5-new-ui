import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const fmpHost = env.VITE_FMP_HOST || 'https://ILELLCO.pcifmhosting.com'

  return {
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [react()],
    server: {
      port: process.env.PORT ? parseInt(process.env.PORT) : undefined,
      proxy: {
        '/fmi': { target: fmpHost, changeOrigin: true, secure: true },
        '/Streaming_SSL': { target: fmpHost, changeOrigin: true, secure: true },
      },
    },
  }
})
