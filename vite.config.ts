import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 相对路径：dist 可以直接双击 index.html 打开，也方便部署到任意子目录
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5273,
    // 固定端口：tauri dev 的 devUrl 指向这里，端口漂移会连不上
    strictPort: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
})
