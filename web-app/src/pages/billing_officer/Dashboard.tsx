import React, { useState, useEffect, useCallback } from 'react';
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
      render: (val: number) => `₱${(val || 0).toFixed(2)}`,
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
      render: (_: any, payment: PendingPayment) => (
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
    <MainLayout title="Billing & Collections Validation">
      <div className="billing-dashboard-page">
        {/* Real-time Status Metrics */}
        <div className="dashboard-cards">
          <div className="card card-highlight-gold">
            <div className="card-header">
              <h2 className="card-title">Pending Validation</h2>
              <i className="fas fa-clipboard-check"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{pendingValidation}</div>
              <div className="card-label">Payments from Treasurer</div>
            </div>
          </div>
          <div className="card card-highlight-green">
            <div className="card-header">
              <h2 className="card-title">Validated Today</h2>
              <i className="fas fa-check-circle"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{validatedToday}</div>
              <div className="card-label">Successfully processed</div>
            </div>
          </div>
          <div className="card card-highlight-blue">
            <div className="card-header">
              <h2 className="card-title">Meter Syncs</h2>
              <i className="fas fa-sync"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{receiptsSynced}</div>
              <div className="card-label">Mobile reader uploads</div>
            </div>
          </div>
          <div className="card card-highlight-red">
            <div className="card-header">
              <h2 className="card-title">Exceptions</h2>
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{exceptions}</div>
              <div className="card-label">Requires audit review</div>
            </div>
          </div>
        </div>

        {/* Validation Queue Table */}
        <div className="queue-card">
          <div className="queue-header">
            <h2 className="queue-title">
              <i className="fas fa-stream"></i> Payment Validation Queue
            </h2>
            <div className="badge-container">
                <span className="badge badge-warning" style={{ color: '#f59e0b', background: '#fffbeb', padding: '6px 12px', borderRadius: '12px', fontWeight: '800', fontSize: '12px' }}>
                    {pendingValidation} REMAINING
                </span>
            </div>
          </div>
          
          <div className="info-box">
            <i className="fas fa-shield-alt"></i>
            <strong>Security Protocol:</strong> These are manual OR payments recorded by the Treasurer. Validate below to finalize the billing update and notify the consumer via mobile.
          </div>

          <div className="card-body">
            <div style={{ padding: '24px' }}>
                <button className="refresh-btn" style={{ margin: '0 0 20px 0' }} onClick={loadPendingPayments}>
                    <i className="fas fa-sync-alt"></i> Refresh Data
                </button>
                <DataTable columns={columns} data={payments} loading={loading} />
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Dashboard;
