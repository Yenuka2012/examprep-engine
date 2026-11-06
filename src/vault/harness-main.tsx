/**
 * Standalone, synthetic-data harness. Intentionally NOT imported by App.tsx,
 * index.html, or vite.config.ts, and excluded from Pages production build.
 */
import {createRoot} from 'react-dom/client';
import OwnerVaultGate from './OwnerVaultGate';
import './harness.css';

const root=document.getElementById('root');
if(!root)throw new Error('Synthetic vault harness root is missing');
createRoot(root).render(<OwnerVaultGate />);
