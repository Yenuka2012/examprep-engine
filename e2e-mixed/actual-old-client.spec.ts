import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const OLD='/examprep-engine/';
const NEW='/examprep-candidate/';
const PROBE='/__mixed_probe__/';
const WRITE_LOCK='examprep-v03-source-write-barrier';
const LEGACY_DB='examprep-v1';
const NATIVE_V3=30;
const PROBE_V4=40;
async function oldImport(page:Page,id:string,title:string){
  const bank=JSON.parse(await readFile('samples/demo-bank.json','utf8')) as {
    bank_id:string;title:string
  };
  bank.bank_id=id;
  bank.title=title;
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  await page.locator('input[type="file"]').first().setInputFiles({
    name:id+'.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(bank))
  });
  await expect(page.getByText(title).first()).toBeVisible();
}
async function nativeVersion(page:Page):Promise<number|null>{
  return page.evaluate(async name=>{
    const items=await indexedDB.databases();
    return items.find(item=>item.name===name)?.version??null;
  },LEGACY_DB);
}
async function holdBarrier(page:Page){
  await page.evaluate(async name=>{
    const w=window as Window&{releaseMixedBarrier?:()=>void};
    let granted:()=>void=()=>undefined;
    const ready=new Promise<void>(resolve=>{granted=resolve;});
    void navigator.locks.request(name,{mode:'exclusive',ifAvailable:true},
      async lock=>{
        if(!lock){granted();return;}
        await new Promise<void>(resolve=>{
          w.releaseMixedBarrier=resolve;
          granted();
        });
      });
    await ready;
    if(!w.releaseMixedBarrier)throw new Error('Synthetic freeze unavailable');
  },WRITE_LOCK);
}
async function releaseBarrier(page:Page){
  if(page.isClosed())return;
  await page.evaluate(()=>{
    const w=window as Window&{releaseMixedBarrier?:()=>void};
    w.releaseMixedBarrier?.();
    delete w.releaseMixedBarrier;
  });
  await expect.poll(()=>page.evaluate(name=>navigator.locks.query().then(
    locks=>locks.held.some(lock=>lock.name===name&&lock.mode==='exclusive')
  ),WRITE_LOCK)).toBe(false);
}
async function rawRecordExists(page:Page,id:string):Promise<boolean>{
  return page.evaluate(async ({name,key})=>{
    return new Promise<boolean>((resolve,reject)=>{
      const req=indexedDB.open(name);
      req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{
        const database=req.result;
        const tx=database.transaction('banks','readonly');
        const get=tx.objectStore('banks').get(key);
        get.onsuccess=()=>resolve(!!get.result);
        get.onerror=()=>reject(get.error);
        tx.oncomplete=()=>database.close();
        tx.onabort=()=>database.close();
      };
    });
  },{name:LEGACY_DB,key:id});
}
test('real pre-barrier v0.3.0 bundle bypasses an exclusive newer Web Lock',async({context,page})=>{
  await page.goto(OLD);
  const newer=await context.newPage();
  try{
    await newer.goto(NEW);
    expect(await nativeVersion(page)).toBe(NATIVE_V3);
    await holdBarrier(newer);
    await oldImport(page,'LEGACY-WEBLOCK','Real obsolete bundle wrote through lock');
    expect(await rawRecordExists(page,'LEGACY-WEBLOCK')).toBe(true);
    await releaseBarrier(newer);
    await newer.getByRole('button',{name:'Check migration safety (read-only)'}).click();
    await expect(newer.getByText('Migration blocked — no data changed.')).toBeVisible();
    await expect(newer.getByTestId('cutover-aggregate-counts')).toContainText('1 banks');
    expect(await nativeVersion(page)).toBe(NATIVE_V3);
  }finally{
    await releaseBarrier(newer).catch(()=>undefined);
    await newer.close();
  }
});
test('inert native upgrade alone is no storage ACL: versionless writer still works',async({context,page})=>{
  await page.goto(PROBE);
  const newer=await context.newPage();
  await newer.goto(NEW);
  await expect(newer.getByRole('heading',{name:'Overview'})).toBeVisible();
  expect(await nativeVersion(newer)).toBe(NATIVE_V3);
  const nativeResult=await page.evaluate(async name=>{
    return new Promise<'upgraded'|'blocked'|'failed'>(resolve=>{
      const request=indexedDB.open(name,PROBE_V4);
      let completed=false;
      const finish=(state:'upgraded'|'blocked'|'failed')=>{
        if(!completed){completed=true;resolve(state);}
      };
      request.onblocked=()=>finish('blocked');
      request.onupgradeneeded=()=>{
        if(completed)request.transaction?.abort();
        else{
          const db=request.result;
          if(!db.objectStoreNames.contains('banks'))db.createObjectStore('banks',{keyPath:'bank_id'});
        }
      };
      request.onsuccess=()=>{request.result.close();finish('upgraded');};
      request.onerror=()=>finish('failed');
    });
  },LEGACY_DB);
  // Synthetic empty v30 source upgraded to 40, and the newer tab must
  // enter update-required mode after the versionchange notification.
  expect(nativeResult).toBe('upgraded');
  const wrote=await page.evaluate(async name=>{
    return new Promise<boolean>((resolve,reject)=>{
      const open=indexedDB.open(name);
      open.onerror=()=>reject(open.error);
      open.onsuccess=()=>{
        const db=open.result;
        const tx=db.transaction('banks','readwrite');
        tx.objectStore('banks').put({bank_id:'VERSIONLESS-POST-40',
          title:'Post-40 write allowed',certification:'DEMO',
          schema_version:'1.0',questions:[]});
        tx.oncomplete=()=>{db.close();resolve(true);};
        tx.onerror=()=>{db.close();reject(tx.error);};
      };
    });
  },LEGACY_DB);
  expect(wrote).toBe(true);
  expect(await rawRecordExists(page,'VERSIONLESS-POST-40')).toBe(true);
  expect(await nativeVersion(page)).toBe(PROBE_V4);
  try{
    await expect(newer.getByText(/Storage update required — writes disabled/)).toBeVisible();
    await newer.getByRole('button',{name:'Check migration safety (read-only)'}).click();
    await expect(newer.getByText('Migration blocked — no data changed.')).toBeVisible();
  }finally{await newer.close();}
});
test('blocked native upgrade fails closed and aborts when subsequently unblocked',async({page})=>{
  await page.goto(PROBE);
  const result=await page.evaluate(async({name})=>{
    const open=()=>new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open(name,30);
      request.onupgradeneeded=()=>{
        const db=request.result;
        db.createObjectStore('banks',{keyPath:'bank_id'});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    const stale=await open();
    const save=stale.transaction('banks','readwrite');
    save.objectStore('banks').put({bank_id:'PRESERVED',title:'Safe record'});
    await new Promise<void>((resolve,reject)=>{
      save.oncomplete=()=>resolve();
      save.onerror=()=>reject(save.error);
    });
    stale.onversionchange=()=>{/* old client refuses to close */};
    return new Promise<{blocked:boolean;aborted:boolean;version:number;record:boolean}>((resolve,reject)=>{
      const upgrade=indexedDB.open(name,40);
      let blocked=false,aborted=false;
      upgrade.onblocked=()=>{blocked=true;stale.close();};
      upgrade.onupgradeneeded=()=>{
        if(blocked){aborted=true;upgrade.transaction?.abort();}
      };
      upgrade.onsuccess=()=>{upgrade.result.close();reject(Error('Late upgrade committed'));};
      upgrade.onerror=()=>{
        const inspect=indexedDB.open(name);
        inspect.onsuccess=()=>{
          const current=inspect.result,tx=current.transaction('banks','readonly');
          const get=tx.objectStore('banks').get('PRESERVED');
          get.onsuccess=()=>{
            const record=!!get.result,version=current.version;
            current.close();resolve({blocked,aborted,version,record});
          };
          get.onerror=()=>{current.close();reject(get.error);};
        };
        inspect.onerror=()=>reject(inspect.error);
      };
    });
  },{name:LEGACY_DB});
  expect(result).toEqual({blocked:true,aborted:true,version:NATIVE_V3,record:true});
});
test('real historical PWA can reopen offline and mutate while newer tab holds lock',async({page,context})=>{
  await page.goto(OLD);
  await page.waitForFunction(async()=>{
    if(!('serviceWorker' in navigator))return false;
    await navigator.serviceWorker.ready;
    return !!navigator.serviceWorker.controller;
  },undefined,{timeout:15000}).catch(async()=>{
    await page.reload();
    await page.waitForFunction(()=>!!navigator.serviceWorker?.controller,{timeout:15000});
  });
  const candidate=await context.newPage();
  try{
    await candidate.goto(NEW);
    await holdBarrier(candidate);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading',{name:'Overview'})).toBeVisible();
    await oldImport(page,'OLD-OFFLINE','Old cached PWA offline write');
    expect(await rawRecordExists(page,'OLD-OFFLINE')).toBe(true);
    await context.setOffline(false);
    await releaseBarrier(candidate);
  }finally{
    await context.setOffline(false).catch(()=>undefined);
    await releaseBarrier(candidate).catch(()=>undefined);
    await candidate.close();
  }
});
