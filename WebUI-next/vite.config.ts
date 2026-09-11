import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 新前端（React）。与旧前端 WebUI/（Preact）完全隔离——
// 两者不能同项目共存：@preact/preset-vite 会把 react 别名到 preact/compat。
//
// /api 与 /img 代理到 tools/devapi 的只读数据服务（真实游戏数据）。
// 这样浏览器里是同源请求，不需要 CORS；将来换成 C# 后端时只改这里的 target。
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'build',
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://127.0.0.1:42500',
      '/img': 'http://127.0.0.1:42500',
    },
  },
});
