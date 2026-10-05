import { defineConfig } from 'vite';

// GitHub Pages serves the site from /planetarium/.
export default defineConfig({
  base: '/planetarium/',
  build: { target: 'es2022', chunkSizeWarningLimit: 800 }, // three.js alone is ~500 kB
});
