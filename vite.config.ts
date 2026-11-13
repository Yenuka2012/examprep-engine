import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {VitePWA} from 'vite-plugin-pwa';
export default defineConfig(({mode})=>{
  const mixedCandidateBase = mode==='mixed-cutover' ? '/examprep-candidate/' : '/examprep-engine/';
  return {
  plugins:[
    react(),
    VitePWA({
      registerType:'prompt',
      includeAssets:['favicon.svg'],
      manifest:{
        id:mixedCandidateBase,
        name:'ExamPrep Engine',
        short_name:'ExamPrep',
        description:'Secure personal exam preparation with locally imported question banks',
        start_url:mixedCandidateBase,
        scope:mixedCandidateBase,
        display:'standalone',
        background_color:'#0b1020',
        theme_color:'#111827',
        icons:[{src:mixedCandidateBase+'favicon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]
      },
      workbox:{
        globPatterns:['**/*.{js,css,html,svg,webmanifest}'],
        navigateFallback:mixedCandidateBase+'index.html',
        cleanupOutdatedCaches:true,
        clientsClaim:false,
        skipWaiting:false,
        runtimeCaching:[]
      }
    })
  ],
  base:mixedCandidateBase,
  build:{outDir:'dist',sourcemap:false}
};
});
