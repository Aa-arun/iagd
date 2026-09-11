import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 新前端（React）。与旧前端 WebUI/（Preact）完全隔离——
// 两者不能同项目共存：@preact/preset-vite 会把 react 别名到 preact/compat。
//
// /api 与 /img 代理到 tools/devapi（真实游戏数据），浏览器里是同源请求、不需要 CORS。
// 将来换成 C# 后端时，只需改这个 target。
//
// 默认指向**只读**服务（读原库，日常开发用）。
// 要验证转移这类**写操作**时，把它指向沙盒写服务：
//     IAGD_API_TARGET=http://127.0.0.1:42501 npm run dev
const API_TARGET = process.env.IAGD_API_TARGET ?? 'http://127.0.0.1:42500';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'build',
  },
  server: {
    port: 3000,
    proxy: {
      '/api': API_TARGET,
      '/img': API_TARGET,
    },
  },
});
