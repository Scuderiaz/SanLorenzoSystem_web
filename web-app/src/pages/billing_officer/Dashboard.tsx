import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable, { Column } from '../../components/Common/DataTable';
import { useToast } from '../../components/Common/ToastContainer';
import {
  getErrorMessage,
  loadBillsWithFallback,
  loadPaymentsWithFallback,
  loadPendingApplicationsWithFallback,
} from '../../services/userManagementApi';
import './Dashboard.css';

interface PendingApplication {
  Ticket_Number: string;
  Consumer_Name: string | null;
  Username: string;
  Application_Date: string;
  Account_ID: number;
  Classification_Name: string | null;
}

interface BillRow {
  Bill_ID: number;
  Consumer_Name: string | null;
  Account_Number: string | null;
  Total_Amount: number;
  Status: string;
  Due_Date: string | null;
  Billing_Month: string | null;
}

interface PaymentRow {
  Payment_ID: number;
  Consumer_Name: string | null;
  Amount_Paid: number;
  Payment_Date: string | null;
  Payment_Method: string | null;
  Reference_No: string | null;
  Status: string;
}

interface WorkItem {
  type: 'Application' | 'Payment' | 'Bill';
  reference: string;
  consumer: string;
  detail: string;
  amount: number | null;
  date: string | null;
  status: string;
  route: string;
}

const formatAmount = (value: number | null | undefined) => `P${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString();
};

const getTicketTimestamp = (ticketNumber: string | null | undefined) => {
  if (!ticketNumber) return null;

  const match = String(ticketNumber).match(/^REG-(\d{14})-/i);
  if (!match) return null;

  const raw = match[1];
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6)) - 1;
  const day = Number(raw.slice(6, 8));
  const hour = Number(raw.slice(8, 10));
  const minute = Number(raw.slice(10, 12));
  const second = Number(raw.slice(12, 14));

  const date = new Date(year, month, day, hour, minute, second);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getApplicationQueueDate = (ticketNumber: string | null | undefined, fallbackDate: string | null | undefined) => {
  const ticketDate = getTicketTimestamp(ticketNumber);
  return ticketDate ? ticketDate.toISOString() : (fallbackDate || null);
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [applications, setApplications] = useState<PendingApplication[]>([]);
  const [bills, setBills] = useState<BillRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [applicationsResult, billsResult, paymentsResult] = await Promise.all([
        loadPendingApplicationsWithFallback(),
        loadBillsWithFallback(),
        loadPaymentsWithFallback(),
      ]);

      setApplications(applicationsResult.data || []);
      setBills(billsResult.data || []);
      setPayments(paymentsResult.data || []);

      if ([applicationsResult.source, billsResult.source, paymentsResult.source].includes('supabase')) {
        showToast('Dashboard loaded using Supabase fallback for part of the data.', 'warning');
      }
    } catch (error) {
      console.error('Error loading billing dashboard:', error);
      showToast(getErrorMessage(error, 'Failed to load billing dashboard data.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const pendingPaymentValidation = useMemo(
    () => payments.filter((payment) => String(payment.Status || '').toLowerCase() === 'pending'),
    [payments]
  );

  const unpaidBills = useMemo(
    () => bills.filter((bill) => ['unpaid', 'partially paid', 'overdue'].includes(String(bill.Status || '').toLowerCase())),
    [bills]
  );

  const overdueBills = useMemo(() => {
    const now = new Date();
    return bills.filter((bill) => {
      const status = String(bill.Status || '').toLowerCase();
      if (status === 'overdue') return true;
      if (status === 'paid' || !bill.Due_Date) return false;
      const dueDate = new Date(bill.Due_Date);
      return !Number.isNaN(dueDate.getTime()) && dueDate < now;
    });
  }, [bills]);

  const totalUnpaidBalance = useMemo(
    () => unpaidBills.reduce((sum, bill) => sum + Number(bill.Total_Amount || 0), 0),
    [unpaidBills]
  );

  const workQueue = useMemo<WorkItem[]>(() => {
    const applicationItems = applications.map((application) => ({
      type: 'Application' as const,
      reference: application.Ticket_Number,
      consumer: application.Consumer_Name || application.Username || 'Pending Applicant',
      detail: application.Classification_Name || 'For review',
      amount: null,
      date: getApplicationQueueDate(application.Ticket_Number, application.Application_Date),
      status: 'Pending',
      route: '/applications',
    }));

    const paymentItems = pendingPaymentValidation.map((payment) => ({
      type: 'Payment' as const,
      reference: payment.Reference_No || `PAY-${payment.Payment_ID}`,
      consumer: payment.Consumer_Name || 'Unknown Consumer',
      detail: payment.Payment_Method || 'Manual entry',
      amount: Number(payment.Amount_Paid || 0),
      date: payment.Payment_Date,
      status: payment.Status || 'Pending',
      route: '/ledger',
    }));

    const overdueItems = overdueBills.map((bill) => ({
      type: 'Bill' as const,
      reference: bill.Account_Number || `BILL-${bill.Bill_ID}`,
      consumer: bill.Consumer_Name || 'Unknown Consumer',
      detail: bill.Billing_Month || 'Outstanding bill',
      amount: Number(bill.Total_Amount || 0),
      date: bill.Due_Date,
      status: bill.Status || 'Overdue',
      route: '/generate-bills',
    }));

    return [...applicationItems, ...paymentItems, ...overdueItems]
      .sort((a, b) => {
        const aTime = a.date ? new Date(a.date).getTime() : 0;
        const bTime = b.date ? new Date(b.date).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 10);
  }, [applications, pendingPaymentValidation, overdueBills]);

  const queueColumns: Column[] = [
    { key: 'type', label: 'Queue', sortable: true, filterType: 'select', filterLabel: 'Queue' },
    { key: 'reference', label: 'Reference', sortable: true },
    { key: 'consumer', label: 'Consumer', sortable: true },
    { key: 'detail', label: 'Details', sortable: true },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      render: (value: number | null) => (value ? formatAmount(value) : 'N/A'),
    },
    {
      key: 'date',
      label: 'Date',
      sortable: true,
      render: (value: string | null) => formatDate(value),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      filterType: 'select',
      filterLabel: 'Status',
      render: (value: string) => <span className={`status-pill status-${String(value || 'unknown').toLowerCase().replace(/\s+/g, '-')}`}>{value}</span>,
    },
    {
      key: 'action',
      label: 'Action',
      render: (_: unknown, row: WorkItem) => (
        <button className="btn btn-sm dashboard-link-btn" onClick={() => navigate(row.route)}>
          Open
        </button>
      ),
    },
  ];

  return (
    <MainLayout title="Billing Operations Dashboard">
      <div className="billing-dashboard-page">
        <div className="dashboard-cards">
          <div className="card card-highlight-gold">
            <div className="card-header">
              <h2 className="card-title">Pending Applications</h2>
              <i className="fas fa-file-signature"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{applications.length}</div>
              <div className="card-label">Registrations waiting for billing review</div>
            </div>
          </div>

          <div className="card card-highlight-red">
            <div className="card-header">
              <h2 className="card-title">Overdue Bills</h2>
              <i className="fas fa-exclamation-circle"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{overdueBills.length}</div>
              <div className="card-label">Accounts needing urgent follow-up</div>
            </div>
          </div>

          <div className="card card-highlight-blue">
            <div className="card-header">
              <h2 className="card-title">Pending Payments</h2>
              <i className="fas fa-receipt"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{pendingPaymentValidation.length}</div>
              <div className="card-label">Collections awaiting validation</div>
            </div>
          </div>

          <div className="card card-highlight-green">
            <div className="card-header">
              <h2 className="card-title">Open Bill Balance</h2>
              <i className="fas fa-wallet"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{formatAmount(totalUnpaidBalance)}</div>
              <div className="card-label">{unpaidBills.length} unpaid or partially paid bills</div>
            </div>
          </div>
        </div>

        <div className="queue-card">
          <div className="queue-header">
            <h2 className="queue-title">
              <i className="fas fa-list-check"></i> Priority Work Queue
            </h2>
            <div className="badge-container">
              <span className="badge badge-warning queue-badge">
                {workQueue.length} ACTIVE ITEMS
              </span>
            </div>
          </div>

          <div className="dashboard-action-strip">
            <button className="btn btn-primary" onClick={() => navigate('/applications')}>
              <i className="fas fa-file-signature"></i> Review Applications
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/generate-bills')}>
              <i className="fas fa-file-invoice-dollar"></i> Open Bills
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/ledger')}>
              <i className="fas fa-book"></i> View Ledger
            </button>
            <button className="refresh-btn dashboard-refresh-btn" onClick={loadDashboard}>
              <i className="fas fa-sync-alt"></i> Refresh Dashboard
            </button>
          </div>

          <div className="card-body">
            <div className="dashboard-table-wrap">
              <DataTable
                columns={queueColumns}
                data={workQueue}
                loading={loading}
                emptyMessage="No priority items at the moment."
                enableFiltering
                filterPlaceholder="Search by reference, consumer, or details..."
              />
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Dashboard;
