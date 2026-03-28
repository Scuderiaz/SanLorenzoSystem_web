import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import Tabs, { Tab } from '../../components/Common/Tabs';
import DataTable from '../../components/Common/DataTable';
import { useToast } from '../../components/Common/ToastContainer';
import './VerifyPayment.css';

interface PendingPayment {
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

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const mockPending: PendingPayment[] = [
        {
          OR_No: 'OR-2026-001',
          Account_Number: 'ACC-001',
          Consumer_Name: 'Juan Dela Cruz',
          Payment_Date: '2026-03-18',
          Amount: 850.0,
          Entered_By: 'Treasurer',
          Status: 'Pending',
        },
      ];

      const mockVerified: PendingPayment[] = [
        {
          OR_No: 'OR-2026-002',
          Account_Number: 'ACC-002',
          Consumer_Name: 'Maria Santos',
          Payment_Date: '2026-03-17',
          Amount: 920.0,
          Entered_By: 'Treasurer',
          Status: 'Verified',
        },
      ];

      setPendingPayments(mockPending);
      setVerifiedPayments(mockVerified);
      setRejectedPayments([]);
    } catch (error) {
      console.error('Error loading payments:', error);
      showToast('Failed to load payments', 'error');
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
      showToast('Payment verified successfully', 'success');
      loadPayments();
    } catch (error) {
      console.error('Error verifying payment:', error);
      showToast('Failed to verify payment', 'error');
    }
  };

  const handleRejectPayment = async (payment: PendingPayment) => {
    if (!window.confirm(`Reject payment ${payment.OR_No}?`)) return;

    try {
      showToast('Payment rejected', 'info');
      loadPayments();
    } catch (error) {
      console.error('Error rejecting payment:', error);
      showToast('Failed to reject payment', 'error');
    }
  };

  const pendingColumns = [
    {
      key: 'OR_No',
      label: 'OR No.',
      sortable: true,
    },
    {
      key: 'Account_Number',
      label: 'Account No.',
      sortable: true,
    },
    {
      key: 'Consumer_Name',
      label: 'Consumer',
      sortable: true,
    },
    {
      key: 'Payment_Date',
      label: 'Date',
      sortable: true,
    },
    {
      key: 'Amount',
      label: 'Amount',
      sortable: true,
      render: (val: number) => `₱${(val || 0).toFixed(2)}`,
    },
    {
      key: 'Entered_By',
      label: 'Entered By',
      sortable: true,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_: any, payment: PendingPayment) => (
        <div className="action-buttons">
          <button
            className="btn btn-sm btn-success"
            onClick={() => handleVerifyPayment(payment)}
          >
            <i className="fas fa-check"></i> Verify
          </button>
          <button
            className="btn btn-sm btn-danger"
            onClick={() => handleRejectPayment(payment)}
          >
            <i className="fas fa-times"></i> Reject
          </button>
        </div>
      ),
    },
  ];

  const verifiedColumns = [
    {
      key: 'OR_No',
      label: 'OR No.',
      sortable: true,
    },
    {
      key: 'Account_Number',
      label: 'Account No.',
      sortable: true,
    },
    {
      key: 'Consumer_Name',
      label: 'Consumer',
      sortable: true,
    },
    {
      key: 'Payment_Date',
      label: 'Date',
      sortable: true,
    },
    {
      key: 'Amount',
      label: 'Amount',
      sortable: true,
      render: (val: number) => `₱${(val || 0).toFixed(2)}`,
    },
    {
      key: 'Entered_By',
      label: 'Entered By',
      sortable: true,
    },
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
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
              <span style={{ color: '#94a3b8', fontWeight: '800' }}>→</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
              <button className="btn btn-secondary" style={{ padding: '10px 20px', borderRadius: '12px' }}>
                  <i className="fas fa-filter"></i> Apply
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '20px' }}>
              <h2 className="card-title">Pending Collections Audit Queue</h2>
              <span className="badge">{pendingPayments.length} Entries pending</span>
            </div>
            <div className="card-body">
                <div style={{ padding: '24px' }}>
                    <DataTable columns={pendingColumns} data={pendingPayments} loading={loading} />
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
                  <DataTable columns={verifiedColumns} data={verifiedPayments} loading={loading} />
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
                  <DataTable columns={verifiedColumns} data={rejectedPayments} loading={loading} />
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
