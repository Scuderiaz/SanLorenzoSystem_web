import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import { useToast } from '../../components/Common/ToastContainer';
import './Dashboard.css';

interface RecentPayment {
  Receipt_No: string;
  Account_Number: string;
  Consumer_Name: string;
  Amount: number;
  Payment_Method: string;
  Date_Time: string;
  Validation_Status: string;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [todaysCollections, setTodaysCollections] = useState(24850);
  const [paymentsToday, setPaymentsToday] = useState(68);
  const [pendingValidation, setPendingValidation] = useState(5);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [loading, setLoading] = useState(false);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  useEffect(() => {
    loadRecentPayments();
  }, []);

  const loadRecentPayments = async () => {
    setLoading(true);
    try {
      const mockPayments: RecentPayment[] = [
        {
          Receipt_No: 'OR-2026-001',
          Account_Number: 'ACC-001',
          Consumer_Name: 'Juan Dela Cruz',
          Amount: 850.0,
          Payment_Method: 'Cash',
          Date_Time: '2026-03-18 09:15 AM',
          Validation_Status: 'Pending',
        },
        {
          Receipt_No: 'OR-2026-002',
          Account_Number: 'ACC-002',
          Consumer_Name: 'Maria Santos',
          Amount: 920.0,
          Payment_Method: 'Cash',
          Date_Time: '2026-03-18 10:30 AM',
          Validation_Status: 'Validated',
        },
      ];
      setRecentPayments(mockPayments);
    } catch (error) {
      console.error('Error loading recent payments:', error);
      showToast('Failed to load recent payments', 'error');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
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
      render: (val: number) => `₱${(val || 0).toFixed(2)}`,
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
  ];

  return (
    <MainLayout title="Collections & Disbursement Control">
      <div className="treasurer-dashboard-page">
        {/* Real-time Financial Metrics */}
        <div className="dashboard-cards">
          <div className="card card-highlight-green">
            <div className="card-header">
              <h2 className="card-title">Today's Collections</h2>
              <i className="fas fa-money-bill-wave"></i>
            </div>
            <div className="card-body">
              <div className="card-value">₱{todaysCollections.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
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

        {/* Recent Activity Table */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Internal Audit: Recent Payments</h2>
            <button className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '700' }}>
                <i className="fas fa-external-link-alt"></i> Detailed Report
            </button>
          </div>
          <div className="card-body">
            <div style={{ padding: '24px' }}>
                <DataTable columns={columns} data={recentPayments} loading={loading} />
            </div>
          </div>
        </div>

        {/* Quick Action Payment Hub */}
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
