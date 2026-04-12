import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import FormInput from '../../components/Common/FormInput';
import { useToast } from '../../components/Common/ToastContainer';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage, requestJson } from '../../services/userManagementApi';
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
  const { user } = useAuth();
  const { showToast } = useToast();
  const [currentDate, setCurrentDate] = useState('');
  const [systemTotal, setSystemTotal] = useState(0);
  const [cashOnHand, setCashOnHand] = useState(0);
  const [discrepancy, setDiscrepancy] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const result = await requestJson<any>(`/admin/close-day-summary?date=${todayIso}`, {}, 'Failed to load close-day summary.');

      setCurrentDate(new Date(result.data?.date || todayIso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }));
      setSystemTotal(Number(result.data?.systemTotal || 0));
      setCashOnHand(Number(result.data?.cashOnHand || 0));
      setTransactions(result.data?.transactions || []);
    } catch (error) {
      console.error('Error loading transactions:', error);
      showToast(getErrorMessage(error, 'Failed to load transactions.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    setDiscrepancy(Number((systemTotal - cashOnHand).toFixed(2)));
  }, [systemTotal, cashOnHand]);

  const handleLockDay = async () => {
    if (discrepancy !== 0) {
      if (!window.confirm(`There is a discrepancy of PHP ${Math.abs(discrepancy || 0).toFixed(2)}. Are you sure you want to lock the day?`)) {
        return;
      }
    }

    if (!window.confirm('Are you sure you want to lock the day? This action cannot be undone.')) {
      return;
    }

    try {
      showToast('Locking day...', 'info');
      await requestJson(
        '/admin/close-day',
        {
          method: 'POST',
          body: JSON.stringify({
          date: new Date().toISOString().slice(0, 10),
          cashOnHand,
          systemTotal,
          userId: Number(user?.id || 1),
          }),
        },
        'Failed to lock day.'
      );
      showToast('Day locked successfully', 'success');
      loadTransactions();
    } catch (error) {
      console.error('Error locking day:', error);
      showToast(getErrorMessage(error, 'Failed to lock day.'), 'error');
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
            Once locked, a closing audit entry will be recorded.
          </p>

          <div className="summary-stats">
            <div className="stat-box">
              <span className="stat-label">System Ledger</span>
              <span className="stat-value">PHP {systemTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Reported Cash</span>
              <span className="stat-value">PHP {cashOnHand.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="stat-box" style={{ borderLeft: `4px solid ${getDiscrepancyColor()}` }}>
              <span className="stat-label">Variance {getDiscrepancyStatus()}</span>
              <span className="stat-value" style={{ color: getDiscrepancyColor() }}>
                PHP {Math.abs(discrepancy).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div style={{ maxWidth: '320px', margin: '0 auto 24px' }}>
            <FormInput
              label="Reported Cash on Hand"
              type="number"
              value={String(cashOnHand)}
              onChange={(value) => setCashOnHand(Number(value || 0))}
              icon="fa-money-bill-wave"
            />
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
                { key: 'amount', label: 'Amount (PHP)', render: (v: number) => `PHP ${v.toFixed(2)}` },
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
