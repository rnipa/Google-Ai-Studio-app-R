import React from 'react';
import type { ArchivedTransaction, LedgerArchive } from '../types';
import { formatDateTimeEn, LEDGER_TX_LABELS } from '../utils/accounting';

interface ThermalPrintSheetProps {
  shopName: string;
  archive: LedgerArchive | null;
  transactions: ArchivedTransaction[];
}

export const ThermalPrintSheet: React.FC<ThermalPrintSheetProps> = ({
  shopName,
  archive,
  transactions,
}) => {
  if (!archive) return null;

  return (
    <div id="thermal-print-sheet" className="hidden print:block">
      <h2 style={{ textAlign: 'center', fontSize: '15px', fontWeight: 'bold', margin: '0 0 2mm' }}>
        {shopName}
      </h2>
      <div style={{ textAlign: 'center', fontSize: '11px' }}>External Fund Ledger — Settlement Receipt</div>
      <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />
      <div>
        <b>Client:</b> {archive.personName}
      </div>
      <div>
        <b>Mobile:</b> {archive.personMobile || '—'}
      </div>
      <div>
        <b>Settled:</b> {formatDateTimeEn(archive.settledAtIso)}
      </div>
      <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Total Received</span>
        <b>৳{archive.totalGiven.toLocaleString('en-US')}</b>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Total Paid</span>
        <b>৳{archive.totalTaken.toLocaleString('en-US')}</b>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Refund Given</span>
        <b>৳{archive.refundGiven.toLocaleString('en-US')}</b>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Refund Received</span>
        <b>৳{archive.refundReceived.toLocaleString('en-US')}</b>
      </div>
      <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />
      <div style={{ fontWeight: 'bold', fontSize: '12px' }}>Final Balance: ৳0 (Settled)</div>
      <div style={{ borderTop: '1px dashed #000', margin: '2mm 0' }} />
      <div style={{ fontWeight: 'bold', marginBottom: '1mm' }}>Transaction Details</div>
      {transactions.map((tx, idx) => (
        <div key={tx.id} style={{ borderBottom: '1px dashed #000', padding: '1.5mm 0' }}>
          <div>
            <b>Entry #{idx + 1}</b>
          </div>
          <div>Date: {formatDateTimeEn(tx.txDateIso)}</div>
          <div>Amount: ৳{tx.amount.toLocaleString('en-US')}</div>
          <div>Type: {LEDGER_TX_LABELS[tx.type] || tx.type}</div>
          <div>Method: {tx.method}</div>
        </div>
      ))}
      <div style={{ textAlign: 'center', marginTop: '3mm' }}>All Accounts Settled</div>
      <div style={{ textAlign: 'center' }}>Thank you for your business</div>
    </div>
  );
};
