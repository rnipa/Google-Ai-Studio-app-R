import React, { useEffect, useState } from 'react';
import { Delete, X } from 'lucide-react';

interface MiniCalculatorModalProps {
  open: boolean;
  label: string;
  initialValue: number;
  onApply: (value: number) => void;
  onClose: () => void;
}

function evaluateExpression(expr: string): number | null {
  const cleaned = expr.replace(/\s+/g, '');
  if (!cleaned) return 0;
  if (!/^[0-9+\-*/().]+$/.test(cleaned)) return null;
  try {
    const fn = new Function(`"use strict"; return (${cleaned});`);
    const res = fn();
    if (typeof res === 'number' && Number.isFinite(res)) {
      return Math.round(res * 100) / 100;
    }
    return null;
  } catch {
    return null;
  }
}

export const MiniCalculatorModal: React.FC<MiniCalculatorModalProps> = ({
  open,
  label,
  initialValue,
  onApply,
  onClose,
}) => {
  const [expr, setExpr] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setExpr(initialValue ? String(initialValue) : '');
      setError('');
    }
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const press = (val: string) => {
    setError('');
    setExpr((prev) => prev + val);
  };

  const handleEquals = () => {
    const res = evaluateExpression(expr);
    if (res === null) {
      setError('Enter a valid expression');
      return;
    }
    setExpr(String(res));
  };

  const handleApply = () => {
    const res = evaluateExpression(expr);
    if (res === null) {
      setError('Enter a valid expression');
      return;
    }
    onApply(res);
    onClose();
  };

  const buttons = [
    '7', '8', '9', '/',
    '4', '5', '6', '*',
    '1', '2', '3', '-',
    '0', '.', '=', '+',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 print:hidden"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-xs rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate pr-2">
            {label} Calculator
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close calculator"
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <input
          type="text"
          value={expr}
          onChange={(e) => {
            setError('');
            setExpr(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleEquals();
            }
          }}
          placeholder="0"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-3 text-right font-mono-num text-xl font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />

        {error && <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

        <div className="grid grid-cols-4 gap-2 mt-3">
          {buttons.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => (b === '=' ? handleEquals() : press(b))}
              className={`h-11 rounded-xl font-mono-num text-base font-semibold transition-colors ${
                ['/', '*', '-', '+', '='].includes(b)
                  ? 'bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/60 dark:text-sky-300 dark:hover:bg-sky-900/60'
                  : 'bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {b === '/' ? '÷' : b === '*' ? '×' : b}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <button
            type="button"
            onClick={() => setExpr((prev) => prev.slice(0, -1))}
            className="flex items-center justify-center gap-1 h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Delete className="w-3.5 h-3.5" /> Back
          </button>
          <button
            type="button"
            onClick={() => {
              setExpr('');
              setError('');
            }}
            className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
