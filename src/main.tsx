import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';
import './index.css';

async function cleanupLegacyServiceWorkers() {
  try {
    let hadActiveController = false;
    if ('serviceWorker' in navigator) {
      hadActiveController = Boolean(navigator.serviceWorker.controller);
      const regs = await navigator.serviceWorker.getRegistrations();
      if (regs.length > 0) {
        await Promise.all(regs.map((r) => r.unregister()));
      }
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      if (keys.length > 0) {
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    }
    if (hadActiveController && !sessionStorage.getItem('rasidul_sw_cleaned')) {
      sessionStorage.setItem('rasidul_sw_cleaned', '1');
      window.location.reload();
    }
  } catch {
    // ignore cleanup failures
  }
}

cleanupLegacyServiceWorkers();

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
