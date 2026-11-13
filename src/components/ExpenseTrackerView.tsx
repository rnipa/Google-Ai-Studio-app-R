import React, { useMemo, useState } from 'react';
import { Plus, Search, Target, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  CategoryBudget,
  DailyHistory,
  PersonalExpense,
  SavingsGoal,
} from '../types';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_METHODS,
  formatBDT,
  isoToLocalDateKey,
  isoToLocalMonthKey,
  localDateKey,
  monthKey,
  safeNum,
} from '../utils/accounting';

interface ExpenseTrackerViewProps {
  histories: DailyHistory[];
  expenses: PersonalExpense[];
  budgets: CategoryBudget[];
  savingsGoal: SavingsGoal | null;
  busy: boolean;
  onAddExpense: (payload: {
    date: string;
    amount: number;
    category: string;
    method: string;
    note: string;
  }) => Promise<void>;
  onDeleteExpense: (expenseId: string) => void;
  onSaveBudget: (category: string, amount: number) => Promise<void>;
  onDeleteBudget: (budgetId: string) => void;
  onSaveGoal: (target: number, saved: number) => Promise<void>;
}

interface UnifiedExpenseItem {
  id: string;
  date: string;
  amount: number;
  category: string;
  method: string;
  note: string;
  source: 'Manual' | 'ERP Owner Withdrawal';
}

export const ExpenseTrackerView: React.FC<ExpenseTrackerViewProps> = ({
  histories,
  expenses,
  budgets,
  savingsGoal,
  busy,
  onAddExpense,
  onDeleteExpense,
  onSaveBudget,
  onDeleteBudget,
  onSaveGoal,
}) => {
  const [selectedMonth, setSelectedMonth] = useState(monthKey());
  const [subTab, setSubTab] = useState<'overview' | 'transactions' | 'analytics' | 'budget'>('overview');

  // Filter state
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');

  // Add Expense modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [fDate, setFDate] = useState(localDateKey());
  const [fAmount, setFAmount] = useState('');
  const [fCat, setFCat] = useState(EXPENSE_CATEGORIES[0]);
  const [fMethod, setFMethod] = useState('Cash');
  const [fNote, setFNote] = useState('');

  // Budget & Goal inputs
  const [bCat, setBCat] = useState(EXPENSE_CATEGORIES[0]);
  const [bAmt, setBAmt] = useState('');
  const [gTarget, setGTarget] = useState(String(savingsGoal?.target || ''));
  const [gSaved, setGSaved] = useState(String(savingsGoal?.saved || ''));

  const unifiedExpenses = useMemo<UnifiedExpenseItem[]>(() => {
    const manual: UnifiedExpenseItem[] = expenses.map((e) => ({
      id: e.id,
      date: e.date,
      amount: safeNum(e.amount),
      category: e.category,
      method: e.method,
      note: e.note,
      source: 'Manual',
    }));

    const ownerWithdrawals: UnifiedExpenseItem[] = histories
      .filter((h) => h.type === 'ownerWithdrawal' && safeNum(h.withdrawalAmount) > 0)
      .map((h) => ({
        id: `OW-${h.id}`,
        date: isoToLocalDateKey(h.dateIso) || localDateKey(),
        amount: safeNum(h.withdrawalAmount),
        category: h.withdrawalCategory || 'Owner Withdrawal',
        method: h.withdrawalMethod || 'Cash',
        note: h.withdrawalReason || 'Owner Withdrawal',
        source: 'ERP Owner Withdrawal',
      }));

    return [...ownerWithdrawals, ...manual].sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, histories]);

  const monthItems = useMemo(
    () => unifiedExpenses.filter((x) => x.date.slice(0, 7) === selectedMonth),
    [unifiedExpenses, selectedMonth]
  );

  const monthProfit = useMemo(() => {
    return histories
      .filter(
        (h) =>
          h.type === 'dailyClosing' && isoToLocalMonthKey(h.dateIso) === selectedMonth
      )
      .reduce((sum, h) => sum + safeNum(h.profit), 0);
  }, [histories, selectedMonth]);

  const totalExpense = useMemo(
    () => monthItems.reduce((sum, x) => sum + x.amount, 0),
    [monthItems]
  );

  const ownerWithdrawalTotal = useMemo(
    () =>
      monthItems
        .filter((x) => x.source === 'ERP Owner Withdrawal')
        .reduce((sum, x) => sum + x.amount, 0),
    [monthItems]
  );

  const netAfterExpense = monthProfit - totalExpense;

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    monthItems.forEach((x) => {
      map[x.category] = (map[x.category] || 0) + x.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [monthItems]);

  const methodBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    monthItems.forEach((x) => {
      map[x.method] = (map[x.method] || 0) + x.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [monthItems]);

  const dailyBuckets = useMemo(() => {
    const map: Record<string, number> = {};
    monthItems.forEach((x) => {
      map[x.date] = (map[x.date] || 0) + x.amount;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [monthItems]);

  const monthlyTrend = useMemo(() => {
    const map: Record<string, number> = {};
    unifiedExpenses.forEach((x) => {
      const m = x.date.slice(0, 7);
      map[m] = (map[m] || 0) + x.amount;
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  }, [unifiedExpenses]);

  const insights = useMemo(() => {
    const list: string[] = [];
    if (!monthItems.length) {
      list.push('No personal expenses recorded for this month yet.');
    } else {
      if (monthProfit > 0 && totalExpense > monthProfit * 0.5) {
        list.push('Alert: Monthly expenses exceed 50% of this month’s business profit.');
      }
      if (categoryBreakdown[0]) {
        list.push(
          `Highest spending category is "${categoryBreakdown[0][0]}" (${formatBDT(categoryBreakdown[0][1])}).`
        );
      }
      list.push(`Average expense per entry is ${formatBDT(totalExpense / monthItems.length)}.`);
      if (netAfterExpense < 0) {
        list.push('Net balance after deducting expenses is currently negative this month.');
      }
    }
    budgets.forEach((b) => {
      const spent = categoryBreakdown.find(([c]) => c === b.category)?.[1] || 0;
      if (b.amount > 0 && spent > b.amount) {
        list.push(`Budget exceeded: ${b.category} is over its ${formatBDT(b.amount)} monthly limit.`);
      }
    });
    return list;
  }, [monthItems, monthProfit, totalExpense, categoryBreakdown, netAfterExpense, budgets]);

  const filteredTx = useMemo(() => {
    const q = search.trim().toLowerCase();
    return monthItems.filter(
      (x) =>
        (!q || `${x.category} ${x.note} ${x.method}`.toLowerCase().includes(q)) &&
        (!catFilter || x.category === catFilter) &&
        (!methodFilter || x.method === methodFilter)
    );
  }, [monthItems, search, catFilter, methodFilter]);

  const handleOpenAdd = (presetCategory?: string) => {
    setFDate(localDateKey());
    if (presetCategory) setFCat(presetCategory);
    setShowAddModal(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = safeNum(fAmount);
    if (!fDate || amt <= 0) return;
    await onAddExpense({
      date: fDate,
      amount: amt,
      category: fCat,
      method: fMethod,
      note: fNote.trim(),
    });
    setSelectedMonth(fDate.slice(0, 7));
    setFAmount('');
    setFNote('');
    setShowAddModal(false);
  };

  const maxDaily = Math.max(1, ...dailyBuckets.map(([, v]) => v));
  const maxMonthly = Math.max(1, ...monthlyTrend.map(([, v]) => v));

  return (
    <div className="space-y-6">
      {/* Header & Month Picker */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Expense Tracker Pro · Owner Withdrawals Synced Automatically
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Personal Expenses, Budgets &amp; Savings
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-mono-num"
          />
          <button
            type="button"
            onClick={() => setSelectedMonth(monthKey())}
            className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => handleOpenAdd()}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 active:scale-[0.98] px-4 py-2 text-sm font-semibold text-white shadow-xs transition-all whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </button>
        </div>
      </div>

      {/* 5 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:shadow-none">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Expenses</div>
          <div className="mt-1.5 font-mono-num text-xl font-bold text-rose-600 dark:text-rose-400">
            {formatBDT(totalExpense)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Business Profit</div>
          <div className="mt-1.5 font-mono-num text-xl font-bold text-slate-900 dark:text-slate-100">
            {formatBDT(monthProfit)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Net After Expenses</div>
          <div
            className={`mt-1.5 font-mono-num text-xl font-bold ${
              netAfterExpense >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {formatBDT(netAfterExpense)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Owner Withdrawals</div>
          <div className="mt-1.5 font-mono-num text-xl font-bold text-amber-600 dark:text-amber-400">
            {formatBDT(ownerWithdrawalTotal)}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Entries</div>
          <div className="mt-1.5 font-mono-num text-xl font-bold text-slate-900 dark:text-slate-100">
            {monthItems.length}
          </div>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="inline-flex flex-wrap rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
        {(
          [
            ['overview', 'Overview'],
            ['transactions', 'Transactions'],
            ['analytics', 'Analytics'],
            ['budget', 'Budgets & Goal'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            className={`min-h-[38px] px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              subTab === key
                ? 'bg-slate-900 text-white dark:bg-sky-600'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {subTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Daily Spending Trend ({selectedMonth})
              </h3>
              {dailyBuckets.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  No expenses logged for this month.
                </div>
              ) : (
                <div className="flex items-end gap-2 h-52 overflow-x-auto pt-4 pb-1">
                  {dailyBuckets.map(([day, val]) => {
                    const pct = Math.max(8, Math.round((val / maxDaily) * 100));
                    return (
                      <div
                        key={day}
                        className="flex-1 min-w-[28px] flex flex-col items-center gap-1.5 h-full justify-end"
                      >
                        <span className="font-mono-num text-[10px] text-slate-600 dark:text-slate-400">
                          {Math.round(val)}
                        </span>
                        <div className="w-full flex-1 flex items-end">
                          <div
                            style={{ height: `${pct}%` }}
                            className="w-full rounded-t-md bg-sky-600/85"
                          />
                        </div>
                        <span className="text-[10px] text-slate-500">{day.slice(8, 10)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Smart Insights
              </h3>
              {insights.map((msg, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300"
                >
                  {msg}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Category Breakdown */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Spending by Category
              </h3>
              {categoryBreakdown.length === 0 ? (
                <p className="text-xs text-slate-500">No expense data available</p>
              ) : (
                <div className="space-y-3">
                  {categoryBreakdown.slice(0, 6).map(([cat, amt]) => {
                    const pct = totalExpense ? Math.round((amt / totalExpense) * 100) : 0;
                    return (
                      <div key={cat}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-700 dark:text-slate-300">{cat}</span>
                          <span className="font-mono-num font-semibold">{formatBDT(amt)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div style={{ width: `${pct}%` }} className="h-full bg-sky-600 rounded-full" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Method Breakdown */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Payment Methods
              </h3>
              {methodBreakdown.length === 0 ? (
                <p className="text-xs text-slate-500">No payment data available</p>
              ) : (
                <div className="space-y-3">
                  {methodBreakdown.slice(0, 6).map(([m, amt]) => {
                    const pct = totalExpense ? Math.round((amt / totalExpense) * 100) : 0;
                    return (
                      <div key={m}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-700 dark:text-slate-300">{m}</span>
                          <span className="font-mono-num font-semibold">{formatBDT(amt)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div style={{ width: `${pct}%` }} className="h-full bg-emerald-600 rounded-full" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Add */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Quick Add Category
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {EXPENSE_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleOpenAdd(cat)}
                    className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-left truncate cursor-pointer"
                  >
                    + {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TRANSACTIONS TAB */}
      {subTab === 'transactions' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search category, note, or method..."
                className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
            >
              <option value="">All Categories</option>
              {[...new Set(monthItems.map((x) => x.category))].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
            >
              <option value="">All Methods</option>
              {[...new Set(monthItems.map((x) => x.method))].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                  <th className="py-2.5 pr-3 font-medium">Date</th>
                  <th className="py-2.5 pr-3 font-medium">Category</th>
                  <th className="py-2.5 pr-3 font-medium">Note</th>
                  <th className="py-2.5 pr-3 font-medium">Method</th>
                  <th className="py-2.5 pr-3 font-medium">Source</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Amount</th>
                  <th className="py-2.5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTx.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 pr-3 text-xs text-slate-600 dark:text-slate-300 font-mono-num">
                      {item.date}
                    </td>
                    <td className="py-3 pr-3 text-xs font-medium text-slate-900 dark:text-slate-100">
                      {item.category}
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-500 dark:text-slate-400">
                      {item.note || '—'}
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-600 dark:text-slate-300">
                      {item.method}
                    </td>
                    <td className="py-3 pr-3 text-xs text-slate-500 dark:text-slate-400">
                      {item.source === 'ERP Owner Withdrawal' ? 'ERP Withdrawal' : 'Manual'}
                    </td>
                    <td className="py-3 pr-3 text-right font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                      {formatBDT(item.amount)}
                    </td>
                    <td className="py-3 text-right">
                      {item.source === 'Manual' ? (
                        <button
                          type="button"
                          onClick={() => onDeleteExpense(item.id)}
                          className="p-2 rounded-lg text-slate-500 hover:text-rose-600 cursor-pointer"
                          aria-label="Delete expense"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">ERP</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredTx.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                      No expense entries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ANALYTICS TAB */}
      {subTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Top Expense Category</div>
              <div className="mt-1.5 text-base font-bold text-slate-900 dark:text-slate-100">
                {categoryBreakdown[0]
                  ? `${categoryBreakdown[0][0]} · ${formatBDT(categoryBreakdown[0][1])}`
                  : '—'}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Average per Entry</div>
              <div className="mt-1.5 font-mono-num text-base font-bold text-slate-900 dark:text-slate-100">
                {monthItems.length ? formatBDT(totalExpense / monthItems.length) : '৳0'}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="text-xs text-slate-500 dark:text-slate-400">Expense-to-Profit Ratio</div>
              <div className="mt-1.5 font-mono-num text-base font-bold text-slate-900 dark:text-slate-100">
                {monthProfit > 0 ? `${((totalExpense / monthProfit) * 100).toFixed(1)}%` : '—'}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Monthly Spending Comparison (Last 6 Months)
            </h3>
            {monthlyTrend.length === 0 ? (
              <p className="text-xs text-slate-500">Not enough historical data yet</p>
            ) : (
              <div className="grid grid-cols-6 gap-3 items-end h-44 pt-4">
                {monthlyTrend.map(([m, val]) => {
                  const pct = Math.max(10, Math.round((val / maxMonthly) * 100));
                  return (
                    <div key={m} className="flex flex-col items-center gap-1.5 h-full justify-end">
                      <span className="font-mono-num text-[11px] font-semibold">
                        {Math.round(val)}
                      </span>
                      <div className="w-full flex-1 flex items-end">
                        <div
                          style={{ height: `${pct}%` }}
                          className="w-full rounded-t-lg bg-sky-600/85"
                        />
                      </div>
                      <span className="text-[11px] text-slate-500">{m}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* BUDGET & SAVINGS TAB */}
      {subTab === 'budget' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Category Budgets */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Set Category Budgets
            </h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (safeNum(bAmt) <= 0) return;
                await onSaveBudget(bCat, safeNum(bAmt));
                setBAmt('');
              }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end"
            >
              <div>
                <label className="block text-xs text-slate-500 mb-1">Category</label>
                <select
                  value={bCat}
                  onChange={(e) => setBCat(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Monthly Limit (৳)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="1"
                  required
                  value={bAmt}
                  onChange={(e) => setBAmt(e.target.value)}
                  placeholder="5000"
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-num text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[40px] rounded-xl bg-sky-600 hover:bg-sky-700 text-white py-2 px-4 text-sm font-semibold cursor-pointer"
              >
                Save Budget
              </button>
            </form>

            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              {budgets.length === 0 ? (
                <p className="text-xs text-slate-500">No monthly category budgets set yet.</p>
              ) : (
                budgets.map((b) => {
                  const spent = categoryBreakdown.find(([c]) => c === b.category)?.[1] || 0;
                  const pct = b.amount > 0 ? Math.min(100, (spent / b.amount) * 100) : 0;
                  const over = b.amount > 0 && spent > b.amount;
                  return (
                    <div key={b.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {b.category}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono-num ${
                              over ? 'text-rose-600 font-bold' : 'text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {formatBDT(spent)} / {formatBDT(b.amount)}
                          </span>
                          <button
                            type="button"
                            onClick={() => onDeleteBudget(b.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                            aria-label="Delete budget"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          style={{ width: `${pct}%` }}
                          className={`h-full rounded-full ${over ? 'bg-rose-600' : 'bg-sky-600'}`}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Savings Goal */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Savings Goal Tracker
              </h3>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await onSaveGoal(safeNum(gTarget), safeNum(gSaved));
              }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end"
            >
              <div>
                <label className="block text-xs text-slate-500 mb-1">Target (৳)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={gTarget}
                  onChange={(e) => setGTarget(e.target.value)}
                  placeholder="100000"
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-num text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Saved So Far (৳)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={gSaved}
                  onChange={(e) => setGSaved(e.target.value)}
                  placeholder="0"
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-num text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-4 text-sm font-semibold cursor-pointer"
              >
                Save Goal
              </button>
            </form>

            {savingsGoal && savingsGoal.target > 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <div className="flex justify-between text-xs text-slate-500 font-mono-num">
                  <span>Saved: {formatBDT(savingsGoal.saved)}</span>
                  <span>Target: {formatBDT(savingsGoal.target)}</span>
                </div>
                <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    style={{
                      width: `${Math.min(100, (savingsGoal.saved / savingsGoal.target) * 100)}%`,
                    }}
                    className="h-full bg-emerald-600 rounded-full"
                  />
                </div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-mono-num">
                  {Math.min(100, Math.round((savingsGoal.saved / savingsGoal.target) * 100))}%
                  complete · {formatBDT(Math.max(0, savingsGoal.target - savingsGoal.saved))} remaining
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No savings goal configured yet.</p>
            )}
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
            onClick={() => setShowAddModal(false)}
          >
            <motion.form
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleAddSubmit}
              className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl"
            >
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Add Personal Expense
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={fDate}
                    onChange={(e) => setFDate(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Amount (৳)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="0.01"
                    required
                    value={fAmount}
                    onChange={(e) => setFAmount(e.target.value)}
                    placeholder="0"
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-num text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Category</label>
                  <select
                    value={fCat}
                    onChange={(e) => setFCat(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Method</label>
                  <select
                    value={fMethod}
                    onChange={(e) => setFMethod(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    {EXPENSE_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Note</label>
                <input
                  type="text"
                  value={fNote}
                  onChange={(e) => setFNote(e.target.value)}
                  placeholder="e.g., Groceries, medicine, fare..."
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="min-h-[38px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-[38px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-semibold transition-all cursor-pointer"
                >
                  Save Expense
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
