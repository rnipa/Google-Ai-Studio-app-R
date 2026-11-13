import type {
  ArchivedTransaction,
  BalanceFieldKey,
  BalanceSummary,
  CapitalSource,
  DailyHistory,
  LedgerArchive,
  LedgerClient,
  LedgerTransaction,
  LedgerTxType,
  WorkspaceState,
} from '../types';

export interface BalanceFieldDef {
  key: BalanceFieldKey;
  label: string;
  group: CapitalSource;
  isCash?: boolean;
}

export const OPENING_FIELDS: BalanceFieldDef[] = [
  { key: 'obk', label: 'Bkash', group: 'mfs' },
  { key: 'ong', label: 'Nagad', group: 'mfs' },
  { key: 'ork', label: 'Rocket', group: 'mfs' },
  { key: 'otk', label: 'Tally Khata', group: 'mfs' },
  { key: 'omc', label: 'MFS Cash', group: 'mfs', isCash: true },
  { key: 'ogp', label: 'GP', group: 'recharge' },
  { key: 'orobi', label: 'Robi', group: 'recharge' },
  { key: 'oair', label: 'Airtel', group: 'recharge' },
  { key: 'obl', label: 'Banglalink', group: 'recharge' },
  { key: 'orc', label: 'Recharge Cash', group: 'recharge', isCash: true },
];

export const CLOSING_FIELDS: BalanceFieldDef[] = [
  { key: 'cbk', label: 'Bkash', group: 'mfs' },
  { key: 'cng', label: 'Nagad', group: 'mfs' },
  { key: 'crk', label: 'Rocket', group: 'mfs' },
  { key: 'ctk', label: 'Tally Khata', group: 'mfs' },
  { key: 'cmc', label: 'MFS Cash', group: 'mfs', isCash: true },
  { key: 'cgp', label: 'GP', group: 'recharge' },
  { key: 'crobi', label: 'Robi', group: 'recharge' },
  { key: 'cair', label: 'Airtel', group: 'recharge' },
  { key: 'cbl', label: 'Banglalink', group: 'recharge' },
  { key: 'crc', label: 'Recharge Cash', group: 'recharge', isCash: true },
];

export const WITHDRAWAL_CATEGORIES = [
  'Food & Groceries',
  'Home & Rent',
  'Medical',
  'Education',
  'Transport',
  'Bills & Utilities',
  'Family & Personal',
  'Business Expense',
  'Other',
];

export const EXPENSE_CATEGORIES = [
  'Food',
  'Housing',
  'Transport',
  'Mobile & Internet',
  'Family',
  'Medical',
  'Education',
  'Shopping',
  'Bills',
  'Other',
];

export const EXPENSE_METHODS = ['Cash', 'Bkash', 'Nagad', 'Rocket', 'Bank', 'Other'];

export const WITHDRAWAL_METHODS = [
  'Cash',
  'Bkash',
  'Nagad',
  'Rocket',
  'GP',
  'Robi',
  'Airtel',
  'Banglalink',
  'Tally',
];

export const LEDGER_METHODS = [
  'Cash',
  'Bkash Personal',
  'Bkash B2B',
  'Nagad Personal',
  'Nagad Merchant',
  'Rocket',
  'GP',
  'Robi',
  'Airtel',
  'Banglalink',
  'Tally',
  'Bank Transfer',
  'Card',
  'Other',
];

export const LEDGER_TX_LABELS: Record<LedgerTxType, string> = {
  gave: 'Client Paid Me (+)',
  took: 'Client Took from Me (−)',
  refundGiven: 'Refunded to Client (−)',
  refundReceived: 'Refund Received (+)',
};

export function safeNum(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

export function createDefaultWorkspace(ownerId: string): WorkspaceState {
  return {
    ownerId,
    mfsCapital: 50000,
    rechargeCapital: 30000,
    dailyTarget: 2000,
    obk: 0,
    ong: 0,
    ork: 0,
    otk: 0,
    omc: 0,
    ogp: 0,
    orobi: 0,
    oair: 0,
    obl: 0,
    orc: 0,
    cbk: 0,
    cng: 0,
    crk: 0,
    ctk: 0,
    cmc: 0,
    cgp: 0,
    crobi: 0,
    cair: 0,
    cbl: 0,
    crc: 0,
    openingNote: '',
    closingNote: '',
  };
}

export function computeBalanceSummary(ws: WorkspaceState): BalanceSummary {
  const openMFS = safeNum(ws.obk) + safeNum(ws.ong) + safeNum(ws.ork) + safeNum(ws.otk) + safeNum(ws.omc);
  const closeMFS = safeNum(ws.cbk) + safeNum(ws.cng) + safeNum(ws.crk) + safeNum(ws.ctk) + safeNum(ws.cmc);
  const openRecharge = safeNum(ws.ogp) + safeNum(ws.orobi) + safeNum(ws.oair) + safeNum(ws.obl) + safeNum(ws.orc);
  const closeRecharge = safeNum(ws.cgp) + safeNum(ws.crobi) + safeNum(ws.cair) + safeNum(ws.cbl) + safeNum(ws.crc);
  const opening = openMFS + openRecharge;
  const closing = closeMFS + closeRecharge;
  const openingEmoney =
    safeNum(ws.obk) + safeNum(ws.ong) + safeNum(ws.ork) + safeNum(ws.otk) +
    safeNum(ws.ogp) + safeNum(ws.orobi) + safeNum(ws.oair) + safeNum(ws.obl);
  const openingCash = safeNum(ws.omc) + safeNum(ws.orc);
  const closingEmoney =
    safeNum(ws.cbk) + safeNum(ws.cng) + safeNum(ws.crk) + safeNum(ws.ctk) +
    safeNum(ws.cgp) + safeNum(ws.crobi) + safeNum(ws.cair) + safeNum(ws.cbl);
  const closingCash = safeNum(ws.cmc) + safeNum(ws.crc);

  return {
    openMFS,
    closeMFS,
    openRecharge,
    closeRecharge,
    opening,
    closing,
    openingEmoney,
    openingCash,
    closingEmoney,
    closingCash,
    mfsProfit: closeMFS - openMFS,
    rechargeProfit: closeRecharge - openRecharge,
    totalProfit: closing - opening,
  };
}

export function formatBDT(amount: number): string {
  return `৳${safeNum(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function monthKey(d = new Date()): string {
  return localDateKey(d).slice(0, 7);
}

export function isoToLocalDateKey(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return localDateKey(d);
}

export function isoToLocalMonthKey(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 7);
  return monthKey(d);
}

export function getDailyHistoryDuplicateKey(h: DailyHistory): string {
  if (h.type === 'ownerWithdrawal') {
    const d = new Date(h.dateIso || '');
    const timeBucket = Number.isNaN(d.getTime())
      ? String(h.dateIso || '').trim()
      : String(Math.floor(d.getTime() / (2 * 60 * 1000)));
    return `OW|${timeBucket}|${safeNum(h.withdrawalAmount)}|${(h.withdrawalMethod || '').trim().toLowerCase()}|${(h.withdrawalSource || '').trim().toLowerCase()}|${(h.withdrawalCategory || '').trim().toLowerCase()}|${(h.withdrawalReason || '').trim().toLowerCase()}`;
  }
  return `DC|${isoToLocalDateKey(h.dateIso)}|${safeNum(h.opening)}|${safeNum(h.closing)}|${safeNum(h.mfs)}|${safeNum(h.recharge)}|${safeNum(h.profit)}|${(h.note || '').trim().toLowerCase()}`;
}

export function findDuplicateDailyHistoryIds(histories: DailyHistory[]): {
  extraIds: string[];
  closingExtraCount: number;
  withdrawalExtraCount: number;
} {
  const seen = new Set<string>();
  const extraIds: string[] = [];
  let closingExtraCount = 0;
  let withdrawalExtraCount = 0;

  // Deterministic ordering: keep earliest/original non-IMP record first
  const ordered = [...histories].sort((a, b) => {
    const aImp = (a.id || '').startsWith('IMP-') ? 1 : 0;
    const bImp = (b.id || '').startsWith('IMP-') ? 1 : 0;
    if (aImp !== bImp) return aImp - bImp;
    const cmpDate = (a.dateIso || '').localeCompare(b.dateIso || '');
    if (cmpDate !== 0) return cmpDate;
    return (a.id || '').localeCompare(b.id || '');
  });

  for (const h of ordered) {
    const key = getDailyHistoryDuplicateKey(h);
    if (seen.has(key)) {
      extraIds.push(h.id);
      if (h.type === 'ownerWithdrawal') withdrawalExtraCount++;
      else closingExtraCount++;
    } else {
      seen.add(key);
    }
  }

  return { extraIds, closingExtraCount, withdrawalExtraCount };
}

export function formatDateTimeEn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '—';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function daysSince(iso: string): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

export function getClientRisk(client: LedgerClient): { label: string; level: 'normal' | 'attention' | 'followup' | 'high'; days: number } {
  if (!client.txCount || !client.lastTxIso || client.balance === 0) {
    return { label: 'Regular', level: 'normal', days: 0 };
  }
  const days = daysSince(client.lastTxIso);
  if (days >= 90) return { label: `High Risk (${days}d)`, level: 'high', days };
  if (days >= 60) return { label: `Follow Up (${days}d)`, level: 'followup', days };
  if (days >= 30) return { label: `Attention (${days}d)`, level: 'attention', days };
  return { label: 'Regular', level: 'normal', days };
}

export function resolveWithdrawalAccount(
  method: string,
  source: CapitalSource
): { field: BalanceFieldKey; source: CapitalSource } | null {
  const map: Record<string, { field: BalanceFieldKey; source: CapitalSource }> = {
    Bkash: { field: 'obk', source: 'mfs' },
    Nagad: { field: 'ong', source: 'mfs' },
    Rocket: { field: 'ork', source: 'mfs' },
    Tally: { field: 'otk', source: 'mfs' },
    GP: { field: 'ogp', source: 'recharge' },
    Robi: { field: 'orobi', source: 'recharge' },
    Airtel: { field: 'oair', source: 'recharge' },
    Banglalink: { field: 'obl', source: 'recharge' },
    Cash: { field: source === 'mfs' ? 'omc' : 'orc', source },
  };
  return map[method] ?? null;
}

export function resolveLedgerAccount(
  method: string,
  fundSource: 'mfs' | 'recharge' | 'external'
): { field: BalanceFieldKey; source: CapitalSource } | null {
  if (fundSource === 'external') return null;
  if (method.includes('Bkash')) return { field: 'obk', source: 'mfs' };
  if (method.includes('Nagad')) return { field: 'ong', source: 'mfs' };
  if (method === 'Rocket') return { field: 'ork', source: 'mfs' };
  if (method === 'Tally') return { field: 'otk', source: 'mfs' };
  if (method === 'GP') return { field: 'ogp', source: 'recharge' };
  if (method === 'Robi') return { field: 'orobi', source: 'recharge' };
  if (method === 'Airtel') return { field: 'oair', source: 'recharge' };
  if (method === 'Banglalink') return { field: 'obl', source: 'recharge' };
  if (method === 'Cash') return { field: fundSource === 'mfs' ? 'omc' : 'orc', source: fundSource };
  return null;
}

export function recomputeClientTotals(txs: LedgerTransaction[]): {
  totalGiven: number;
  totalTaken: number;
  refundGiven: number;
  refundReceived: number;
  balance: number;
  txCount: number;
  lastTxIso: string;
} {
  let totalGiven = 0;
  let totalTaken = 0;
  let refundGiven = 0;
  let refundReceived = 0;
  let balance = 0;
  let lastTxIso = '';

  txs.forEach((h) => {
    const amt = safeNum(h.amount);
    if (h.type === 'gave') {
      totalGiven += amt;
      balance += amt;
    } else if (h.type === 'took') {
      totalTaken += amt;
      balance -= amt;
    } else if (h.type === 'refundGiven') {
      refundGiven += amt;
      balance -= amt;
    } else if (h.type === 'refundReceived') {
      refundReceived += amt;
      balance += amt;
    }
    if (h.txDateIso && (!lastTxIso || h.txDateIso > lastTxIso)) {
      lastTxIso = h.txDateIso;
    }
  });

  return {
    totalGiven,
    totalTaken,
    refundGiven,
    refundReceived,
    balance: Math.round(balance * 100) / 100,
    txCount: txs.length,
    lastTxIso,
  };
}

export function sanitizePhone(phone: string): string {
  const digits = phone.replace(/[^0-9+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('01') && digits.length === 11) {
    return `88${digits}`;
  }
  return digits.replace(/^\+/, '');
}

function formatAmtBn(val: number): string {
  return safeNum(val).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatNowShortEn(): string {
  return new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface WhatsAppMessagePayload {
  text: string;
  url: string;
  styleIndex: number;
  styleTotal: number;
  styleName: string;
}

export function buildWhatsAppReminderUrl(
  client: LedgerClient,
  shopName: string,
  variantIndex?: number
): string {
  const phone = sanitizePhone(client.mobile);
  const dueStr = formatAmtBn(Math.abs(client.balance));
  const nowStr = formatNowShortEn();

  const templates = [
    `🟠 *বকেয়া হিসাব রিমাইন্ডার | ৳${dueStr}*

আসসালামু আলাইকুম *${client.name}*,
*${shopName}*-এ আপনার হিসাবে বর্তমানে *৳${dueStr}* বকেয়া রয়েছে।

📌 *পরিশোধযোগ্য বকেয়া:* ৳${dueStr}
🕒 *আপডেট সময়:* ${nowStr}

🙏 অনুগ্রহ করে আপনার সুবিধামতো সময়ে বকেয়া পরিশোধ করলে খুবই কৃতজ্ঞ থাকব।
🔍 কোনো লেনদেনে গরমিল বা প্রশ্ন থাকলে অনুগ্রহ করে দ্রুত জানাবেন।

🏪 *${shopName}* · 💙 সহযোগিতার জন্য ধন্যবাদ`,

    `📌 *বিনীত তাগাদা | বকেয়া ৳${dueStr}*

প্রিয় *${client.name}*,
সদয় অবগতির জন্য জানানো যাচ্ছে যে, ডিজিটাল খাতায় আপনার নামে *৳${dueStr}* বকেয়া রয়েছে।

💳 *মোট পাওনা:* ৳${dueStr}
🕒 *তারিখ:* ${nowStr}

🤝 সময় করে হিসাবটি সমন্বয় করার জন্য বিনীত অনুরোধ রইল। কোনো তথ্য যাচাই করতে চাইলে নির্দ্বিধায় জানাবেন।

🏪 *${shopName}* · 💙 ধন্যবাদ`,

    `🤝 *হিসাব আপডেট | বকেয়া ৳${dueStr}*

প্রিয় *${client.name}*,
আশা করি ভালো আছেন। *${shopName}*-এ আপনার চলমান হিসাবে *৳${dueStr}* পাওনা বাকি আছে।

📥 *বর্তমান বকেয়া:* ৳${dueStr}
🕒 *হিসাবের সময়:* ${nowStr}

🙏 সুবিধাজনক সময়ে পরিশোধ করে দিলে হিসাবটি আপডেট করতে সুবিধা হবে। ভুল কোনো এন্ট্রি চোখে পড়লে জানাবেন।

🏪 *${shopName}* · 💙 অগ্রিম ধন্যবাদ`,
  ];

  const idx =
    typeof variantIndex === 'number'
      ? Math.abs(variantIndex) % templates.length
      : Math.floor(Date.now() / 60000) % templates.length;

  return `https://wa.me/${phone}?text=${encodeURIComponent(templates[idx])}`;
}

export function buildWhatsAppTxPayload(params: {
  clientName: string;
  mobile: string;
  newBalance: number;
  amount: number;
  type: LedgerTxType;
  method: string;
  settled: boolean;
  shopName: string;
  note?: string;
  variantIndex?: number;
}): WhatsAppMessagePayload {
  const {
    clientName,
    mobile,
    newBalance,
    amount,
    type,
    method,
    settled,
    shopName,
    note,
    variantIndex = 0,
  } = params;

  const phone = sanitizePhone(mobile);
  const amtStr = formatAmtBn(amount);
  const nowStr = formatNowShortEn();
  const cleanNote = (note || '').trim();
  const noteLine = cleanNote ? `\n📝 *নোট:* ${cleanNote}` : '';

  const balanceLine = settled
    ? `⚖️ *বর্তমান ব্যালেন্স:* ৳0 (সম্পূর্ণ পরিশোধিত)\n📦 *স্ট্যাটাস:* সম্পূর্ণ হিসাব Archive-এ সংরক্ষিত হয়েছে — এরপর থেকে নতুন সাইকেল শুরু হবে।`
    : newBalance < 0
      ? `📥 *বর্তমান পাওনা (বকেয়া):* ৳${formatAmtBn(Math.abs(newBalance))}`
      : newBalance > 0
        ? `📤 *আপনার অগ্রিম জমা:* ৳${formatAmtBn(newBalance)}`
        : '⚖️ *বর্তমান ব্যালেন্স:* ৳0 (সমন্বিত)';

  const metaBlock = `👤 *ক্লায়েন্ট:* ${clientName}\n💳 *মাধ্যম:* ${method}\n🕒 *সময়:* ${nowStr}${noteLine}\n\n${balanceLine}`;
  const footerBlock = `✅ *ডিজিটাল খাতায় সফলভাবে সংরক্ষিত হয়েছে।*\n🔍 হিসাবে কোনো ভুল বা অজানা লেনদেন মনে হলে দ্রুত জানাবেন।\n\n🏪 *${shopName}* · 💙 ধন্যবাদ`;

  let bank: Array<{ styleName: string; build: () => string }>;

  if (settled) {
    bank = [
      {
        styleName: 'সমন্বয় উৎসব',
        build: () =>
          `🎉 *হিসাব সম্পূর্ণ পরিশোধিত! | ৳${amtStr}*\n\nআলহামদুলিল্লাহ *${clientName}*, আজকের *৳${amtStr}* (${method}) লেনদেনের মাধ্যমে আপনার সকল হিসাব ৳0-তে সমন্বয় হয়েছে!\n\n${metaBlock}\n\n${footerBlock}`,
      },
      {
        styleName: 'ক্লিয়ারেন্স স্লিপ',
        build: () =>
          `⚖️ *সকল পাওনা-দেনা সমন্বিত (৳0) | ৳${amtStr}*\n\nপ্রিয় *${clientName}*, *৳${amtStr}* লেনদেন শেষে আপনার চলতি হিসাবের সমস্ত বকেয়া ও দেনা সম্পূর্ণ ক্লিয়ার হয়েছে।\n\n${metaBlock}\n\n${footerBlock}`,
      },
      {
        styleName: 'আর্কাইভ রসিদ',
        build: () =>
          `✨ *ক্লিয়ারেন্স রসিদ (Settled) | ৳${amtStr}*\n\nধন্যবাদ *${clientName}*! আপনার *৳${amtStr}* (${method}) সমন্বয় হয়েছে এবং এই সাইকেলের পূর্ণ হিসাব আর্কাইভে সেভ করা হয়েছে।\n\n${metaBlock}\n\n${footerBlock}`,
      },
    ];
  } else if (type === 'gave') {
    bank = [
      {
        styleName: 'স্বাগত রসিদ',
        build: () =>
          `🟢 *পেমেন্ট গ্রহণ রসিদ | +৳${amtStr}*\n\nআসসালামু আলাইকুম *${clientName}*, আপনার পাঠানো *৳${amtStr}* (${method}) সাদরে গ্রহণ করা হয়েছে।\n\n${metaBlock}\n\n${footerBlock}`,
      },
      {
        styleName: 'ডিজিটাল স্লিপ',
        build: () =>
          `✅ *ডিজিটাল ক্যাশ স্লিপ | +৳${amtStr}*\n\nপ্রিয় *${clientName}*, *${method}* মাধ্যমে আপনার পরিশোধিত *৳${amtStr}* সফলভাবে খাতায় জমা হয়েছে।\n\n${metaBlock}\n\n${footerBlock}`,
      },
      {
        styleName: 'ধন্যবাদ বার্তা',
        build: () =>
          `💚 *টাকা প্রাপ্তি নিশ্চিতকরণ | ৳${amtStr}*\n\nধন্যবাদ *${clientName}*! আপনার *৳${amtStr}* (${method}) বুঝে পেয়েছি এবং আপনার ব্যালেন্স আপডেট করা হয়েছে।\n\n${metaBlock}\n\n${footerBlock}`,
      },
      {
        styleName: 'তাৎক্ষণিক এন্ট্রি',
        build: () =>
          `🧾 *হিসাব আপডেট (জমা) | ৳${amtStr}*\n\nপ্রিয় *${clientName}*, আজকের লেনদেনে *৳${amtStr}* (${method}) আপনার অ্যাকাউন্টে ক্রেডিট করা হয়েছে।\n\n${metaBlock}\n\n${footerBlock}`,
      },
    ];
  } else if (type === 'took') {
    bank = [
      {
        styleName: 'লেনদেন রসিদ',
        build: () =>
          `🔴 *টাকা প্রদান রসিদ | −৳${amtStr}*\n\nপ্রিয় *${clientName}*, *${method}* মাধ্যমে *৳${amtStr}* আপনার হিসাবে যোগ (প্রদান) করা হয়েছে।\n\n${metaBlock}\n\n${footerBlock}`,
      },
      {
        styleName: 'খাতা এন্ট্রি',
        build: () =>
          `📤 *ডিজিটাল খাতা এন্ট্রি | ৳${amtStr}*\n\nআসসালামু আলাইকুম *${clientName}*, আপনার চাহিদা অনুযায়ী *৳${amtStr}* (${method}) প্রদান করে হিসাব আপডেট করা হলো।\n\n${metaBlock}\n\n${footerBlock}`,
      },
      {
        styleName: 'ব্যালেন্স নোটিশ',
        build: () =>
          `📝 *লেনদেন নোটিশ | ৳${amtStr}*\n\nপ্রিয় *${clientName}*, *${method}* মাধ্যমে *৳${amtStr}* লেনদেনটি আপনার ডিজিটাল খাতায় নথিভুক্ত হয়েছে।\n\n${metaBlock}\n\n${footerBlock}`,
      },
    ];
  } else if (type === 'refundReceived') {
    bank = [
      {
        styleName: 'রিফান্ড প্রাপ্তি',
        build: () =>
          `💚 *রিফান্ড প্রাপ্তি রসিদ | +৳${amtStr}*\n\nপ্রিয় *${clientName}*, *${method}* মাধ্যমে আপনার ফেরত পাঠানো *৳${amtStr}* গ্রহণ করা হয়েছে।\n\n${metaBlock}\n\n${footerBlock}`,
      },
      {
        styleName: 'ফেরত সমন্বয়',
        build: () =>
          `🔄 *ফেরত গ্রহণ আপডেট | ৳${amtStr}*\n\nধন্যবাদ *${clientName}*! *৳${amtStr}* (${method}) রিফান্ড হিসেবে আপনার হিসাবে যুক্ত হয়েছে।\n\n${metaBlock}\n\n${footerBlock}`,
      },
      {
        styleName: 'সমন্বয় রসিদ',
        build: () =>
          `✅ *রিফান্ড নিশ্চিতকরণ | ৳${amtStr}*\n\nপ্রিয় *${clientName}*, ফেরত বাবদ *৳${amtStr}* (${method}) বুঝে পেয়ে হিসাব আপডেট করা হলো।\n\n${metaBlock}\n\n${footerBlock}`,
      },
    ];
  } else {
    bank = [
      {
        styleName: 'রিফান্ড প্রদান',
        build: () =>
          `💸 *রিফান্ড প্রদান রসিদ | ৳${amtStr}*\n\nপ্রিয় *${clientName}*, *${method}* মাধ্যমে আপনাকে *৳${amtStr}* ফেরত প্রদান করা হয়েছে।\n\n${metaBlock}\n\n${footerBlock}`,
      },
      {
        styleName: 'ফেরত স্লিপ',
        build: () =>
          `🧾 *টাকা ফেরত স্লিপ | ৳${amtStr}*\n\nআসসালামু আলাইকুম *${clientName}*, ফেরত বাবদ *৳${amtStr}* (${method}) পরিশোধ করে খাতা আপডেট করা হয়েছে।\n\n${metaBlock}\n\n${footerBlock}`,
      },
      {
        styleName: 'সমন্বয় আপডেট',
        build: () =>
          `🔄 *ফেরত পরিশোধ আপডেট | ৳${amtStr}*\n\nপ্রিয় *${clientName}*, আপনার *৳${amtStr}* (${method}) রিফান্ড সম্পন্ন হয়েছে।\n\n${metaBlock}\n\n${footerBlock}`,
      },
    ];
  }

  const safeIdx = Math.abs(variantIndex) % bank.length;
  const chosen = bank[safeIdx];
  const text = chosen.build();

  return {
    text,
    url: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`,
    styleIndex: safeIdx,
    styleTotal: bank.length,
    styleName: chosen.styleName,
  };
}

export function buildWhatsAppTxUrl(
  clientName: string,
  mobile: string,
  newBalance: number,
  amount: number,
  type: LedgerTxType,
  method: string,
  settled: boolean,
  shopName: string,
  note?: string,
  variantIndex?: number
): string {
  return buildWhatsAppTxPayload({
    clientName,
    mobile,
    newBalance,
    amount,
    type,
    method,
    settled,
    shopName,
    note,
    variantIndex,
  }).url;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

const TX_TYPE_BN: Record<LedgerTxType, string> = {
  gave: 'টাকা জমা (+)',
  took: 'টাকা নিল (−)',
  refundGiven: 'ফেরত প্রদান (−)',
  refundReceived: 'ফেরত গ্রহণ (+)',
};

export function buildWhatsAppShareUrl(text: string, mobile?: string): string {
  const phone = mobile ? sanitizePhone(mobile) : '';
  const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function buildClientStatementText(params: {
  shopName: string;
  client: LedgerClient;
  transactions: LedgerTransaction[];
  periodLabel: string;
  lang: 'bn' | 'en';
}): string {
  const { shopName, client, transactions, periodLabel, lang } = params;
  const sorted = [...transactions].sort((a, b) =>
    (a.txDateIso || '').localeCompare(b.txDateIso || '')
  );

  let periodGiven = 0;
  let periodTaken = 0;
  let periodRefundOut = 0;
  let periodRefundIn = 0;

  sorted.forEach((t) => {
    const amt = safeNum(t.amount);
    if (t.type === 'gave') periodGiven += amt;
    else if (t.type === 'took') periodTaken += amt;
    else if (t.type === 'refundGiven') periodRefundOut += amt;
    else if (t.type === 'refundReceived') periodRefundIn += amt;
  });

  if (lang === 'bn') {
    const balLine =
      client.balance < 0
        ? `📥 বর্তমান বকেয়া (পাওনা): ৳${Math.abs(client.balance).toLocaleString('en-US')}`
        : client.balance > 0
          ? `📤 বর্তমান জমা (দেনা): ৳${client.balance.toLocaleString('en-US')}`
          : '🤝 বর্তমান ব্যালেন্স: ৳0 (সমন্বিত)';

    const lines = sorted.map((t, i) => {
      const dt = new Date(t.txDateIso);
      const dateStr = Number.isNaN(dt.getTime())
        ? t.txDateIso
        : dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `${i + 1}. ${dateStr} | ${TX_TYPE_BN[t.type]} | ${t.method} | ৳${safeNum(t.amount).toLocaleString('en-US')}${t.note ? ` (${t.note})` : ''}`;
    });

    return `🧾 *লেনদেনের বিবরণী (Client Statement)*
🏪 *${shopName}*
👤 ক্লায়েন্ট: ${client.name}${client.mobile ? ` (${client.mobile})` : ''}
📅 সময়কাল: ${periodLabel}

📊 *এই সময়ের সারসংক্ষেপ (${sorted.length}টি লেনদেন):*
• টাকা জমা (+): ৳${periodGiven.toLocaleString('en-US')}
• টাকা প্রদান (−): ৳${periodTaken.toLocaleString('en-US')}${periodRefundIn ? `\n• ফেরত গ্রহণ (+): ৳${periodRefundIn.toLocaleString('en-US')}` : ''}${periodRefundOut ? `\n• ফেরত প্রদান (−): ৳${periodRefundOut.toLocaleString('en-US')}` : ''}

${balLine}

${sorted.length ? `*লেনদেনের তালিকা:*\n${lines.join('\n')}` : 'এই সময়কালে কোনো লেনদেন নেই।'}

⚠️ অনুগ্রহ করে হিসাবটি যাচাই করুন। কোনো ভুল থাকলে দ্রুত জানাবেন।
💙 ধন্যবাদ — ${shopName}`;
  }

  const balLineEn =
    client.balance < 0
      ? `Receivable Due: ৳${Math.abs(client.balance).toLocaleString('en-US')}`
      : client.balance > 0
        ? `Payable Balance: ৳${client.balance.toLocaleString('en-US')}`
        : 'Current Balance: ৳0 (Settled)';

  const linesEn = sorted.map((t, i) => {
    const dt = new Date(t.txDateIso);
    const dateStr = Number.isNaN(dt.getTime())
      ? t.txDateIso
      : dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `${i + 1}. ${dateStr} | ${LEDGER_TX_LABELS[t.type]} | ${t.method} | ৳${safeNum(t.amount).toLocaleString('en-US')}${t.note ? ` (${t.note})` : ''}`;
  });

  return `CLIENT STATEMENT — ${shopName}
Client: ${client.name}${client.mobile ? ` (${client.mobile})` : ''}
Period: ${periodLabel}

Summary (${sorted.length} entries):
• Received (+): ৳${periodGiven.toLocaleString('en-US')}
• Paid (−): ৳${periodTaken.toLocaleString('en-US')}${periodRefundIn ? `\n• Refund Received (+): ৳${periodRefundIn.toLocaleString('en-US')}` : ''}${periodRefundOut ? `\n• Refund Given (−): ৳${periodRefundOut.toLocaleString('en-US')}` : ''}
${balLineEn}

${sorted.length ? `Transactions:\n${linesEn.join('\n')}` : 'No transactions recorded in this period.'}

Thank you — ${shopName}`;
}

export function buildArchiveStatementText(params: {
  shopName: string;
  archive: LedgerArchive;
  transactions: ArchivedTransaction[];
  lang: 'bn' | 'en';
}): string {
  const { shopName, archive, transactions, lang } = params;
  const sorted = [...transactions].sort((a, b) =>
    (a.txDateIso || '').localeCompare(b.txDateIso || '')
  );

  if (lang === 'bn') {
    const lines = sorted.map((t, i) => {
      const dt = new Date(t.txDateIso);
      const dateStr = Number.isNaN(dt.getTime())
        ? t.txDateIso
        : dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `${i + 1}. ${dateStr} | ${TX_TYPE_BN[t.type]} | ${t.method} | ৳${safeNum(t.amount).toLocaleString('en-US')}`;
    });
    return `📦 *সমন্বিত হিসাবের বিবরণী (Settled Receipt)*
🏪 *${shopName}*
👤 ক্লায়েন্ট: ${archive.personName}${archive.personMobile ? ` (${archive.personMobile})` : ''}
✅ সমন্বয়ের তারিখ: ${formatDateTimeEn(archive.settledAtIso)}

• মোট জমা (+): ৳${safeNum(archive.totalGiven).toLocaleString('en-US')}
• মোট প্রদান (−): ৳${safeNum(archive.totalTaken).toLocaleString('en-US')}
⚖️ চূড়ান্ত ব্যালেন্স: ৳0 (সম্পূর্ণ পরিশোধিত)

*বিস্তারিত লেনদেন (${sorted.length}টি):*
${lines.join('\n') || '—'}

💙 ধন্যবাদ — ${shopName}`;
  }

  const linesEn = sorted.map((t, i) => {
    const dt = new Date(t.txDateIso);
    const dateStr = Number.isNaN(dt.getTime())
      ? t.txDateIso
      : dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `${i + 1}. ${dateStr} | ${LEDGER_TX_LABELS[t.type]} | ${t.method} | ৳${safeNum(t.amount).toLocaleString('en-US')}`;
  });
  return `SETTLED ARCHIVE STATEMENT — ${shopName}
Client: ${archive.personName}${archive.personMobile ? ` (${archive.personMobile})` : ''}
Settled At: ${formatDateTimeEn(archive.settledAtIso)}

Total Received: ৳${safeNum(archive.totalGiven).toLocaleString('en-US')}
Total Paid: ৳${safeNum(archive.totalTaken).toLocaleString('en-US')}
Final Balance: ৳0 (Settled)

Transactions (${sorted.length}):
${linesEn.join('\n') || '—'}

Thank you — ${shopName}`;
}

export function buildBusinessReportText(params: {
  shopName: string;
  workspace: WorkspaceState;
  histories: DailyHistory[];
  periodLabel: string;
  includeLiveShift: boolean;
  lang: 'bn' | 'en';
}): string {
  const { shopName, workspace, histories, periodLabel, includeLiveShift, lang } = params;
  const summary = computeBalanceSummary(workspace);
  const closings = histories.filter((h) => h.type === 'dailyClosing');
  const withdrawals = histories.filter((h) => h.type === 'ownerWithdrawal');

  const totalMfsProfit = closings.reduce((s, h) => s + safeNum(h.mfs), 0);
  const totalRechargeProfit = closings.reduce((s, h) => s + safeNum(h.recharge), 0);
  const totalSavedProfit = closings.reduce((s, h) => s + safeNum(h.profit), 0);
  const totalWithdrawn = withdrawals.reduce((s, h) => s + safeNum(h.withdrawalAmount), 0);
  const workingCap = safeNum(workspace.mfsCapital) + safeNum(workspace.rechargeCapital);

  if (lang === 'bn') {
    const liveBlock = includeLiveShift
      ? `\n📌 *চলমান শিফট (Live Shift):*
• Opening: ৳${summary.opening.toLocaleString('en-US')} (MFS ৳${summary.openMFS.toLocaleString('en-US')} + Recharge ৳${summary.openRecharge.toLocaleString('en-US')})
• Closing: ৳${summary.closing.toLocaleString('en-US')} (Cash ৳${summary.closingCash.toLocaleString('en-US')} + E-Money ৳${summary.closingEmoney.toLocaleString('en-US')})
• চলমান লাভ/ক্ষতি: ৳${summary.totalProfit.toLocaleString('en-US')} (MFS ৳${summary.mfsProfit.toLocaleString('en-US')} · Recharge ৳${summary.rechargeProfit.toLocaleString('en-US')})\n`
      : '';

    const dayLines = closings.slice(0, 15).map((h, i) => {
      const dt = new Date(h.dateIso);
      const dStr = Number.isNaN(dt.getTime()) ? h.dateIso : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${i + 1}. ${dStr} | লাভ: ৳${safeNum(h.profit).toLocaleString('en-US')} (MFS ৳${safeNum(h.mfs).toLocaleString('en-US')}, Rec ৳${safeNum(h.recharge).toLocaleString('en-US')})`;
    });

    return `📊 *ব্যবসার রিপোর্ট — ${shopName}*
📅 সময়কাল: ${periodLabel}
💼 Working Capital: ৳${workingCap.toLocaleString('en-US')}
${liveBlock}
📈 *সংরক্ষিত হিসাব (${closings.length}টি ক্লোজিং):*
• MFS মোট লাভ: ৳${totalMfsProfit.toLocaleString('en-US')}
• Recharge মোট লাভ: ৳${totalRechargeProfit.toLocaleString('en-US')}
• সর্বমোট Profit: ৳${totalSavedProfit.toLocaleString('en-US')}
• Owner Withdrawal (${withdrawals.length}টি): ৳${totalWithdrawn.toLocaleString('en-US')}

${dayLines.length ? `*ক্লোজিং বিবরণ:*\n${dayLines.join('\n')}` : ''}`;
  }

  const liveBlockEn = includeLiveShift
    ? `\nCurrent Live Shift:
• Opening: ৳${summary.opening.toLocaleString('en-US')} (MFS ৳${summary.openMFS.toLocaleString('en-US')} + Recharge ৳${summary.openRecharge.toLocaleString('en-US')})
• Closing: ৳${summary.closing.toLocaleString('en-US')} (Cash ৳${summary.closingCash.toLocaleString('en-US')} + E-Money ৳${summary.closingEmoney.toLocaleString('en-US')})
• Live Profit/Loss: ৳${summary.totalProfit.toLocaleString('en-US')} (MFS ৳${summary.mfsProfit.toLocaleString('en-US')} · Recharge ৳${summary.rechargeProfit.toLocaleString('en-US')})\n`
    : '';

  const dayLinesEn = closings.slice(0, 15).map((h, i) => {
    const dt = new Date(h.dateIso);
    const dStr = Number.isNaN(dt.getTime()) ? h.dateIso : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${i + 1}. ${dStr} | Profit: ৳${safeNum(h.profit).toLocaleString('en-US')} (MFS ৳${safeNum(h.mfs).toLocaleString('en-US')}, Rec ৳${safeNum(h.recharge).toLocaleString('en-US')})`;
  });

  return `BUSINESS REPORT — ${shopName}
Period: ${periodLabel}
Working Capital: ৳${workingCap.toLocaleString('en-US')}
${liveBlockEn}
Saved Closings (${closings.length}):
• MFS Profit: ৳${totalMfsProfit.toLocaleString('en-US')}
• Recharge Profit: ৳${totalRechargeProfit.toLocaleString('en-US')}
• Net Profit: ৳${totalSavedProfit.toLocaleString('en-US')}
• Owner Withdrawals (${withdrawals.length}): ৳${totalWithdrawn.toLocaleString('en-US')}

${dayLinesEn.length ? `Daily Breakdown:\n${dayLinesEn.join('\n')}` : ''}`;
}

