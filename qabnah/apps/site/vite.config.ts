import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5175, strictPort: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 800 },
});
