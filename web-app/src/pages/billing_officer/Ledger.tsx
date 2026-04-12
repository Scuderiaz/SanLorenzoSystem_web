import React, { useEffect, useMemo, useState, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import Modal from '../../components/Common/Modal';
import { useToast } from '../../components/Common/ToastContainer';
import {
  getErrorMessage,
  loadBillsWithFallback,
  loadConsumersWithFallback,
  loadPaymentsWithFallback,
} from '../../services/userManagementApi';
import './Ledger.css';

interface ConsumerRow {
  Consumer_ID: number;
  First_Name: string;
  Middle_Name?: string;
  Last_Name: string;
  Address: string;
  Zone_ID: number;
  Zone_Name?: string;
  Classification_Name?: string;
  Account_Number: string;
  Status: string;
}

interface BillRow {
  Bill_ID: number;
  Consumer_ID: number;
  Account_Number: string;
  Consumer_Name: string;
  Total_Amount: number;
  Bill_Date?: string;
  Due_Date?: string;
  Billing_Month?: string;
  Status: string;
}

interface PaymentRow {
  Payment_ID: number;
  Bill_ID?: number;
  Consumer_ID: number;
  Amount_Paid: number;
  Payment_Date?: string;
  Payment_Method?: string;
  Reference_No?: string;
  OR_Number?: string;
  Status: string;
}

interface LedgerEntry {
  Account_Number: string;
  Consumer_Name: string;
  Address: string;
  Zone: string;
  Classification: string;
  Current_Balance: number;
  Last_Payment: string;
  Status: string;
  Consumer_ID: number;
}

interface TransactionRow {
  Date: string;
  Type: 'Bill' | 'Payment';
  Reference: string;
  Details: string;
  Debit: number;
  Credit: number;
  Running_Balance: number;
  Status: string;
}

const formatCurrency = (value: number) =>
  `P${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value?: string) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH');
};

const formatZoneLabel = (zoneName?: string, zoneId?: number | string | null) =>
  zoneName || (zoneId ? `Zone ${zoneId}` : 'Not Assigned');

const BillingLedger: React.FC = () => {
  const { showToast } = useToast();

  const [consumers, setConsumers] = useState<ConsumerRow[]>([]);
  const [bills, setBills] = useState<BillRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConsumer, setSelectedConsumer] = useState<LedgerEntry | null>(null);

  const loadLedgerData = useCallback(async () => {
    setLoading(true);
    try {
      const [consumersResult, billsResult, paymentsResult] = await Promise.all([
        loadConsumersWithFallback(),
        loadBillsWithFallback(),
        loadPaymentsWithFallback(),
      ]);

      setConsumers(consumersResult.data || []);
      setBills(billsResult.data || []);
      setPayments(paymentsResult.data || []);

      if ([consumersResult.source, billsResult.source, paymentsResult.source].includes('supabase')) {
        showToast('Ledger loaded using Supabase fallback for part of the data.', 'warning');
      }
    } catch (error) {
      console.error('Error loading ledger data:', error);
      showToast(getErrorMessage(error, 'Failed to load ledger data.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadLedgerData();
  }, [loadLedgerData]);

  const ledgerData = useMemo<LedgerEntry[]>(() => {
    const paymentMap = new Map<number, PaymentRow[]>();
    payments.forEach((payment) => {
      const current = paymentMap.get(payment.Consumer_ID) || [];
      current.push(payment);
      paymentMap.set(payment.Consumer_ID, current);
    });

    return consumers.map((consumer) => {
      const consumerBills = bills.filter((bill) => bill.Consumer_ID === consumer.Consumer_ID);
      const consumerPayments = paymentMap.get(consumer.Consumer_ID) || [];
      const currentBalance = consumerBills
        .filter((bill) => String(bill.Status || '').toLowerCase() !== 'paid')
        .reduce((sum, bill) => sum + Number(bill.Total_Amount || 0), 0);
      const lastPayment = consumerPayments
        .map((payment) => payment.Payment_Date)
        .filter(Boolean)
        .sort()
        .reverse()[0] || '';

      return {
        Account_Number: consumer.Account_Number,
        Consumer_Name: [consumer.First_Name, consumer.Middle_Name, consumer.Last_Name].filter(Boolean).join(' '),
        Address: consumer.Address,
        Zone: formatZoneLabel(consumer.Zone_Name, consumer.Zone_ID),
        Classification: consumer.Classification_Name || 'Unclassified',
        Current_Balance: currentBalance,
        Last_Payment: lastPayment,
        Status: consumer.Status,
        Consumer_ID: consumer.Consumer_ID,
      };
    });
  }, [bills, consumers, payments]);

  const filteredData = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return ledgerData;
    return ledgerData.filter((entry) =>
      [entry.Account_Number, entry.Consumer_Name, entry.Address]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [ledgerData, searchTerm]);

  const transactions = useMemo<TransactionRow[]>(() => {
    if (!selectedConsumer) return [];

    const transactionRows: Array<Omit<TransactionRow, 'Running_Balance'>> = [];
    bills
      .filter((bill) => bill.Consumer_ID === selectedConsumer.Consumer_ID)
      .forEach((bill) => {
        transactionRows.push({
          Date: bill.Bill_Date || bill.Due_Date || '',
          Type: 'Bill',
          Reference: `BILL-${bill.Bill_ID}`,
          Details: bill.Billing_Month || 'Generated bill',
          Debit: Number(bill.Total_Amount || 0),
          Credit: 0,
          Status: bill.Status || 'Unpaid',
        });
      });

    payments
      .filter((payment) => payment.Consumer_ID === selectedConsumer.Consumer_ID)
      .forEach((payment) => {
        transactionRows.push({
          Date: payment.Payment_Date || '',
          Type: 'Payment',
          Reference: payment.OR_Number || payment.Reference_No || `PAY-${payment.Payment_ID}`,
          Details: payment.Payment_Method || 'Payment',
          Debit: 0,
          Credit: Number(payment.Amount_Paid || 0),
          Status: payment.Status || 'Pending',
        });
      });

    const sorted = transactionRows.sort((a, b) => {
      const aTime = a.Date ? new Date(a.Date).getTime() : 0;
      const bTime = b.Date ? new Date(b.Date).getTime() : 0;
      return aTime - bTime;
    });

    let runningBalance = 0;
    return sorted.map((row) => {
      runningBalance += row.Debit - row.Credit;
      return { ...row, Running_Balance: runningBalance };
    }).reverse();
  }, [bills, payments, selectedConsumer]);

  const columns = [
    { key: 'Account_Number', label: 'Account No.', sortable: true },
    { key: 'Consumer_Name', label: 'Consumer Name', sortable: true },
    { key: 'Address', label: 'Address', sortable: true },
    { key: 'Zone', label: 'Zone', sortable: true },
    { key: 'Classification', label: 'Type', sortable: true },
    {
      key: 'Current_Balance',
      label: 'Outstanding Balance',
      sortable: true,
      render: (value: number) => (
        <span className={value > 0 ? 'balance-due' : 'balance-paid'}>{formatCurrency(value)}</span>
      ),
    },
    {
      key: 'Last_Payment',
      label: 'Last Payment',
      sortable: true,
      render: (value: string) => formatDate(value),
    },
    {
      key: 'actions',
      label: 'Ledger',
      render: (_: unknown, row: LedgerEntry) => (
        <button className="btn btn-sm btn-info" onClick={() => setSelectedConsumer(row)}>
          <i className="fas fa-book"></i> View Ledger
        </button>
      ),
    },
  ];

  const transactionColumns = [
    { key: 'Date', label: 'Date', sortable: true, render: (value: string) => formatDate(value) },
    { key: 'Type', label: 'Type', sortable: true },
    { key: 'Reference', label: 'Reference', sortable: true },
    { key: 'Details', label: 'Details', sortable: true },
    { key: 'Debit', label: 'Debit', sortable: true, render: (value: number) => (value ? formatCurrency(value) : '-') },
    { key: 'Credit', label: 'Credit', sortable: true, render: (value: number) => (value ? formatCurrency(value) : '-') },
    { key: 'Running_Balance', label: 'Balance', sortable: true, render: (value: number) => formatCurrency(value) },
    { key: 'Status', label: 'Status', sortable: true },
  ];

  return (
    <MainLayout title="Account Ledger">
      <div className="ledger-page">
        <div className="registry-control-hub card shadow-sm border-0 mb-4" style={{ borderRadius: '20px' }}>
          <div className="card-body p-4">
            <div className="hub-layout">
              <div className="hub-search-main">
                <div className="input-group-custom">
                  <div className="input-icon-wrapper">
                    <i className="fas fa-search"></i>
                  </div>
                  <input
                    type="text"
                    placeholder="Search by account number or consumer name..."
                    className="form-control"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="hub-filters">
                <button className="btn-sync-registry" onClick={loadLedgerData} title="Refresh Registry">
                  <i className="fas fa-sync-alt"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="card shadow-sm border-0" style={{ borderRadius: '24px', overflow: 'hidden' }}>
          <div className="card-header bg-white py-4 border-light">
            <h2 className="card-title" style={{ fontSize: '18px', fontWeight: '800', color: '#1B1B63' }}>Consumer Account Ledger</h2>
          </div>
          <div className="card-body p-0">
            <div style={{ padding: '24px' }}>
              <DataTable columns={columns} data={filteredData} loading={loading} emptyMessage="No ledger accounts found." />
            </div>
          </div>
        </div>

        {selectedConsumer && (
          <Modal isOpen={Boolean(selectedConsumer)} onClose={() => setSelectedConsumer(null)} title="Account Ledger Details" size="large" closeOnOverlayClick={true}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div><strong>Account No.:</strong> {selectedConsumer.Account_Number}</div>
              <div><strong>Consumer:</strong> {selectedConsumer.Consumer_Name}</div>
              <div><strong>Zone:</strong> {selectedConsumer.Zone}</div>
              <div><strong>Classification:</strong> {selectedConsumer.Classification}</div>
              <div><strong>Current Balance:</strong> {formatCurrency(selectedConsumer.Current_Balance)}</div>
              <div><strong>Last Payment:</strong> {formatDate(selectedConsumer.Last_Payment)}</div>
              <div style={{ gridColumn: '1 / -1' }}><strong>Address:</strong> {selectedConsumer.Address}</div>
            </div>
            <DataTable columns={transactionColumns} data={transactions} loading={false} emptyMessage="No bill or payment transactions found." />
          </Modal>
        )}
      </div>
    </MainLayout>
  );
};

export default BillingLedger;
