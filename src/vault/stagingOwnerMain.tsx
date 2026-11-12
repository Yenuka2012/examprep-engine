/**
 * Separate HTTPS-only owner staging boot. This is NOT the loopback dev
 * harness, is NOT an authenticated network login, and never opens legacy
 * browser storage. Abort before mounting React on unexpected hostname.
 */
import {createRoot} from 'react-dom/client';
import EncryptedOwnerApp from './EncryptedOwnerApp';
import OwnerPwaStatus from './OwnerPwaStatus';
import {evaluateOwnerStagingOrigin} from './stagingOriginGuard';

const expected=import.meta.env.VITE_OWNER_STAGING_ORIGIN;
const verdict=evaluateOwnerStagingOrigin(expected,window.location.origin);
if(!verdict.allowed||!window.isSecureContext||window.location.protocol!=='https:'){
  throw new Error('Encrypted owner staging refused: '+verdict.reason);
}
const mount=document.getElementById('encrypted-owner');
if(!mount)throw new Error('Missing encrypted-owner staging root');
createRoot(mount).render(<EncryptedOwnerApp PwaStatus={OwnerPwaStatus}/>);
