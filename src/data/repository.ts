// An explicit read boundary for future encrypted IndexedDB / private API adapters.
// Do not treat this as authorization or encryption. Writes remain in existing
// transactional services until the vault threat model is approved and tested.
export interface ReadRepository<T> {
  getById(id:string):Promise<T|undefined>;
  list():Promise<T[]>;
}
