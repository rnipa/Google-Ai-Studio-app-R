import React, { useMemo, useState } from 'react';
import { Check, Copy, MessageCircle, Share2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  ArchivedTransaction,
  DailyHistory,
  LedgerArchive,
  LedgerClient,
  LedgerTransaction,
  WorkspaceState,
} from '../types';
import {
  buildArchiveStatementText,
  buildBusinessReportText,
  buildClientStatementText,
  buildWhatsAppShareUrl,
  isoToLocalDateKey,
  localDateKey,
} from '../utils/accounting';

export type ShareReportPayload =
  | {
      kind: 'client';
      client: LedgerClient;
      transactions: LedgerTransaction[];
    }
  | {
      kind: 'archive';
      archive: LedgerArchive;
      transactions: ArchivedTransaction[];
    }
  | {
      kind: 'business';
      shopName: string;
      workspace: WorkspaceState;
      histories: DailyHistory[];
    };

interface ShareReportModalProps {
  open: boolean;
  shopName: string;
  payload: ShareReportPayload | null;
  onClose: () => void;
  onCopied?: () => void;
}

type DateScope = 'today' | 'week' | 'all' | 'custom';

export const ShareReportModal: React.FC<ShareReportModalProps> = ({
  open,
  shopName,
  payload,
  onClose,
  onCopied,
}) => {
  const today = localDateKey();
  const [scope, setScope] = useState<DateScope>('today');
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [lang, setLang] = useState<'bn' | 'en'>('bn');
  const [copied, setCopied] = useState(false);

  const reportText = useMemo(() => {
    if (!payload) return '';

    const weekAgo = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return localDateKey(d);
    })();

    const inScope = (iso: string) => {
      const dKey = isoToLocalDateKey(iso);
      if (scope === 'all') return true;
      if (scope === 'today') return dKey === today;
      if (scope === 'week') return dKey >= weekAgo && dKey <= today;
      return (!fromDate || dKey >= fromDate) && (!toDate || dKey <= toDate);
    };

    const periodLabel =
      scope === 'today'
        ? `Today (${today})`
        : scope === 'week'
          ? `Last 7 Days (${weekAgo} to ${today})`
          : scope === 'all'
            ? 'All Records'
            : `${fromDate || '...'} to ${toDate || '...'}`;

    if (payload.kind === 'client') {
      const filtered = payload.transactions.filter((t) => inScope(t.txDateIso));
      return buildClientStatementText({
        shopName,
        client: payload.client,
        transactions: filtered,
        periodLabel,
        lang,
      });
    }

    if (payload.kind === 'archive') {
      return buildArchiveStatementText({
        shopName,
        archive: payload.archive,
        transactions: payload.transactions,
        lang,
      });
    }

    const filteredHist = payload.histories.filter((h) => inScope(h.dateIso));
    return buildBusinessReportText({
      shopName: payload.shopName,
      workspace: payload.workspace,
      histories: filteredHist,
      periodLabel,
      includeLiveShift: scope === 'today' || scope === 'all',
      lang,
    });
  }, [payload, shopName, scope, fromDate, toDate, lang, today]);

  const targetMobile =
    payload?.kind === 'client'
      ? payload.client.mobile
      : payload?.kind === 'archive'
        ? payload.archive.personMobile
        : '';

  const waUrl = useMemo(() => buildWhatsAppShareUrl(reportText, targetMobile), [reportText, targetMobile]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${shopName} Report`,
          text: reportText,
        });
        return;
      } catch {
        // user cancelled or unavailable -> fallback to copy
      }
    }
    await handleCopy();
  };

  const title =
    payload?.kind === 'client'
      ? `Share Statement · ${payload.client.name}`
      : payload?.kind === 'archive'
        ? `Share Settled Report · ${payload.archive.personName}`
        : 'Share Business Shift Report';

  return (
    <AnimatePresence>
      {open && payload && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4 print:hidden"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                  {title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Choose any date range and share via WhatsApp, Share menu, or Copy
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close share dialog"
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scope & Language Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {payload.kind !== 'archive' ? (
                <div className="inline-flex flex-wrap rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-1">
                  {(
                    [
                      ['today', 'Today'],
                      ['week', '7 Days'],
                      ['all', 'All'],
                      ['custom', 'Custom Range'],
                    ] as const
                  ).map(([k, lbl]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setScope(k)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                        scope === k
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Complete settled cycle statement
                </span>
              )}

              <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-1">
                <button
                  type="button"
                  onClick={() => setLang('bn')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    lang === 'bn'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  বাংলা
                </button>
                <button
                  type="button"
                  onClick={() => setLang('en')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    lang === 'en'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  English
                </button>
              </div>
            </div>

            {payload.kind !== 'archive' && scope === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono-num"
                  />
                </div>
              </div>
            )}

            {/* Preview Box */}
            <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
              <pre className="whitespace-pre-wrap font-sans text-xs sm:text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
                {reportText}
              </pre>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-all"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>

              <button
                type="button"
                onClick={handleNativeShare}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-all cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Share App</span>
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-[0.98] px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 transition-all cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied!' : 'Copy Text'}</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
