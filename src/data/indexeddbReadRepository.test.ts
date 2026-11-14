import {describe,expect,it,vi} from 'vitest';
import {IndexedDbReadRepository} from './indexeddbReadRepository';

describe('read-only repository contract',()=>{
  it('preserves record identity and delegates to storage without mutation',async()=>{
    const record={id:'CISM',title:'Synthetic question bank'};
    const get=vi.fn(async(id:string)=>id===record.id?record:undefined);
    const toArray=vi.fn(async()=>[record]);
    const repository=new IndexedDbReadRepository({get,toArray});
    expect(await repository.getById('CISM')).toEqual(record);
    expect(await repository.getById('MISSING')).toBeUndefined();
    expect(await repository.list()).toEqual([record]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(toArray).toHaveBeenCalledTimes(1);
  });
});
