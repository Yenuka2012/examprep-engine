import {describe,expect,it,vi} from 'vitest';
import {SessionSaveQueue} from './saveQueue';

describe('M0.1 durable session save queue',()=>{
  it('serializes saves and waits for earlier writes before completing a final flush',async()=>{
    const calls:string[]=[];
    let finishFirst:()=>void=()=>{};
    const firstGate=new Promise<void>(resolve=>{finishFirst=resolve;});
    const writer=vi.fn(async(value:string)=>{
      calls.push('start '+value);
      if(value==='first')await firstGate;
      calls.push('end '+value);
    });
    const queue=new SessionSaveQueue(writer);
    const first=queue.enqueue('first');
    const final=queue.flush('final');
    await Promise.resolve();await Promise.resolve(); 
    expect(calls).toEqual(['start first']);
    finishFirst();
    await Promise.all([first,final]);
    expect(calls).toEqual(['start first','end first','start final','end final']);
  });

  it('surfaces an autosave failure but permits a subsequent successful retry',async()=>{
    const calls:string[]=[];
    const queue=new SessionSaveQueue<string>(async value=>{
      calls.push(value);
      if(value==='older')throw new Error('IndexedDB quota exceeded');
    });
    await expect(queue.enqueue('older')).rejects.toThrow('quota');
    await expect(queue.flush('latest')).resolves.toBeUndefined();
    expect(calls).toEqual(['older','latest']);
  });

  it('rejects the final flush on storage failure rather than silently submitting',async()=>{
    const queue=new SessionSaveQueue<string>(async()=>{throw new Error('database unavailable');});
    await expect(queue.enqueue('draft')).rejects.toThrow('database unavailable');
    await expect(queue.flush('final')).rejects.toThrow('database unavailable');
  });
});
