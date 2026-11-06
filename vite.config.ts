import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {VitePWA} from 'vite-plugin-pwa';

// The two hosting models share the same application and data format.
// GitHub Pages remains the default for the existing CI/deployment workflow.
export default defineConfig(({mode})=>{
  const base=mode==='ubuntu'?'/':'/examprep-engine/';
  return {
    plugins:[
      react(),
      VitePWA({
        registerType:'prompt',
        includeAssets:['favicon.svg'],
        manifest:{
          id:base,
          name:'ExamPrep Engine',
          short_name:'ExamPrep',
          description:'Secure personal exam preparation with locally imported question banks',
          start_url:base,
          scope:base,
          display:'standalone',
          background_color:'#0b1020',
          theme_color:'#111827',
          icons:[{src:base+'favicon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]
        },
        workbox:{
          globPatterns:['**/*.{js,css,html,svg,webmanifest}'],
          navigateFallback:base+'index.html',
          cleanupOutdatedCaches:true,
          clientsClaim:false,
          skipWaiting:false,
          runtimeCaching:[]
        }
      })
    ],
    base,
    build:{outDir:mode==='ubuntu'?'dist-ubuntu':'dist',sourcemap:false}
  };
});
