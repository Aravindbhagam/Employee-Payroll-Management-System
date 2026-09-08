import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Set VITE_BASE_PATH="/<repo-name>/" when building for a GitHub Pages
  // project site (see .github/workflows/deploy-pages.yml). Defaults to "/"
  // for local dev and any host that serves the app from its domain root.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
