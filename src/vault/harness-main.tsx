/**
 * Standalone, synthetic-data harness. Intentionally NOT imported by App.tsx,
 * index.html, or vite.config.ts, and excluded from Pages production build.
 */
import {createRoot} from 'react-dom/client';
import OwnerVaultGate from './OwnerVaultGate';
import './harness.css';

const root=document.getElementById('root');
if(!root)throw new Error('Synthetic vault harness root is missing');
// Shorter lifecycle intervals and background-lock overrides are available ONLY
// on this synthetic harness origin. Neither is compiled into production Pages.
const params=new URLSearchParams(window.location.search);
const idleMs=params.has('testIdleMs')?Number(params.get('testIdleMs')):undefined;
const lockOnHidden=params.get('testKeepActiveOnHidden')!=='1';
createRoot(root).render(<OwnerVaultGate idleMs={idleMs} lockOnHidden={lockOnHidden} />);
