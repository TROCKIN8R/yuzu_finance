import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '')
  // CI sets VITE_BASE_PATH in process.env; loadEnv only reads .env files.
  const base = process.env.VITE_BASE_PATH || fileEnv.VITE_BASE_PATH || '/'
  return {
    plugins: [react(), tailwindcss()],
    // GitHub project pages: https://user.github.io/repo-name/
    base,
  }
})
