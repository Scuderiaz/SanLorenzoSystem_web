import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import { useToast } from '../../components/Common/ToastContainer';
import './Dashboard.css';

const toAmount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

interface RecentPayment {
  Receipt_No: string;
  Account_Number: string;
  Consumer_Name: string;
  Amount: number;
  Payment_Method: string;
  Date_Time: string;
  Validation_Status: string;
}

interface QuickLookupResult {
  currentBillAmount: number;
  previousBalance: number;
  totalDue: number;
  dueDate: string | null;
  billingMonth: string | null;
}

interface PaymentSummaryRow {
  Payment_ID?: number;
  OR_Number?: string;
  OR_No?: string;
  Reference_No?: string;
  Account_Number?: string;
  Consumer_Name?: string;
  Amount_Paid?: number | string;
  Amount?: number | string;
  Payment_Method?: string;
  Payment_Date?: string;
  Date_Time?: string;
  Status?: string;
}

const sameDay = (value: string | null | undefined, dateText: string): boolean => {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.toISOString().slice(0, 10) === dateText;
};

const mapFallbackRecentPayment = (payment: PaymentSummaryRow): RecentPayment => ({
  Receipt_No: payment.OR_Number || payment.OR_No || payment.Reference_No || `PAY-${payment.Payment_ID || 'N/A'}`,
  Account_Number: payment.Account_Number || 'N/A',
  Consumer_Name: payment.Consumer_Name || 'Unknown Consumer',
  Amount: toAmount(payment.Amount_Paid ?? payment.Amount),
  Payment_Method: payment.Payment_Method || 'Cash',
  Date_Time: payment.Payment_Date || payment.Date_Time || '',
  Validation_Status: payment.Status || 'Pending',
});

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  const [todaysCollections, setTodaysCollections] = useState(0);
  const [paymentsToday, setPaymentsToday] = useState(0);
  const [pendingValidation, setPendingValidation] = useState(0);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const [quickViewBill, setQuickViewBill] = useState<QuickLookupResult | null>(null);

  const loadDashboardFromPayments = useCallback(async () => {
    const response = await fetch(`${API_URL}/payments`);
    const result = await response.json();
    const payments: PaymentSummaryRow[] = Array.isArray(result) ? result : (result.data || []);
    const todayText = new Date().toISOString().slice(0, 10);
    const todaysPayments = payments.filter((payment) => sameDay(payment.Payment_Date || payment.Date_Time, todayText));
    const pendingPayments = payments.filter((payment) => String(payment.Status || '').toLowerCase() === 'pending');

    setTodaysCollections(todaysPayments.reduce((sum, payment) => sum + toAmount(payment.Amount_Paid ?? payment.Amount), 0));
    setPaymentsToday(todaysPayments.length);
    setPendingValidation(pendingPayments.length);
    setRecentPayments(payments.slice(0, 10).map(mapFallbackRecentPayment));
  }, [API_URL]);

  const loadRecentPayments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/treasurer/dashboard-summary`);
      if (!response.ok) {
        throw new Error(`Dashboard summary request failed with status ${response.status}`);
      }
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to load treasurer dashboard.');
      }

      const summary = result.data || {};
      setTodaysCollections(toAmount(summary.todaysCollections));
      setPaymentsToday(Number(summary.paymentsToday || 0));
      setPendingValidation(Number(summary.pendingValidation || 0));
      setRecentPayments(summary.recentPayments || []);
    } catch (error) {
      console.error('Error loading treasurer dashboard summary:', error);
      try {
        await loadDashboardFromPayments();
        showToast('Treasurer dashboard loaded using payment history fallback.', 'warning');
      } catch (fallbackError) {
        console.error('Error loading treasurer dashboard fallback:', fallbackError);
        showToast('Failed to load treasurer dashboard data', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [API_URL, loadDashboardFromPayments, showToast]);

  useEffect(() => {
    loadRecentPayments();
  }, [loadRecentPayments]);

  const handleQuickLookup = useCallback(async () => {
    if (!quickSearch.trim()) {
      showToast('Enter an account number or consumer name first.', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/treasurer/account-lookup?q=${encodeURIComponent(quickSearch.trim())}`);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Account not found.');
      }

      setQuickViewBill(result.data?.summary || null);
    } catch (error: any) {
      console.error('Quick lookup failed:', error);
      setQuickViewBill(null);
      showToast(error.message || 'Account not found', 'error');
    } finally {
      setLoading(false);
    }
  }, [API_URL, quickSearch, showToast]);

  const columns = useMemo(() => [
    {
      key: 'Receipt_No',
      label: 'Receipt No.',
      sortable: true,
    },
    {
      key: 'Account_Number',
      label: 'Account No.',
      sortable: true,
    },
    {
      key: 'Consumer_Name',
      label: 'Consumer Name',
      sortable: true,
    },
    {
      key: 'Amount',
      label: 'Amount',
      sortable: true,
      render: (val: number) => `P${toAmount(val).toFixed(2)}`,
    },
    {
      key: 'Payment_Method',
      label: 'Payment Method',
      sortable: true,
    },
    {
      key: 'Date_Time',
      label: 'Date/Time',
      sortable: true,
      render: (value: string) => value ? new Date(value).toLocaleString() : 'N/A',
    },
    {
      key: 'Validation_Status',
      label: 'Validation Status',
      sortable: true,
      render: (val: string) => (
        <span className={`status-badge status-${(val || 'unknown').toLowerCase()}`}>
          {val || 'Unknown'}
        </span>
      ),
    },
  ], []);

  return (
    <MainLayout title="Collections & Disbursement Control">
      <div className="treasurer-dashboard-page">
        <div className="card quick-view-section">
          <div className="card-header">
            <h2 className="card-title"><i className="fas fa-search-dollar"></i> Bill Quick Lookup</h2>
            <div className="header-search">
              <input
                type="text"
                placeholder="Enter Account No. or Consumer Name..."
                className="quick-search-input"
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuickLookup()}
              />
              <button className="btn btn-primary btn-sm" onClick={handleQuickLookup}>Search</button>
            </div>
          </div>
          <div className="card-body">
            {quickViewBill ? (
              <div className="quick-info-grid">
                <div className="quick-item">
                  <span className="label">Current Bill ({quickViewBill.billingMonth || 'Latest'})</span>
                  <span className="value">P{toAmount(quickViewBill.currentBillAmount).toFixed(2)}</span>
                </div>
                <div className="quick-item">
                  <span className="label">Balance (Previous Unpaid)</span>
                  <span className="value">P{toAmount(quickViewBill.previousBalance).toFixed(2)}</span>
                </div>
                <div className="quick-item highlight">
                  <span className="label">Total Due</span>
                  <span className="value">P{toAmount(quickViewBill.totalDue).toFixed(2)}</span>
                </div>
                <div className="quick-item">
                  <span className="label">Due Date</span>
                  <span className="value">{quickViewBill.dueDate ? new Date(quickViewBill.dueDate).toLocaleDateString() : 'N/A'}</span>
                </div>
                <div className="quick-actions">
                  <button className="btn btn-primary" onClick={() => navigate('/payments')}>
                    <i className="fas fa-file-invoice"></i> View Full Bill & Pay
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-quick-view">
                <i className="fas fa-id-card"></i>
                <p>Search an account number to see a quick bill summary.</p>
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-cards">
          <div className="card card-highlight-green">
            <div className="card-header">
              <h2 className="card-title">Today's Collections</h2>
              <i className="fas fa-money-bill-wave"></i>
            </div>
            <div className="card-body">
              <div className="card-value">P{todaysCollections.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="card-label">Gross revenue processed today</div>
            </div>
          </div>
          <div className="card card-highlight-blue">
            <div className="card-header">
              <h2 className="card-title">Payments Today</h2>
              <i className="fas fa-receipt"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{paymentsToday}</div>
              <div className="card-label">Individual receipts issued</div>
            </div>
          </div>
          <div className="card card-highlight-gold">
            <div className="card-header">
              <h2 className="card-title">Pending Validation</h2>
              <i className="fas fa-clock"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{pendingValidation}</div>
              <div className="card-label">Awaiting Billing Officer audit</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Internal Audit: Recent Payments</h2>
            <button className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '700' }} onClick={loadRecentPayments}>
              <i className="fas fa-sync-alt"></i> Refresh
            </button>
          </div>
          <div className="card-body">
            <div style={{ padding: '24px' }}>
              <DataTable columns={columns} data={recentPayments} loading={loading} emptyMessage="No recent payment records found." />
            </div>
          </div>
        </div>

        <div className="form-container">
          <h2 className="form-title">Water Bill Collection Point</h2>
          <p className="form-description">
            Process on-site collections and issue digital Official Receipts (OR).
            System-generated receipts are automatically queued for Billing Officer validation.
          </p>
          <button className="btn-large" onClick={() => navigate('/payments')}>
            <i className="fas fa-plus-circle"></i> NEW COLLECTION ENTRY
          </button>
        </div>
      </div>
    </MainLayout>
  );
};

export default Dashboard;
