import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {VitePWA} from 'vite-plugin-pwa';

/**
 * Separate encrypted-owner HTTPS PWA staging ARTIFACT ONLY.
 * No production github.io deploy, no owner content in build or service worker.
 */
export default defineConfig(()=>{
  // This is a PUBLIC expected origin, not a secret. Actual hostname/TLS and
  // owner control still require independent verification before any staging.
  if(!process.env.VITE_OWNER_STAGING_ORIGIN){
    throw new Error('VITE_OWNER_STAGING_ORIGIN required for HTTPS staging build');
  }
  return {
    plugins:[
      react(),
      VitePWA({
        strategies:'injectManifest',
        srcDir:'src/vault',
        filename:'ownerStagingSw.js',
        injectRegister:false,
        registerType:'prompt',
        // Manifest icons are precached explicitly through the restricted
        // glob allowlist below; do not auto-add duplicates.
        includeAssets:[],
        includeManifestIcons:false,
        manifest:{
          id:'/owner-staging.html',
          name:'ExamPrep Engine — Encrypted Owner Staging',
          short_name:'ExamPrep Owner',
          description:'Owner-only encrypted offline examination practice (staging)',
          start_url:'/owner-staging.html',
          scope:'/',
          display:'standalone',
          background_color:'#0c1524',
          theme_color:'#18283d',
          icons:[{src:'/favicon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]
        },
        injectManifest:{
          // Do not scan everything! Only compiled static shell resources are
          // permitted in CacheStorage, never imports or user-owned data.
          globPatterns:[
            'owner-staging.html',
            'assets/**/*.{js,css,svg}',
            'favicon.svg',
            'manifest.webmanifest'
          ],
          maximumFileSizeToCacheInBytes:5*1024*1024
        }
      })
    ],
    base:'/',
    build:{
      outDir:'dist-owner-staging',
      sourcemap:false,
      rollupOptions:{input:['owner-staging.html']}
    }
  };
});
