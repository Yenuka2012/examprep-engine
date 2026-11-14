/**
 * Development-only owner UI entry. Only the isolated vault build includes it.
 * Runtime origin guard prevents loading this test preview from public Pages.
 */
import {createRoot} from 'react-dom/client';
import EncryptedOwnerApp from './EncryptedOwnerApp';

if(location.protocol!=='http:'||
   !['127.0.0.1','localhost'].includes(location.hostname)||
   !window.isSecureContext||location.port!=='4174'){
  throw new Error('M2.9 development UI may only run on approved loopback origin');
}
const root=document.getElementById('encrypted-owner');
if(!root)throw new Error('Missing M2.9 encrypted owner root');
createRoot(root).render(<EncryptedOwnerApp/>);
