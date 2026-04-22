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
  Meter_Number?: string | null;
  Connection_Date?: string | null;
  Status: string;
}

interface BillRow {
  Bill_ID: number;
  Consumer_ID: number;
  Account_Number: string;
  Consumer_Name: string;
  Total_Amount: number;
  Penalty?: number | string | null;
  Penalties?: number | string | null;
  Meter_Fee?: number | string | null;
  Environmental_Fee?: number | string | null;
  Current_Reading?: number | string | null;
  Consumption?: number | string | null;
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
  Meter_Number: string | null;
  Connection_Date: string | null;
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

const toAmount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (value: number) =>
  `P${toAmount(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  const [zoneFilter, setZoneFilter] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
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

      const sources = [consumersResult.source, billsResult.source, paymentsResult.source];
      if (sources.includes('offline')) {
        showToast('Ledger loaded from the offline database snapshot.', 'warning');
      } else if (sources.includes('supabase')) {
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
        .reduce((sum, bill) => sum + toAmount(bill.Total_Amount), 0);
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
        Meter_Number: consumer.Meter_Number || null,
        Connection_Date: consumer.Connection_Date || null,
        Current_Balance: currentBalance,
        Last_Payment: lastPayment,
        Status: consumer.Status,
        Consumer_ID: consumer.Consumer_ID,
      };
    });
  }, [bills, consumers, payments]);

  const filteredData = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return ledgerData.filter((entry) => {
      const matchesSearch = !query || [entry.Account_Number, entry.Consumer_Name, entry.Address]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      const matchesZone = !zoneFilter || entry.Zone === zoneFilter;
      const matchesClassification = !classificationFilter || entry.Classification === classificationFilter;
      const matchesStatus = !statusFilter || entry.Status === statusFilter;
      return matchesSearch && matchesZone && matchesClassification && matchesStatus;
    });
  }, [classificationFilter, ledgerData, searchTerm, statusFilter, zoneFilter]);

  const zoneOptions = useMemo(
    () => Array.from(new Set(ledgerData.map((entry) => entry.Zone).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [ledgerData]
  );
  const classificationOptions = useMemo(
    () => Array.from(new Set(ledgerData.map((entry) => entry.Classification).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [ledgerData]
  );
  const statusOptions = useMemo(
    () => Array.from(new Set(ledgerData.map((entry) => entry.Status).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [ledgerData]
  );

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
          Debit: toAmount(bill.Total_Amount),
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
          Credit: toAmount(payment.Amount_Paid),
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
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <select className="form-control" style={{ minWidth: '180px' }} value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}>
                    <option value="">All Zones</option>
                    {zoneOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                  <select className="form-control" style={{ minWidth: '180px' }} value={classificationFilter} onChange={(e) => setClassificationFilter(e.target.value)}>
                    <option value="">All Types</option>
                    {classificationOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                  <select className="form-control" style={{ minWidth: '180px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="">All Statuses</option>
                    {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
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
          <Modal isOpen={Boolean(selectedConsumer)} onClose={() => setSelectedConsumer(null)} title="Official Account Ledger" size="portrait" closeOnOverlayClick={true}>
            <div className="billing-paper-theme">
              <div className="ledger-big-id">{selectedConsumer.Account_Number.split('-').pop()}</div>
              
              <div className="ledger-official-header">
                <div className="title">REPUBLIC OF THE PHILIPPINES</div>
                <div className="subtitle">MUNICIPALITY OF SAN LORENZO RUIZ</div>
                <div style={{ fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', color: '#1e293b' }}>WATER SERVICE RECORD</div>
                <h3>RECORDS OF PAYMENT</h3>
              </div>

              <div className="ledger-consumer-info">
                <div className="info-row-layout">
                  <div className="form-field flex-wide">
                    <span className="form-label">Consumer Name</span>
                    <div className="form-data underline">{selectedConsumer.Consumer_Name}</div>
                  </div>
                  <div className="form-field">
                    <span className="form-label">Zone</span>
                    <div className="form-data underline">{selectedConsumer.Zone}</div>
                  </div>
                </div>
                <div className="info-row-layout">
                  <div className="form-field flex-wide">
                    <span className="form-label">Address</span>
                    <div className="form-data underline">{selectedConsumer.Address}</div>
                  </div>
                  <div className="form-field flex-narrow">
                    <span className="form-label">Account No.</span>
                    <div className="form-data underline">{selectedConsumer.Account_Number}</div>
                  </div>
                </div>
                <div className="info-row-layout">
                  <div className="form-field">
                    <span className="form-label">Classification</span>
                    <div className="form-data underline">{selectedConsumer.Classification}</div>
                  </div>
                  <div className="form-field">
                    <span className="form-label">Meter Serial No.</span>
                    <div className="form-data underline">{selectedConsumer.Meter_Number || 'N/A'}</div>
                  </div>
                  <div className="form-field">
                    <span className="form-label">Connection Date</span>
                    <div className="form-data underline">{formatDate(selectedConsumer.Connection_Date || undefined)}</div>
                  </div>
                </div>
              </div>

              <div className="paper-table-wrapper">
                <table className="paper-ledger-table">
                  <thead>
                    <tr>
                      <th rowSpan={2}>Date</th>
                      <th rowSpan={2}>Meter Reading</th>
                      <th rowSpan={2}>Consumption</th>
                      <th rowSpan={2}>Water Billing</th>
                      <th rowSpan={2}>Penalty</th>
                      <th rowSpan={2}>Meter</th>
                      <th rowSpan={2}>Payment</th>
                      <th rowSpan={2}>Receipt Number</th>
                      <th colSpan={2} className="balance-col-header">Balance</th>
                    </tr>
                    <tr>
                      <th className="sub-th">PHP</th>
                      <th className="sub-th">cts.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>
                          No bill or payment transactions found.
                        </td>
                      </tr>
                    ) : (
                      transactions.map((row, idx) => {
                        const bill = row.Type === 'Bill' ? bills.find(b => `BILL-${b.Bill_ID}` === row.Reference) : null;
                        const billPenalty = toAmount(bill?.Penalty ?? bill?.Penalties);
                        const billMeterFee = toAmount(bill?.Meter_Fee ?? bill?.Environmental_Fee);
                        const runningBalance = toAmount(row.Running_Balance);
                        
                        return (
                          <tr key={`${row.Reference}-${idx}`}>
                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{formatDate(row.Date)}</td>
                            <td style={{ textAlign: 'right' }}>{bill ? toAmount(bill.Current_Reading) : ''}</td>
                            <td style={{ textAlign: 'center' }}>{bill ? toAmount(bill.Consumption) : ''}</td>
                            <td style={{ textAlign: 'right' }}>{toAmount(row.Debit) > 0 ? toAmount(row.Debit).toFixed(2) : ''}</td>
                            <td style={{ textAlign: 'right' }}>{bill ? billPenalty.toFixed(2) : ''}</td>
                            <td style={{ textAlign: 'right' }}>{bill ? billMeterFee.toFixed(2) : ''}</td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{toAmount(row.Credit) > 0 ? toAmount(row.Credit).toFixed(2) : ''}</td>
                            <td style={{ textAlign: 'center' }}>{row.Reference.startsWith('BILL-') ? '' : row.Reference}</td>
                            <td style={{ textAlign: 'right' }}>{Math.floor(runningBalance)}</td>
                            <td style={{ textAlign: 'right' }}>{(runningBalance % 1).toFixed(2).split('.')[1]}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="ledger-footer-actions no-print">
                <button className="btn btn-secondary" onClick={() => setSelectedConsumer(null)}>Close Record</button>
                <button className="btn btn-primary" onClick={() => window.print()}>
                  <i className="fas fa-print"></i> Generate Audit Report
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </MainLayout>
  );
};

export default BillingLedger;
