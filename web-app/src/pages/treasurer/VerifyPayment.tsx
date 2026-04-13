import React, { useState, useEffect, useCallback, useMemo } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import Tabs, { Tab } from '../../components/Common/Tabs';
import DataTable from '../../components/Common/DataTable';
import { useToast } from '../../components/Common/ToastContainer';
import { getErrorMessage, loadPaymentsWithFallback, requestJson } from '../../services/userManagementApi';
import { formatAccountNumberForDisplay } from '../../utils/accountNumber';
import './VerifyPayment.css';

const toAmount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value: unknown) => String(value || '').trim().toLowerCase();

const formatDate = (value: string) => {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-PH');
};

interface PendingPayment {
  Payment_ID: number;
  OR_No: string;
  Account_Number: string;
  Consumer_Name: string;
  Payment_Date: string;
  Amount: number;
  Entered_By: string;
  Status: string;
}

const VerifyPayment: React.FC = () => {
  const { showToast } = useToast();
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [verifiedPayments, setVerifiedPayments] = useState<PendingPayment[]>([]);
  const [rejectedPayments, setRejectedPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadPaymentsWithFallback();
      const mapped = (result.data || []).map((payment: any) => ({
        Payment_ID: payment.Payment_ID,
        OR_No: payment.OR_Number || payment.Reference_No || String(payment.Payment_ID),
        Account_Number: formatAccountNumberForDisplay(payment.Account_Number, 'N/A'),
        Consumer_Name: payment.Consumer_Name || 'Unknown Consumer',
        Payment_Date: payment.Payment_Date || '',
        Amount: toAmount(payment.Amount_Paid),
        Entered_By: 'Treasurer',
        Status: payment.Status || 'Pending',
      }));

      setPendingPayments(mapped.filter((payment) => normalizeStatus(payment.Status) === 'pending'));
      setVerifiedPayments(mapped.filter((payment) => ['validated', 'verified', 'paid'].includes(normalizeStatus(payment.Status))));
      setRejectedPayments(mapped.filter((payment) => normalizeStatus(payment.Status) === 'rejected'));

      if (result.source === 'supabase') {
        showToast('Payments loaded using Supabase fallback.', 'warning');
      }
    } catch (error) {
      console.error('Error loading payments:', error);
      showToast(getErrorMessage(error, 'Failed to load payments.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const handleVerifyPayment = async (payment: PendingPayment) => {
    if (!window.confirm(`Verify payment ${payment.OR_No}?`)) return;

    try {
      await requestJson<{ success: boolean }>(
        `/payments/${payment.Payment_ID}/status`,
        {
          method: 'PUT',
          body: JSON.stringify({ status: 'Validated' }),
        },
        'Failed to verify payment.'
      );
      showToast('Payment verified successfully', 'success');
      loadPayments();
    } catch (error) {
      console.error('Error verifying payment:', error);
      showToast(getErrorMessage(error, 'Failed to verify payment.'), 'error');
    }
  };

  const handleRejectPayment = async (payment: PendingPayment) => {
    if (!window.confirm(`Reject payment ${payment.OR_No}?`)) return;

    try {
      await requestJson<{ success: boolean }>(
        `/payments/${payment.Payment_ID}/status`,
        {
          method: 'PUT',
          body: JSON.stringify({ status: 'Rejected' }),
        },
        'Failed to reject payment.'
      );
      showToast('Payment rejected', 'info');
      loadPayments();
    } catch (error) {
      console.error('Error rejecting payment:', error);
      showToast(getErrorMessage(error, 'Failed to reject payment.'), 'error');
    }
  };

  const filterPayments = useCallback((rows: PendingPayment[]) => {
    const query = searchTerm.trim().toLowerCase();
    return rows.filter((payment) => {
      const matchesQuery = !query || [payment.OR_No, payment.Account_Number, payment.Consumer_Name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));

      const paymentDate = payment.Payment_Date ? new Date(payment.Payment_Date) : null;
      const matchesFrom = !fromDate || !paymentDate || paymentDate >= new Date(fromDate);
      const matchesTo = !toDate || !paymentDate || paymentDate <= new Date(`${toDate}T23:59:59`);
      return matchesQuery && matchesFrom && matchesTo;
    });
  }, [fromDate, searchTerm, toDate]);

  const filteredPendingPayments = useMemo(() => filterPayments(pendingPayments), [filterPayments, pendingPayments]);
  const filteredVerifiedPayments = useMemo(() => filterPayments(verifiedPayments), [filterPayments, verifiedPayments]);
  const filteredRejectedPayments = useMemo(() => filterPayments(rejectedPayments), [filterPayments, rejectedPayments]);

  const pendingColumns = [
    { key: 'OR_No', label: 'OR No.', sortable: true },
    { key: 'Account_Number', label: 'Account No.', sortable: true, render: (value: string) => formatAccountNumberForDisplay(value, 'N/A') },
    { key: 'Consumer_Name', label: 'Consumer', sortable: true },
    { key: 'Payment_Date', label: 'Date', sortable: true, render: (value: string) => formatDate(value) },
    { key: 'Amount', label: 'Amount', sortable: true, render: (val: number) => `P${toAmount(val).toFixed(2)}` },
    { key: 'Entered_By', label: 'Entered By', sortable: true },
    {
      key: 'actions',
      label: 'Actions',
      render: (_: any, payment: PendingPayment) => (
        <div className="action-buttons">
          <button className="btn btn-sm btn-success" onClick={() => handleVerifyPayment(payment)}>
            <i className="fas fa-check"></i> Verify
          </button>
          <button className="btn btn-sm btn-danger" onClick={() => handleRejectPayment(payment)}>
            <i className="fas fa-times"></i> Reject
          </button>
        </div>
      ),
    },
  ];

  const verifiedColumns = [
    { key: 'OR_No', label: 'OR No.', sortable: true },
    { key: 'Account_Number', label: 'Account No.', sortable: true, render: (value: string) => formatAccountNumberForDisplay(value, 'N/A') },
    { key: 'Consumer_Name', label: 'Consumer', sortable: true },
    { key: 'Payment_Date', label: 'Date', sortable: true, render: (value: string) => formatDate(value) },
    { key: 'Amount', label: 'Amount', sortable: true, render: (val: number) => `P${toAmount(val).toFixed(2)}` },
    { key: 'Entered_By', label: 'Entered By', sortable: true },
    {
      key: 'Status',
      label: 'Status',
      sortable: true,
      render: (val: string) => (
        <span className={`status-badge status-${(val || 'unknown').toLowerCase()}`}>
          {val || 'Unknown'}
        </span>
      ),
    },
  ];

  const tabs: Tab[] = [
    {
      id: 'pending',
      label: 'Awaiting Verification',
      content: (
        <div className="tab-content">
          <div className="search-filters">
            <div className="search-container">
              <i className="fas fa-search"></i>
              <input
                type="text"
                placeholder="Search by OR sequence or account..."
                className="search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="filter-container">
              <label>Audit Range:</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              <span style={{ color: '#94a3b8', fontWeight: '800' }}>-&gt;</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              <button className="btn btn-secondary" style={{ padding: '10px 20px', borderRadius: '12px' }}>
                <i className="fas fa-filter"></i> Apply
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '20px' }}>
              <h2 className="card-title">Pending Collections Audit Queue</h2>
              <span className="badge">{filteredPendingPayments.length} Entries pending</span>
            </div>
            <div className="card-body">
              <div style={{ padding: '24px' }}>
                <DataTable columns={pendingColumns} data={filteredPendingPayments} loading={loading} />
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'verified',
      label: 'Verified Records',
      content: (
        <div className="card">
          <div className="card-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '20px' }}>
            <h2 className="card-title">Verified Transaction Ledger</h2>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '13px' }}>
                <i className="fas fa-file-export"></i> CSV Export
              </button>
              <button className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '13px' }}>
                <i className="fas fa-print"></i> Print Audit
              </button>
            </div>
          </div>
          <div className="card-body">
            <div style={{ padding: '24px' }}>
              <DataTable columns={verifiedColumns} data={filteredVerifiedPayments} loading={loading} />
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'rejected',
      label: 'Rejected Entries',
      content: (
        <div className="card">
          <div className="card-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '20px' }}>
            <h2 className="card-title">Flagged for Correction</h2>
          </div>
          <div className="card-body">
            <div style={{ padding: '24px' }}>
              <DataTable columns={verifiedColumns} data={filteredRejectedPayments} loading={loading} />
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <MainLayout title="Internal Audit & Verification">
      <div className="verify-payment-page">
        <Tabs tabs={tabs} defaultTab="pending" />
      </div>
    </MainLayout>
  );
};

export default VerifyPayment;
