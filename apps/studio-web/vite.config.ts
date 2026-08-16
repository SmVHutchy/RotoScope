import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Die Engine laeuft als eigener lokaler Prozess. Der Proxy haelt das Frontend
    // frei von Host-Wissen -- spaeter zeigt derselbe Pfad auf die Tauri-Sidecar.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
