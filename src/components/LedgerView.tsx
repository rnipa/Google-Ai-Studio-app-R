import React, { useMemo, useRef, useState } from 'react';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Edit3,
  Eye,
  MessageCircle,
  Printer,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { makeClientDuplicateKey } from '../services/erpStore';
import { ShareReportModal, type ShareReportPayload } from './ShareReportModal';
import type {
  ArchivedTransaction,
  LedgerArchive,
  LedgerClient,
  LedgerFundSource,
  LedgerTransaction,
  LedgerTxType,
} from '../types';
import {
  LEDGER_METHODS,
  LEDGER_TX_LABELS,
  buildWhatsAppReminderUrl,
  buildWhatsAppTxPayload,
  formatBDT,
  formatDateTimeEn,
  getClientRisk,
  safeNum,
} from '../utils/accounting';

interface LedgerViewProps {
  uid: string;
  shopName: string;
  clients: LedgerClient[];
  archives: LedgerArchive[];
  busy: boolean;
  onAddClient: (name: string, mobile: string) => Promise<void>;
  onUpdateClient: (clientId: string, name: string, mobile: string) => Promise<void>;
  onDeleteClient: (client: LedgerClient) => void;
  onDeduplicateClients: (extraCount: number) => void;
  onFetchClientTxs: (clientId: string) => Promise<LedgerTransaction[]>;
  onFetchArchiveTxs: (archiveId: string) => Promise<ArchivedTransaction[]>;
  onRecordTransaction: (
    client: LedgerClient,
    currentTxs: LedgerTransaction[],
    payload: {
      amount: number;
      type: LedgerTxType;
      method: string;
      fundSource: LedgerFundSource;
      note: string;
    }
  ) => Promise<{ settled: boolean; newBalance: number }>;
  onEditTransaction: (
    client: LedgerClient,
    allTxs: LedgerTransaction[],
    txId: string,
    patch: { amount: number; type: LedgerTxType; note: string }
  ) => Promise<void>;
  onDeleteTransaction: (
    client: LedgerClient,
    allTxs: LedgerTransaction[],
    txId: string
  ) => void;
  onPrintArchive: (archive: LedgerArchive, txs: ArchivedTransaction[]) => void;
}

export const LedgerView: React.FC<LedgerViewProps> = ({
  shopName,
  clients,
  archives,
  busy,
  onAddClient,
  onUpdateClient,
  onDeleteClient,
  onDeduplicateClients,
  onFetchClientTxs,
  onFetchArchiveTxs,
  onRecordTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onPrintArchive,
}) => {
  const [subTab, setSubTab] = useState<'ledger' | 'clientView' | 'archive'>('ledger');
  const [clientTab, setClientTab] = useState<'receivable' | 'payable'>('receivable');
  const [search, setSearch] = useState('');

  // Add client form
  const [newName, setNewName] = useState('');
  const [newMobile, setNewMobile] = useState('');

  // Transaction form
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [txAmount, setTxAmount] = useState('');
  const [txType, setTxType] = useState<LedgerTxType>('gave');
  const [txMethod, setTxMethod] = useState('Cash');
  const [txSource, setTxSource] = useState<LedgerFundSource>('mfs');
  const [txNote, setTxNote] = useState('');

  // Last WhatsApp receipt shortcut with interactive rotating template style
  const waRotationRef = useRef(0);
  const [showWaPreview, setShowWaPreview] = useState(false);
  const [lastWaReceipt, setLastWaReceipt] = useState<{
    clientName: string;
    mobile: string;
    newBalance: number;
    amount: number;
    type: LedgerTxType;
    method: string;
    settled: boolean;
    note: string;
    variantIndex: number;
    url: string;
    text: string;
    styleName: string;
    styleTotal: number;
  } | null>(null);

  // Expanded client transactions cache
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [txCache, setTxCache] = useState<Record<string, LedgerTransaction[]>>({});
  const [loadingClientId, setLoadingClientId] = useState<string | null>(null);

  // Edit client modal
  const [editingClient, setEditingClient] = useState<LedgerClient | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editClientMobile, setEditClientMobile] = useState('');

  // Edit tx modal
  const [editingTx, setEditingTx] = useState<{
    client: LedgerClient;
    tx: LedgerTransaction;
  } | null>(null);
  const [editTxAmount, setEditTxAmount] = useState('');
  const [editTxType, setEditTxType] = useState<LedgerTxType>('gave');
  const [editTxNote, setEditTxNote] = useState('');

  // Expanded archive folder & archive items
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [archiveTxCache, setArchiveTxCache] = useState<Record<string, ArchivedTransaction[]>>({});
  const [loadingArchiveId, setLoadingArchiveId] = useState<string | null>(null);

  // Share Report Modal state
  const [sharePayload, setSharePayload] = useState<ShareReportPayload | null>(null);
  const [loadingShareId, setLoadingShareId] = useState<string | null>(null);

  const activeClientId = selectedClientId || (clients[0]?.id ?? '');

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || (c.mobile || '').toLowerCase().includes(q)
    );
  }, [clients, search]);

  const { receivableClients, payableClients, receivableTotal, payableTotal } = useMemo(() => {
    const rec: LedgerClient[] = [];
    const pay: LedgerClient[] = [];
    let recSum = 0;
    let paySum = 0;
    clients.forEach((c) => {
      if (c.balance < 0) {
        rec.push(c);
        recSum += Math.abs(c.balance);
      } else if (c.balance > 0) {
        pay.push(c);
        paySum += c.balance;
      }
    });
    return {
      receivableClients: rec,
      payableClients: pay,
      receivableTotal: recSum,
      payableTotal: paySum,
    };
  }, [clients]);

  const groupedArchives = useMemo(() => {
    const groups: Record<string, { name: string; items: LedgerArchive[] }> = {};
    archives.forEach((a) => {
      const key = a.personName || 'Unknown';
      if (!groups[key]) groups[key] = { name: key, items: [] };
      groups[key].items.push(a);
    });
    return Object.values(groups);
  }, [archives]);

  const { duplicateExtraCount, duplicateNamesSample } = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    clients.forEach((c) => {
      const key = makeClientDuplicateKey(c.name, c.mobile);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { name: c.name, count: 1 });
    });
    let extra = 0;
    const names: string[] = [];
    counts.forEach((v) => {
      if (v.count > 1) {
        extra += v.count - 1;
        if (names.length < 3) names.push(`${v.name} (×${v.count})`);
      }
    });
    return { duplicateExtraCount: extra, duplicateNamesSample: names };
  }, [clients]);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await onAddClient(newName.trim(), newMobile.trim());
    setNewName('');
    setNewMobile('');
  };

  const toggleExpandClient = async (clientId: string) => {
    if (expandedClientId === clientId) {
      setExpandedClientId(null);
      return;
    }
    setExpandedClientId(clientId);
    setLoadingClientId(clientId);
    try {
      const txs = await onFetchClientTxs(clientId);
      setTxCache((prev) => ({ ...prev, [clientId]: txs }));
    } finally {
      setLoadingClientId(null);
    }
  };

  const handleTxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find((c) => c.id === activeClientId);
    if (!client) return;
    const amt = safeNum(txAmount);
    if (amt <= 0) return;

    const currentTxs = txCache[client.id] ?? (await onFetchClientTxs(client.id));
    const res = await onRecordTransaction(client, currentTxs, {
      amount: amt,
      type: txType,
      method: txMethod,
      fundSource: txSource,
      note: txNote,
    });

    if (res.settled) {
      setTxCache((prev) => ({ ...prev, [client.id]: [] }));
    } else {
      const updatedTxs = await onFetchClientTxs(client.id);
      setTxCache((prev) => ({ ...prev, [client.id]: updatedTxs }));
    }

    if (client.mobile && client.mobile.trim()) {
      const nextIdx = waRotationRef.current;
      waRotationRef.current += 1;
      const wa = buildWhatsAppTxPayload({
        clientName: client.name,
        mobile: client.mobile,
        newBalance: res.newBalance,
        amount: amt,
        type: txType,
        method: txMethod,
        settled: res.settled,
        shopName,
        note: txNote,
        variantIndex: nextIdx,
      });
      setLastWaReceipt({
        clientName: client.name,
        mobile: client.mobile,
        newBalance: res.newBalance,
        amount: amt,
        type: txType,
        method: txMethod,
        settled: res.settled,
        note: txNote,
        variantIndex: wa.styleIndex,
        url: wa.url,
        text: wa.text,
        styleName: wa.styleName,
        styleTotal: wa.styleTotal,
      });
      setShowWaPreview(false);
    } else {
      setLastWaReceipt(null);
    }

    setTxAmount('');
    setTxNote('');
  };

  const handleSaveClientEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    await onUpdateClient(editingClient.id, editClientName, editClientMobile);
    setEditingClient(null);
  };

  const handleSaveTxEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;
    const list = txCache[editingTx.client.id] || [];
    await onEditTransaction(editingTx.client, list, editingTx.tx.id, {
      amount: safeNum(editTxAmount),
      type: editTxType,
      note: editTxNote,
    });
    const refreshed = await onFetchClientTxs(editingTx.client.id);
    setTxCache((prev) => ({ ...prev, [editingTx.client.id]: refreshed }));
    setEditingTx(null);
  };

  const handleLoadArchiveTxs = async (archiveId: string) => {
    if (archiveTxCache[archiveId]) return archiveTxCache[archiveId];
    setLoadingArchiveId(archiveId);
    try {
      const txs = await onFetchArchiveTxs(archiveId);
      setArchiveTxCache((prev) => ({ ...prev, [archiveId]: txs }));
      return txs;
    } finally {
      setLoadingArchiveId(null);
    }
  };

  const handleShareClientReport = async (client: LedgerClient) => {
    setLoadingShareId(client.id);
    try {
      const txs = txCache[client.id] ?? (await onFetchClientTxs(client.id));
      if (!txCache[client.id]) {
        setTxCache((prev) => ({ ...prev, [client.id]: txs }));
      }
      setSharePayload({ kind: 'client', client, transactions: txs });
    } finally {
      setLoadingShareId(null);
    }
  };

  const handleShareArchiveReport = async (archive: LedgerArchive) => {
    setLoadingShareId(archive.id);
    try {
      const txs = (await handleLoadArchiveTxs(archive.id)) || [];
      setSharePayload({ kind: 'archive', archive, transactions: txs });
    } finally {
      setLoadingShareId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Sub-navigation Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            External Fund Ledger · Receivables {formatBDT(receivableTotal)} · Payables{' '}
            {formatBDT(payableTotal)}
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Client Ledger &amp; Settlements
          </h2>
        </div>

        <div className="inline-flex flex-wrap rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => setSubTab('ledger')}
            className={`min-h-[38px] px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'ledger'
                ? 'bg-slate-900 text-white dark:bg-sky-600'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Entries &amp; Clients
          </button>
          <button
            type="button"
            onClick={() => setSubTab('clientView')}
            className={`min-h-[38px] px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'clientView'
                ? 'bg-slate-900 text-white dark:bg-sky-600'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Balances ({receivableClients.length + payableClients.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('archive')}
            className={`min-h-[38px] px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              subTab === 'archive'
                ? 'bg-slate-900 text-white dark:bg-sky-600'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Settled Archive ({archives.length})
          </button>
        </div>
      </div>

      {/* TAB 1: LEDGER ENTRY & CLIENTS */}
      {subTab === 'ledger' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Add Client Card */}
            <form
              onSubmit={handleCreateClient}
              className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:shadow-none"
            >
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Add New Client
                </h3>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Client Name
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g., Karim Telecom"
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Mobile Number (For WhatsApp)
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={newMobile}
                  onChange={(e) => setNewMobile(e.target.value)}
                  placeholder="017XXXXXXXX"
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-num text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[42px] rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white py-2.5 text-sm font-semibold transition-all disabled:opacity-60 cursor-pointer"
              >
                Save Client
              </button>
            </form>

            {/* Record Transaction Card */}
            <form
              onSubmit={handleTxSubmit}
              className="lg:col-span-2 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:shadow-none"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Record Ledger Transaction
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Auto-archives when balance reaches ৳0
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Select Client
                  </label>
                  <select
                    value={activeClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    {clients.length === 0 ? (
                      <option value="">Add a client first</option>
                    ) : (
                      clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Amount (৳)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="0.01"
                    required
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value)}
                    placeholder="0"
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-num text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Transaction Type
                  </label>
                  <select
                    value={txType}
                    onChange={(e) => setTxType(e.target.value as LedgerTxType)}
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="gave">Client Paid Me (+)</option>
                    <option value="took">Client Took from Me (−)</option>
                    <option value="refundGiven">Refunded to Client (−)</option>
                    <option value="refundReceived">Refund Received (+)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Method
                  </label>
                  <select
                    value={txMethod}
                    onChange={(e) => setTxMethod(e.target.value)}
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    {LEDGER_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Fund Source
                  </label>
                  <select
                    value={txSource}
                    onChange={(e) => setTxSource(e.target.value as LedgerFundSource)}
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  >
                    <option value="mfs">MFS (Adjusts Opening &amp; Capital)</option>
                    <option value="recharge">Recharge (Adjusts Opening &amp; Capital)</option>
                    <option value="external">External Only (No Shift Impact)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={txNote}
                    onChange={(e) => setTxNote(e.target.value)}
                    placeholder="Transaction details..."
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="submit"
                  disabled={busy || clients.length === 0}
                  className="min-h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer"
                >
                  Save Transaction
                </button>

                {lastWaReceipt && (
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={lastWaReceipt.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] inline-flex items-center gap-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 px-4 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Send WhatsApp to {lastWaReceipt.clientName} (BN)</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        const nextIdx = (lastWaReceipt.variantIndex + 1) % lastWaReceipt.styleTotal;
                        const wa = buildWhatsAppTxPayload({
                          clientName: lastWaReceipt.clientName,
                          mobile: lastWaReceipt.mobile,
                          newBalance: lastWaReceipt.newBalance,
                          amount: lastWaReceipt.amount,
                          type: lastWaReceipt.type,
                          method: lastWaReceipt.method,
                          settled: lastWaReceipt.settled,
                          shopName,
                          note: lastWaReceipt.note,
                          variantIndex: nextIdx,
                        });
                        setLastWaReceipt({
                          ...lastWaReceipt,
                          variantIndex: wa.styleIndex,
                          url: wa.url,
                          text: wa.text,
                          styleName: wa.styleName,
                          styleTotal: wa.styleTotal,
                        });
                      }}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                      title="Switch interactive Bengali receipt message style"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>
                        Style {lastWaReceipt.variantIndex + 1}/{lastWaReceipt.styleTotal}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowWaPreview((p) => !p)}
                      className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{showWaPreview ? 'Hide' : 'Preview'}</span>
                    </button>
                  </div>
                )}
              </div>

              {lastWaReceipt && showWaPreview && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/50 dark:bg-emerald-950/25 p-3.5 text-xs">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    <span>Template Style: {lastWaReceipt.styleName}</span>
                    <span>Bengali WhatsApp Preview</span>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                    {lastWaReceipt.text}
                  </pre>
                </div>
              )}
            </form>
          </div>

          {/* Client Directory List */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-500" />
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Client Directory ({filteredClients.length})
                </h3>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or phone..."
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 py-2 text-sm"
                />
              </div>
            </div>

            {duplicateExtraCount > 0 && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/90 dark:bg-amber-950/35 px-4 py-3">
                <div className="text-xs text-amber-950 dark:text-amber-200 leading-relaxed">
                  <strong>{duplicateExtraCount} duplicate client {duplicateExtraCount === 1 ? 'copy' : 'copies'} detected</strong>
                  {duplicateNamesSample.length > 0 ? ` (${duplicateNamesSample.join(', ')})` : ''}. Merge &amp; clean up extra copies safely without losing any unique transactions.
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDeduplicateClients(duplicateExtraCount)}
                  className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 active:scale-[0.98] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-all disabled:opacity-60 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Remove {duplicateExtraCount} Duplicates</span>
                </button>
              </div>
            )}

            {filteredClients.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                No matching clients found.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredClients.map((client) => {
                  const risk = getClientRisk(client);
                  const isExpanded = expandedClientId === client.id;
                  const txs = txCache[client.id] || [];
                  const statusLabel =
                    client.balance < 0
                      ? `Receivable ${formatBDT(Math.abs(client.balance))}`
                      : client.balance > 0
                        ? `Payable ${formatBDT(client.balance)}`
                        : 'Settled (৳0)';

                  const statusColor =
                    client.balance < 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : client.balance > 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-500 dark:text-slate-400';

                  return (
                    <div
                      key={client.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
                    >
                      <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-950/40">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleExpandClient(client.id)}
                              className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100 hover:text-sky-600 cursor-pointer"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                              <span>{client.name}</span>
                            </button>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              · {client.mobile || 'No phone'} · {risk.label}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                            <span>Received: {formatBDT(client.totalGiven)}</span>
                            <span>Paid: {formatBDT(client.totalTaken)}</span>
                            <span>Refund Out: {formatBDT(client.refundGiven)}</span>
                            <span>Refund In: {formatBDT(client.refundReceived)}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`font-mono-num text-sm font-bold mr-1 ${statusColor}`}>
                            {statusLabel}
                          </span>

                          {client.balance < 0 && client.mobile && (
                            <a
                              href={buildWhatsAppReminderUrl(client, shopName)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition-colors"
                              title="Send due reminder in Bengali via WhatsApp"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>Remind (BN)</span>
                            </a>
                          )}

                          <button
                            type="button"
                            disabled={loadingShareId === client.id}
                            onClick={() => handleShareClientReport(client)}
                            className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] px-3 py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-60 cursor-pointer"
                            title="Share daily or custom-range client statement"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>{loadingShareId === client.id ? 'Loading...' : 'Share Report'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingClient(client);
                              setEditClientName(client.name);
                              setEditClientMobile(client.mobile);
                            }}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-sky-600 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                            title="Edit client"
                            aria-label="Edit client"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onDeleteClient(client)}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                            title="Delete client"
                            aria-label="Delete client"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                          {loadingClientId === client.id ? (
                            <p className="text-xs text-slate-500">Loading transactions...</p>
                          ) : txs.length === 0 ? (
                            <p className="text-xs text-slate-500">
                              No active transactions in the current cycle.
                            </p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs min-w-[540px]">
                                <thead>
                                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500">
                                    <th className="py-2 pr-3 font-medium">Date</th>
                                    <th className="py-2 pr-3 font-medium">Type</th>
                                    <th className="py-2 pr-3 font-medium">Method</th>
                                    <th className="py-2 pr-3 font-medium text-right">Amount</th>
                                    <th className="py-2 pr-3 font-medium">Note</th>
                                    <th className="py-2 font-medium text-right">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {txs.map((tx) => (
                                    <tr key={tx.id}>
                                      <td className="py-2 pr-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                        {formatDateTimeEn(tx.txDateIso)}
                                      </td>
                                      <td className="py-2 pr-3 text-slate-800 dark:text-slate-200">
                                        {LEDGER_TX_LABELS[tx.type]}
                                      </td>
                                      <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">
                                        {tx.method}
                                      </td>
                                      <td className="py-2 pr-3 text-right font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                                        {formatBDT(tx.amount)}
                                      </td>
                                      <td className="py-2 pr-3 text-slate-500 truncate max-w-[160px]">
                                        {tx.note || '—'}
                                      </td>
                                      <td className="py-2 text-right whitespace-nowrap">
                                        <div className="inline-flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingTx({ client, tx });
                                              setEditTxAmount(String(tx.amount));
                                              setEditTxType(tx.type);
                                              setEditTxNote(tx.note || '');
                                            }}
                                            className="p-1.5 text-slate-500 hover:text-sky-600 cursor-pointer"
                                            aria-label="Edit transaction"
                                          >
                                            <Edit3 className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => onDeleteTransaction(client, txs, tx.id)}
                                            className="p-1.5 text-slate-500 hover:text-rose-600 cursor-pointer"
                                            aria-label="Delete transaction"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CLIENT VIEW (RECEIVABLE / PAYABLE) */}
      {subTab === 'clientView' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setClientTab('receivable')}
              className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                clientTab === 'receivable'
                  ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Receivable — Clients Owe You ({receivableClients.length})
              </div>
              <div className="mt-1 font-mono-num text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatBDT(receivableTotal)}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setClientTab('payable')}
              className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                clientTab === 'payable'
                  ? 'border-rose-500 bg-rose-50/70 dark:bg-rose-950/30'
                  : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Payable — You Owe Clients ({payableClients.length})
              </div>
              <div className="mt-1 font-mono-num text-xl font-bold text-rose-600 dark:text-rose-400">
                {formatBDT(payableTotal)}
              </div>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(clientTab === 'receivable' ? receivableClients : payableClients).map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{c.name}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                    {c.mobile || 'No mobile number'}
                  </p>
                  <div
                    className={`mt-2 font-mono-num text-base font-bold ${
                      clientTab === 'receivable'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {clientTab === 'receivable'
                      ? `Receivable: ${formatBDT(Math.abs(c.balance))}`
                      : `Payable: ${formatBDT(c.balance)}`}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClientId(c.id);
                      setSubTab('ledger');
                    }}
                    className="flex-1 min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 py-1.5 px-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    Record Entry
                  </button>
                  <button
                    type="button"
                    disabled={loadingShareId === c.id}
                    onClick={() => handleShareClientReport(c)}
                    className="min-h-[38px] inline-flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] px-3 py-1.5 text-xs font-semibold text-white transition-all cursor-pointer"
                    title="Share client statement"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share</span>
                  </button>
                  {clientTab === 'receivable' && c.mobile && (
                    <a
                      href={buildWhatsAppReminderUrl(c, shopName)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[38px] inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
                      title="Send Bengali due reminder on WhatsApp"
                    >
                      WhatsApp (BN)
                    </a>
                  )}
                </div>
              </div>
            ))}
            {(clientTab === 'receivable' ? receivableClients : payableClients).length === 0 && (
              <div className="col-span-full py-8 text-center text-sm text-slate-500">
                No clients in this category.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SETTLED LEDGER ARCHIVE */}
      {subTab === 'archive' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4 text-slate-500" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Settled Ledger Archive
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Completed client cycles settled to ৳0 are stored permanently here with 58mm thermal printing support.
          </p>

          {groupedArchives.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              No settled archives yet.
            </div>
          ) : (
            <div className="space-y-3">
              {groupedArchives.map((g) => {
                const isOpen = openFolder === g.name;
                return (
                  <div
                    key={g.name}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFolder(isOpen ? null : g.name)}
                      className="w-full min-h-[46px] flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-950/60 text-left cursor-pointer"
                    >
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {g.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        {g.items.length} settlement{g.items.length > 1 ? 's' : ''} ·{' '}
                        {isOpen ? 'Hide' : 'Open'}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="p-4 space-y-3 bg-white dark:bg-slate-900">
                        {g.items.map((a) => {
                          const archTxs = archiveTxCache[a.id];
                          return (
                            <div
                              key={a.id}
                              className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                                  Settled: {formatDateTimeEn(a.settledAtIso)} · Received{' '}
                                  {formatBDT(a.totalGiven)} · Paid {formatBDT(a.totalTaken)}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleLoadArchiveTxs(a.id)}
                                    className="min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                                  >
                                    {loadingArchiveId === a.id
                                      ? 'Loading...'
                                      : `View Entries (${a.txCount})`}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={loadingShareId === a.id}
                                    onClick={() => handleShareArchiveReport(a)}
                                    className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] px-3 py-1.5 text-xs font-semibold text-white transition-all cursor-pointer"
                                  >
                                    <Share2 className="w-3.5 h-3.5" />
                                    <span>Share Report</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const list = await handleLoadArchiveTxs(a.id);
                                      onPrintArchive(a, list || []);
                                    }}
                                    className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-sky-600 hover:opacity-90 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                    <span>58mm Print</span>
                                  </button>
                                </div>
                              </div>

                              {archTxs && (
                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                                  {archTxs.map((t) => (
                                    <div
                                      key={t.id}
                                      className="flex items-center justify-between text-slate-600 dark:text-slate-300"
                                    >
                                      <span>
                                        {formatDateTimeEn(t.txDateIso)} · {LEDGER_TX_LABELS[t.type]} ({t.method})
                                      </span>
                                      <span className="font-mono-num font-semibold">
                                        {formatBDT(t.amount)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit Client Modal */}
      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleSaveClientEdit}
            className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Edit Client Profile
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Name
              </label>
              <input
                type="text"
                required
                value={editClientName}
                onChange={(e) => setEditClientName(e.target.value)}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Mobile Number
              </label>
              <input
                type="tel"
                inputMode="tel"
                value={editClientMobile}
                onChange={(e) => setEditClientMobile(e.target.value)}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-num text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="min-h-[38px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-semibold"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleSaveTxEdit}
            className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Edit Transaction ({editingTx.client.name})
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Amount (৳)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="1"
                step="0.01"
                required
                value={editTxAmount}
                onChange={(e) => setEditTxAmount(e.target.value)}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-num text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Type
              </label>
              <select
                value={editTxType}
                onChange={(e) => setEditTxType(e.target.value as LedgerTxType)}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="gave">Client Paid Me (+)</option>
                <option value="took">Client Took from Me (−)</option>
                <option value="refundGiven">Refunded to Client (−)</option>
                <option value="refundReceived">Refund Received (+)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Note
              </label>
              <input
                type="text"
                value={editTxNote}
                onChange={(e) => setEditTxNote(e.target.value)}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="min-h-[38px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-semibold"
              >
                Update Entry
              </button>
            </div>
          </form>
        </div>
      )}

      <ShareReportModal
        open={Boolean(sharePayload)}
        shopName={shopName}
        payload={sharePayload}
        onClose={() => setSharePayload(null)}
      />
    </div>
  );
};
