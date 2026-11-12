import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dedicated HTTPS staging ARTIFACT ONLY. Separate output directory, never
 * included in GitHub Pages dist/ deployment, with no service worker.
 * The preview requires a configured distinct HTTPS hostname.
 */
export default defineConfig(()=>{
  // Refuse accidental unconfigured builds. The runtime independently checks
  // both the expected and actual HTTPS origin before mounting any vault UI.
  if(!process.env.VITE_OWNER_STAGING_ORIGIN){
    throw new Error('VITE_OWNER_STAGING_ORIGIN is required for the isolated HTTPS staging build');
  }
  return {
  plugins:[react()],
  base:'/',
  build:{
    outDir:'dist-owner-staging',
    sourcemap:false,
    rollupOptions:{input:['owner-staging.html']}
  }
  };
});
