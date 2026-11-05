import {useEffect,useState} from 'react';
import {db} from './db';
import {ExamLock} from './examLock';
import {registerSW} from 'virtual:pwa-register';

/**
 * PWA updates are explicitly user-approved. The app refuses to activate a
 * waiting worker if any tab has a stored unfinished exam, and coordinates
 * the final check with the existing origin-wide examination Web Lock.
 * This is a reliability control, not a substitute for durable autosave.
 */
export default function PwaStatus(){
  const [available,setAvailable]=useState(false);
  const [offline,setOffline]=useState(()=>typeof navigator!=='undefined'&&!navigator.onLine);
  const [ready,setReady]=useState(false);
  const [message,setMessage]=useState('');
  const [applyUpdate,setApplyUpdate]=useState<((reloadPage?:boolean)=>Promise<void>)|null>(null);

  useEffect(()=>{
    const online=()=>setOffline(false);
    const disconnected=()=>setOffline(true);
    window.addEventListener('online',online);
    window.addEventListener('offline',disconnected);
    const update=registerSW({
      immediate:true,
      onNeedRefresh(){setAvailable(true);},
      onOfflineReady(){setReady(true);},
      onRegisteredSW(_url,registration){
        if(registration?.waiting)setAvailable(true);
      },
      onRegisterError(){setMessage('Offline installation is unavailable. An internet connection is required to load the application.');}
    });
    setApplyUpdate(()=>update);
    return()=>{
      window.removeEventListener('online',online);
      window.removeEventListener('offline',disconnected);
    };
  },[]);

  async function activate(){
    if(!applyUpdate)return;
    const lock=new ExamLock();
    if(!lock.supported){
      setMessage('Update deferred: this browser cannot verify exclusive exam ownership. Close all exam tabs before updating.');
      return;
    }
    const acquired=await lock.acquire();
    if(!acquired){
      setMessage('Update deferred: another browser tab currently owns an examination.');
      return;
    }
    try{
      if(await db.activeSessions.get('current')){
        setMessage('Update deferred: complete your unfinished examination before applying this version.');
        return;
      }
      setMessage('Updating the application…');
      // Retain the exclusive lock until the browser navigates to the new worker.
      await applyUpdate(true);
    }catch{
      setMessage('Could not verify safe update conditions. Your stored exam was not changed.');
    }finally{
      await lock.release();
    }
  }

  if(!available&&!offline&&!ready&&!message)return null;
  return <section className="pwa-status" role="status" aria-live="polite">
    {offline&&<span>Offline mode — imported banks and exams remain on this device.</span>}
    {ready&&!offline&&<span>Offline app shell is ready.</span>}
    {available&&<span>A new application version is available.</span>}
    {message&&<span>{message}</span>}
    {available&&<button type="button" onClick={()=>void activate()}>Install update safely</button>}
  </section>;
}
