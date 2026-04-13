import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import Modal from '../../components/Common/Modal';
import { useToast } from '../../components/Common/ToastContainer';
import { formatAccountNumberForDisplay } from '../../utils/accountNumber';
import {
  getErrorMessage,
  loadBillsWithFallback,
  loadConsumersWithFallback,
  loadPaymentsWithFallback,
} from '../../services/userManagementApi';
import './Ledger.css';

const toAmount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value?: string | null) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-PH');
};

const formatZoneLabel = (zoneName?: string | null, zoneId?: number | string | null) =>
  zoneName || (zoneId ? `Zone ${zoneId}` : 'Not Assigned');

interface ConsumerRecord {
  Consumer_ID: number;
  First_Name: string;
  Middle_Name?: string;
  Last_Name: string;
  Address: string;
  Account_Number: string;
  Meter_Number?: string | null;
  Connection_Date?: string | null;
  Zone_ID?: number | null;
  Zone_Name?: string | null;
  Classification_Name?: string | null;
  Status?: string;
}

interface BillRecord {
  Bill_ID: number;
  Consumer_ID: number;
  Billing_Month?: string | null;
  Bill_Date?: string | null;
  Due_Date?: string | null;
  Total_Amount?: number;
  Water_Charge?: number;
  Basic_Charge?: number;
  Penalty?: number;
  Penalties?: number;
  Meter_Fee?: number;
  Environmental_Fee?: number;
  Current_Reading?: number;
  Consumption?: number;
  Status?: string;
}

interface PaymentRecord {
  Payment_ID: number;
  Consumer_ID: number;
  Bill_ID?: number | null;
  Amount_Paid?: number;
  Payment_Date?: string | null;
  Payment_Method?: string | null;
  OR_Number?: string | null;
  Reference_No?: string | null;
  Status?: string;
}

interface RegistryRow {
  Consumer_ID: number;
  Consumer_Name: string;
  Account_Number: string;
  Address: string;
  Zone: string;
  Classification: string;
  Last_Bill: number;
  Outstanding_Balance: number;
  Last_Payment: string;
  Status: string;
  Meter_Number: string | null;
  Connection_Date: string | null;
}

interface LedgerRecord {
  Month_Year: string;
  Reading: number;
  Consumption: number;
  Water_Bill: number;
  Penalty: number;
  Meter_Fee: number;
  Amount_Paid: number;
  Date_Paid: string;
  OR_No: string;
  Balance: number;
}

const TreasurerLedger: React.FC = () => {
  const { showToast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [consumers, setConsumers] = useState<ConsumerRecord[]>([]);
  const [bills, setBills] = useState<BillRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [selectedConsumer, setSelectedConsumer] = useState<RegistryRow | null>(null);

  const loadRegistry = useCallback(async () => {
    try {
      setLoading(true);
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
        showToast('Treasurer registry loaded from the offline database snapshot.', 'warning');
      } else if (sources.includes('supabase')) {
        showToast('Treasurer registry loaded using Supabase fallback for part of the data.', 'warning');
      }
    } catch (error) {
      console.error('Error loading treasurer registry:', error);
      showToast(getErrorMessage(error, 'Failed to load treasurer registry.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadRegistry();
  }, [loadRegistry]);

  const registryRows = useMemo<RegistryRow[]>(() => {
    const billsByConsumer = new Map<number, BillRecord[]>();
    const paymentsByConsumer = new Map<number, PaymentRecord[]>();

    bills.forEach((bill) => {
      const current = billsByConsumer.get(bill.Consumer_ID) || [];
      current.push(bill);
      billsByConsumer.set(bill.Consumer_ID, current);
    });

    payments.forEach((payment) => {
      const current = paymentsByConsumer.get(payment.Consumer_ID) || [];
      current.push(payment);
      paymentsByConsumer.set(payment.Consumer_ID, current);
    });

    return consumers.map((consumer) => {
      const consumerBills = (billsByConsumer.get(consumer.Consumer_ID) || []).slice().sort((a, b) => {
        const aTime = new Date(a.Bill_Date || a.Due_Date || 0).getTime();
        const bTime = new Date(b.Bill_Date || b.Due_Date || 0).getTime();
        return bTime - aTime;
      });
      const consumerPayments = (paymentsByConsumer.get(consumer.Consumer_ID) || []).slice().sort((a, b) => {
        const aTime = new Date(a.Payment_Date || 0).getTime();
        const bTime = new Date(b.Payment_Date || 0).getTime();
        return bTime - aTime;
      });

      const lastBill = consumerBills[0];
      const lastPayment = consumerPayments[0];
      const outstandingBalance = consumerBills
        .filter((bill) => String(bill.Status || '').toLowerCase() !== 'paid')
        .reduce((sum, bill) => sum + toAmount(bill.Total_Amount), 0);

      return {
        Consumer_ID: consumer.Consumer_ID,
        Consumer_Name: [consumer.First_Name, consumer.Middle_Name, consumer.Last_Name].filter(Boolean).join(' '),
        Account_Number: consumer.Account_Number,
        Address: consumer.Address,
        Zone: formatZoneLabel(consumer.Zone_Name, consumer.Zone_ID),
        Classification: consumer.Classification_Name || 'Unclassified',
        Last_Bill: toAmount(lastBill?.Total_Amount),
        Outstanding_Balance: outstandingBalance,
        Last_Payment: lastPayment?.Payment_Date || '',
        Status: consumer.Status || 'Unknown',
        Meter_Number: consumer.Meter_Number || null,
        Connection_Date: consumer.Connection_Date || null,
      };
    });
  }, [bills, consumers, payments]);

  const filteredRegistryRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return registryRows;

    return registryRows.filter((row) =>
      [row.Account_Number, row.Consumer_Name, row.Address, row.Zone, row.Classification]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [registryRows, searchTerm]);

  const selectedLedgerRecords = useMemo<LedgerRecord[]>(() => {
    if (!selectedConsumer) return [];

    const paymentsByBillId = new Map<number, PaymentRecord[]>();
    payments
      .filter((payment) => payment.Consumer_ID === selectedConsumer.Consumer_ID)
      .forEach((payment) => {
        const billId = Number(payment.Bill_ID || 0);
        if (!paymentsByBillId.has(billId)) {
          paymentsByBillId.set(billId, []);
        }
        paymentsByBillId.get(billId)?.push(payment);
      });

    return bills
      .filter((bill) => bill.Consumer_ID === selectedConsumer.Consumer_ID)
      .slice()
      .sort((a, b) => new Date(b.Bill_Date || b.Due_Date || 0).getTime() - new Date(a.Bill_Date || a.Due_Date || 0).getTime())
      .map((bill) => {
        const billPayments = (paymentsByBillId.get(bill.Bill_ID) || []).slice().sort((a, b) =>
          new Date(b.Payment_Date || 0).getTime() - new Date(a.Payment_Date || 0).getTime()
        );
        const totalPaid = billPayments.reduce((sum, payment) => sum + toAmount(payment.Amount_Paid), 0);
        const latestPayment = billPayments[0];
        const totalBill = toAmount(bill.Total_Amount);

        return {
          Month_Year: bill.Billing_Month || formatDate(bill.Bill_Date),
          Reading: toAmount(bill.Current_Reading),
          Consumption: toAmount(bill.Consumption),
          Water_Bill: toAmount(bill.Water_Charge ?? bill.Basic_Charge ?? bill.Total_Amount),
          Penalty: toAmount(bill.Penalty ?? bill.Penalties),
          Meter_Fee: toAmount(bill.Meter_Fee ?? bill.Environmental_Fee),
          Amount_Paid: totalPaid,
          Date_Paid: latestPayment?.Payment_Date ? formatDate(latestPayment.Payment_Date) : 'N/A',
          OR_No: latestPayment?.OR_Number || latestPayment?.Reference_No || '-',
          Balance: Math.max(0, totalBill - totalPaid),
        };
      });
  }, [bills, payments, selectedConsumer]);

  const columns = useMemo(() => [
    {
      key: 'Account_Number',
      label: 'ACCOUNT NO.',
      sortable: true,
      render: (value: string) => formatAccountNumberForDisplay(value),
    },
    { key: 'Consumer_Name', label: 'CONSUMER NAME', sortable: true },
    { key: 'Zone', label: 'ZONE', sortable: true },
    { key: 'Classification', label: 'TYPE', sortable: true },
    {
      key: 'Last_Bill',
      label: 'LATEST BILL',
      sortable: true,
      render: (value: number) => `P${toAmount(value).toFixed(2)}`,
    },
    {
      key: 'Outstanding_Balance',
      label: 'OUTSTANDING',
      sortable: true,
      render: (value: number) => (
        <span className={toAmount(value) > 0 ? 'balance-due' : 'balance-paid'}>
          P{toAmount(value).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'Last_Payment',
      label: 'LAST PAYMENT',
      sortable: true,
      render: (value: string) => formatDate(value),
    },
    {
      key: 'actions',
      label: 'LEDGER',
      render: (_: unknown, row: RegistryRow) => (
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            setSelectedConsumer(row);
            setShowLedgerModal(true);
          }}
        >
          <i className="fas fa-book"></i> View Record
        </button>
      ),
    },
  ], []);

  return (
    <MainLayout title="Financial Registry: Records of Payment">
      <div className="treasurer-ledger-page">
        <div className="registry-control-hub card shadow-sm border-0 mb-4" style={{ borderRadius: '24px' }}>
          <div className="card-body p-4">
            <div className="hub-layout">
              <div className="hub-search-main">
                <div className="input-group-custom">
                  <div className="input-icon-wrapper">
                    <i className="fas fa-search-dollar"></i>
                  </div>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Filter registry by Account No., Consumer Name, Zone, or Type..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <button className="btn btn-primary registry-submit-btn" style={{ minWidth: '150px' }}>
                    REGISTRY
                  </button>
                </div>
              </div>

              <div className="hub-filters">
                <button className="btn-sync-registry" onClick={loadRegistry} title="Refresh Records">
                  <i className="fas fa-sync-alt"></i>
                </button>
              </div>
            </div>

            <div className="profile-dashboard mt-4">
              <div className="registry-stats-grid">
                <div className="registry-stat-card">
                  <span className="label">Registry Coverage</span>
                  <span className="name">{filteredRegistryRows.length}</span>
                  <span className="value">Consumers in current view</span>
                </div>
                <div className="registry-stat-card">
                  <span className="label">Total Outstanding</span>
                  <span className="name">P{filteredRegistryRows.reduce((sum, row) => sum + toAmount(row.Outstanding_Balance), 0).toFixed(2)}</span>
                  <span className="value">Running unpaid balance</span>
                </div>
                <div className="registry-stat-card">
                  <span className="label">With Recorded Bill</span>
                  <span className="name">{filteredRegistryRows.filter((row) => toAmount(row.Last_Bill) > 0).length}</span>
                  <span className="value">Accounts with bill history</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card shadow-sm border-0" style={{ borderRadius: '24px' }}>
          <div className="card-header bg-white py-3">
            <h2 className="card-title m-0 h5 font-weight-bold" style={{ color: '#1B1B63' }}>Financial Registry Overview</h2>
          </div>
          <div className="card-body p-0">
            <DataTable
              columns={columns}
              data={filteredRegistryRows}
              loading={loading}
              emptyMessage="No consumer financial records found."
            />
          </div>
        </div>

        {showLedgerModal && selectedConsumer && (
          <Modal isOpen={showLedgerModal} onClose={() => setShowLedgerModal(false)} title="Official Water Service Record" size="portrait" closeOnOverlayClick={true}>
            <div className="treasurer-paper-theme">
              <div className="ledger-official-header">
                <p>REPUBLIC OF THE PHILIPPINES</p>
                <h3>SAN LORENZO WATER SYSTEM</h3>
                <p>San Lorenzo Ruiz, Camarines Norte</p>
                <div style={{ marginTop: '10px', fontSize: '14px', fontWeight: 900, textDecoration: 'underline' }}>WATER SERVICE RECORD</div>
              </div>

              <div className="ledger-consumer-info">
                <div className="info-row-layout">
                  <div className="form-field"><span className="form-label">Acc. No.</span><div className="form-data underline">{formatAccountNumberForDisplay(selectedConsumer.Account_Number)}</div></div>
                  <div className="form-field flex-narrow"><span className="form-label">Zone</span><div className="form-data underline">{selectedConsumer.Zone}</div></div>
                  <div className="form-field"><span className="form-label">Meter Serial No.</span><div className="form-data underline">{selectedConsumer.Meter_Number || 'N/A'}</div></div>
                </div>
                <div className="info-row-layout">
                  <div className="form-field flex-wide"><span className="form-label">Name</span><div className="form-data underline">{selectedConsumer.Consumer_Name}</div></div>
                  <div className="form-field"><span className="form-label">Date Con.</span><div className="form-data underline">{formatDate(selectedConsumer.Connection_Date)}</div></div>
                </div>
                <div className="info-row-layout">
                  <div className="form-field flex-wide"><span className="form-label">Address</span><div className="form-data underline">{selectedConsumer.Address}</div></div>
                </div>
              </div>

              <div className="paper-table-wrapper">
                <table className="paper-ledger-table">
                  <thead>
                    <tr>
                      <th rowSpan={2}>Reading</th>
                      <th rowSpan={2}>Cu. M. Used</th>
                      <th rowSpan={2}>Water Bill</th>
                      <th rowSpan={2}>Penalty</th>
                      <th rowSpan={2}>Meter Fee</th>
                      <th rowSpan={2}>Amount Paid</th>
                      <th rowSpan={2}>Date Paid</th>
                      <th rowSpan={2}>O.R. No.</th>
                      <th colSpan={2}>Balance</th>
                    </tr>
                    <tr><th className="sub-th">PHP</th><th className="sub-th">cts.</th></tr>
                  </thead>
                  <tbody>
                    {selectedLedgerRecords.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center">No ledger entries available.</td>
                      </tr>
                    ) : (
                      selectedLedgerRecords.map((record, idx) => (
                        <tr key={`${record.Month_Year}-${idx}`}>
                          <td className="text-right">{record.Reading}</td>
                          <td className="text-center">{record.Consumption}</td>
                          <td className="text-right">{record.Water_Bill.toFixed(2)}</td>
                          <td className="text-right">{record.Penalty.toFixed(2)}</td>
                          <td className="text-right">{record.Meter_Fee.toFixed(2)}</td>
                          <td className="text-right font-bold">{record.Amount_Paid.toFixed(2)}</td>
                          <td className="text-center">{record.Date_Paid}</td>
                          <td className="text-center font-bold">{record.OR_No}</td>
                          <td className="text-right">{Math.floor(record.Balance)}</td>
                          <td className="text-right">{(record.Balance % 1).toFixed(2).split('.')[1]}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="ledger-footer-actions no-print">
                <button className="btn btn-secondary" onClick={() => setShowLedgerModal(false)}>Close Registry</button>
                <button className="btn btn-primary" onClick={() => window.print()}><i className="fas fa-print"></i> Generate Official Audit Report</button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </MainLayout>
  );
};

export default TreasurerLedger;
