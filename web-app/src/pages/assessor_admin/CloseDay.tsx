import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import { useToast } from '../../components/Common/ToastContainer';
import './CloseDay.css';

interface Transaction {
  orNumber: string;
  time: string;
  cashier: string;
  accountNumber: string;
  consumer: string;
  amount: number;
  notes: string;
}

const CloseDay: React.FC = () => {
  const { showToast } = useToast();
  const [currentDate, setCurrentDate] = useState('');
  const [systemTotal, setSystemTotal] = useState(38560.0);
  const [cashOnHand, setCashOnHand] = useState(38560.0);
  const [discrepancy, setDiscrepancy] = useState(0.0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const mockTransactions: Transaction[] = [
        {
          orNumber: 'OR-2026-001',
          time: '09:15 AM',
          cashier: 'Cashier 1',
          accountNumber: 'ACC-001',
          consumer: 'Juan Dela Cruz',
          amount: 850.0,
          notes: 'March 2026 billing',
        },
        {
          orNumber: 'OR-2026-002',
          time: '10:30 AM',
          cashier: 'Cashier 1',
          accountNumber: 'ACC-002',
          consumer: 'Maria Santos',
          amount: 920.0,
          notes: 'March 2026 billing',
        },
      ];
      setTransactions(mockTransactions);
    } catch (error) {
      console.error('Error loading transactions:', error);
      showToast('Failed to load transactions', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    setCurrentDate(today);
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    const diff = systemTotal - cashOnHand;
    setDiscrepancy(diff);
  }, [systemTotal, cashOnHand]);

  const handleLockDay = async () => {
    if (discrepancy !== 0) {
      if (
        !window.confirm(
          `There is a discrepancy of ₱${Math.abs(discrepancy || 0).toFixed(
            2
          )}. Are you sure you want to lock the day?`
        )
      ) {
        return;
      }
    }

    if (!window.confirm('Are you sure you want to lock the day? This action cannot be undone.')) {
      return;
    }

    try {
      showToast('Locking day...', 'info');
      setTimeout(() => {
        showToast('Day locked successfully', 'success');
      }, 1500);
    } catch (error) {
      console.error('Error locking day:', error);
      showToast('Failed to lock day', 'error');
    }
  };

  const getDiscrepancyColor = () => {
    if (discrepancy === 0) return '#28a745';
    return '#dc3545';
  };

  const getDiscrepancyStatus = () => {
    if (discrepancy === 0) return '(Balanced)';
    if (discrepancy > 0) return '(Over)';
    return '(Short)';
  };

  return (
    <MainLayout title="Financial Reconciliation">
      <div className="closeday-page">
        <div className="closeday-card">
          <div className="closeday-icon">
            <i className="fas fa-calendar-check"></i>
          </div>
          <h2 className="closeday-title">Finalize Daily Collections</h2>
          <p className="closeday-desc">
            You are about to close the financial records for <strong>{currentDate}</strong>. 
            Ensure all physical cash on hand matches the system totals before locking. 
            Once locked, transactions for this period can no longer be modified.
          </p>

          <div className="summary-stats">
            <div className="stat-box">
              <span className="stat-label">System Ledger</span>
              <span className="stat-value">₱{systemTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Reported Cash</span>
              <span className="stat-value">₱{cashOnHand.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="stat-box" style={{ borderLeft: `4px solid ${getDiscrepancyColor()}` }}>
              <span className="stat-label">Variance {getDiscrepancyStatus()}</span>
              <span className="stat-value" style={{ color: getDiscrepancyColor() }}>
                ₱{Math.abs(discrepancy).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="closeday-actions">
            <button className="btn btn-secondary" onClick={loadTransactions}>
              <i className="fas fa-list-ul"></i> Review Audit Trail
            </button>
            <button 
              className="btn btn-primary" 
              onClick={handleLockDay}
              disabled={loading}
            >
              <i className="fas fa-lock"></i> Authorize & Lock Day
            </button>
          </div>
        </div>

        {/* Audit Trail Table Section */}
        <div className="card" style={{ marginTop: '20px' }}>
          <div className="card-header">
            <h2 className="card-title">Detailed Transaction Audit Trail</h2>
          </div>
          <div className="card-body">
            <DataTable
              columns={[
                { key: 'orNumber', label: 'OR Number' },
                { key: 'time', label: 'Timestamp' },
                { key: 'accountNumber', label: 'Account' },
                { key: 'consumer', label: 'Consumer' },
                { key: 'amount', label: 'Amount (₱)', render: (v: number) => `₱${v.toFixed(2)}` },
                { key: 'notes', label: 'Reference' }
              ]}
              data={transactions}
              loading={loading}
              emptyMessage="No transactions recorded for this period."
            />
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default CloseDay;
