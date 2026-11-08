import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
/**
 * REVIEW TEST BUILD ONLY, not connected to GitHub Pages deployment.
 * A production host requires independently reviewed distinct HTTPS origin
 * and a separately authorized, explicit expected-origin configuration.
 */
export default defineConfig({
  plugins:[react()],
  base:'/',
  build:{outDir:'dist-encrypted-prototype',sourcemap:false,
    rollupOptions:{input:'encrypted-owner.html'}},
  preview:{host:'127.0.0.1',port:4175,strictPort:true}
});
