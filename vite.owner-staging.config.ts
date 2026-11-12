import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dedicated HTTPS staging ARTIFACT ONLY. Separate output directory, never
 * included in GitHub Pages dist/ deployment, with no service worker.
 * The preview requires a configured distinct HTTPS hostname.
 */
export default defineConfig({
  plugins:[react()],
  base:'/',
  build:{
    outDir:'dist-owner-staging',
    sourcemap:false,
    rollupOptions:{input:['owner-staging.html']}
  }
});
