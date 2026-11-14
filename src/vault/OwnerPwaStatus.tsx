/**
 * HTTPS staging only. Does not call updateSW(), skipWaiting(), clientsClaim()
 * or reload the page. Waiting workers activate naturally after tab closure.
 */
import {useEffect,useState} from 'react';
import {registerSW} from 'virtual:pwa-register';
import {waitingUpdateAdvice,waitingUpdateMessage,type OwnerPwaSafety} from './ownerPwaPolicy';

export default function OwnerPwaStatus({security}:{security:OwnerPwaSafety}){
  const [waiting,setWaiting]=useState(false);
  const [offlineReady,setOfflineReady]=useState(false);
  const [error,setError]=useState(false);
  useEffect(()=>{
    if(!('serviceWorker' in navigator)){
      setError(true);return;
    }
    // Do NOT hold updateSW callback: no owner UI code may force a waiting
    // worker to take over while an exam or encrypted write is in flight.
    registerSW({
      immediate:true,
      onNeedRefresh(){setWaiting(true);},
      onOfflineReady(){setOfflineReady(true);},
      onRegisterError(){setError(true);}
    });
  },[]);
  return <aside className="owner-pwa-status" aria-label="Offline owner app status">
    {error&&<p role="status">Offline installation unavailable. Keep an encrypted backup;
      this browser requires a supported service-worker environment.</p>}
    {offlineReady&&<p role="status">Encrypted owner application shell is cached for
      later offline use. Question data and credentials are NOT cached by the service worker.</p>}
    {waiting&&<p role="status">{waitingUpdateMessage(waitingUpdateAdvice(security))}</p>}
  </aside>;
}
