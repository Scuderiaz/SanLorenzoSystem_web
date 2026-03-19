import React, { useState, useEffect } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import { useToast } from '../../components/Common/ToastContainer';
import './Dashboard.css';

interface PendingPayment {
  accountNumber: string;
  consumerName: string;
  amount: number;
  paymentDate: string;
  method: string;
  reference: string;
}

const Dashboard: React.FC = () => {
  const { showToast } = useToast();
  const [pendingValidation, setPendingValidation] = useState(5);
  const [validatedToday, setValidatedToday] = useState(68);
  const [receiptsSynced, setReceiptsSynced] = useState(120);
  const [exceptions, setExceptions] = useState(3);
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(false);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  useEffect(() => {
    loadPendingPayments();
  }, []);

  const loadPendingPayments = async () => {
    setLoading(true);
    try {
      const mockPayments: PendingPayment[] = [
        {
          accountNumber: 'ACC-001',
          consumerName: 'Juan Dela Cruz',
          amount: 850.0,
          paymentDate: '2026-03-18',
          method: 'Cash',
          reference: 'OR-2026-001',
        },
        {
          accountNumber: 'ACC-002',
          consumerName: 'Maria Santos',
          amount: 920.0,
          paymentDate: '2026-03-18',
          method: 'Cash',
          reference: 'OR-2026-002',
        },
      ];
      setPayments(mockPayments);
    } catch (error) {
      console.error('Error loading pending payments:', error);
      showToast('Failed to load pending payments', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleValidatePayment = async (payment: PendingPayment) => {
    if (
      !window.confirm(
        `Validate payment with Manual OR #${payment.reference}?\n\nThis will:\n✓ Mark payment as validated\n✓ Update consumer mobile app\n✓ Update billing records`
      )
    ) {
      return;
    }

    try {
      showToast('Payment validated successfully!', 'success');
      loadPendingPayments();
      setPendingValidation(pendingValidation - 1);
      setValidatedToday(validatedToday + 1);
    } catch (error) {
      console.error('Error validating payment:', error);
      showToast('Failed to validate payment', 'error');
    }
  };

  const handleRejectPayment = async (payment: PendingPayment) => {
    if (!window.confirm(`Reject payment ${payment.reference}?`)) {
      return;
    }

    try {
      showToast('Payment rejected', 'info');
      loadPendingPayments();
      setPendingValidation(pendingValidation - 1);
    } catch (error) {
      console.error('Error rejecting payment:', error);
      showToast('Failed to reject payment', 'error');
    }
  };

  const columns = [
    {
      key: 'accountNumber',
      label: 'Account No.',
      sortable: true,
    },
    {
      key: 'consumerName',
      label: 'Consumer Name',
      sortable: true,
    },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      render: (payment: PendingPayment) => `₱${(payment.amount || 0).toFixed(2)}`,
    },
    {
      key: 'paymentDate',
      label: 'Payment Date',
      sortable: true,
    },
    {
      key: 'method',
      label: 'Method',
      sortable: true,
    },
    {
      key: 'reference',
      label: 'Reference',
      sortable: true,
    },
    {
      key: 'actions',
      label: 'Action',
      render: (payment: PendingPayment) => (
        <div className="action-buttons">
          <button
            className="btn btn-sm validate-btn"
            onClick={() => handleValidatePayment(payment)}
          >
            <i className="fas fa-check"></i> Validate
          </button>
          <button
            className="btn btn-sm reject-btn"
            onClick={() => handleRejectPayment(payment)}
          >
            <i className="fas fa-times"></i> Reject
          </button>
        </div>
      ),
    },
  ];

  return (
    <MainLayout title="Billing Officer - Payment Validation">
      <div className="billing-dashboard-page">
        <div className="dashboard-cards">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Pending Validation</h2>
              <i className="fas fa-clipboard-check"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{pendingValidation}</div>
              <div className="card-label">Payments awaiting validation</div>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Validated Today</h2>
              <i className="fas fa-check-circle"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{validatedToday}</div>
              <div className="card-label">Payments validated</div>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Receipts Synced</h2>
              <i className="fas fa-sync"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{receiptsSynced}</div>
              <div className="card-label">From meter readers</div>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Exceptions</h2>
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{exceptions}</div>
              <div className="card-label">Require attention</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <i className="fas fa-clipboard-check"></i> Payment Validation Queue (From Treasurer)
            </h2>
            <span className="badge badge-warning">{pendingValidation} Pending</span>
          </div>
          <div className="info-box">
            <strong>
              <i className="fas fa-info-circle"></i> Note:
            </strong>{' '}
            These payments were recorded by Treasurer with manual OR. Click [Validate] to approve and
            update consumer mobile app.
          </div>
          <div className="card-body">
            <button className="btn refresh-btn" onClick={loadPendingPayments}>
              <i className="fas fa-sync-alt"></i> Refresh
            </button>
            <DataTable columns={columns} data={payments} loading={loading} />
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Dashboard;
