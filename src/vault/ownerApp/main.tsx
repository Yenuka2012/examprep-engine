/**
 * Standalone encrypted owner test build. Never imported by public Pages
 * index.html. A verified DISTINCT HTTPS host is required outside synthetic
 * loopback tests; refuse to render vault unlock until the origin is approved.
 */
import {createRoot} from 'react-dom/client';
import {assertEncryptedOwnerHost} from './ownerOriginGuard';
import EncryptedOwnerApp from './EncryptedOwnerApp';
import './ownerApp.css';

const node=document.getElementById('root');
if(!node)throw new Error('Encrypted owner app root missing');
try{
  assertEncryptedOwnerHost(
    window.location.origin+'/',
    import.meta.env.VITE_ENCRYPTED_EXPECTED_ORIGIN as string|undefined,
    import.meta.env.MODE==='encrypted-test'
  );
  createRoot(node).render(<EncryptedOwnerApp/>);
}catch{
  node.textContent='Encrypted owner application refused this unapproved browser origin. No vault or legacy database was opened.';
}
