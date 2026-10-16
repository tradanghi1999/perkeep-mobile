import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    host: true,
    port: 5173
  },
  // Chỉ dùng khi test local: proxy sang Perkeep để tránh CORS (Perkeep không gửi CORS header).
  // APK không dùng phần này.
  preview: {
    host: true,
    port: 4173,
    proxy: {
      '/pk': {
        target: 'http://localhost:3179',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/pk/, '')
      }
    }
  }
});
