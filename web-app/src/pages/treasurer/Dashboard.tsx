import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import { useToast } from '../../components/Common/ToastContainer';
import { formatAccountNumberForDisplay } from '../../utils/accountNumber';
import {
  getErrorMessage,
  loadAccountLookupWithFallback,
  loadConsumersWithFallback,
  loadTreasurerDashboardSummaryWithFallback,
} from '../../services/userManagementApi';
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

interface QuickLookupAccount {
  Consumer_ID: number;
  Account_Number: string;
  First_Name?: string;
  Middle_Name?: string;
  Last_Name?: string;
  Address?: string;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [todaysCollections, setTodaysCollections] = useState(0);
  const [paymentsToday, setPaymentsToday] = useState(0);
  const [pendingValidation, setPendingValidation] = useState(0);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const [quickViewBill, setQuickViewBill] = useState<QuickLookupResult | null>(null);
  const [quickLookupAccounts, setQuickLookupAccounts] = useState<QuickLookupAccount[]>([]);
  const [showQuickSuggestions, setShowQuickSuggestions] = useState(false);
  const quickLookupRef = useRef<HTMLDivElement | null>(null);

  const loadRecentPayments = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadTreasurerDashboardSummaryWithFallback();
      const summary = result.data || {};
      setTodaysCollections(toAmount(summary.todaysCollections));
      setPaymentsToday(Number(summary.paymentsToday || 0));
      setPendingValidation(Number(summary.pendingValidation || 0));
      setRecentPayments(summary.recentPayments || []);
      if (result.source === 'supabase') {
        showToast('Treasurer dashboard loaded using Supabase fallback.', 'warning');
      }
    } catch (error) {
      console.error('Error loading treasurer dashboard summary:', error);
      showToast(getErrorMessage(error, 'Failed to load treasurer dashboard data.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadQuickLookupAccounts = useCallback(async () => {
    try {
      const result = await loadConsumersWithFallback();
      setQuickLookupAccounts(result.data || []);
      if (result.source === 'supabase') {
        showToast('Quick lookup accounts loaded using Supabase fallback.', 'warning');
      }
    } catch (error) {
      console.error('Error loading quick lookup accounts:', error);
      showToast(getErrorMessage(error, 'Failed to load quick lookup accounts.'), 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadRecentPayments();
    loadQuickLookupAccounts();
  }, [loadQuickLookupAccounts, loadRecentPayments]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (quickLookupRef.current && !quickLookupRef.current.contains(event.target as Node)) {
        setShowQuickSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performQuickLookup = useCallback(async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query) {
      showToast('Enter an account number or consumer name first.', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await loadAccountLookupWithFallback(query);
      if (!result.data?.consumer) {
        throw new Error('Account not found.');
      }

      setQuickViewBill(result.data.summary || null);
      setQuickSearch(query);
      setShowQuickSuggestions(false);
      if (result.source === 'supabase') {
        showToast('Account lookup used Supabase fallback.', 'warning');
      }
    } catch (error: any) {
      console.error('Quick lookup failed:', error);
      setQuickViewBill(null);
      showToast(getErrorMessage(error, 'Account not found.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const handleQuickLookup = useCallback(async () => {
    await performQuickLookup(quickSearch);
  }, [performQuickLookup, quickSearch]);

  const quickSuggestions = useMemo(() => {
    const query = quickSearch.trim().toLowerCase();

    const mapped = quickLookupAccounts.map((account) => ({
      ...account,
      Consumer_Name: [account.First_Name, account.Middle_Name, account.Last_Name].filter(Boolean).join(' ').trim(),
    }));

    const filtered = query
      ? mapped.filter((account) =>
          account.Account_Number?.toLowerCase().includes(query) ||
          account.Consumer_Name.toLowerCase().includes(query) ||
          account.Address?.toLowerCase().includes(query)
        )
      : mapped;

    return filtered.slice(0, 6);
  }, [quickLookupAccounts, quickSearch]);

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
      render: (value: string) => formatAccountNumberForDisplay(value, 'N/A'),
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
      filterType: 'select',
      filterLabel: 'Payment Method',
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
      filterType: 'select',
      filterLabel: 'Validation Status',
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
            <div className="quick-view-toolbar">
              <div className="quick-view-heading">
                <h2 className="card-title"><i className="fas fa-search-dollar"></i> Bill Quick Lookup</h2>
                <p className="quick-view-subtitle">Search an account to preview the latest bill, balance, and payable amount.</p>
              </div>
              <div className="quick-view-search-wrap" ref={quickLookupRef}>
                <div className="header-search quick-view-search">
                <input
                  type="text"
                  placeholder="Enter Account No. or Consumer Name..."
                  className="quick-search-input"
                  value={quickSearch}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  onFocus={() => setShowQuickSuggestions(true)}
                  onKeyDown={(e) => e.key === 'Enter' && handleQuickLookup()}
                />
                <button className="btn btn-primary btn-sm" onClick={handleQuickLookup}>Search</button>
                </div>
                {showQuickSuggestions && quickSuggestions.length > 0 && (
                  <div className="quick-search-suggestions">
                    {quickSuggestions.map((account) => (
                      <button
                        key={account.Consumer_ID}
                        type="button"
                        className="quick-search-suggestion"
                        onClick={() => performQuickLookup(account.Account_Number || account.Consumer_Name)}
                      >
                        <div className="quick-search-suggestion-main">
                          <strong>{formatAccountNumberForDisplay(account.Account_Number, 'No account number')}</strong>
                          <span>{account.Consumer_Name || 'Unnamed consumer'}</span>
                        </div>
                        <span className="quick-search-suggestion-address">{account.Address || 'No saved address'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
                  <button
                    className="btn btn-primary"
                    onClick={() => navigate(`/payments?account=${encodeURIComponent(quickSearch.trim())}`)}
                  >
                    <i className="fas fa-file-invoice"></i> View Full Bill & Pay
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-quick-view">
                <div className="empty-quick-view-icon">
                  <i className="fas fa-id-card"></i>
                </div>
                <div className="empty-quick-view-copy">
                  <h3>No account selected yet</h3>
                  <p>Search an account number or consumer name to preview the latest quick bill summary.</p>
                </div>
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
              <DataTable
                columns={columns}
                data={recentPayments}
                loading={loading}
                emptyMessage="No recent payment records found."
                enableFiltering
                filterPlaceholder="Search by receipt number, account, or consumer..."
              />
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
