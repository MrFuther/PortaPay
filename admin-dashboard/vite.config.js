import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    host: true, // atau isi dengan '0.0.0.0'
    port: 5173, // sesuaikan port Anda
  },
})
