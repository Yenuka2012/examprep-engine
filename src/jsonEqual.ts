/**
 * Compare validated JSON payloads by value, independently of object property
 * insertion order. Array order is significant and is preserved.
 */
export function jsonEqual(a:unknown,b:unknown):boolean {
  const stable=(input:unknown):string|undefined=>JSON.stringify(input,(_key,value:unknown)=>{
    if(value!==null && typeof value==='object' && !Array.isArray(value)){
      const record=value as Record<string,unknown>;
      const ordered:Record<string,unknown>=Object.create(null) as Record<string,unknown>;
      for(const key of Object.keys(record).sort())ordered[key]=record[key];
      return ordered;
    }
    return value;
  });
  return stable(a)===stable(b);
}
