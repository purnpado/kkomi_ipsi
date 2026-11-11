import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import wails from '@wailsio/runtime/plugins/vite'

// Wails v3: wails3 dev 실행 시 FRONTEND 개발 서버 포트(WAILS_VITE_PORT)를 따르고,
// 생성 바인딩(./bindings)을 개발 서버에서도 해석할 수 있게 한다.
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
    strictPort: true,
  },
  plugins: [
    tailwindcss(),
    wails('./bindings'),
  ],
})
