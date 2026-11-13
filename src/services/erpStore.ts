import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
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
  PersonalExpense,
  SavingsGoal,
  UserProfile,
  WorkspaceState,
} from '../types';
import {
  computeBalanceSummary,
  createDefaultWorkspace,
  findDuplicateDailyHistoryIds,
  getDailyHistoryDuplicateKey,
  isoToLocalDateKey,
  localDateKey,
  makeSafeId,
  recomputeClientTotals,
  resolveLedgerAccount,
  resolveWithdrawalAccount,
  safeNum,
} from '../utils/accounting';

function clampStr(val: unknown, maxLen: number): string {
  return String(val ?? '').trim().slice(0, maxLen);
}

export function normalizeClientName(name: string): string {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizePhoneKey(mobile: string): string {
  const digits = String(mobile ?? '').replace(/\D/g, '');
  if (digits.startsWith('880') && digits.length === 13) return digits.slice(2);
  return digits;
}

export function makeClientDuplicateKey(name: string, mobile: string): string {
  return `${normalizeClientName(name)}::${normalizePhoneKey(mobile)}`;
}

function sanitizeWorkspacePayload(ws: WorkspaceState) {
  return {
    mfsCapital: safeNum(ws.mfsCapital),
    rechargeCapital: safeNum(ws.rechargeCapital),
    dailyTarget: safeNum(ws.dailyTarget),
    obk: safeNum(ws.obk),
    ong: safeNum(ws.ong),
    ork: safeNum(ws.ork),
    otk: safeNum(ws.otk),
    omc: safeNum(ws.omc),
    ogp: safeNum(ws.ogp),
    orobi: safeNum(ws.orobi),
    oair: safeNum(ws.oair),
    obl: safeNum(ws.obl),
    orc: safeNum(ws.orc),
    cbk: safeNum(ws.cbk),
    cng: safeNum(ws.cng),
    crk: safeNum(ws.crk),
    ctk: safeNum(ws.ctk),
    cmc: safeNum(ws.cmc),
    cgp: safeNum(ws.cgp),
    crobi: safeNum(ws.crobi),
    cair: safeNum(ws.cair),
    cbl: safeNum(ws.cbl),
    crc: safeNum(ws.crc),
    openingNote: clampStr(ws.openingNote, 1000),
    closingNote: clampStr(ws.closingNote, 1000),
  };
}

export async function ensureUserAndWorkspace(user: User): Promise<void> {
  const userPath = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email: clampStr(user.email || 'user@example.com', 200),
        displayName: clampStr(user.displayName || 'Business Owner', 120),
        shopName: 'Rubaiya Pharmacy',
        pinHash: '',
        pinEnabled: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }

  const wsPath = `users/${user.uid}/workspace/current`;
  const wsRef = doc(db, 'users', user.uid, 'workspace', 'current');
  try {
    const snap = await getDoc(wsRef);
    if (!snap.exists()) {
      const def = createDefaultWorkspace(user.uid);
      await setDoc(wsRef, {
        ownerId: user.uid,
        ...sanitizeWorkspacePayload(def),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, wsPath);
  }

  const goalPath = `users/${user.uid}/settings/savingsGoal`;
  const goalRef = doc(db, 'users', user.uid, 'settings', 'savingsGoal');
  try {
    const snap = await getDoc(goalRef);
    if (!snap.exists()) {
      await setDoc(goalRef, {
        ownerId: user.uid,
        target: 0,
        saved: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, goalPath);
  }
}

export async function updateUserProfileSettings(
  uid: string,
  patch: Partial<Pick<UserProfile, 'displayName' | 'shopName' | 'pinHash' | 'pinEnabled'>>
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (patch.displayName !== undefined) payload.displayName = clampStr(patch.displayName, 120);
    if (patch.shopName !== undefined) payload.shopName = clampStr(patch.shopName || 'Rubaiya Pharmacy', 120);
    if (patch.pinHash !== undefined) payload.pinHash = clampStr(patch.pinHash, 128);
    if (patch.pinEnabled !== undefined) payload.pinEnabled = Boolean(patch.pinEnabled);
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function saveWorkspaceState(uid: string, ws: WorkspaceState): Promise<void> {
  const path = `users/${uid}/workspace/current`;
  try {
    await updateDoc(doc(db, 'users', uid, 'workspace', 'current'), {
      ...sanitizeWorkspacePayload(ws),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function saveDailyClosing(
  uid: string,
  ws: WorkspaceState,
  editingId?: string | null
): Promise<string> {
  const summary = computeBalanceSummary(ws);
  let targetId = editingId || '';

  // Prevent accidental duplicate Final Save of the exact same shift figures on the same day
  if (!targetId) {
    try {
      const existingSnap = await getDocs(
        query(collection(db, 'users', uid, 'dailyHistories'), where('ownerId', '==', uid))
      );
      const todayKey = localDateKey();
      const sameShiftDoc = existingSnap.docs.find((d) => {
        const h = d.data() as DailyHistory;
        return (
          h.type === 'dailyClosing' &&
          isoToLocalDateKey(h.dateIso) === todayKey &&
          safeNum(h.opening) === summary.opening &&
          safeNum(h.closing) === summary.closing &&
          safeNum(h.mfs) === summary.mfsProfit &&
          safeNum(h.recharge) === summary.rechargeProfit &&
          safeNum(h.profit) === summary.totalProfit
        );
      });
      if (sameShiftDoc) {
        targetId = sameShiftDoc.id;
      }
    } catch {
      // Proceed cleanly with new record if lookup fails
    }
  }

  const isUpdate = Boolean(targetId);
  const historyId = targetId || makeSafeId('DAY');
  const path = `users/${uid}/dailyHistories/${historyId}`;
  const ref = doc(db, 'users', uid, 'dailyHistories', historyId);

  try {
    if (isUpdate) {
      await updateDoc(ref, {
        dateIso: new Date().toISOString(),
        opening: summary.opening,
        closing: summary.closing,
        openingMFS: summary.openMFS,
        closingMFS: summary.closeMFS,
        openingRecharge: summary.openRecharge,
        closingRecharge: summary.closeRecharge,
        mfs: summary.mfsProfit,
        recharge: summary.rechargeProfit,
        profit: summary.totalProfit,
        note: clampStr(ws.closingNote, 1000),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id: historyId,
        ownerId: uid,
        type: 'dailyClosing',
        dateIso: new Date().toISOString(),
        opening: summary.opening,
        closing: summary.closing,
        openingMFS: summary.openMFS,
        closingMFS: summary.closeMFS,
        openingRecharge: summary.openRecharge,
        closingRecharge: summary.closeRecharge,
        mfs: summary.mfsProfit,
        recharge: summary.rechargeProfit,
        profit: summary.totalProfit,
        note: clampStr(ws.closingNote, 1000),
        withdrawalAmount: 0,
        withdrawalMethod: '',
        withdrawalSource: '',
        withdrawalCategory: '',
        withdrawalReason: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return historyId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteDailyHistory(uid: string, historyId: string): Promise<void> {
  const path = `users/${uid}/dailyHistories/${historyId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'dailyHistories', historyId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function deduplicateHistoriesAndExpenses(uid: string): Promise<{
  removedClosings: number;
  removedWithdrawals: number;
  removedExpenses: number;
}> {
  const histPath = `users/${uid}/dailyHistories`;
  let allHistories: DailyHistory[] = [];
  let allExpenses: PersonalExpense[] = [];

  try {
    const [histSnap, expSnap] = await Promise.all([
      getDocs(query(collection(db, 'users', uid, 'dailyHistories'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'users', uid, 'expenses'), where('ownerId', '==', uid))),
    ]);
    allHistories = histSnap.docs.map((d) => d.data() as DailyHistory);
    allExpenses = expSnap.docs.map((d) => d.data() as PersonalExpense);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, histPath);
  }

  const { extraIds, closingExtraCount, withdrawalExtraCount } =
    findDuplicateDailyHistoryIds(allHistories);

  // Deduplicate manual expenses too
  const seenExpKeys = new Set<string>();
  const extraExpenseIds: string[] = [];
  const orderedExpenses = [...allExpenses].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  for (const e of orderedExpenses) {
    const k = `${e.date}|${safeNum(e.amount)}|${(e.category || '').trim().toLowerCase()}|${(e.method || '').trim().toLowerCase()}|${(e.note || '').trim().toLowerCase()}`;
    if (seenExpKeys.has(k)) extraExpenseIds.push(e.id);
    else seenExpKeys.add(k);
  }

  let batch = writeBatch(db);
  let opCount = 0;

  for (const id of extraIds) {
    batch.delete(doc(db, 'users', uid, 'dailyHistories', id));
    opCount++;
    if (opCount >= 350) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  for (const id of extraExpenseIds) {
    batch.delete(doc(db, 'users', uid, 'expenses', id));
    opCount++;
    if (opCount >= 350) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  if (opCount > 0) {
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, histPath);
    }
  }

  return {
    removedClosings: closingExtraCount,
    removedWithdrawals: withdrawalExtraCount,
    removedExpenses: extraExpenseIds.length,
  };
}

export async function startNewDayAtomic(uid: string, ws: WorkspaceState): Promise<WorkspaceState> {
  const nextMfsCap =
    safeNum(ws.cbk) + safeNum(ws.cng) + safeNum(ws.crk) + safeNum(ws.ctk) + safeNum(ws.cmc);
  const nextRechargeCap =
    safeNum(ws.cgp) + safeNum(ws.crobi) + safeNum(ws.cair) + safeNum(ws.cbl) + safeNum(ws.crc);

  const nextWs: WorkspaceState = {
    ...ws,
    obk: safeNum(ws.cbk),
    ong: safeNum(ws.cng),
    ork: safeNum(ws.crk),
    otk: safeNum(ws.ctk),
    omc: safeNum(ws.cmc),
    ogp: safeNum(ws.cgp),
    orobi: safeNum(ws.crobi),
    oair: safeNum(ws.cair),
    obl: safeNum(ws.cbl),
    orc: safeNum(ws.crc),
    mfsCapital: nextMfsCap,
    rechargeCapital: nextRechargeCap,
  };

  await saveWorkspaceState(uid, nextWs);
  return nextWs;
}

export async function applyReinvestAtomic(
  uid: string,
  ws: WorkspaceState,
  mfsAdd: number,
  rechargeAdd: number
): Promise<WorkspaceState> {
  const nextWs: WorkspaceState = {
    ...ws,
    mfsCapital: safeNum(ws.mfsCapital) + safeNum(mfsAdd),
    rechargeCapital: safeNum(ws.rechargeCapital) + safeNum(rechargeAdd),
  };
  await saveWorkspaceState(uid, nextWs);
  return nextWs;
}

export async function withdrawFromCapitalAtomic(
  uid: string,
  ws: WorkspaceState,
  payload: {
    amount: number;
    reason: string;
    category: string;
    source: CapitalSource;
    method: string;
  }
): Promise<WorkspaceState> {
  const amount = safeNum(payload.amount);
  const account = resolveWithdrawalAccount(payload.method, payload.source);
  if (!account) throw new Error('Invalid withdrawal method selected.');
  if (account.source !== payload.source) {
    throw new Error(
      `Selected method (${payload.method}) does not match Capital source (${payload.source.toUpperCase()}).`
    );
  }

  const capitalKey = payload.source === 'mfs' ? 'mfsCapital' : 'rechargeCapital';
  const currentOpening = safeNum(ws[account.field]);
  const currentCapital = safeNum(ws[capitalKey]);

  if (amount <= 0) throw new Error('Please enter a valid positive amount.');
  if (amount > currentOpening) {
    throw new Error(`Insufficient balance in selected Opening account (Available: ৳${currentOpening}).`);
  }
  if (amount > currentCapital) {
    throw new Error(`Insufficient funds in selected Base Capital (Available: ৳${currentCapital}).`);
  }

  const nextWs: WorkspaceState = {
    ...ws,
    [account.field]: currentOpening - amount,
    [capitalKey]: currentCapital - amount,
  };

  const historyId = makeSafeId('OW');
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid, 'workspace', 'current'), {
    ...sanitizeWorkspacePayload(nextWs),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'users', uid, 'dailyHistories', historyId), {
    id: historyId,
    ownerId: uid,
    type: 'ownerWithdrawal',
    dateIso: new Date().toISOString(),
    opening: 0,
    closing: 0,
    openingMFS: 0,
    closingMFS: 0,
    openingRecharge: 0,
    closingRecharge: 0,
    mfs: 0,
    recharge: 0,
    profit: 0,
    note: clampStr(
      `Owner Withdrawal: ৳${amount} | ${payload.category} | ${payload.method} | ${payload.reason || 'Personal Expense'}`,
      1000
    ),
    withdrawalAmount: amount,
    withdrawalMethod: clampStr(payload.method, 40),
    withdrawalSource: payload.source,
    withdrawalCategory: clampStr(payload.category || 'Other', 60),
    withdrawalReason: clampStr(payload.reason || 'Personal Expense', 300),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return nextWs;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/dailyHistories/${historyId}`);
  }
}

export async function addLedgerClient(
  uid: string,
  name: string,
  mobile: string
): Promise<string> {
  const cleanName = clampStr(name, 120);
  const cleanMobile = clampStr(mobile, 30);
  if (!cleanName) throw new Error('Please enter a client name.');

  // Guard against duplicate client creation
  const existingSnap = await getDocs(
    query(collection(db, 'users', uid, 'ledgerClients'), where('ownerId', '==', uid))
  );
  const targetNameKey = normalizeClientName(cleanName);
  const targetPhoneKey = normalizePhoneKey(cleanMobile);
  const duplicate = existingSnap.docs.find((d) => {
    const c = d.data() as LedgerClient;
    const sameName = normalizeClientName(c.name) === targetNameKey;
    if (!sameName) return false;
    const existingPhone = normalizePhoneKey(c.mobile);
    return !targetPhoneKey || !existingPhone || existingPhone === targetPhoneKey;
  });
  if (duplicate) {
    throw new Error(`Client "${cleanName}" already exists in your Client Directory.`);
  }

  const clientId = makeSafeId('CLI');
  const path = `users/${uid}/ledgerClients/${clientId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'ledgerClients', clientId), {
      id: clientId,
      ownerId: uid,
      name: cleanName,
      mobile: cleanMobile,
      totalGiven: 0,
      totalTaken: 0,
      refundGiven: 0,
      refundReceived: 0,
      balance: 0,
      txCount: 0,
      lastTxIso: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return clientId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deduplicateLedgerClients(
  uid: string
): Promise<{ removedClients: number; mergedTransactions: number }> {
  const path = `users/${uid}/ledgerClients`;
  let allClients: LedgerClient[] = [];
  try {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'ledgerClients'), where('ownerId', '==', uid))
    );
    allClients = snap.docs.map((d) => d.data() as LedgerClient);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }

  const groups = new Map<string, LedgerClient[]>();
  for (const c of allClients) {
    const key = makeClientDuplicateKey(c.name, c.mobile);
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }

  let removedClients = 0;
  let mergedTransactions = 0;

  for (const group of groups.values()) {
    if (group.length <= 1) continue;

    // Pick primary keeper: most transactions, then non-zero balance, then deterministic ID
    const sorted = [...group].sort((a, b) => {
      if ((b.txCount || 0) !== (a.txCount || 0)) return (b.txCount || 0) - (a.txCount || 0);
      if (Math.abs(b.balance || 0) !== Math.abs(a.balance || 0)) {
        return Math.abs(b.balance || 0) - Math.abs(a.balance || 0);
      }
      return (a.id || '').localeCompare(b.id || '');
    });

    const keeper = sorted[0];
    const duplicates = sorted.slice(1);

    const keeperTxs = await fetchClientTransactions(uid, keeper.id);
    const txSig = (t: LedgerTransaction) =>
      `${safeNum(t.amount)}|${t.type}|${clampStr(t.method, 60)}|${clampStr(t.txDateIso, 40)}`;
    const seenTxs = new Set(keeperTxs.map(txSig));
    const txsToMerge: LedgerTransaction[] = [];

    // Collect unique txs from duplicates and delete duplicate subcollection txs first
    for (const dup of duplicates) {
      const dupTxs = await fetchClientTransactions(uid, dup.id);
      for (const dt of dupTxs) {
        const sig = txSig(dt);
        if (!seenTxs.has(sig)) {
          seenTxs.add(sig);
          txsToMerge.push({
            ...dt,
            id: makeSafeId('TX'),
            ownerId: uid,
            clientId: keeper.id,
          });
        }
      }

      if (dupTxs.length > 0) {
        let txBatch = writeBatch(db);
        let op = 0;
        for (const dt of dupTxs) {
          txBatch.delete(doc(db, 'users', uid, 'ledgerClients', dup.id, 'transactions', dt.id));
          op++;
          if (op >= 350) {
            await txBatch.commit();
            txBatch = writeBatch(db);
            op = 0;
          }
        }
        if (op > 0) await txBatch.commit();
      }
    }

    // Merge any unique transactions onto keeper before removing duplicates
    if (txsToMerge.length > 0) {
      const mergedAll = [...keeperTxs, ...txsToMerge];
      const stats = recomputeClientTotals(mergedAll);
      let mergeBatch = writeBatch(db);
      let op = 0;
      for (const mt of txsToMerge) {
        mergeBatch.set(doc(db, 'users', uid, 'ledgerClients', keeper.id, 'transactions', mt.id), {
          ...mt,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        mergedTransactions++;
        op++;
        if (op >= 350) {
          await mergeBatch.commit();
          mergeBatch = writeBatch(db);
          op = 0;
        }
      }
      mergeBatch.update(doc(db, 'users', uid, 'ledgerClients', keeper.id), {
        totalGiven: stats.totalGiven,
        totalTaken: stats.totalTaken,
        refundGiven: stats.refundGiven,
        refundReceived: stats.refundReceived,
        balance: stats.balance,
        txCount: stats.txCount,
        lastTxIso: stats.lastTxIso,
        updatedAt: serverTimestamp(),
      });
      await mergeBatch.commit();
    }

    // Now delete the duplicate client documents
    let delBatch = writeBatch(db);
    let delOp = 0;
    for (const dup of duplicates) {
      delBatch.delete(doc(db, 'users', uid, 'ledgerClients', dup.id));
      removedClients++;
      delOp++;
      if (delOp >= 350) {
        await delBatch.commit();
        delBatch = writeBatch(db);
        delOp = 0;
      }
    }
    if (delOp > 0) {
      try {
        await delBatch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }
  }

  return { removedClients, mergedTransactions };
}

export async function updateLedgerClientInfo(
  uid: string,
  clientId: string,
  name: string,
  mobile: string
): Promise<void> {
  const cleanName = clampStr(name, 120);
  if (!cleanName) throw new Error('Client name cannot be empty.');
  const path = `users/${uid}/ledgerClients/${clientId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'ledgerClients', clientId), {
      name: cleanName,
      mobile: clampStr(mobile, 30),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteLedgerClientCascade(uid: string, clientId: string): Promise<void> {
  const clientPath = `users/${uid}/ledgerClients/${clientId}`;
  try {
    const txSnap = await getDocs(
      query(
        collection(db, 'users', uid, 'ledgerClients', clientId, 'transactions'),
        where('ownerId', '==', uid)
      )
    );
    const batch = writeBatch(db);
    txSnap.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'users', uid, 'ledgerClients', clientId));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, clientPath);
  }
}

export async function fetchClientTransactions(
  uid: string,
  clientId: string
): Promise<LedgerTransaction[]> {
  const path = `users/${uid}/ledgerClients/${clientId}/transactions`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, 'ledgerClients', clientId, 'transactions'),
        where('ownerId', '==', uid)
      )
    );
    return snap.docs
      .map((d) => d.data() as LedgerTransaction)
      .sort((a, b) => (b.txDateIso || '').localeCompare(a.txDateIso || ''));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchArchiveTransactions(
  uid: string,
  archiveId: string
): Promise<ArchivedTransaction[]> {
  const path = `users/${uid}/ledgerArchives/${archiveId}/transactions`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, 'ledgerArchives', archiveId, 'transactions'),
        where('ownerId', '==', uid)
      )
    );
    return snap.docs
      .map((d) => d.data() as ArchivedTransaction)
      .sort((a, b) => (b.txDateIso || '').localeCompare(a.txDateIso || ''));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function recordLedgerTransactionAtomic(
  uid: string,
  ws: WorkspaceState,
  client: LedgerClient,
  existingTxs: LedgerTransaction[],
  payload: {
    amount: number;
    type: LedgerTxType;
    method: string;
    fundSource: LedgerFundSource;
    note: string;
  }
): Promise<{
  nextWs: WorkspaceState;
  settled: boolean;
  newBalance: number;
  archiveId?: string;
}> {
  const amount = safeNum(payload.amount);
  if (amount <= 0) throw new Error('Please enter a valid positive amount.');

  const sign = payload.type === 'gave' || payload.type === 'refundReceived' ? 1 : -1;
  let nextWs = { ...ws };
  const mappedAccount = resolveLedgerAccount(payload.method, payload.fundSource);

  if (payload.fundSource !== 'external') {
    if (!mappedAccount) {
      throw new Error(
        'This method is not linked to MFS/Recharge balances. Select "External Only" or choose Cash/Bkash/Nagad/Rocket/SIM/Tally.'
      );
    }
    if (mappedAccount.source !== payload.fundSource) {
      throw new Error(
        `Selected method (${payload.method}) does not match fund source (${payload.fundSource.toUpperCase()}).`
      );
    }
    const capitalKey = payload.fundSource === 'mfs' ? 'mfsCapital' : 'rechargeCapital';
    const curOpening = safeNum(ws[mappedAccount.field]);
    const curCapital = safeNum(ws[capitalKey]);

    if (sign < 0 && amount > curOpening) {
      throw new Error(`Insufficient funds in selected Opening Balance (Available: ৳${curOpening}).`);
    }
    if (sign < 0 && amount > curCapital) {
      throw new Error(`Insufficient funds in selected Base Capital (Available: ৳${curCapital}).`);
    }

    nextWs = {
      ...ws,
      [mappedAccount.field]: curOpening + amount * sign,
      [capitalKey]: curCapital + amount * sign,
    };
  }

  const nowIso = new Date().toISOString();
  const txId = makeSafeId('TX');
  const newTx: LedgerTransaction = {
    id: txId,
    ownerId: uid,
    clientId: client.id,
    amount,
    type: payload.type,
    method: clampStr(payload.method, 60),
    fundSource: payload.fundSource,
    note: clampStr(payload.note, 300),
    txDateIso: nowIso,
  };

  const combinedTxs = [...existingTxs, newTx];
  const stats = recomputeClientTotals(combinedTxs);
  const settled = combinedTxs.length > 0 && Math.abs(stats.balance) < 0.001;

  const batch = writeBatch(db);
  if (payload.fundSource !== 'external') {
    batch.update(doc(db, 'users', uid, 'workspace', 'current'), {
      ...sanitizeWorkspacePayload(nextWs),
      updatedAt: serverTimestamp(),
    });
  }

  const clientRef = doc(db, 'users', uid, 'ledgerClients', client.id);

  if (settled) {
    const archiveId = makeSafeId('ARC');
    const archiveRef = doc(db, 'users', uid, 'ledgerArchives', archiveId);
    batch.set(archiveRef, {
      id: archiveId,
      ownerId: uid,
      clientId: client.id,
      personName: clampStr(client.name, 120),
      personMobile: clampStr(client.mobile, 30),
      settledAtIso: nowIso,
      businessDate: localDateKey(),
      finalBalance: 0,
      totalGiven: stats.totalGiven,
      totalTaken: stats.totalTaken,
      refundGiven: stats.refundGiven,
      refundReceived: stats.refundReceived,
      txCount: combinedTxs.length,
      createdAt: serverTimestamp(),
    });

    combinedTxs.forEach((tx) => {
      const archTxRef = doc(db, 'users', uid, 'ledgerArchives', archiveId, 'transactions', tx.id);
      batch.set(archTxRef, {
        id: tx.id,
        ownerId: uid,
        archiveId,
        amount: tx.amount,
        type: tx.type,
        method: tx.method,
        fundSource: tx.fundSource,
        txDateIso: tx.txDateIso,
        createdAt: serverTimestamp(),
      });
    });

    existingTxs.forEach((oldTx) => {
      batch.delete(doc(db, 'users', uid, 'ledgerClients', client.id, 'transactions', oldTx.id));
    });

    batch.update(clientRef, {
      totalGiven: 0,
      totalTaken: 0,
      refundGiven: 0,
      refundReceived: 0,
      balance: 0,
      txCount: 0,
      lastTxIso: nowIso,
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
      return { nextWs, settled: true, newBalance: 0, archiveId };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}/ledgerArchives/${archiveId}`);
    }
  } else {
    batch.set(doc(db, 'users', uid, 'ledgerClients', client.id, 'transactions', txId), {
      ...newTx,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(clientRef, {
      totalGiven: stats.totalGiven,
      totalTaken: stats.totalTaken,
      refundGiven: stats.refundGiven,
      refundReceived: stats.refundReceived,
      balance: stats.balance,
      txCount: stats.txCount,
      lastTxIso: stats.lastTxIso,
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
      return { nextWs, settled: false, newBalance: stats.balance };
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.WRITE,
        `users/${uid}/ledgerClients/${client.id}/transactions/${txId}`
      );
    }
  }
}

export async function editLedgerTransactionAtomic(
  uid: string,
  client: LedgerClient,
  allTxs: LedgerTransaction[],
  txId: string,
  patch: { amount: number; type: LedgerTxType; note: string }
): Promise<void> {
  const amount = safeNum(patch.amount);
  if (amount <= 0) throw new Error('Please enter a valid positive amount.');

  const updatedTxs = allTxs.map((t) =>
    t.id === txId
      ? { ...t, amount, type: patch.type, note: clampStr(patch.note, 300) }
      : t
  );
  const stats = recomputeClientTotals(updatedTxs);

  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid, 'ledgerClients', client.id, 'transactions', txId), {
    amount,
    type: patch.type,
    note: clampStr(patch.note, 300),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users', uid, 'ledgerClients', client.id), {
    totalGiven: stats.totalGiven,
    totalTaken: stats.totalTaken,
    refundGiven: stats.refundGiven,
    refundReceived: stats.refundReceived,
    balance: stats.balance,
    txCount: stats.txCount,
    lastTxIso: stats.lastTxIso,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.UPDATE,
      `users/${uid}/ledgerClients/${client.id}/transactions/${txId}`
    );
  }
}

export async function deleteLedgerTransactionAtomic(
  uid: string,
  client: LedgerClient,
  allTxs: LedgerTransaction[],
  txId: string
): Promise<void> {
  const remainingTxs = allTxs.filter((t) => t.id !== txId);
  const stats = recomputeClientTotals(remainingTxs);

  const batch = writeBatch(db);
  batch.delete(doc(db, 'users', uid, 'ledgerClients', client.id, 'transactions', txId));
  batch.update(doc(db, 'users', uid, 'ledgerClients', client.id), {
    totalGiven: stats.totalGiven,
    totalTaken: stats.totalTaken,
    refundGiven: stats.refundGiven,
    refundReceived: stats.refundReceived,
    balance: stats.balance,
    txCount: stats.txCount,
    lastTxIso: stats.lastTxIso,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.DELETE,
      `users/${uid}/ledgerClients/${client.id}/transactions/${txId}`
    );
  }
}

export async function addPersonalExpense(
  uid: string,
  payload: { date: string; amount: number; category: string; method: string; note: string }
): Promise<string> {
  const amount = safeNum(payload.amount);
  if (!payload.date || amount <= 0) throw new Error('Please enter a valid date and amount.');
  const expenseId = makeSafeId('EXP');
  const path = `users/${uid}/expenses/${expenseId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'expenses', expenseId), {
      id: expenseId,
      ownerId: uid,
      date: clampStr(payload.date, 20),
      amount,
      category: clampStr(payload.category || 'Other', 60),
      method: clampStr(payload.method || 'Cash', 40),
      note: clampStr(payload.note, 200),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return expenseId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deletePersonalExpense(uid: string, expenseId: string): Promise<void> {
  const path = `users/${uid}/expenses/${expenseId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'expenses', expenseId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function upsertCategoryBudget(
  uid: string,
  existingBudgets: CategoryBudget[],
  category: string,
  amount: number
): Promise<void> {
  const existing = existingBudgets.find((b) => b.category === category);
  const budgetId = existing ? existing.id : makeSafeId('BDG');
  const path = `users/${uid}/categoryBudgets/${budgetId}`;
  try {
    if (existing) {
      await updateDoc(doc(db, 'users', uid, 'categoryBudgets', budgetId), {
        category: clampStr(category, 60),
        amount: Math.max(0, safeNum(amount)),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'users', uid, 'categoryBudgets', budgetId), {
        id: budgetId,
        ownerId: uid,
        category: clampStr(category, 60),
        amount: Math.max(0, safeNum(amount)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteCategoryBudget(uid: string, budgetId: string): Promise<void> {
  const path = `users/${uid}/categoryBudgets/${budgetId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'categoryBudgets', budgetId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveSavingsGoal(
  uid: string,
  target: number,
  saved: number
): Promise<void> {
  const path = `users/${uid}/settings/savingsGoal`;
  try {
    await updateDoc(doc(db, 'users', uid, 'settings', 'savingsGoal'), {
      target: Math.max(0, safeNum(target)),
      saved: Math.max(0, safeNum(saved)),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

interface LegacyBackupPayload {
  histories?: Array<Record<string, unknown>>;
  ledgerPeople?: Array<{
    name?: string;
    mobile?: string;
    history?: Array<{
      amount?: number;
      type?: LedgerTxType;
      method?: string;
      fundSource?: LedgerFundSource;
      time?: string;
    }>;
  }>;
  ledgerArchives?: Array<{
    archiveId?: string;
    personName?: string;
    personMobile?: string;
    settledAt?: string;
    businessDate?: string;
    totalGiven?: number;
    totalTaken?: number;
    refundGiven?: number;
    refundReceived?: number;
    transactions?: Array<{
      amount?: number;
      type?: LedgerTxType;
      method?: string;
      fundSource?: LedgerFundSource;
      time?: string;
    }>;
  }>;
  form?: Record<string, string | number>;
  expenses?: Array<{
    date?: string;
    amount?: number;
    category?: string;
    method?: string;
    note?: string;
    source?: string;
  }>;
  budgets?: Record<string, number>;
  goal?: { target?: number; saved?: number };
}

function parseLegacyDateToIso(raw: unknown): string {
  if (!raw) return new Date().toISOString();
  const s = String(raw).trim();
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  const m = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const yr = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    const dt = new Date(yr, Number(m[2]) - 1, Number(m[1]));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  return new Date().toISOString();
}

export async function importBackupToCloud(
  uid: string,
  currentWs: WorkspaceState,
  existingBudgets: CategoryBudget[],
  raw: LegacyBackupPayload
): Promise<{ importedHistories: number; importedClients: number; importedArchives: number; importedExpenses: number }> {
  // Load existing collections to prevent creating duplicate records on re-import
  const [existingClientsSnap, existingHistSnap, existingArchSnap, existingExpSnap] = await Promise.all([
    getDocs(query(collection(db, 'users', uid, 'ledgerClients'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'users', uid, 'dailyHistories'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'users', uid, 'ledgerArchives'), where('ownerId', '==', uid))),
    getDocs(query(collection(db, 'users', uid, 'expenses'), where('ownerId', '==', uid))),
  ]);

  const seenClientKeys = new Set(
    existingClientsSnap.docs.map((d) => {
      const c = d.data() as LedgerClient;
      return makeClientDuplicateKey(c.name, c.mobile);
    })
  );
  const seenHistoryKeys = new Set(
    existingHistSnap.docs.map((d) => getDailyHistoryDuplicateKey(d.data() as DailyHistory))
  );
  const seenArchiveKeys = new Set(
    existingArchSnap.docs.map((d) => {
      const a = d.data() as LedgerArchive;
      return `${normalizeClientName(a.personName)}|${a.settledAtIso}|${safeNum(a.totalGiven)}|${safeNum(a.totalTaken)}`;
    })
  );
  const seenExpenseKeys = new Set(
    existingExpSnap.docs.map((d) => {
      const e = d.data() as PersonalExpense;
      return `${e.date}|${safeNum(e.amount)}|${e.category}|${e.note}`;
    })
  );

  let batch = writeBatch(db);
  let opCount = 0;
  const flushIfFull = async () => {
    if (opCount >= 350) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  };

  let importedHistories = 0;
  let importedClients = 0;
  let importedArchives = 0;
  let importedExpenses = 0;

  if (raw.form && typeof raw.form === 'object') {
    const f = raw.form;
    const nextWs: WorkspaceState = {
      ...currentWs,
      mfsCapital: f.mfsCapital !== undefined ? safeNum(f.mfsCapital) : currentWs.mfsCapital,
      rechargeCapital: f.rechargeCapital !== undefined ? safeNum(f.rechargeCapital) : currentWs.rechargeCapital,
      dailyTarget: f.target !== undefined ? safeNum(f.target) : currentWs.dailyTarget,
      obk: f.obk !== undefined ? safeNum(f.obk) : currentWs.obk,
      ong: f.ong !== undefined ? safeNum(f.ong) : currentWs.ong,
      ork: f.ork !== undefined ? safeNum(f.ork) : currentWs.ork,
      otk: f.otk !== undefined ? safeNum(f.otk) : currentWs.otk,
      omc: f.omc !== undefined ? safeNum(f.omc) : currentWs.omc,
      ogp: f.ogp !== undefined ? safeNum(f.ogp) : currentWs.ogp,
      orobi: f.orobi !== undefined ? safeNum(f.orobi) : currentWs.orobi,
      oair: f.oair !== undefined ? safeNum(f.oair) : currentWs.oair,
      obl: f.obl !== undefined ? safeNum(f.obl) : currentWs.obl,
      orc: f.orc !== undefined ? safeNum(f.orc) : currentWs.orc,
      cbk: f.cbk !== undefined ? safeNum(f.cbk) : currentWs.cbk,
      cng: f.cng !== undefined ? safeNum(f.cng) : currentWs.cng,
      crk: f.crk !== undefined ? safeNum(f.crk) : currentWs.crk,
      ctk: f.ctk !== undefined ? safeNum(f.ctk) : currentWs.ctk,
      cmc: f.cmc !== undefined ? safeNum(f.cmc) : currentWs.cmc,
      cgp: f.cgp !== undefined ? safeNum(f.cgp) : currentWs.cgp,
      crobi: f.crobi !== undefined ? safeNum(f.crobi) : currentWs.crobi,
      cair: f.cair !== undefined ? safeNum(f.cair) : currentWs.cair,
      cbl: f.cbl !== undefined ? safeNum(f.cbl) : currentWs.cbl,
      crc: f.crc !== undefined ? safeNum(f.crc) : currentWs.crc,
      openingNote: f.ui_openingNote !== undefined ? clampStr(f.ui_openingNote, 1000) : currentWs.openingNote,
      closingNote: f.ui_closingNote !== undefined ? clampStr(f.ui_closingNote, 1000) : clampStr(f.note ?? currentWs.closingNote, 1000),
    };
    batch.update(doc(db, 'users', uid, 'workspace', 'current'), {
      ...sanitizeWorkspacePayload(nextWs),
      updatedAt: serverTimestamp(),
    });
    opCount++;
  }

  for (const h of raw.histories || []) {
    const isWithdrawal = h.type === 'ownerWithdrawal';
    const dateIso = parseLegacyDateToIso(h.dateIso || h.createdAt || h.date);
    const candidate: DailyHistory = {
      id: 'TEMP',
      ownerId: uid,
      type: isWithdrawal ? 'ownerWithdrawal' : 'dailyClosing',
      dateIso,
      opening: safeNum(h.opening),
      closing: safeNum(h.closing),
      openingMFS: safeNum(h.openingMFS),
      closingMFS: safeNum(h.closingMFS),
      openingRecharge: safeNum(h.openingRecharge),
      closingRecharge: safeNum(h.closingRecharge),
      mfs: safeNum(h.mfs),
      recharge: safeNum(h.recharge),
      profit: safeNum(h.profit),
      note: clampStr(h.note, 1000),
      withdrawalAmount: safeNum(h.withdrawalAmount),
      withdrawalMethod: clampStr(h.withdrawalMethod, 40),
      withdrawalSource: clampStr(h.withdrawalSource, 20),
      withdrawalCategory: clampStr(h.withdrawalCategory, 60),
      withdrawalReason: clampStr(h.withdrawalReason, 300),
    };
    const histKey = getDailyHistoryDuplicateKey(candidate);
    if (seenHistoryKeys.has(histKey)) continue;
    seenHistoryKeys.add(histKey);

    const id = makeSafeId('IMP');
    batch.set(doc(db, 'users', uid, 'dailyHistories', id), {
      id,
      ownerId: uid,
      type: isWithdrawal ? 'ownerWithdrawal' : 'dailyClosing',
      dateIso,
      opening: safeNum(h.opening),
      closing: safeNum(h.closing),
      openingMFS: safeNum(h.openingMFS),
      closingMFS: safeNum(h.closingMFS),
      openingRecharge: safeNum(h.openingRecharge),
      closingRecharge: safeNum(h.closingRecharge),
      mfs: safeNum(h.mfs),
      recharge: safeNum(h.recharge),
      profit: safeNum(h.profit),
      note: clampStr(h.note, 1000),
      withdrawalAmount: safeNum(h.withdrawalAmount),
      withdrawalMethod: clampStr(h.withdrawalMethod, 40),
      withdrawalSource: clampStr(h.withdrawalSource, 20),
      withdrawalCategory: clampStr(h.withdrawalCategory, 60),
      withdrawalReason: clampStr(h.withdrawalReason, 300),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    importedHistories++;
    opCount++;
    await flushIfFull();
  }

  for (const p of raw.ledgerPeople || []) {
    const clientName = clampStr(p.name || 'Unnamed Client', 120);
    const clientMobile = clampStr(p.mobile || '', 30);
    const clientKey = makeClientDuplicateKey(clientName, clientMobile);
    if (seenClientKeys.has(clientKey)) continue;
    seenClientKeys.add(clientKey);

    const clientId = makeSafeId('CLI');
    const txs: LedgerTransaction[] = (p.history || [])
      .filter((t) => safeNum(t.amount) > 0)
      .map((t) => ({
        id: makeSafeId('TX'),
        ownerId: uid,
        clientId,
        amount: safeNum(t.amount),
        type: (['gave', 'took', 'refundGiven', 'refundReceived'].includes(String(t.type))
          ? t.type
          : 'gave') as LedgerTxType,
        method: clampStr(t.method || 'Cash', 60),
        fundSource: (['mfs', 'recharge', 'external'].includes(String(t.fundSource))
          ? t.fundSource
          : 'external') as LedgerFundSource,
        note: '',
        txDateIso: parseLegacyDateToIso(t.time),
      }));

    const stats = recomputeClientTotals(txs);
    batch.set(doc(db, 'users', uid, 'ledgerClients', clientId), {
      id: clientId,
      ownerId: uid,
      name: clientName,
      mobile: clientMobile,
      totalGiven: stats.totalGiven,
      totalTaken: stats.totalTaken,
      refundGiven: stats.refundGiven,
      refundReceived: stats.refundReceived,
      balance: stats.balance,
      txCount: stats.txCount,
      lastTxIso: stats.lastTxIso,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    importedClients++;
    opCount++;
    await flushIfFull();

    // Commit client first before subcollection transactions if we are close to batch limit
    if (txs.length > 0) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;

      for (const tx of txs) {
        batch.set(doc(db, 'users', uid, 'ledgerClients', clientId, 'transactions', tx.id), {
          ...tx,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        opCount++;
        await flushIfFull();
      }
    }
  }

  for (const a of raw.ledgerArchives || []) {
    const txs = (a.transactions || []).filter((t) => safeNum(t.amount) > 0);
    if (txs.length === 0) continue;

    const personName = clampStr(a.personName || 'Archived Client', 120);
    const settledAtIso = parseLegacyDateToIso(a.settledAt);
    const archKey = `${normalizeClientName(personName)}|${settledAtIso}|${safeNum(a.totalGiven)}|${safeNum(a.totalTaken)}`;
    if (seenArchiveKeys.has(archKey)) continue;
    seenArchiveKeys.add(archKey);

    const archiveId = makeSafeId('ARC');
    batch.set(doc(db, 'users', uid, 'ledgerArchives', archiveId), {
      id: archiveId,
      ownerId: uid,
      clientId: makeSafeId('CLI'),
      personName,
      personMobile: clampStr(a.personMobile || '', 30),
      settledAtIso,
      businessDate: clampStr(a.businessDate || localDateKey(), 20),
      finalBalance: 0,
      totalGiven: safeNum(a.totalGiven),
      totalTaken: safeNum(a.totalTaken),
      refundGiven: safeNum(a.refundGiven),
      refundReceived: safeNum(a.refundReceived),
      txCount: txs.length,
      createdAt: serverTimestamp(),
    });
    opCount++;

    for (const tx of txs) {
      const txId = makeSafeId('ATX');
      batch.set(doc(db, 'users', uid, 'ledgerArchives', archiveId, 'transactions', txId), {
        id: txId,
        ownerId: uid,
        archiveId,
        amount: safeNum(tx.amount),
        type: (['gave', 'took', 'refundGiven', 'refundReceived'].includes(String(tx.type))
          ? tx.type
          : 'gave') as LedgerTxType,
        method: clampStr(tx.method || 'Cash', 60),
        fundSource: (['mfs', 'recharge', 'external'].includes(String(tx.fundSource))
          ? tx.fundSource
          : 'external') as LedgerFundSource,
        txDateIso: parseLegacyDateToIso(tx.time),
        createdAt: serverTimestamp(),
      });
      opCount++;
      await flushIfFull();
    }
    importedArchives++;
  }

  for (const exp of raw.expenses || []) {
    if (exp.source === 'ERP Owner Withdrawal') continue;
    const amt = safeNum(exp.amount);
    if (amt <= 0) continue;
    const date = clampStr(exp.date || localDateKey(), 20);
    const category = clampStr(exp.category || 'Other', 60);
    const note = clampStr(exp.note || '', 200);
    const expKey = `${date}|${amt}|${category}|${note}`;
    if (seenExpenseKeys.has(expKey)) continue;
    seenExpenseKeys.add(expKey);

    const expId = makeSafeId('EXP');
    batch.set(doc(db, 'users', uid, 'expenses', expId), {
      id: expId,
      ownerId: uid,
      date,
      amount: amt,
      category,
      method: clampStr(exp.method || 'Cash', 40),
      note,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    importedExpenses++;
    opCount++;
    await flushIfFull();
  }

  if (opCount > 0) {
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${uid}/import`);
    }
  }

  if (raw.budgets && typeof raw.budgets === 'object') {
    for (const [cat, amt] of Object.entries(raw.budgets)) {
      if (safeNum(amt) > 0) {
        await upsertCategoryBudget(uid, existingBudgets, cat, safeNum(amt));
      }
    }
  }

  if (raw.goal && (safeNum(raw.goal.target) > 0 || safeNum(raw.goal.saved) > 0)) {
    await saveSavingsGoal(uid, safeNum(raw.goal.target), safeNum(raw.goal.saved));
  }

  return { importedHistories, importedClients, importedArchives, importedExpenses };
}

export function buildFullExportPayload(params: {
  profile: UserProfile | null;
  workspace: WorkspaceState;
  histories: DailyHistory[];
  clients: LedgerClient[];
  archives: LedgerArchive[];
  expenses: PersonalExpense[];
  budgets: CategoryBudget[];
  savingsGoal: SavingsGoal | null;
}) {
  return {
    app: 'Rasidul Premium ERP',
    version: 'cloud-v2',
    exportedAt: new Date().toISOString(),
    shopName: params.profile?.shopName || 'Rubaiya Pharmacy',
    workspace: params.workspace,
    histories: params.histories,
    clients: params.clients,
    archives: params.archives,
    expenses: params.expenses,
    budgets: params.budgets,
    savingsGoal: params.savingsGoal,
  };
}
