import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {VitePWA} from 'vite-plugin-pwa';
export default defineConfig({
  plugins:[
    react(),
    VitePWA({
      registerType:'autoUpdate',
      includeAssets:['favicon.svg'],
      manifest:{
        id:'/examprep-engine/',
        name:'ExamPrep Engine',
        short_name:'ExamPrep',
        description:'Secure personal exam preparation with locally imported question banks',
        start_url:'/examprep-engine/',
        scope:'/examprep-engine/',
        display:'standalone',
        background_color:'#0b1020',
        theme_color:'#111827',
        icons:[{src:'/examprep-engine/favicon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]
      },
      workbox:{
        globPatterns:['**/*.{js,css,html,svg,webmanifest}'],
        navigateFallback:'/examprep-engine/index.html',
        cleanupOutdatedCaches:true,
        runtimeCaching:[]
      }
    })
  ],
  base:'/examprep-engine/',
  build:{outDir:'dist',sourcemap:false}
});
