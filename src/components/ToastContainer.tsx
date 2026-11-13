import React from 'react';
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from 'lucide-react';
import type { ToastMessage } from '../types';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] print:hidden">
      {toasts.map((t) => {
        const style =
          t.type === 'success'
            ? 'border-emerald-200 bg-white text-slate-900 dark:border-emerald-800/70 dark:bg-slate-900 dark:text-slate-100'
            : t.type === 'error'
              ? 'border-rose-200 bg-white text-slate-900 dark:border-rose-800/70 dark:bg-slate-900 dark:text-slate-100'
              : t.type === 'warning'
                ? 'border-amber-200 bg-white text-slate-900 dark:border-amber-800/70 dark:bg-slate-900 dark:text-slate-100'
                : 'border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

        const Icon =
          t.type === 'success'
            ? CheckCircle2
            : t.type === 'error'
              ? XCircle
              : t.type === 'warning'
                ? AlertTriangle
                : Info;

        const iconColor =
          t.type === 'success'
            ? 'text-emerald-600 dark:text-emerald-400'
            : t.type === 'error'
              ? 'text-rose-600 dark:text-rose-400'
              : t.type === 'warning'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-sky-600 dark:text-sky-400';

        return (
          <div
            key={t.id}
            role="status"
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg transition-all ${style}`}
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} />
            <p className="text-sm font-medium leading-snug flex-1">{t.text}</p>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
