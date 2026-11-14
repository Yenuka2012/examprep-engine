import type {ReadRepository} from './repository';

// Narrow Dexie-compatible surface, so tests and future adapters need not
// construct a real database merely to exercise domain read operations.
export interface ReadonlyTable<T> {
  get(id:string):Promise<T|undefined>;
  toArray():Promise<T[]>;
}
export class IndexedDbReadRepository<T> implements ReadRepository<T>{
  constructor(private readonly table:ReadonlyTable<T>){}
  getById(id:string){return this.table.get(id);}
  list(){return this.table.toArray();}
}
