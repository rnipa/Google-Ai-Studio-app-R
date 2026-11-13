import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Coins,
  Copy,
  Edit3,
  RefreshCw,
  Save,
  Share2,
  Sparkles,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  BalanceFieldKey,
  CapitalSource,
  DailyHistory,
  WorkspaceState,
} from '../types';
import {
  CLOSING_FIELDS,
  OPENING_FIELDS,
  WITHDRAWAL_CATEGORIES,
  WITHDRAWAL_METHODS,
  computeBalanceSummary,
  findDuplicateDailyHistoryIds,
  formatBDT,
  formatDateTimeEn,
  isoToLocalDateKey,
  localDateKey,
  safeNum,
} from '../utils/accounting';
import { MiniCalculatorModal } from './MiniCalculatorModal';

interface DailyShiftViewProps {
  workspace: WorkspaceState;
  histories: DailyHistory[];
  saving: boolean;
  onUpdateField: <K extends keyof WorkspaceState>(key: K, value: WorkspaceState[K]) => void;
  onCopyOpeningToClosing: () => void;
  onSaveDailyClosing: (editingId?: string | null) => Promise<void>;
  onNewDay: () => Promise<void>;
  onReinvest: (mfsAdd: number, rechargeAdd: number) => Promise<void>;
  onWithdraw: (payload: {
    amount: number;
    reason: string;
    category: string;
    source: CapitalSource;
    method: string;
  }) => Promise<void>;
  onDeleteHistory: (historyId: string) => void;
  onDeduplicateHistories?: (extraCount: number) => void;
  onShareReport: () => void;
}

type CashTargetKey = 'omc' | 'orc' | 'cmc' | 'crc';

export const DailyShiftView: React.FC<DailyShiftViewProps> = ({
  workspace,
  histories,
  saving,
  onUpdateField,
  onCopyOpeningToClosing,
  onSaveDailyClosing,
  onNewDay,
  onReinvest,
  onWithdraw,
  onDeleteHistory,
  onDeduplicateHistories,
  onShareReport,
}) => {
  const summary = useMemo(() => computeBalanceSummary(workspace), [workspace]);
  const dupInfo = useMemo(() => findDuplicateDailyHistoryIds(histories), [histories]);
  const todaySaved = useMemo(() => {
    const today = localDateKey();
    const list = histories.filter(
      (h) => h.type === 'dailyClosing' && isoToLocalDateKey(h.dateIso) === today
    );
    return {
      count: list.length,
      profit: list.reduce((s, h) => s + safeNum(h.profit), 0),
    };
  }, [histories]);

  // Sub-panel toggles
  const [activeTool, setActiveTool] = useState<'none' | 'reinvest' | 'withdraw' | 'cash'>('none');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'dailyClosing' | 'ownerWithdrawal'>('all');

  // Mini Field Calculator state
  const [calcModal, setCalcModal] = useState<{
    open: boolean;
    field: BalanceFieldKey;
    label: string;
  }>({ open: false, field: 'obk', label: '' });

  // Reinvest inputs
  const [mfsReinvest, setMfsReinvest] = useState('');
  const [rechargeReinvest, setRechargeReinvest] = useState('');

  // Withdrawal inputs
  const [wAmount, setWAmount] = useState('');
  const [wReason, setWReason] = useState('');
  const [wCategory, setWCategory] = useState(WITHDRAWAL_CATEGORIES[0]);
  const [wSource, setWSource] = useState<CapitalSource>('mfs');
  const [wMethod, setWMethod] = useState('Cash');

  // Smart Cash Calculator state
  const [cashTarget, setCashTarget] = useState<CashTargetKey>('cmc');
  const [notes, setNotes] = useState<Record<number, string>>({
    1000: '',
    500: '',
    200: '',
    100: '',
    50: '',
    20: '',
    10: '',
  });

  // Closing validation message
  const [checkReport, setCheckReport] = useState<{
    checked: boolean;
    warnings: string[];
  }>({ checked: false, warnings: [] });

  // Editing existing daily history note
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);

  const cashTotal = useMemo(() => {
    return Object.entries(notes).reduce((sum, [denom, qty]) => {
      const q = Math.max(0, Number(qty) || 0);
      return sum + Number(denom) * q;
    }, 0);
  }, [notes]);

  const filteredHistories = useMemo(() => {
    if (historyFilter === 'all') return histories;
    return histories.filter((h) => h.type === historyFilter);
  }, [histories, historyFilter]);

  const openMfsFields = useMemo(() => OPENING_FIELDS.filter((f) => f.group === 'mfs'), []);
  const openRechargeFields = useMemo(() => OPENING_FIELDS.filter((f) => f.group === 'recharge'), []);
  const closeMfsFields = useMemo(() => CLOSING_FIELDS.filter((f) => f.group === 'mfs'), []);
  const closeRechargeFields = useMemo(() => CLOSING_FIELDS.filter((f) => f.group === 'recharge'), []);

  const handleClosingCheck = () => {
    const warnings: string[] = [];
    CLOSING_FIELDS.forEach((f) => {
      const val = safeNum(workspace[f.key]);
      if (val < 0) warnings.push(`${f.label} is negative (${val})`);
    });
    setCheckReport({ checked: true, warnings });
  };

  const handleApplyCash = () => {
    onUpdateField(cashTarget, cashTotal);
  };

  const handleReinvestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const m = Math.max(0, safeNum(mfsReinvest));
    const r = Math.max(0, safeNum(rechargeReinvest));
    if (m === 0 && r === 0) return;
    await onReinvest(m, r);
    setMfsReinvest('');
    setRechargeReinvest('');
    setActiveTool('none');
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = safeNum(wAmount);
    if (amt <= 0) return;
    await onWithdraw({
      amount: amt,
      reason: wReason,
      category: wCategory,
      source: wSource,
      method: wMethod,
    });
    setWAmount('');
    setWReason('');
    setActiveTool('none');
  };

  const handleFinalSaveClick = async () => {
    await onSaveDailyClosing(editingHistoryId);
    setEditingHistoryId(null);
  };

  const handleEditHistoryItem = (h: DailyHistory) => {
    if (h.type === 'ownerWithdrawal') return;
    onUpdateField('closingNote', h.note || '');
    setEditingHistoryId(h.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderFieldCard = (
    field: { key: BalanceFieldKey; label: string; isCash?: boolean },
    prefix: 'Opening' | 'Closing'
  ) => (
    <div
      key={field.key}
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
          {field.label}
        </label>
        <button
          type="button"
          onClick={() =>
            setCalcModal({ open: true, field: field.key, label: `${prefix} ${field.label}` })
          }
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-sky-600 hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title="Open inline calculator"
          aria-label={`Calculator for ${prefix} ${field.label}`}
        >
          <Calculator className="w-3.5 h-3.5" />
        </button>
      </div>
      <input
        type="number"
        inputMode="decimal"
        value={workspace[field.key]}
        onChange={(e) => onUpdateField(field.key, safeNum(e.target.value))}
        className="w-full min-h-[42px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-num text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
      />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Daily Operations · MFS &amp; Mobile Recharge Shift Accounting
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Daily Shift Control
          </h2>
        </div>

        <button
          type="button"
          onClick={onShareReport}
          className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition-all cursor-pointer"
        >
          <Share2 className="w-4 h-4" />
          <span>Share Report</span>
        </button>
      </div>

      {/* Capital & Quick Tool Bar */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:shadow-none">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 flex-1">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                MFS Base Capital
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={workspace.mfsCapital}
                onChange={(e) => onUpdateField('mfsCapital', safeNum(e.target.value))}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-num text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                Recharge Base Capital
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={workspace.rechargeCapital}
                onChange={(e) => onUpdateField('rechargeCapital', safeNum(e.target.value))}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-num text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="col-span-2 sm:col-span-1 flex flex-col justify-end pb-1">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Working Capital
              </div>
              <div className="mt-1 font-mono-num text-xl font-bold text-slate-900 dark:text-slate-100">
                {formatBDT(safeNum(workspace.mfsCapital) + safeNum(workspace.rechargeCapital))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTool(activeTool === 'reinvest' ? 'none' : 'reinvest')}
              className={`min-h-[42px] inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
                activeTool === 'reinvest'
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Reinvest Profit</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTool(activeTool === 'withdraw' ? 'none' : 'withdraw')}
              className={`min-h-[42px] inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
                activeTool === 'withdraw'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Owner Withdrawal</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTool(activeTool === 'cash' ? 'none' : 'cash')}
              className={`min-h-[42px] inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
                activeTool === 'cash'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Cash Note Counter</span>
            </button>
          </div>
        </div>

        {/* Expandable Tool Panels */}
        <AnimatePresence mode="wait">
          {activeTool === 'reinvest' && (
            <motion.form
              key="tool-reinvest"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              onSubmit={handleReinvestSubmit}
              className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
            >
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Add to MFS Capital (৳)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={mfsReinvest}
                onChange={(e) => setMfsReinvest(e.target.value)}
                placeholder="0"
                className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-num text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Add to Recharge Capital (৳)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={rechargeReinvest}
                onChange={(e) => setRechargeReinvest(e.target.value)}
                placeholder="0"
                className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-num text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[42px] rounded-xl bg-sky-600 hover:bg-sky-700 text-white py-2.5 px-4 text-sm font-semibold transition-colors cursor-pointer"
            >
              Add to Base Capital
            </button>
            </motion.form>
          )}

          {activeTool === 'withdraw' && (
            <motion.form
              key="tool-withdraw"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              onSubmit={handleWithdrawSubmit}
              className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end"
            >
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Withdraw Amount (৳)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="1"
                required
                value={wAmount}
                onChange={(e) => setWAmount(e.target.value)}
                placeholder="0"
                className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-num text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Expense Category
              </label>
              <select
                value={wCategory}
                onChange={(e) => setWCategory(e.target.value)}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              >
                {WITHDRAWAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Capital Source
              </label>
              <select
                value={wSource}
                onChange={(e) => setWSource(e.target.value as CapitalSource)}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="mfs">MFS Capital</option>
                <option value="recharge">Recharge Capital</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Payment Method
              </label>
              <select
                value={wMethod}
                onChange={(e) => setWMethod(e.target.value)}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              >
                {WITHDRAWAL_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Reason / Note
              </label>
              <input
                type="text"
                value={wReason}
                onChange={(e) => setWReason(e.target.value)}
                placeholder="e.g., Household groceries, shop rent..."
                className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[42px] rounded-xl bg-amber-600 hover:bg-amber-700 text-white py-2.5 px-4 text-sm font-semibold transition-colors cursor-pointer"
            >
              Record Withdrawal
            </button>
            </motion.form>
          )}

          {activeTool === 'cash' && (
            <motion.div
              key="tool-cash"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
              className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-4"
            >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  Apply Total To:
                </label>
                <select
                  value={cashTarget}
                  onChange={(e) => setCashTarget(e.target.value as CashTargetKey)}
                  className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                >
                  <option value="omc">Opening MFS Cash</option>
                  <option value="orc">Opening Recharge Cash</option>
                  <option value="cmc">Closing MFS Cash</option>
                  <option value="crc">Closing Recharge Cash</option>
                </select>
              </div>
              <div className="font-mono-num text-base font-bold text-emerald-600 dark:text-emerald-400">
                Counted Cash: {formatBDT(cashTotal)}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {[1000, 500, 200, 100, 50, 20, 10].map((denom) => (
                <div key={denom}>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    ৳{denom} Notes
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={notes[denom]}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [denom]: e.target.value }))
                    }
                    placeholder="0"
                    className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-num text-sm"
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleApplyCash}
                className="min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-xs font-semibold cursor-pointer"
              >
                Apply to Field ({formatBDT(cashTotal)})
              </button>
              <button
                type="button"
                onClick={() =>
                  setNotes({ 1000: '', 500: '', 200: '', 100: '', 50: '', 20: '', 10: '' })
                }
                className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Clear Notes
              </button>
            </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Opening & Closing Side-by-Side Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Opening Balance */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Opening Balance
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                MFS {formatBDT(summary.openMFS)} · Recharge {formatBDT(summary.openRecharge)}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total Opening
              </div>
              <div className="font-mono-num text-xl font-bold text-slate-900 dark:text-slate-100">
                {formatBDT(summary.opening)}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-sky-700 dark:text-sky-400 mb-2">
                <span>MFS Accounts</span>
                <span className="font-mono-num">{formatBDT(summary.openMFS)}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {openMfsFields.map((f) => renderFieldCard(f, 'Opening'))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">
                <span>Mobile Recharge &amp; SIM</span>
                <span className="font-mono-num">{formatBDT(summary.openRecharge)}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {openRechargeFields.map((f) => renderFieldCard(f, 'Opening'))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm pt-1">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">Opening E-Money</div>
              <div className="mt-0.5 font-mono-num font-bold text-slate-900 dark:text-slate-100">
                {formatBDT(summary.openingEmoney)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">Opening Cash</div>
              <div className="mt-0.5 font-mono-num font-bold text-slate-900 dark:text-slate-100">
                {formatBDT(summary.openingCash)}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Opening Note
            </label>
            <textarea
              rows={2}
              value={workspace.openingNote}
              onChange={(e) => onUpdateField('openingNote', e.target.value)}
              placeholder="Optional notes for the start of shift..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </section>

        {/* Closing Balance */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Closing Balance
                </h3>
                <button
                  type="button"
                  onClick={onCopyOpeningToClosing}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  title="Copy Opening values into Closing fields as a starting point"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy Opening</span>
                </button>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                MFS {formatBDT(summary.closeMFS)} · Recharge {formatBDT(summary.closeRecharge)}
              </p>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total Closing
              </div>
              <div className="font-mono-num text-xl font-bold text-slate-900 dark:text-slate-100">
                {formatBDT(summary.closing)}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-sky-700 dark:text-sky-400 mb-2">
                <span>MFS Accounts</span>
                <span className="font-mono-num">
                  {formatBDT(summary.closeMFS)} ({summary.mfsProfit >= 0 ? '+' : ''}
                  {formatBDT(summary.mfsProfit)})
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {closeMfsFields.map((f) => renderFieldCard(f, 'Closing'))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">
                <span>Mobile Recharge &amp; SIM</span>
                <span className="font-mono-num">
                  {formatBDT(summary.closeRecharge)} ({summary.rechargeProfit >= 0 ? '+' : ''}
                  {formatBDT(summary.rechargeProfit)})
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {closeRechargeFields.map((f) => renderFieldCard(f, 'Closing'))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm pt-1">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">Closing E-Money</div>
              <div className="mt-0.5 font-mono-num font-bold text-slate-900 dark:text-slate-100">
                {formatBDT(summary.closingEmoney)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">Closing Cash</div>
              <div className="mt-0.5 font-mono-num font-bold text-slate-900 dark:text-slate-100">
                {formatBDT(summary.closingCash)}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Closing Note {editingHistoryId ? '(Editing History Entry)' : ''}
            </label>
            <textarea
              rows={2}
              value={workspace.closingNote}
              onChange={(e) => onUpdateField('closingNote', e.target.value)}
              placeholder="Optional summary or discrepancy notes..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
        </section>
      </div>

      {/* Live Profit & Final Action Strip */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:shadow-none">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">MFS Profit / Loss</div>
              <div
                className={`font-mono-num text-xl font-bold ${
                  summary.mfsProfit >= 0
                    ? 'text-sky-600 dark:text-sky-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {formatBDT(summary.mfsProfit)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Recharge Profit / Loss</div>
              <div
                className={`font-mono-num text-xl font-bold ${
                  summary.rechargeProfit >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {formatBDT(summary.rechargeProfit)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Net Daily Profit</div>
              <div
                className={`font-mono-num text-2xl font-bold ${
                  summary.totalProfit >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {formatBDT(summary.totalProfit)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleClosingCheck}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-[0.98] transition-all whitespace-nowrap cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Verify Shift</span>
            </button>
            <button
              type="button"
              onClick={onShareReport}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 active:scale-[0.98] px-4 py-2.5 text-sm font-semibold text-indigo-700 dark:text-indigo-300 transition-all whitespace-nowrap cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>Share Report</span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleFinalSaveClick}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-[0.98] px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-all whitespace-nowrap disabled:opacity-60 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{editingHistoryId ? 'Update Closing' : 'Final Save'}</span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onNewDay}
              className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 active:scale-[0.98] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-all whitespace-nowrap disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Start New Day</span>
            </button>
          </div>
        </div>

        {checkReport.checked && (
          <div
            className={`mt-4 rounded-xl border p-3.5 text-xs leading-relaxed ${
              checkReport.warnings.length
                ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
            }`}
          >
            {checkReport.warnings.length ? (
              <div>Warning: {checkReport.warnings.join(', ')}</div>
            ) : (
              <div>
                Balances verified. Opening {formatBDT(summary.opening)} → Closing{' '}
                {formatBDT(summary.closing)} · Net Profit/Loss {formatBDT(summary.totalProfit)}.
              </div>
            )}
          </div>
        )}

        {summary.opening === summary.closing && todaySaved.count > 0 && (
          <div className="mt-4 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/80 dark:bg-sky-950/40 px-3.5 py-2.5 text-xs text-sky-900 dark:text-sky-200">
            Today&apos;s saved closing profit:{' '}
            <span className="font-mono-num font-bold">{formatBDT(todaySaved.profit)}</span> (
            {todaySaved.count} saved). Opening and Closing match for the current shift — enter new
            Closing figures above when closing the next shift.
          </div>
        )}
      </div>

      {/* Daily History Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Daily Shift &amp; Withdrawal History
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {histories.length} cloud records stored
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-1">
            {(
              [
                ['all', 'All'],
                ['dailyClosing', 'Closings'],
                ['ownerWithdrawal', 'Withdrawals'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setHistoryFilter(k)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  historyFilter === k
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {dupInfo.extraIds.length > 0 && onDeduplicateHistories && (
          <div className="mb-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-100">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">
                  {dupInfo.extraIds.length} duplicate records found
                </span>{' '}
                ({dupInfo.closingExtraCount} closings · {dupInfo.withdrawalExtraCount}{' '}
                withdrawals). Clean them up to fix Monthly Profit and Month Withdrawals totals.
              </div>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => onDeduplicateHistories(dupInfo.extraIds.length)}
              className="min-h-[36px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 px-3.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Remove {dupInfo.extraIds.length} Duplicates</span>
            </button>
          </div>
        )}

        {filteredHistories.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            No history records match this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pr-4 font-medium">Date &amp; Time</th>
                  <th className="py-2.5 pr-4 font-medium">Type</th>
                  <th className="py-2.5 pr-4 font-medium text-right">MFS</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Recharge</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Profit / Amount</th>
                  <th className="py-2.5 pr-4 font-medium">Note</th>
                  <th className="py-2.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredHistories.map((h) => {
                  const isWithdrawal = h.type === 'ownerWithdrawal';
                  return (
                    <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 pr-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatDateTimeEn(h.dateIso)}
                      </td>
                      <td className="py-3 pr-4 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {isWithdrawal ? `Owner Withdrawal · ${h.withdrawalCategory}` : 'Daily Closing'}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono-num text-xs text-slate-700 dark:text-slate-300">
                        {isWithdrawal ? '—' : formatBDT(h.mfs)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono-num text-xs text-slate-700 dark:text-slate-300">
                        {isWithdrawal ? '—' : formatBDT(h.recharge)}
                      </td>
                      <td
                        className={`py-3 pr-4 text-right font-mono-num text-sm font-semibold whitespace-nowrap ${
                          isWithdrawal
                            ? 'text-amber-600 dark:text-amber-400'
                            : h.profit >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isWithdrawal ? formatBDT(h.withdrawalAmount) : formatBDT(h.profit)}
                      </td>
                      <td className="py-3 pr-4 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {isWithdrawal
                          ? `${h.withdrawalMethod} · ${h.withdrawalReason || '—'}`
                          : h.note || '—'}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {!isWithdrawal && (
                            <button
                              type="button"
                              onClick={() => handleEditHistoryItem(h)}
                              className="p-2 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              title="Edit closing note"
                              aria-label="Edit closing note"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteHistory(h.id)}
                            className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Delete entry"
                            aria-label="Delete entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MiniCalculatorModal
        open={calcModal.open}
        label={calcModal.label}
        initialValue={safeNum(workspace[calcModal.field])}
        onApply={(val) => onUpdateField(calcModal.field, val)}
        onClose={() => setCalcModal((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
};
