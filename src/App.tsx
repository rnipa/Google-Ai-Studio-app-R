import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  waitForPendingWrites,
  where,
} from 'firebase/firestore';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Calculator,
  CloudOff,
  LayoutDashboard,
  Loader2,
  Receipt,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Users,
  WifiOff,
} from 'lucide-react';
import { AuthScreen, PinLockOverlay } from './components/AuthGate';
import { ClosingReportModal } from './components/ClosingReportModal';
import { ConfirmModal } from './components/ConfirmModal';
import { DailyShiftView } from './components/DailyShiftView';
import { DashboardView } from './components/DashboardView';
import { ExpenseTrackerView } from './components/ExpenseTrackerView';
import { LedgerView } from './components/LedgerView';
import { SettingsBackupView } from './components/SettingsBackupView';
import { ShareReportModal } from './components/ShareReportModal';
import { ThermalPrintSheet } from './components/ThermalPrintSheet';
import { ToastContainer } from './components/ToastContainer';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { getBiometricConfig, type BiometricLockConfig } from './utils/biometric';
import {
  auth,
  db,
  logFirestoreSnapshotError,
  OperationType,
  testFirestoreConnection,
} from './firebase';
import {
  addLedgerClient,
  addPersonalExpense,
  applyReinvestAtomic,
  buildFullExportPayload,
  deduplicateHistoriesAndExpenses,
  deduplicateLedgerClients,
  deleteCategoryBudget,
  deleteDailyHistory,
  deleteLedgerClientCascade,
  deleteLedgerTransactionAtomic,
  deletePersonalExpense,
  editLedgerTransactionAtomic,
  ensureUserAndWorkspace,
  fetchArchiveTransactions,
  fetchClientTransactions,
  importBackupToCloud,
  recordLedgerTransactionAtomic,
  saveDailyClosing,
  saveSavingsGoal,
  saveWorkspaceState,
  startNewDayAtomic,
  updateLedgerClientInfo,
  updateUserProfileSettings,
  upsertCategoryBudget,
  withdrawFromCapitalAtomic,
} from './services/erpStore';
import type {
  ArchivedTransaction,
  CapitalSource,
  CategoryBudget,
  DailyHistory,
  LedgerArchive,
  LedgerClient,
  LedgerFundSource,
  LedgerTransaction,
  LedgerTxType,
  NavTab,
  PersonalExpense,
  SaveSyncStatus,
  SavingsGoal,
  ToastMessage,
  UserProfile,
  WorkspaceState,
} from './types';
import { computeBalanceSummary, createDefaultWorkspace, safeNum } from './utils/accounting';

interface LocalWorkspaceDraft {
  ws: WorkspaceState;
  savedAt: number;
  dirty: boolean;
}

const getDraftKey = (uid: string) => `rasidul_pending_ws_${uid}`;
const getSnapshotKey = (uid: string) => `rasidul_cloud_snapshot_${uid}`;
const LAST_JSON_EXPORT_KEY = 'rasidul_last_json_export';

interface CloudEmergencySnapshot {
  savedAt: string;
  profile: UserProfile | null;
  workspace: WorkspaceState;
  histories: DailyHistory[];
  clients: LedgerClient[];
  archives: LedgerArchive[];
  expenses: PersonalExpense[];
  budgets: CategoryBudget[];
  savingsGoal: SavingsGoal | null;
}

function writeCloudSnapshot(uid: string, snapshot: CloudEmergencySnapshot) {
  if (!uid) return;
  try {
    localStorage.setItem(getSnapshotKey(uid), JSON.stringify(snapshot));
  } catch {
    try {
      const compact: CloudEmergencySnapshot = {
        ...snapshot,
        histories: snapshot.histories.slice(0, 90),
        archives: snapshot.archives.slice(0, 50),
        expenses: snapshot.expenses.slice(0, 120),
      };
      localStorage.setItem(getSnapshotKey(uid), JSON.stringify(compact));
    } catch {
      // ignore storage quota errors
    }
  }
}

function readCloudSnapshot(uid: string): CloudEmergencySnapshot | null {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(getSnapshotKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CloudEmergencySnapshot;
    if (parsed && parsed.workspace) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeLocalDraft(uid: string, ws: WorkspaceState, dirty: boolean) {
  if (!uid) return;
  try {
    const payload: LocalWorkspaceDraft = { ws, savedAt: Date.now(), dirty };
    localStorage.setItem(getDraftKey(uid), JSON.stringify(payload));
  } catch {
    // ignore storage quota failures
  }
}

function readLocalDraft(uid: string): LocalWorkspaceDraft | null {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(getDraftKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalWorkspaceDraft;
    if (parsed && parsed.ws && typeof parsed.dirty === 'boolean') return parsed;
    return null;
  } catch {
    return null;
  }
}

const NAV_ITEMS: Array<{ key: NavTab; label: string; mobileLabel: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'dashboard', label: 'Dashboard', mobileLabel: 'Home', Icon: LayoutDashboard },
  { key: 'daily', label: 'Daily Shift', mobileLabel: 'Shift', Icon: Calculator },
  { key: 'ledger', label: 'Client Ledger', mobileLabel: 'Ledger', Icon: Users },
  { key: 'expenses', label: 'Expenses', mobileLabel: 'Expenses', Icon: Receipt },
  { key: 'settings', label: 'Settings', mobileLabel: 'Settings', Icon: Settings },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [bioConfig, setBioConfig] = useState<BiometricLockConfig | null>(null);

  const [workspace, setWorkspace] = useState<WorkspaceState>(() => createDefaultWorkspace(''));
  const workspaceRef = useRef<WorkspaceState>(workspace);
  workspaceRef.current = workspace;

  const [histories, setHistories] = useState<DailyHistory[]>([]);
  const [clients, setClients] = useState<LedgerClient[]>([]);
  const [archives, setArchives] = useState<LedgerArchive[]>([]);
  const [expenses, setExpenses] = useState<PersonalExpense[]>([]);
  const [budgets, setBudgets] = useState<CategoryBudget[]>([]);
  const [savingsGoal, setSavingsGoal] = useState<SavingsGoal | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [syncStatus, setSyncStatus] = useState<SaveSyncStatus>('synced');
  const [lastSavedAt, setLastSavedAt] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false);
  const [pendingCloudCount, setPendingCloudCount] = useState(0);
  const isOnline = useOnlineStatus();

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('rasidulTheme') === 'dark';
    } catch {
      return false;
    }
  });

  const [lastJsonBackupAt, setLastJsonBackupAt] = useState<string>(() => {
    try {
      return localStorage.getItem(LAST_JSON_EXPORT_KEY) || '';
    } catch {
      return '';
    }
  });

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [closingModalOpen, setClosingModalOpen] = useState(false);
  const [businessShareOpen, setBusinessShareOpen] = useState(false);
  const [printData, setPrintData] = useState<{
    archive: LedgerArchive | null;
    txs: ArchivedTransaction[];
  }>({ archive: null, txs: [] });

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    danger?: boolean;
    onConfirm: () => Promise<void>;
  }>({
    open: false,
    title: '',
    message: '',
    onConfirm: async () => {},
  });

  const saveTimerRef = useRef<number | null>(null);
  const pendingLocalEditRef = useRef(false);
  const draftRecoveryCheckedRef = useRef(false);
  const pendingSourcesRef = useRef<Record<string, boolean>>({});

  const updatePendingSource = useCallback((key: string, hasPending: boolean) => {
    const prevVal = Boolean(pendingSourcesRef.current[key]);
    if (prevVal === hasPending) return;
    pendingSourcesRef.current[key] = hasPending;
    const count = Object.values(pendingSourcesRef.current).filter(Boolean).length;
    setPendingCloudCount(count);
    if (count === 0 && !pendingLocalEditRef.current) {
      setSyncStatus('synced');
      setLastSavedAt(
        new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      );
    }
  }, []);

  const hasUnbackedUpData =
    hasUnsavedDraft ||
    pendingCloudCount > 0 ||
    syncStatus === 'saving' ||
    syncStatus === 'error';

  const pushToast = useCallback((type: ToastMessage['type'], text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // Theme sync
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem('rasidulTheme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [darkMode]);

  // Boot connection test + Auth listener
  useEffect(() => {
    testFirestoreConnection();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      if (u) {
        setBioConfig(getBiometricConfig(u.uid));
      } else {
        setDataLoading(false);
        setPinUnlocked(false);
        setBioConfig(null);
      }
    });
    return () => unsub();
  }, []);

  // Firestore real-time listeners once authenticated
  useEffect(() => {
    if (!authReady || !user) return;
    let active = true;
    let loadingResolved = false;
    let snapshotWarnShown = false;
    setDataLoading(true);
    const uid = user.uid;
    const unsubs: Array<() => void> = [];

    const resolveLoadingWithLocalFallback = (reasonToast?: string) => {
      if (!active || loadingResolved) return;
      loadingResolved = true;
      const localDraft = readLocalDraft(uid);
      const localSnapshot = readCloudSnapshot(uid);
      if (localDraft?.ws) {
        workspaceRef.current = localDraft.ws;
        setWorkspace(localDraft.ws);
      } else if (localSnapshot?.workspace) {
        workspaceRef.current = localSnapshot.workspace;
        setWorkspace(localSnapshot.workspace);
      }
      if (localSnapshot) {
        if (localSnapshot.profile) setProfile((prev) => prev ?? localSnapshot.profile);
        if (localSnapshot.histories?.length) {
          setHistories((prev) => (prev.length ? prev : localSnapshot.histories));
        }
        if (localSnapshot.clients?.length) {
          setClients((prev) => (prev.length ? prev : localSnapshot.clients));
        }
        if (localSnapshot.archives?.length) {
          setArchives((prev) => (prev.length ? prev : localSnapshot.archives));
        }
        if (localSnapshot.expenses?.length) {
          setExpenses((prev) => (prev.length ? prev : localSnapshot.expenses));
        }
        if (localSnapshot.budgets?.length) {
          setBudgets((prev) => (prev.length ? prev : localSnapshot.budgets));
        }
        if (localSnapshot.savingsGoal) {
          setSavingsGoal((prev) => prev ?? localSnapshot.savingsGoal);
        }
      }
      setDataLoading(false);
      if (reasonToast) {
        pushToast('info', reasonToast);
      }
    };

    const loadingTimeoutId = window.setTimeout(() => {
      resolveLoadingWithLocalFallback(
        'Slow network detected — opened local offline vault while Cloud sync continues.'
      );
    }, 8000);

    const reportSnapshotError = (
      err: unknown,
      operationType: OperationType,
      path: string
    ) => {
      logFirestoreSnapshotError(err, operationType, path);
      if (!active) return;
      resolveLoadingWithLocalFallback();
      if (!snapshotWarnShown) {
        snapshotWarnShown = true;
        pushToast('info', 'Cloud sync warning — working safely from local offline vault.');
      }
    };

    (async () => {
      try {
        await ensureUserAndWorkspace(user);
        if (!active) return;

        pendingSourcesRef.current = {};
        setPendingCloudCount(0);

        unsubs.push(
          onSnapshot(
            doc(db, 'users', uid),
            { includeMetadataChanges: true },
            (snap) => {
              updatePendingSource('profile', snap.metadata.hasPendingWrites);
              if (snap.exists()) {
                const p = snap.data() as UserProfile;
                setProfile(p);
              }
            },
            (err) => reportSnapshotError(err, OperationType.GET, `users/${uid}`)
          )
        );

        draftRecoveryCheckedRef.current = false;

        unsubs.push(
          onSnapshot(
            doc(db, 'users', uid, 'workspace', 'current'),
            { includeMetadataChanges: true },
            (snap) => {
              updatePendingSource('workspace', snap.metadata.hasPendingWrites);
              if (!draftRecoveryCheckedRef.current) {
                draftRecoveryCheckedRef.current = true;
                const localDraft = readLocalDraft(uid);
                if (localDraft?.dirty) {
                  pendingLocalEditRef.current = true;
                  setHasUnsavedDraft(true);
                  workspaceRef.current = localDraft.ws;
                  setWorkspace(localDraft.ws);
                  setSyncStatus('saving');
                  loadingResolved = true;
                  window.clearTimeout(loadingTimeoutId);
                  setDataLoading(false);
                  saveWorkspaceState(uid, localDraft.ws)
                    .then(() => {
                      pendingLocalEditRef.current = false;
                      setHasUnsavedDraft(false);
                      writeLocalDraft(uid, localDraft.ws, false);
                      setSyncStatus('synced');
                      setLastSavedAt(
                        new Date().toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      );
                      pushToast('info', 'Recovered unsaved offline changes and synced to Cloud.');
                    })
                    .catch(() => {
                      setSyncStatus('error');
                    });
                  return;
                }
              }

              if (snap.exists() && !pendingLocalEditRef.current) {
                const cloudWs = snap.data() as WorkspaceState;
                setWorkspace(cloudWs);
                writeLocalDraft(uid, cloudWs, false);
              }
              loadingResolved = true;
              window.clearTimeout(loadingTimeoutId);
              setDataLoading(false);
            },
            (err) =>
              reportSnapshotError(err, OperationType.GET, `users/${uid}/workspace/current`)
          )
        );

        unsubs.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'dailyHistories'), where('ownerId', '==', uid)),
            { includeMetadataChanges: true },
            (snap) => {
              updatePendingSource('dailyHistories', snap.metadata.hasPendingWrites);
              const items = snap.docs
                .map((d) => d.data() as DailyHistory)
                .sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));
              setHistories(items);
            },
            (err) =>
              reportSnapshotError(err, OperationType.LIST, `users/${uid}/dailyHistories`)
          )
        );

        unsubs.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'ledgerClients'), where('ownerId', '==', uid)),
            { includeMetadataChanges: true },
            (snap) => {
              updatePendingSource('ledgerClients', snap.metadata.hasPendingWrites);
              const items = snap.docs
                .map((d) => d.data() as LedgerClient)
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
              setClients(items);
            },
            (err) =>
              reportSnapshotError(err, OperationType.LIST, `users/${uid}/ledgerClients`)
          )
        );

        unsubs.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'ledgerArchives'), where('ownerId', '==', uid)),
            { includeMetadataChanges: true },
            (snap) => {
              updatePendingSource('ledgerArchives', snap.metadata.hasPendingWrites);
              const items = snap.docs
                .map((d) => d.data() as LedgerArchive)
                .sort((a, b) => (b.settledAtIso || '').localeCompare(a.settledAtIso || ''));
              setArchives(items);
            },
            (err) =>
              reportSnapshotError(err, OperationType.LIST, `users/${uid}/ledgerArchives`)
          )
        );

        unsubs.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'expenses'), where('ownerId', '==', uid)),
            { includeMetadataChanges: true },
            (snap) => {
              updatePendingSource('expenses', snap.metadata.hasPendingWrites);
              const items = snap.docs
                .map((d) => d.data() as PersonalExpense)
                .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
              setExpenses(items);
            },
            (err) => reportSnapshotError(err, OperationType.LIST, `users/${uid}/expenses`)
          )
        );

        unsubs.push(
          onSnapshot(
            query(collection(db, 'users', uid, 'categoryBudgets'), where('ownerId', '==', uid)),
            { includeMetadataChanges: true },
            (snap) => {
              updatePendingSource('categoryBudgets', snap.metadata.hasPendingWrites);
              setBudgets(snap.docs.map((d) => d.data() as CategoryBudget));
            },
            (err) =>
              reportSnapshotError(err, OperationType.LIST, `users/${uid}/categoryBudgets`)
          )
        );

        unsubs.push(
          onSnapshot(
            doc(db, 'users', uid, 'settings', 'savingsGoal'),
            { includeMetadataChanges: true },
            (snap) => {
              updatePendingSource('savingsGoal', snap.metadata.hasPendingWrites);
              if (snap.exists()) setSavingsGoal(snap.data() as SavingsGoal);
            },
            (err) =>
              reportSnapshotError(err, OperationType.GET, `users/${uid}/settings/savingsGoal`)
          )
        );
      } catch (err) {
        window.clearTimeout(loadingTimeoutId);
        resolveLoadingWithLocalFallback();
        pushToast(
          'error',
          err instanceof Error ? err.message : 'Unable to connect to Cloud Database.'
        );
      }
    })();

    return () => {
      active = false;
      window.clearTimeout(loadingTimeoutId);
      unsubs.forEach((u) => u());
    };
  }, [authReady, user, pushToast, updatePendingSource]);

  // Keep a rolling emergency snapshot in localStorage for instant offline/recovery access
  useEffect(() => {
    if (!user || dataLoading) return;
    const timer = window.setTimeout(() => {
      writeCloudSnapshot(user.uid, {
        savedAt: new Date().toISOString(),
        profile,
        workspace,
        histories,
        clients,
        archives,
        expenses,
        budgets,
        savingsGoal,
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [user, dataLoading, profile, workspace, histories, clients, archives, expenses, budgets, savingsGoal]);

  const flushWorkspaceSave = useCallback(
    async (wsToSave: WorkspaceState) => {
      if (!user) return;
      setSyncStatus('saving');
      try {
        await saveWorkspaceState(user.uid, wsToSave);
        pendingLocalEditRef.current = false;
        setHasUnsavedDraft(false);
        writeLocalDraft(user.uid, wsToSave, false);
        setSyncStatus('synced');
        setLastSavedAt(
          new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        );
      } catch {
        // Keep local dirty vault intact so it retries automatically on reconnect
        pendingLocalEditRef.current = true;
        setHasUnsavedDraft(true);
        writeLocalDraft(user.uid, wsToSave, true);
        setSyncStatus('error');
      }
    },
    [user]
  );

  // Zero-Data-Loss listeners: auto-flush when tab hides, reconnects, and block exit if Cloud backup is pending
  useEffect(() => {
    if (!user) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && pendingLocalEditRef.current) {
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        writeLocalDraft(user.uid, workspaceRef.current, true);
        flushWorkspaceSave(workspaceRef.current);
      }
    };

    const handleOnline = async () => {
      const draft = readLocalDraft(user.uid);
      if (pendingLocalEditRef.current || draft?.dirty) {
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        const targetWs = draft?.dirty ? draft.ws : workspaceRef.current;
        await flushWorkspaceSave(targetWs);
      }
      try {
        await waitForPendingWrites(db);
        setPendingCloudCount(0);
        pendingSourcesRef.current = {};
        setSyncStatus('synced');
        setLastSavedAt(
          new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        );
        pushToast('success', 'Internet restored — 100% of pending data is now backed up to Cloud.');
      } catch {
        // retry handled on next snapshot/manual sync
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnbackedUpData) {
        if (pendingLocalEditRef.current) {
          writeLocalDraft(user.uid, workspaceRef.current, true);
        }
        e.preventDefault();
        e.returnValue = '';
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user, hasUnbackedUpData, flushWorkspaceSave, pushToast]);

  const handleUpdateWorkspaceField = useCallback(
    <K extends keyof WorkspaceState>(key: K, value: WorkspaceState[K]) => {
      pendingLocalEditRef.current = true;
      setHasUnsavedDraft(true);
      setSyncStatus('saving');
      setWorkspace((prev) => {
        const next = { ...prev, [key]: value };
        workspaceRef.current = next;
        if (user) writeLocalDraft(user.uid, next, true);
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
          flushWorkspaceSave(workspaceRef.current);
        }, 450);
        return next;
      });
    },
    [user, flushWorkspaceSave]
  );

  const handleCopyOpeningToClosing = useCallback(() => {
    pendingLocalEditRef.current = true;
    setHasUnsavedDraft(true);
    setSyncStatus('saving');
    setWorkspace((prev) => {
      const next: WorkspaceState = {
        ...prev,
        cbk: prev.obk,
        cng: prev.ong,
        crk: prev.ork,
        ctk: prev.otk,
        cmc: prev.omc,
        cgp: prev.ogp,
        crobi: prev.orobi,
        cair: prev.oair,
        cbl: prev.obl,
        crc: prev.orc,
      };
      workspaceRef.current = next;
      if (user) writeLocalDraft(user.uid, next, true);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        flushWorkspaceSave(workspaceRef.current);
      }, 400);
      return next;
    });
    pushToast('info', 'Copied Opening balances into Closing fields.');
  }, [user, flushWorkspaceSave, pushToast]);

  const handleManualFlushSave = async () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    await flushWorkspaceSave(workspaceRef.current);
    if (!navigator.onLine) {
      pushToast(
        'info',
        'Saved in offline vault on this device. Connect to internet to finish Cloud backup.'
      );
      return;
    }
    try {
      const timeout = new Promise<'timeout'>((resolve) =>
        window.setTimeout(() => resolve('timeout'), 4500)
      );
      const result = await Promise.race([
        waitForPendingWrites(db).then(() => 'committed' as const),
        timeout,
      ]);
      if (result === 'committed') {
        pendingSourcesRef.current = {};
        setPendingCloudCount(0);
        setSyncStatus('synced');
        setLastSavedAt(
          new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        );
        pushToast('success', '100% Backed up to Cloud! Safe to exit or switch devices.');
      } else {
        pushToast('info', 'Upload still in progress — keep app open until Cloud Backed Up appears.');
      }
    } catch {
      pushToast('error', 'Cloud backup verification failed. Please check internet and retry.');
    }
  };

  const handleSaveDailyClosing = async (editingId?: string | null) => {
    if (!user) return;
    setBusy(true);
    setSyncStatus('saving');
    try {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      await saveWorkspaceState(user.uid, workspaceRef.current);
      pendingLocalEditRef.current = false;
      setHasUnsavedDraft(false);
      writeLocalDraft(user.uid, workspaceRef.current, false);
      await saveDailyClosing(user.uid, workspaceRef.current, editingId);
      setSyncStatus('synced');
      setLastSavedAt(
        new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      );
      setClosingModalOpen(true);
      pushToast('success', 'Daily shift closing saved to Cloud.');
    } catch (err) {
      setSyncStatus('error');
      pushToast('error', err instanceof Error ? err.message : 'Final Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleNewDay = async () => {
    if (!user) return;
    setConfirmState({
      open: true,
      title: 'Start a New Business Day?',
      message:
        'Today’s Closing balances will carry forward as tomorrow’s Opening balances, and Base Capital will update automatically.',
      onConfirm: async () => {
        setBusy(true);
        try {
          if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
          const next = await startNewDayAtomic(user.uid, workspaceRef.current);
          workspaceRef.current = next;
          pendingLocalEditRef.current = false;
          setHasUnsavedDraft(false);
          writeLocalDraft(user.uid, next, false);
          setWorkspace(next);
          setSyncStatus('synced');
          pushToast('success', 'New business day started and Base Capital updated.');
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Could not start new day.');
        } finally {
          setBusy(false);
          setConfirmState((prev) => ({ ...prev, open: false }));
        }
      },
    });
  };

  const handleReinvest = async (mfsAdd: number, rechargeAdd: number) => {
    if (!user) return;
    setBusy(true);
    try {
      const next = await applyReinvestAtomic(user.uid, workspaceRef.current, mfsAdd, rechargeAdd);
      workspaceRef.current = next;
      pendingLocalEditRef.current = false;
      setHasUnsavedDraft(false);
      writeLocalDraft(user.uid, next, false);
      setWorkspace(next);
      pushToast('success', 'Profit reinvested into Base Capital.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Failed to reinvest profit.');
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async (payload: {
    amount: number;
    reason: string;
    category: string;
    source: CapitalSource;
    method: string;
  }) => {
    if (!user) return;
    setBusy(true);
    try {
      const next = await withdrawFromCapitalAtomic(user.uid, workspaceRef.current, payload);
      workspaceRef.current = next;
      pendingLocalEditRef.current = false;
      setHasUnsavedDraft(false);
      writeLocalDraft(user.uid, next, false);
      setWorkspace(next);
      pushToast('success', 'Owner withdrawal recorded and synced to Expense Tracker.');
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Withdrawal failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeduplicateHistories = (extraCount: number) => {
    if (!user) return;
    setConfirmState({
      open: true,
      title: `Remove ${extraCount} Duplicate History Records?`,
      message:
        'Repeated copies of identical daily closings, owner withdrawals, and expenses (from repeated JSON imports or double-saves) will be removed safely. One canonical copy of each unique shift and withdrawal is kept.',
      onConfirm: async () => {
        setBusy(true);
        try {
          const res = await deduplicateHistoriesAndExpenses(user.uid);
          const totalRemoved = res.removedClosings + res.removedWithdrawals + res.removedExpenses;
          pushToast(
            'success',
            totalRemoved > 0
              ? `Cleaned ${res.removedClosings} duplicate closings, ${res.removedWithdrawals} withdrawals${res.removedExpenses ? `, and ${res.removedExpenses} expenses` : ''}.`
              : 'All history and withdrawal records are already clean.'
          );
        } catch (err) {
          pushToast(
            'error',
            err instanceof Error ? err.message : 'Failed to clean duplicate history records.'
          );
        } finally {
          setBusy(false);
          setConfirmState((prev) => ({ ...prev, open: false }));
        }
      },
    });
  };

  const handleDeleteHistory = (historyId: string) => {
    if (!user) return;
    setConfirmState({
      open: true,
      title: 'Delete History Record?',
      message: 'This shift record will be permanently removed from your cloud history.',
      danger: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          await deleteDailyHistory(user.uid, historyId);
          pushToast('success', 'History record deleted.');
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Could not delete record.');
        } finally {
          setBusy(false);
          setConfirmState((prev) => ({ ...prev, open: false }));
        }
      },
    });
  };

  const handlePrintArchive = (archive: LedgerArchive, txs: ArchivedTransaction[]) => {
    setPrintData({ archive, txs });
    window.setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleExportJson = () => {
    const payload = buildFullExportPayload({
      profile,
      workspace,
      histories,
      clients,
      archives,
      expenses,
      budgets,
      savingsGoal,
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rasidul-erp-cloud-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const nowIso = new Date().toISOString();
    setLastJsonBackupAt(nowIso);
    try {
      localStorage.setItem(LAST_JSON_EXPORT_KEY, nowIso);
    } catch {
      // ignore storage errors
    }
    pushToast('success', 'Full JSON backup downloaded.');
  };

  const handleImportJson = async (file: File) => {
    if (!user) return;
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await importBackupToCloud(user.uid, workspaceRef.current, budgets, parsed);
      pushToast(
        'success',
        `Imported: ${res.importedHistories} shifts, ${res.importedClients} clients, ${res.importedArchives} archives, ${res.importedExpenses} expenses.`
      );
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Invalid JSON backup file.');
    } finally {
      setBusy(false);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-7 h-7 animate-spin text-sky-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthScreen onError={(m) => pushToast('error', m)} />
        <ToastContainer
          toasts={toasts}
          onDismiss={(id) => setToasts((p) => p.filter((x) => x.id !== id))}
        />
      </>
    );
  }

  const shopName = profile?.shopName || 'Rubaiya Pharmacy';
  const hasPin = Boolean(profile?.pinEnabled && profile?.pinHash);
  const hasFingerprint = Boolean(bioConfig?.enabled && bioConfig?.credentialIdB64);
  const showPinOverlay = (hasPin || hasFingerprint) && !pinUnlocked;
  const summary = computeBalanceSummary(workspace);
  const workingCapital = safeNum(workspace.mfsCapital) + safeNum(workspace.rechargeCapital);

  return (
    <div className="min-h-screen bg-[#F4F7FB] dark:bg-[#090E1A] text-slate-900 dark:text-slate-100">
      {/* Top Bar (Strict 3-Zone Contract) */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-6">
          {/* Zone 1: Brand Title */}
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-2.5 text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <img
              src="/pwa-192x192.png"
              alt="Rasidul ERP"
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shadow-xs"
            />
            <span>Rasidul ERP</span>
          </button>

          {/* Zone 2: Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {NAV_ITEMS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
                  activeTab === key
                    ? 'border-indigo-600 dark:border-sky-400 text-slate-900 dark:text-white font-semibold'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 Primary Action + Real Cloud Backup Verification Pill */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap border ${
                !isOnline && hasUnbackedUpData
                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 animate-pulse'
                  : hasUnbackedUpData
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    : !isOnline
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              }`}
            >
              {!isOnline && hasUnbackedUpData ? (
                <>
                  <CloudOff className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  <span className="hidden sm:inline">Not Backed Up (Offline)</span>
                  <span className="sm:hidden">Pending</span>
                </>
              ) : hasUnbackedUpData ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 dark:text-amber-400" />
                  <span className="hidden sm:inline">Backing Up to Cloud...</span>
                  <span className="sm:hidden">Syncing...</span>
                </>
              ) : !isOnline ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden sm:inline">Offline · Prior Data Safe</span>
                  <span className="sm:hidden">Offline</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="hidden sm:inline">
                    {lastSavedAt ? `Cloud Backed Up · ${lastSavedAt}` : 'Cloud Backed Up'}
                  </span>
                  <span className="sm:hidden">Backed Up</span>
                </>
              )}
            </span>

            <button
              type="button"
              onClick={handleManualFlushSave}
              disabled={syncStatus === 'saving'}
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-700 hover:to-sky-700 active:scale-[0.98] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Cloud Save</span>
            </button>
          </div>
        </div>
      </header>

      {/* Sticky Cloud Backup Guard Signal Banner */}
      <AnimatePresence>
        {(hasUnbackedUpData || !isOnline) && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.18 }}
            className={`sticky top-14 z-20 border-b px-4 py-2.5 print:hidden ${
              hasUnbackedUpData && (!isOnline || syncStatus === 'error')
                ? 'bg-rose-600 text-white border-rose-700'
                : hasUnbackedUpData
                  ? 'bg-amber-500 text-slate-950 border-amber-600'
                  : 'bg-amber-50 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800'
            }`}
          >
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs font-semibold">
              <div className="flex items-center gap-2">
                {hasUnbackedUpData ? (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                ) : (
                  <WifiOff className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {hasUnbackedUpData && (!isOnline || syncStatus === 'error')
                    ? 'WARNING: Cloud Backup NOT finished! Do NOT close app or switch devices — connect internet to upload pending entries.'
                    : hasUnbackedUpData
                      ? 'Cloud backup in progress... Please wait until "Cloud Backed Up" turns green before closing or switching devices.'
                      : 'Offline Mode — Previous cloud records are safe. New edits will wait in your local vault until internet reconnects.'}
                </span>
              </div>

              {hasUnbackedUpData && (
                <button
                  type="button"
                  onClick={handleManualFlushSave}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/95 hover:bg-white text-slate-900 px-3 py-1.5 text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Cloud Backup</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content (with mobile bottom nav clearance) */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-10 print:hidden">
        {dataLoading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
            <p className="text-sm">Syncing your business workspace from Cloud...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
            >
              {activeTab === 'dashboard' && (
                <DashboardView
                  shopName={shopName}
                  workspace={workspace}
                  histories={histories}
                  clients={clients}
                  busy={busy}
                  onNavigate={setActiveTab}
                  onShareReport={() => setBusinessShareOpen(true)}
                  onDeduplicateHistories={handleDeduplicateHistories}
                />
              )}

              {activeTab === 'daily' && (
                <DailyShiftView
                  workspace={workspace}
                  histories={histories}
                  saving={busy}
                  onUpdateField={handleUpdateWorkspaceField}
                  onCopyOpeningToClosing={handleCopyOpeningToClosing}
                  onSaveDailyClosing={handleSaveDailyClosing}
                  onNewDay={handleNewDay}
                  onReinvest={handleReinvest}
                  onWithdraw={handleWithdraw}
                  onDeleteHistory={handleDeleteHistory}
                  onDeduplicateHistories={handleDeduplicateHistories}
                  onShareReport={() => setBusinessShareOpen(true)}
                />
              )}

            {activeTab === 'ledger' && (
              <LedgerView
                uid={user.uid}
                shopName={shopName}
                clients={clients}
                archives={archives}
                busy={busy}
                onAddClient={async (name, mobile) => {
                  setBusy(true);
                  try {
                    await addLedgerClient(user.uid, name, mobile);
                    pushToast('success', 'New client added to ledger.');
                  } catch (e) {
                    pushToast('error', e instanceof Error ? e.message : 'Failed to add client.');
                  } finally {
                    setBusy(false);
                  }
                }}
                onUpdateClient={async (id, name, mobile) => {
                  setBusy(true);
                  try {
                    await updateLedgerClientInfo(user.uid, id, name, mobile);
                    pushToast('success', 'Client profile updated.');
                  } catch (e) {
                    pushToast('error', e instanceof Error ? e.message : 'Failed to update client.');
                  } finally {
                    setBusy(false);
                  }
                }}
                onDeleteClient={(client) => {
                  setConfirmState({
                    open: true,
                    title: `Delete "${client.name}"?`,
                    message:
                      'This will delete the client profile and active cycle entries. Settled archives will remain intact.',
                    danger: true,
                    onConfirm: async () => {
                      setBusy(true);
                      try {
                        await deleteLedgerClientCascade(user.uid, client.id);
                        pushToast('success', 'Client removed from active ledger.');
                      } catch (e) {
                        pushToast('error', e instanceof Error ? e.message : 'Failed to delete client.');
                      } finally {
                        setBusy(false);
                        setConfirmState((p) => ({ ...p, open: false }));
                      }
                    },
                  });
                }}
                onDeduplicateClients={(extraCount) => {
                  setConfirmState({
                    open: true,
                    title: `Remove ${extraCount} Duplicate Client ${extraCount === 1 ? 'Copy' : 'Copies'}?`,
                    message:
                      'Identical duplicate client cards (such as repeated JSON imports) will be removed safely. Any unique transactions on duplicate cards are automatically merged into the primary client card so zero data is lost.',
                    onConfirm: async () => {
                      setBusy(true);
                      try {
                        const res = await deduplicateLedgerClients(user.uid);
                        pushToast(
                          'success',
                          res.mergedTransactions > 0
                            ? `Removed ${res.removedClients} duplicate clients & merged ${res.mergedTransactions} unique transactions.`
                            : `Removed ${res.removedClients} duplicate client ${res.removedClients === 1 ? 'copy' : 'copies'} cleanly.`
                        );
                      } catch (e) {
                        pushToast(
                          'error',
                          e instanceof Error ? e.message : 'Failed to clean up duplicates.'
                        );
                      } finally {
                        setBusy(false);
                        setConfirmState((p) => ({ ...p, open: false }));
                      }
                    },
                  });
                }}
                onFetchClientTxs={(clientId) => fetchClientTransactions(user.uid, clientId)}
                onFetchArchiveTxs={(archiveId) => fetchArchiveTransactions(user.uid, archiveId)}
                onRecordTransaction={async (client, currentTxs, payload) => {
                  setBusy(true);
                  try {
                    const res = await recordLedgerTransactionAtomic(
                      user.uid,
                      workspaceRef.current,
                      client,
                      currentTxs,
                      payload
                    );
                    workspaceRef.current = res.nextWs;
                    setWorkspace(res.nextWs);
                    writeLocalDraft(user.uid, res.nextWs, false);
                    pushToast(
                      'success',
                      res.settled
                        ? `${client.name} settled to ৳0 and moved to Archive.`
                        : 'Ledger transaction saved to Cloud.'
                    );
                    return { settled: res.settled, newBalance: res.newBalance };
                  } catch (e) {
                    pushToast('error', e instanceof Error ? e.message : 'Failed to save transaction.');
                    throw e;
                  } finally {
                    setBusy(false);
                  }
                }}
                onEditTransaction={async (client, allTxs, txId, patch) => {
                  setBusy(true);
                  try {
                    await editLedgerTransactionAtomic(user.uid, client, allTxs, txId, patch);
                    pushToast('success', 'Transaction updated.');
                  } catch (e) {
                    pushToast('error', e instanceof Error ? e.message : 'Update failed.');
                  } finally {
                    setBusy(false);
                  }
                }}
                onDeleteTransaction={(client, allTxs, txId) => {
                  setConfirmState({
                    open: true,
                    title: 'Delete Transaction?',
                    message: 'Removing this entry will recalculate the client’s current balance.',
                    danger: true,
                    onConfirm: async () => {
                      setBusy(true);
                      try {
                        await deleteLedgerTransactionAtomic(user.uid, client, allTxs, txId);
                        pushToast('success', 'Transaction deleted.');
                      } catch (e) {
                        pushToast('error', e instanceof Error ? e.message : 'Delete failed.');
                      } finally {
                        setBusy(false);
                        setConfirmState((p) => ({ ...p, open: false }));
                      }
                    },
                  });
                }}
                onPrintArchive={handlePrintArchive}
              />
            )}

            {activeTab === 'expenses' && (
              <ExpenseTrackerView
                histories={histories}
                expenses={expenses}
                budgets={budgets}
                savingsGoal={savingsGoal}
                busy={busy}
                onAddExpense={async (payload) => {
                  setBusy(true);
                  try {
                    await addPersonalExpense(user.uid, payload);
                    pushToast('success', 'Expense saved to Cloud.');
                  } catch (e) {
                    pushToast('error', e instanceof Error ? e.message : 'Failed to save expense.');
                  } finally {
                    setBusy(false);
                  }
                }}
                onDeleteExpense={(id) => {
                  setConfirmState({
                    open: true,
                    title: 'Delete Expense Entry?',
                    message: 'This personal expense entry will be permanently deleted.',
                    danger: true,
                    onConfirm: async () => {
                      setBusy(true);
                      try {
                        await deletePersonalExpense(user.uid, id);
                        pushToast('success', 'Expense deleted.');
                      } catch (e) {
                        pushToast('error', e instanceof Error ? e.message : 'Delete failed.');
                      } finally {
                        setBusy(false);
                        setConfirmState((p) => ({ ...p, open: false }));
                      }
                    },
                  });
                }}
                onSaveBudget={async (cat, amt) => {
                  setBusy(true);
                  try {
                    await upsertCategoryBudget(user.uid, budgets, cat, amt);
                    pushToast('success', 'Category budget saved.');
                  } catch (e) {
                    pushToast('error', e instanceof Error ? e.message : 'Failed to save budget.');
                  } finally {
                    setBusy(false);
                  }
                }}
                onDeleteBudget={(id) => {
                  setConfirmState({
                    open: true,
                    title: 'Delete Category Budget?',
                    message: 'This monthly spending limit will be removed.',
                    danger: true,
                    onConfirm: async () => {
                      setBusy(true);
                      try {
                        await deleteCategoryBudget(user.uid, id);
                        pushToast('success', 'Budget removed.');
                      } catch (e) {
                        pushToast('error', e instanceof Error ? e.message : 'Delete failed.');
                      } finally {
                        setBusy(false);
                        setConfirmState((p) => ({ ...p, open: false }));
                      }
                    },
                  });
                }}
                onSaveGoal={async (target, saved) => {
                  setBusy(true);
                  try {
                    await saveSavingsGoal(user.uid, target, saved);
                    pushToast('success', 'Savings goal updated.');
                  } catch (e) {
                    pushToast('error', e instanceof Error ? e.message : 'Failed to save goal.');
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsBackupView
                user={user}
                profile={profile}
                workspace={workspace}
                bioConfig={bioConfig}
                darkMode={darkMode}
                busy={busy}
                lastJsonBackupAt={lastJsonBackupAt}
                onToggleDark={() => setDarkMode((d) => !d)}
                onUpdateShopAndTarget={async (newShopName, newTarget) => {
                  setBusy(true);
                  try {
                    await updateUserProfileSettings(user.uid, { shopName: newShopName });
                    const nextWs = { ...workspaceRef.current, dailyTarget: newTarget };
                    await saveWorkspaceState(user.uid, nextWs);
                    setWorkspace(nextWs);
                    pushToast('success', 'Shop & target settings saved.');
                  } catch (e) {
                    pushToast('error', e instanceof Error ? e.message : 'Failed to save settings.');
                  } finally {
                    setBusy(false);
                  }
                }}
                onSavePinSettings={async (enabled, pinHash) => {
                  setBusy(true);
                  try {
                    await updateUserProfileSettings(user.uid, {
                      pinEnabled: enabled,
                      pinHash,
                    });
                    if (enabled) setPinUnlocked(true);
                    pushToast(
                      'success',
                      enabled ? 'PIN lock enabled.' : 'PIN lock disabled.'
                    );
                  } catch (e) {
                    pushToast('error', e instanceof Error ? e.message : 'Failed to update PIN.');
                  } finally {
                    setBusy(false);
                  }
                }}
                onBiometricChange={(next) => {
                  setBioConfig(next);
                  if (next?.enabled) {
                    setPinUnlocked(true);
                    pushToast('success', 'Fingerprint Lock enabled on this device.');
                  } else {
                    pushToast('info', 'Fingerprint Lock disabled.');
                  }
                }}
                onLockNow={() => setPinUnlocked(false)}
                onExportJson={handleExportJson}
                onImportJson={handleImportJson}
                onSignOut={async () => {
                  if (hasUnbackedUpData) {
                    setConfirmState({
                      open: true,
                      title: 'Cloud Backup Not Finished Yet!',
                      message:
                        'Some entries on this device have NOT been backed up to Cloud yet. Please stay signed in with internet until the top bar shows "Cloud Backed Up". Signing out right now may leave unsynced data behind.',
                      danger: true,
                      onConfirm: async () => {
                        setConfirmState((p) => ({ ...p, open: false }));
                        await signOut(auth);
                        pushToast('info', 'Signed out.');
                      },
                    });
                    return;
                  }
                  await signOut(auth);
                  pushToast('info', 'Signed out cleanly.');
                }}
              />
            )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* Mobile Fixed Bottom Thumb Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] print:hidden"
      >
        <div className="grid grid-cols-5 h-16">
          {NAV_ITEMS.map(({ key, mobileLabel, Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`flex flex-col items-center justify-center gap-1 min-h-[48px] transition-colors ${
                  active
                    ? 'text-indigo-600 dark:text-sky-400 font-semibold'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] leading-none">{mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Modals & Helpers */}
      {showPinOverlay && (
        <PinLockOverlay
          uid={user.uid}
          expectedPinHash={profile?.pinHash || ''}
          hasPin={hasPin}
          hasFingerprint={hasFingerprint}
          shopName={shopName}
          onUnlock={() => setPinUnlocked(true)}
          onSignOutFallback={async () => {
            if (!hasUnbackedUpData) {
              await signOut(auth);
            } else {
              pushToast(
                'error',
                'Cannot sign out while cloud backup is pending. Connect internet first.'
              );
            }
          }}
        />
      )}

      <ClosingReportModal
        open={closingModalOpen}
        summary={summary}
        workingCapital={workingCapital}
        closingNote={workspace.closingNote}
        onShareReport={() => setBusinessShareOpen(true)}
        onClose={() => setClosingModalOpen(false)}
      />

      <ShareReportModal
        open={businessShareOpen}
        shopName={shopName}
        payload={
          businessShareOpen
            ? {
                kind: 'business',
                shopName,
                workspace,
                histories,
              }
            : null
        }
        onClose={() => setBusinessShareOpen(false)}
        onCopied={() => pushToast('success', 'Report text copied to clipboard.')}
      />

      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        danger={confirmState.danger}
        busy={busy}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((p) => ({ ...p, open: false }))}
      />

      <ThermalPrintSheet
        shopName={shopName}
        archive={printData.archive}
        transactions={printData.txs}
      />

      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((p) => p.filter((x) => x.id !== id))}
      />
    </div>
  );
}
