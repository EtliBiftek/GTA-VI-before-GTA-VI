import { defineConfig } from 'vite';

// Relative base so the same build works in browser, Electron (file://) and Capacitor.
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
  server: { host: true },
});
