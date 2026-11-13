import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineBanner: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 px-3.5 py-2.5 text-xs font-semibold text-amber-800 dark:text-amber-200 shadow-lg print:hidden">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Offline mode — changes will sync automatically when reconnected</span>
    </div>
  );
};
