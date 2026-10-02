import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        // Keep lesson catalogs and stable runtimes reusable across UI updates.
        manualChunks(id) {
          if (id.endsWith('/src/data/hanzi.json')) return 'lessons-hanzi';
          if (id.endsWith('/src/data/poems.json')) return 'lessons-poems';
          if (id.includes('/node_modules/pinyin-pro/')) return 'pinyin';
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
        },
      },
    },
  },
});
