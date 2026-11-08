import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

/**
 * This separate build is ONLY for synthetic CI regression testing.
 * It has no PWA or production deployment action. NEVER deploy dist-vault-test.
 */
export default defineConfig({
  plugins:[react()],
  base:'/',
  build:{
    outDir:'dist-vault-test',
    sourcemap:false,
    rollupOptions:{input:['vault-harness.html','offline-converter.html']}
  },
  preview:{host:'127.0.0.1',port:4174,strictPort:true}
});
