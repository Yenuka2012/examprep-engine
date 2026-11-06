/**
 * Isolated M2.2 encrypted-storage candidate.
 * Importing this module does not open, migrate or modify the legacy examprep-v1 DB.
 * Not connected to UI or production persistence until a separate accepted migration.
 */
import Dexie,{type Table} from 'dexie';
import {
  createVault,encryptVaultRecord,decryptVaultRecord,validateVaultHeader,validateVaultRecord,
  type VaultHeader,type EncryptedVaultRecord,type VaultRecordType
} from './crypto';

type HeaderRow={id:'primary';value:VaultHeader};
type EncryptedRow={recordId:string;envelope:EncryptedVaultRecord};
class IsolatedEncryptedDb extends Dexie{
  headers!:Table<HeaderRow,'primary'>;
  records!:Table<EncryptedRow,string>;
  constructor(){
    super('examprep-secure-vault-v1');
    this.version(1).stores({headers:'id',records:'recordId'});
  }
}
export class ExperimentalVaultRepository{
  private readonly db=new IsolatedEncryptedDb();
  async setup(masterSecret:string,recoverySecret:string):Promise<{header:VaultHeader;key:CryptoKey}>{
    // Do not create a second credential if an encrypted vault already exists.
    if(await this.db.headers.get('primary'))throw new Error('Encrypted vault already enrolled');
    const created=await createVault(masterSecret,recoverySecret);
    await this.db.headers.add({id:'primary',value:created.header});
    return created;
  }
  async header():Promise<VaultHeader|undefined>{
    const row=await this.db.headers.get('primary');
    return row?validateVaultHeader(row.value):undefined;
  }
  async unlock(secret:string,method:'master'|'recovery'='master'):Promise<CryptoKey>{
    const header=await this.header();
    if(!header)throw new Error('No encrypted vault is enrolled');
    const {unlockVault}=await import('./crypto');
    return unlockVault(header,secret,method);
  }
  async put(
    key:CryptoKey,type:VaultRecordType,value:unknown,recordId?:string
  ):Promise<string>{
    const header=await this.header();
    if(!header)throw new Error('No encrypted vault is enrolled');
    const envelope=await encryptVaultRecord(header,key,type,value,recordId);
    await this.db.transaction('rw',this.db.headers,this.db.records,async()=>{
      const current=await this.db.headers.get('primary');
      if(!current||validateVaultHeader(current.value).vaultId!==header.vaultId){
        throw new Error('Vault changed during encrypted record write');
      }
      const old=await this.db.records.get(envelope.recordId);
      if(old&&validateVaultRecord(old.envelope).recordType!==envelope.recordType){
        throw new Error('Cannot reassign an existing record to another record type');
      }
      await this.db.records.put({recordId:envelope.recordId,envelope});
    });
    return envelope.recordId;
  }
  async get(key:CryptoKey,recordId:string):Promise<unknown|undefined>{
    const header=await this.header();
    if(!header)throw new Error('No encrypted vault is enrolled');
    const row=await this.db.records.get(recordId);
    if(!row)return undefined;
    if(row.recordId!==row.envelope.recordId)throw new Error('Encrypted record identity mismatch');
    return decryptVaultRecord(header,key,row.envelope);
  }
  // Only opaque IDs + encrypted envelopes are exposed here. No user data.
  async encryptedRecords():Promise<EncryptedVaultRecord[]>{
    const rows=await this.db.records.toArray();
    return rows.map(row=>validateVaultRecord(row.envelope));
  }
  close(){this.db.close();}
}
