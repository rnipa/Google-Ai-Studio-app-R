import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Calculator,
  Calendar,
  Landmark,
  Receipt,
  Share2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import type {
  DailyHistory,
  LedgerClient,
  NavTab,
  WorkspaceState,
} from '../types';
import {
  computeBalanceSummary,
  daysSince,
  findDuplicateDailyHistoryIds,
  formatBDT,
  isoToLocalDateKey,
  isoToLocalMonthKey,
  localDateKey,
  monthKey,
  safeNum,
} from '../utils/accounting';

interface DashboardViewProps {
  shopName: string;
  workspace: WorkspaceState;
  histories: DailyHistory[];
  clients: LedgerClient[];
  busy?: boolean;
  onNavigate: (tab: NavTab) => void;
  onShareReport: () => void;
  onDeduplicateHistories?: (extraCount: number) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  shopName,
  workspace,
  histories,
  clients,
  busy = false,
  onNavigate,
  onShareReport,
  onDeduplicateHistories,
}) => {
  const summary = useMemo(() => computeBalanceSummary(workspace), [workspace]);
  const workingCapital = safeNum(workspace.mfsCapital) + safeNum(workspace.rechargeCapital);
  const currentMonth = monthKey();
  const todayKey = localDateKey();
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const dupInfo = useMemo(() => findDuplicateDailyHistoryIds(histories), [histories]);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    []
  );

  const stats = useMemo(() => {
    const closingEntries = histories.filter((h) => h.type === 'dailyClosing');
    const withdrawalEntries = histories.filter((h) => h.type === 'ownerWithdrawal');

    let monthlyProfit = 0;
    let monthlyWithdrawal = 0;
    let lifetimeProfit = 0;
    let bestProfit: number | null = null;
    let lowestProfit: number | null = null;
    let todaySavedProfit = 0;
    let todaySavedMfs = 0;
    let todaySavedRecharge = 0;
    let todayClosingCount = 0;

    const byDay = new Map<
      string,
      { dateKey: string; profit: number; mfs: number; recharge: number; count: number; sampleIso: string }
    >();

    closingEntries.forEach((h) => {
      const p = safeNum(h.profit);
      const mfsP = safeNum(h.mfs);
      const recP = safeNum(h.recharge);
      lifetimeProfit += p;
      if (bestProfit === null || p > bestProfit) bestProfit = p;
      if (lowestProfit === null || p < lowestProfit) lowestProfit = p;

      if (isoToLocalMonthKey(h.dateIso) === currentMonth) {
        monthlyProfit += p;
      }

      const dKey = isoToLocalDateKey(h.dateIso);
      if (dKey === todayKey) {
        todaySavedProfit += p;
        todaySavedMfs += mfsP;
        todaySavedRecharge += recP;
        todayClosingCount += 1;
      }

      if (dKey) {
        const prev = byDay.get(dKey);
        if (prev) {
          prev.profit += p;
          prev.mfs += mfsP;
          prev.recharge += recP;
          prev.count += 1;
        } else {
          byDay.set(dKey, {
            dateKey: dKey,
            profit: p,
            mfs: mfsP,
            recharge: recP,
            count: 1,
            sampleIso: h.dateIso,
          });
        }
      }
    });

    withdrawalEntries.forEach((h) => {
      if (isoToLocalMonthKey(h.dateIso) === currentMonth) {
        monthlyWithdrawal += safeNum(h.withdrawalAmount);
      }
    });

    const liveHasDelta = summary.opening !== summary.closing;
    const hasSavedToday = todayClosingCount > 0;
    const displayTodayProfit =
      !liveHasDelta && hasSavedToday ? todaySavedProfit : summary.totalProfit;
    const displayTodayMfs =
      !liveHasDelta && hasSavedToday ? todaySavedMfs : summary.mfsProfit;
    const displayTodayRecharge =
      !liveHasDelta && hasSavedToday ? todaySavedRecharge : summary.rechargeProfit;

    const avgDaily = closingEntries.length ? lifetimeProfit / closingEntries.length : 0;
    const target = safeNum(workspace.dailyTarget);
    const targetPct =
      target > 0 ? Math.max(0, Math.min(100, (displayTodayProfit / target) * 100)) : 0;
    const remainingTarget = target > 0 ? Math.max(0, target - displayTodayProfit) : 0;

    const recent7Days = Array.from(byDay.values())
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .slice(-7);

    return {
      monthlyProfit,
      monthlyWithdrawal,
      lifetimeProfit,
      bestProfit,
      lowestProfit,
      avgDaily,
      targetPct,
      remainingTarget,
      closingCount: closingEntries.length,
      recent7Days,
      liveHasDelta,
      hasSavedToday,
      todaySavedProfit,
      todayClosingCount,
      displayTodayProfit,
      displayTodayMfs,
      displayTodayRecharge,
    };
  }, [
    histories,
    currentMonth,
    todayKey,
    workspace.dailyTarget,
    summary.opening,
    summary.closing,
    summary.totalProfit,
    summary.mfsProfit,
    summary.rechargeProfit,
  ]);

  const ledgerStats = useMemo(() => {
    let receivable = 0;
    let payable = 0;
    let dueCount = 0;
    let highRiskCount = 0;
    const alerts: Array<{ name: string; days: number; due: number }> = [];

    clients.forEach((c) => {
      const bal = safeNum(c.balance);
      if (bal < 0) {
        dueCount++;
        receivable += Math.abs(bal);
        const d = daysSince(c.lastTxIso);
        if (d >= 10) highRiskCount++;
        if (d >= 3) alerts.push({ name: c.name, days: d, due: Math.abs(bal) });
      } else if (bal > 0) {
        payable += bal;
      }
    });

    alerts.sort((a, b) => b.days - a.days);
    return {
      receivable,
      payable,
      net: receivable - payable,
      dueCount,
      highRiskCount,
      alerts: alerts.slice(0, 5),
    };
  }, [clients]);

  const maxChartVal = Math.max(
    1,
    ...stats.recent7Days.map((d) => Math.abs(safeNum(d.profit)))
  );

  const selectedDay =
    stats.recent7Days.find((d) => d.dateKey === selectedDayKey) ||
    stats.recent7Days[stats.recent7Days.length - 1] ||
    null;

  return (
    <div className="space-y-6">
      {/* Executive Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Calendar className="w-3.5 h-3.5" />
            <span>{todayLabel}</span>
            <span>·</span>
            <span className="text-slate-700 dark:text-slate-300 font-semibold">{shopName}</span>
          </div>
          <h2 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Business Overview
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('daily')}
            className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 active:scale-[0.98] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-all whitespace-nowrap cursor-pointer"
          >
            <Calculator className="w-4 h-4" />
            <span>Open Daily Shift</span>
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
            onClick={() => onNavigate('ledger')}
            className="min-h-[42px] inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-[0.98] px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 transition-all whitespace-nowrap cursor-pointer"
          >
            <Users className="w-4 h-4" />
            <span>Client Ledger</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('expenses')}
            className="min-h-[42px] inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-[0.98] px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 transition-all whitespace-nowrap cursor-pointer"
          >
            <Receipt className="w-4 h-4" />
            <span>Expenses</span>
          </button>
        </div>
      </div>

      {/* Duplicate History / Withdrawal Warning Banner */}
      {dupInfo.extraIds.length > 0 && onDeduplicateHistories && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-amber-900 dark:text-amber-100">
              <div className="font-bold text-sm">
                {dupInfo.extraIds.length} Duplicate Closing / Withdrawal Records Detected
              </div>
              <p className="mt-0.5 text-amber-800 dark:text-amber-200">
                Found {dupInfo.closingExtraCount} repeated daily closings and{' '}
                {dupInfo.withdrawalExtraCount} repeated owner withdrawals (from repeated backup
                imports or double-saves). This multiplies Monthly Profit and Month Withdrawals.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDeduplicateHistories(dupInfo.extraIds.length)}
            className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-[0.98] px-4 py-2 text-xs font-semibold text-white shadow-xs transition-all whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Clean Up {dupInfo.extraIds.length} Duplicates</span>
          </button>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:shadow-none hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Working Capital
            </span>
            <Landmark className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 font-mono-num text-2xl font-bold text-slate-900 dark:text-slate-100">
            {formatBDT(workingCapital)}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            MFS {formatBDT(workspace.mfsCapital)} · Recharge {formatBDT(workspace.rechargeCapital)}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:shadow-none hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {!stats.liveHasDelta && stats.hasSavedToday
                ? "Today's Saved Profit"
                : "Today's Live Profit"}
            </span>
            {stats.displayTodayProfit >= 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-500" />
            )}
          </div>
          <div
            className={`mt-2 font-mono-num text-2xl font-bold ${
              stats.displayTodayProfit >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {formatBDT(stats.displayTodayProfit)}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            MFS {formatBDT(stats.displayTodayMfs)} · Recharge{' '}
            {formatBDT(stats.displayTodayRecharge)}
            {!stats.liveHasDelta && stats.hasSavedToday
              ? ' · Next shift live: ৳0'
              : stats.liveHasDelta && stats.hasSavedToday
                ? ` · Saved today: ${formatBDT(stats.todaySavedProfit)}`
                : ''}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:shadow-none hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Monthly Profit
            </span>
            <TrendingUp className="w-4 h-4 text-sky-500" />
          </div>
          <div className="mt-2 font-mono-num text-2xl font-bold text-sky-600 dark:text-sky-400">
            {formatBDT(stats.monthlyProfit)}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            {stats.closingCount} closings · Avg {formatBDT(stats.avgDaily)}/day
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:shadow-none hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Month Withdrawals
            </span>
            <Wallet className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 font-mono-num text-2xl font-bold text-amber-600 dark:text-amber-400">
            {formatBDT(stats.monthlyWithdrawal)}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Synced automatically to Expenses
          </div>
        </div>
      </div>

      {/* Live Counter Liquidity Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:shadow-none">
        <div className="px-2 py-1">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Shift Opening Total
          </div>
          <div className="mt-0.5 font-mono-num text-base font-bold text-slate-900 dark:text-slate-100">
            {formatBDT(summary.opening)}
          </div>
        </div>
        <div className="px-2 py-1 border-l border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Shift Closing Total
          </div>
          <div className="mt-0.5 font-mono-num text-base font-bold text-slate-900 dark:text-slate-100">
            {formatBDT(summary.closing)}
          </div>
        </div>
        <div className="px-2 py-1 lg:border-l border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Closing Cash in Hand
          </div>
          <div className="mt-0.5 font-mono-num text-base font-bold text-emerald-600 dark:text-emerald-400">
            {formatBDT(summary.closingCash)}
          </div>
        </div>
        <div className="px-2 py-1 border-l border-slate-100 dark:border-slate-800">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Closing E-Money
          </div>
          <div className="mt-0.5 font-mono-num text-base font-bold text-sky-600 dark:text-sky-400">
            {formatBDT(summary.closingEmoney)}
          </div>
        </div>
      </div>

      {/* Main Analytics + Ledger Health Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent 7-Day Profit Chart */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  7-Day Profit Performance
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                  Best: {stats.bestProfit !== null ? formatBDT(stats.bestProfit) : '—'} · Low:{' '}
                  {stats.lowestProfit !== null ? formatBDT(stats.lowestProfit) : '—'} · Lifetime:{' '}
                  {formatBDT(stats.lifetimeProfit)}
                </p>
              </div>
              {selectedDay && (
                <div className="text-right text-xs">
                  <div className="text-slate-500 dark:text-slate-400">
                    {new Date(selectedDay.sampleIso).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                    {selectedDay.count > 1 ? ` (${selectedDay.count} entries)` : ''}
                  </div>
                  <div className="font-mono-num font-bold text-slate-900 dark:text-slate-100">
                    {formatBDT(selectedDay.profit)}
                  </div>
                </div>
              )}
            </div>

            {stats.recent7Days.length === 0 ? (
              <div className="py-14 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No daily closings saved yet.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('daily')}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                >
                  <span>Record your first shift closing</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-2.5 sm:gap-3 items-end h-52 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                {stats.recent7Days.map((item) => {
                  const p = safeNum(item.profit);
                  const pct = Math.max(10, Math.round((Math.abs(p) / maxChartVal) * 100));
                  const d = new Date(item.sampleIso);
                  const label = Number.isNaN(d.getTime())
                    ? item.dateKey
                    : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
                  const isSelected = selectedDay?.dateKey === item.dateKey;
                  return (
                    <button
                      key={item.dateKey}
                      type="button"
                      onClick={() => setSelectedDayKey(item.dateKey)}
                      className="flex flex-col items-center gap-2 h-full justify-end group cursor-pointer focus:outline-none"
                    >
                      <span className="font-mono-num text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate max-w-full">
                        {p >= 0 ? `+${Math.round(p)}` : Math.round(p)}
                      </span>
                      <div className="w-full flex-1 flex items-end">
                        <div
                          style={{ height: `${pct}%` }}
                          className={`w-full rounded-t-lg transition-all ${
                            p >= 0
                              ? isSelected
                                ? 'bg-emerald-600 dark:bg-emerald-400'
                                : 'bg-emerald-500/80 group-hover:bg-emerald-500 dark:bg-emerald-500/65'
                              : isSelected
                                ? 'bg-rose-600 dark:bg-rose-400'
                                : 'bg-rose-500/80 group-hover:bg-rose-500 dark:bg-rose-500/65'
                          }`}
                        />
                      </div>
                      <span
                        className={`text-[11px] truncate max-w-full ${
                          isSelected
                            ? 'font-semibold text-slate-900 dark:text-slate-100'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Daily Target Progress */}
          <div className="mt-5 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2">
              <span className="font-medium text-slate-600 dark:text-slate-300">
                Daily Profit Goal ({formatBDT(workspace.dailyTarget)})
              </span>
              <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                {stats.targetPct.toFixed(0)}%
                {stats.remainingTarget > 0
                  ? ` · ${formatBDT(stats.remainingTarget)} remaining`
                  : workspace.dailyTarget > 0
                    ? ' · Goal Achieved'
                    : ''}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                style={{ width: `${stats.targetPct}%` }}
                className={`h-full rounded-full transition-all ${
                  stats.targetPct >= 100 ? 'bg-emerald-500' : 'bg-sky-600'
                }`}
              />
            </div>
          </div>
        </div>

        {/* External Ledger & Due Reminders */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Ledger &amp; Receivables
              </h3>
              <Wallet className="w-5 h-5 text-slate-400" />
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">Receivable (To Collect)</span>
                <span className="font-mono-num font-bold text-emerald-600 dark:text-emerald-400">
                  {formatBDT(ledgerStats.receivable)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">Payable (To Pay)</span>
                <span className="font-mono-num font-bold text-rose-600 dark:text-rose-400">
                  {formatBDT(ledgerStats.payable)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">Net Position</span>
                <span className="font-mono-num font-bold text-slate-900 dark:text-slate-100">
                  {formatBDT(ledgerStats.net)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-600 dark:text-slate-400">Active Dues / High Risk</span>
                <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                  {ledgerStats.dueCount} clients · {ledgerStats.highRiskCount} risk
                </span>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2.5">
                <Bell className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Overdue Follow-ups (3+ days)</span>
              </div>

              {ledgerStats.alerts.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No overdue receivable alerts right now.
                </p>
              ) : (
                <ul className="space-y-2">
                  {ledgerStats.alerts.map((a, idx) => (
                    <li
                      key={`${a.name}-${idx}`}
                      className="flex items-center justify-between text-xs py-1"
                    >
                      <span className="text-slate-700 dark:text-slate-300 truncate max-w-[155px]">
                        {a.name} ({a.days}d)
                      </span>
                      <span className="font-mono-num font-semibold text-rose-600 dark:text-rose-400">
                        {formatBDT(a.due)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('ledger')}
            className="mt-5 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Open Ledger &amp; Reminders
          </button>
        </div>
      </div>
    </div>
  );
};
