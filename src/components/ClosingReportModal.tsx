import React from 'react';
import { CheckCircle2, Share2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { BalanceSummary } from '../types';
import { formatBDT } from '../utils/accounting';

interface ClosingReportModalProps {
  open: boolean;
  summary: BalanceSummary;
  workingCapital: number;
  closingNote: string;
  onShareReport?: () => void;
  onClose: () => void;
}

export const ClosingReportModal: React.FC<ClosingReportModalProps> = ({
  open,
  summary,
  workingCapital,
  closingNote,
  onShareReport,
  onClose,
}) => {
  const isProfit = summary.totalProfit >= 0;

  return (
    <AnimatePresence>
      {open && (
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
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Saved securely to Cloud Database</span>
                </div>
                <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
                  End-of-Day Summary Report
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {new Date().toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close summary report"
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 text-center">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Net Daily Profit / Loss (Closing − Opening)
              </div>
              <div
                className={`mt-1 font-mono-num text-2xl font-bold ${
                  isProfit
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {formatBDT(summary.totalProfit)}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-sm">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">Total Opening</div>
                <div className="mt-0.5 font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                  {formatBDT(summary.opening)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">Total Closing</div>
                <div className="mt-0.5 font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                  {formatBDT(summary.closing)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 col-span-2 sm:col-span-1">
                <div className="text-xs text-slate-500 dark:text-slate-400">Working Capital</div>
                <div className="mt-0.5 font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                  {formatBDT(workingCapital)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">MFS Opening</div>
                <div className="mt-0.5 font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                  {formatBDT(summary.openMFS)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">MFS Closing</div>
                <div className="mt-0.5 font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                  {formatBDT(summary.closeMFS)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">MFS Profit</div>
                <div className="mt-0.5 font-mono-num font-semibold text-sky-600 dark:text-sky-400">
                  {formatBDT(summary.mfsProfit)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">Recharge Opening</div>
                <div className="mt-0.5 font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                  {formatBDT(summary.openRecharge)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">Recharge Closing</div>
                <div className="mt-0.5 font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                  {formatBDT(summary.closeRecharge)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">Recharge Profit</div>
                <div className="mt-0.5 font-mono-num font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatBDT(summary.rechargeProfit)}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">Closing Cash</div>
                <div className="mt-0.5 font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                  {formatBDT(summary.closingCash)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 col-span-1 sm:col-span-2">
                <div className="text-xs text-slate-500 dark:text-slate-400">Closing E-Money</div>
                <div className="mt-0.5 font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                  {formatBDT(summary.closingEmoney)}
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
              {closingNote.trim() ? `Note: ${closingNote}` : 'No closing note recorded.'}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2.5">
              {onShareReport && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onShareReport();
                  }}
                  className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-sm font-semibold transition-all cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share Report</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-sky-600 text-white text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
