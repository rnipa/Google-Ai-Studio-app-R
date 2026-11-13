import React from 'react';
import { AlertTriangle, Download, RefreshCw, Trash2 } from 'lucide-react';

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected application error.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('AppErrorBoundary caught error:', error, info);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearCacheAndReload = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // ignore cleanup errors
    }
    window.location.reload();
  };

  private handleDownloadEmergencyLocalBackup = () => {
    try {
      const recovered: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        source: 'Emergency Local Vault Recovery',
        drafts: {} as Record<string, unknown>,
        snapshots: {} as Record<string, unknown>,
      };
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith('rasidul_pending_ws_')) {
          try {
            (recovered.drafts as Record<string, unknown>)[key] = JSON.parse(
              localStorage.getItem(key) || 'null'
            );
          } catch {
            (recovered.drafts as Record<string, unknown>)[key] = localStorage.getItem(key);
          }
        } else if (key.startsWith('rasidul_cloud_snapshot_')) {
          try {
            (recovered.snapshots as Record<string, unknown>)[key] = JSON.parse(
              localStorage.getItem(key) || 'null'
            );
          } catch {
            // skip malformed snapshot
          }
        }
      }
      const blob = new Blob([JSON.stringify(recovered, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rasidul-erp-emergency-recovery-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore download errors
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 text-slate-900 dark:text-slate-100">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 p-6 shadow-xl space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold">Rasidul ERP Recovery Mode</h1>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                The screen hit an unexpected error, but your Firebase Cloud database and local
                draft vault are completely safe.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs font-mono text-rose-700 dark:text-rose-300 break-words">
            {this.state.errorMessage}
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={this.handleClearCacheAndReload}
              className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear Old Cache &amp; Reopen App</span>
            </button>

            <button
              type="button"
              onClick={this.handleReload}
              className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-4 py-2.5 text-sm font-semibold cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload App</span>
            </button>

            <button
              type="button"
              onClick={this.handleDownloadEmergencyLocalBackup}
              className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download Local Vault Snapshot (.json)</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
