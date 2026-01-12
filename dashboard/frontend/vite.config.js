import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __INCLUDE_LICENSE_GENERATOR__: JSON.stringify(
      process.env.VITE_INCLUDE_LICENSE_GENERATOR === 'true'
    ),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
  },
})
