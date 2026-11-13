import type { Timestamp } from 'firebase/firestore';

export type BalanceFieldKey =
  | 'obk' | 'ong' | 'ork' | 'otk' | 'omc'
  | 'ogp' | 'orobi' | 'oair' | 'obl' | 'orc'
  | 'cbk' | 'cng' | 'crk' | 'ctk' | 'cmc'
  | 'cgp' | 'crobi' | 'cair' | 'cbl' | 'crc';

export type CapitalSource = 'mfs' | 'recharge';
export type LedgerFundSource = 'mfs' | 'recharge' | 'external';
export type LedgerTxType = 'gave' | 'took' | 'refundGiven' | 'refundReceived';
export type HistoryEntryType = 'dailyClosing' | 'ownerWithdrawal';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  shopName: string;
  pinHash: string;
  pinEnabled: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface WorkspaceState {
  ownerId: string;
  mfsCapital: number;
  rechargeCapital: number;
  dailyTarget: number;
  obk: number;
  ong: number;
  ork: number;
  otk: number;
  omc: number;
  ogp: number;
  orobi: number;
  oair: number;
  obl: number;
  orc: number;
  cbk: number;
  cng: number;
  crk: number;
  ctk: number;
  cmc: number;
  cgp: number;
  crobi: number;
  cair: number;
  cbl: number;
  crc: number;
  openingNote: string;
  closingNote: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface DailyHistory {
  id: string;
  ownerId: string;
  type: HistoryEntryType;
  dateIso: string;
  opening: number;
  closing: number;
  openingMFS: number;
  closingMFS: number;
  openingRecharge: number;
  closingRecharge: number;
  mfs: number;
  recharge: number;
  profit: number;
  note: string;
  withdrawalAmount: number;
  withdrawalMethod: string;
  withdrawalSource: string;
  withdrawalCategory: string;
  withdrawalReason: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LedgerClient {
  id: string;
  ownerId: string;
  name: string;
  mobile: string;
  totalGiven: number;
  totalTaken: number;
  refundGiven: number;
  refundReceived: number;
  balance: number;
  txCount: number;
  lastTxIso: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LedgerTransaction {
  id: string;
  ownerId: string;
  clientId: string;
  amount: number;
  type: LedgerTxType;
  method: string;
  fundSource: LedgerFundSource;
  note: string;
  txDateIso: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface LedgerArchive {
  id: string;
  ownerId: string;
  clientId: string;
  personName: string;
  personMobile: string;
  settledAtIso: string;
  businessDate: string;
  finalBalance: number;
  totalGiven: number;
  totalTaken: number;
  refundGiven: number;
  refundReceived: number;
  txCount: number;
  createdAt?: Timestamp;
}

export interface ArchivedTransaction {
  id: string;
  ownerId: string;
  archiveId: string;
  amount: number;
  type: LedgerTxType;
  method: string;
  fundSource: LedgerFundSource;
  txDateIso: string;
  createdAt?: Timestamp;
}

export interface PersonalExpense {
  id: string;
  ownerId: string;
  date: string;
  amount: number;
  category: string;
  method: string;
  note: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CategoryBudget {
  id: string;
  ownerId: string;
  category: string;
  amount: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface SavingsGoal {
  ownerId: string;
  target: number;
  saved: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface BalanceSummary {
  openMFS: number;
  closeMFS: number;
  openRecharge: number;
  closeRecharge: number;
  opening: number;
  closing: number;
  openingEmoney: number;
  openingCash: number;
  closingEmoney: number;
  closingCash: number;
  mfsProfit: number;
  rechargeProfit: number;
  totalProfit: number;
}

export type SaveSyncStatus = 'synced' | 'saving' | 'error' | 'offline';
export type NavTab = 'dashboard' | 'daily' | 'ledger' | 'expenses' | 'settings';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  text: string;
}
