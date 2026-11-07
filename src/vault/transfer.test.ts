import {describe,it,expect} from 'vitest';
import {createVault,encryptVaultRecord} from './crypto';
import {
  createEncryptedVaultTransfer,verifyEncryptedVaultTransfer,
  MAX_VAULT_TRANSFER_RECORDS,type EncryptedVaultTransfer
} from './transfer';

const master='synthetic-master-password-manager-secret-long';
const recovery='synthetic-independent-recovery-phrase-long';
const marker='DO-NOT-LEAK-QUESTION-ANSWER-KEY-55f1';
async function sample(){
  const {header,key}=await createVault(master,recovery);
  const verifier=await encryptVaultRecord(header,key,'key-check',{
    purpose:'examprep-vault-key-check-v1',vaultId:header.vaultId,challenge:crypto.randomUUID()
  });
  const note=await encryptVaultRecord(header,key,'bank',{
    certification:'DEMO',text:marker,correctAnswers:['A']
  });
  const bundle=await createEncryptedVaultTransfer(
    header,key,verifier.recordId,[verifier,note]
  );
  return {bundle,verifier,note,key,header};
}

describe('portable encrypted vault transfer',()=>{
  it('contains only opaque metadata and authenticated ciphertext, recoverable with either secret',async()=>{
    const {bundle,note}=await sample();
    const wire=JSON.stringify(bundle);
    expect(wire).not.toContain(marker);
    expect(wire).not.toContain(master);
    expect(wire).not.toContain(recovery);
    expect(wire).not.toContain('correctAnswers');
    const restored=await verifyEncryptedVaultTransfer(JSON.parse(wire),master);
    expect(restored.userRecordCount).toBe(1);
    expect(restored.bundle.records.some(r=>r.recordId===note.recordId)).toBe(true);
    const independent=await verifyEncryptedVaultTransfer(JSON.parse(wire),recovery,'recovery');
    expect(independent.userRecordCount).toBe(1);
    expect(independent.key.extractable).toBe(false);
    await expect(verifyEncryptedVaultTransfer(JSON.parse(wire),'wrong-credential-long')).rejects.toThrow();
  });
  it('rejects missing, duplicated, reordered and substituted ciphertext records',async()=>{
    const {bundle,note}=await sample();
    const clone=():EncryptedVaultTransfer=>structuredClone(bundle);
    const missing=clone();
    missing.records=missing.records.filter(r=>r.recordId!==note.recordId);
    await expect(verifyEncryptedVaultTransfer(missing,master)).rejects.toThrow(/inventory|mismatch/i);
    const duplicate=clone();
    duplicate.records.push({...duplicate.records[0]});
    await expect(verifyEncryptedVaultTransfer(duplicate,master)).rejects.toThrow(/duplicate|inventory/i);
    const reversed=clone();
    reversed.records.reverse();
    await expect(verifyEncryptedVaultTransfer(reversed,master)).rejects.toThrow(/sorted|inventory/i);
    const swapped=clone();
    const target=swapped.records.find(r=>r.recordId===note.recordId)!;
    target.ciphertext=(target.ciphertext[0]==='A'?'B':'A')+target.ciphertext.slice(1);
    await expect(verifyEncryptedVaultTransfer(swapped,master)).rejects.toThrow(/digest|authentication/i);
  });
  it('rejects corrupted encrypted inventory, wrong key identity and unknown schema',async()=>{
    const {bundle}=await sample();
    const altered=structuredClone(bundle);
    altered.manifest.ciphertext=(altered.manifest.ciphertext[0]==='A'?'B':'A')+
      altered.manifest.ciphertext.slice(1);
    await expect(verifyEncryptedVaultTransfer(altered,master)).rejects.toThrow();
    await expect(verifyEncryptedVaultTransfer({...bundle,format:'examprep-vault-transfer-v2'},master))
      .rejects.toThrow(/Unsupported/);
    await expect(verifyEncryptedVaultTransfer({...bundle,unexpected:true},master))
      .rejects.toThrow(/fields/);
    const foreign=await createVault(master,recovery);
    await expect(verifyEncryptedVaultTransfer({...bundle,header:foreign.header},master))
      .rejects.toThrow();
    await expect(verifyEncryptedVaultTransfer({...bundle,verifierId:crypto.randomUUID()},master))
      .rejects.toThrow(/verifier/);
  });
  it('refuses a forged or missing key verifier, duplicate IDs and oversized exports',async()=>{
    const {bundle,key,header,note}=await sample();
    await expect(createEncryptedVaultTransfer(header,key,note.recordId,bundle.records))
      .rejects.toThrow(/verifier/);
    await expect(createEncryptedVaultTransfer(header,key,bundle.verifierId,
      [...bundle.records,bundle.records[0]])).rejects.toThrow(/Duplicate/);
    await expect(createEncryptedVaultTransfer(header,key,bundle.verifierId,
      Array(MAX_VAULT_TRANSFER_RECORDS+2).fill(bundle.records[0])))
      .rejects.toThrow(/many/);
  });
});
