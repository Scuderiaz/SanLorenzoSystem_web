import React, { useState, useEffect } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
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

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    setCurrentDate(today);
    loadTransactions();
  }, []);

  useEffect(() => {
    const diff = systemTotal - cashOnHand;
    setDiscrepancy(diff);
  }, [systemTotal, cashOnHand]);

  const loadTransactions = async () => {
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
  };

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
    <MainLayout title="Close Day Operations">
      <div className="close-day-page">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Date: {currentDate}</h2>
          </div>
        </div>

        <div className="dashboard-cards">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">System Total</h2>
              <i className="fas fa-check-circle"></i>
            </div>
            <div className="card-body">
              <div className="card-value">₱{systemTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="card-label">Auto-verified payments</div>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Cash on Hand</h2>
              <i className="fas fa-hand-holding-usd"></i>
            </div>
            <div className="card-body">
              <div className="card-value">₱{cashOnHand.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div className="card-label">Physical cash reported</div>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Discrepancy</h2>
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <div className="card-body">
              <div className="card-value" style={{ color: getDiscrepancyColor() }}>
                ₱{Math.abs(discrepancy).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="card-label">Auto-calculated {getDiscrepancyStatus()}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Today's Transactions</h2>
          </div>
          <div className="card-body">
            <table className="data-table">
              <thead>
                <tr>
                  <th>OR No.</th>
                  <th>Time</th>
                  <th>Cashier</th>
                  <th>Account No.</th>
                  <th>Consumer</th>
                  <th>Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '20px' }}>
                      <i className="fas fa-spinner fa-spin"></i> Loading transactions...
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '20px' }}>
                      No transactions for today
                    </td>
                  </tr>
                ) : (
                  transactions.map((transaction, index) => (
                    <tr key={index}>
                      <td>{transaction.orNumber}</td>
                      <td>{transaction.time}</td>
                      <td>{transaction.cashier}</td>
                      <td>{transaction.accountNumber}</td>
                      <td>{transaction.consumer}</td>
                      <td>₱{transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td>{transaction.notes}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <p>
              <strong>Review the totals above.</strong> If everything is correct, lock the day to
              prevent any further edits to today's transactions.
            </p>
            <div className="form-actions">
              <button className="btn btn-primary" onClick={handleLockDay} style={{ width: '200px' }}>
                <i className="fas fa-lock"></i> Lock Day
              </button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default CloseDay;
