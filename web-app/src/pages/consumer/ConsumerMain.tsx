import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import './ConsumerMain.css';

// ─── Types ─────────────────────────────────────────────────────────────────
interface ConsumerInfo {
  name: string;
  accountNo: string;
  connectionStatus: string;
}

interface Bill {
  Bill_ID: number;
  Bill_Date: string;
  Due_Date: string;
  Total_Amount: number;
  Status: 'Paid' | 'Unpaid';
}

interface Payment {
  Payment_ID: number;
  Payment_Date: string;
  Amount_Paid: number;
  Reference_Number: string;
  Bill_ID: number;
  // This comes from our new join in the backend
  Bill_Date?: string; 
  bills?: { Bill_Date: string };
}

interface Reading {
  Reading_Date: string;
  Consumption: number;
}

interface BarChartProps {
  readings: Reading[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────
const formatPeso = (v: number) =>
  `₱${(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

const shortMonth = (dateStr: string) => {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleString('default', { month: 'short', year: '2-digit' });
};

const fullMonth = (dateStr?: string) => {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleString('default', { month: 'long', year: 'numeric' });
};

// ─── Bar Chart ─────────────────────────────────────────────────────────────
const BarChart: React.FC<BarChartProps> = ({ readings }) => {
  if (!readings.length) return <p style={{ color: '#5f6368', fontSize: 13 }}>No reading data available.</p>;
  const max = Math.max(...readings.map(r => r.Consumption || 0));
  return (
    <div className="bar-chart">
      {readings.map((r, i) => (
        <div key={i} className="bar-col">
          <span className="bar-value">{r.Consumption}m³</span>
          <div className="bar-fill" style={{ height: max > 0 ? `${((r.Consumption || 0) / max) * 100}%` : '5%' }} />
          <span className="bar-label">{shortMonth(r.Reading_Date)}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────
const ConsumerMain: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [consumer, setConsumer] = useState<ConsumerInfo | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    const fetchDashboard = async () => {
      try {
        const res = await api.get(`/consumer-dashboard/${user.id}`);
        const { consumer: c, bills: b, payments: p, readings: r } = res.data;
        setConsumer({
          name: c.First_Name && c.Last_Name
            ? `${c.First_Name}${c.Middle_Name ? ' ' + c.Middle_Name : ''} ${c.Last_Name}`
            : user.fullName || 'Consumer',
          accountNo: `C-${String(c.Consumer_ID).padStart(4, '0')}`,
          connectionStatus: c.Status || 'Active',
        });
        setBills(b || []);
        setPayments(p || []);
        setReadings(r || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, [user]);

  // ── Bill calculations
  const currentBill = bills.find(b => b.Status === 'Unpaid') || null;
  const unpaidBills = bills.filter(b => b.Status === 'Unpaid');
  
  // The 'Balance' is all unpaid bills EXCEPT the current one
  const balanceBills = currentBill ? unpaidBills.filter(b => b.Bill_ID !== currentBill.Bill_ID) : unpaidBills;
  const unpaidBalance = balanceBills.reduce((s, b) => s + (b.Total_Amount || 0), 0);
  
  const totalDue = (currentBill?.Total_Amount || 0) + unpaidBalance;
  
  const dueDate = currentBill?.Due_Date
    ? new Date(currentBill.Due_Date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'N/A';

  const handleLogout = () => { logout(); navigate('/login'); };

  if (loading) return (
    <div className="cm-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#1a73e8' }}>
        <i className="fas fa-spinner fa-spin" style={{ fontSize: 40 }} />
        <p>Loading dashboard...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="cm-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#e53935' }}>
        <i className="fas fa-exclamation-circle" style={{ fontSize: 40 }} />
        <p>{error}</p>
      </div>
    </div>
  );

  return (
    <div className="cm-page">
      {/* ── Header ── */}
      {/* ── Header ── */}
      <div className="cm-header">
        <div className="cm-header-info">
          <h1 className="cm-name">{consumer?.name || user?.fullName}</h1>
          <div className="cm-dashboard-label">San Lorenzo Ruiz Water System</div>
          <div className="cm-meta">
            <span>
              <i className="fas fa-id-card" style={{ color: 'var(--primary-navy)' }} /> 
              Account No: <strong>{consumer?.accountNo}</strong>
            </span>
            <span className={`cm-status ${consumer?.connectionStatus === 'Active' ? 'active' : 'inactive'}`}>
              <i className="fas fa-circle" /> Connection Status: {consumer?.connectionStatus}
            </span>
          </div>
        </div>
        <button className="cm-logout-btn" onClick={handleLogout}>
          <i className="fas fa-sign-out-alt" /> Logout
        </button>
      </div>

      {/* ── 3 Cards ── */}
      <div className="cm-cards">
        {/* Current Bill */}
        <div className="cm-card">
          <div className="cm-card-label"><i className="fas fa-file-invoice-dollar" /> Current Bill</div>
          <div className="cm-card-amount">{currentBill ? formatPeso(currentBill.Total_Amount) : '₱0.00'}</div>
          <div className="cm-card-sub">
            {currentBill ? `Month of ${fullMonth(currentBill.Bill_Date)}` : 'No unpaid current bill'}
          </div>
        </div>

        {/* Balance */}
        <div className="cm-card">
          <div className="cm-card-label">
            <i className="fas fa-balance-scale" style={{ color: unpaidBalance > 0 ? '#ef4444' : '#12b981' }} /> 
            Balance
          </div>
          <div className={`cm-card-amount ${unpaidBalance > 0 ? 'red' : 'green'}`}>
            {formatPeso(unpaidBalance)}
          </div>
          <div className="cm-card-sub">
            {balanceBills.length > 0
              ? balanceBills.map(b => (
                  <div key={b.Bill_ID} className="balance-row unpaid">
                    <span>{shortMonth(b.Bill_Date)}</span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span className="balance-amt">{formatPeso(b.Total_Amount)}</span>
                      <span className="balance-tag">Unpaid</span>
                    </div>
                  </div>
                ))
              : <div className="balance-row paid">
                  <span style={{ color: '#12b981' }}>Account up to date</span>
                  <span className="balance-tag">Paid</span>
                </div>
            }
            <div className="balance-overall">Overall Status: <strong>{unpaidBalance > 0 ? 'Unpaid' : 'Fully Paid'}</strong></div>
          </div>
        </div>

        {/* Total Bill - Highlight Component */}
        <div className="cm-card cm-card-highlight">
          <div className="cm-card-label"><i className="fas fa-receipt" /> Total Amount Due</div>
          <div className="cm-card-amount total">{formatPeso(totalDue)}</div>
          <div className="cm-card-sub">
            <div className="total-formula">
              <span>Current + Balance</span>
              <span>{formatPeso(currentBill?.Total_Amount || 0)} + {formatPeso(unpaidBalance)}</span>
            </div>
            <div className="total-due-date">
              <i className="fas fa-calendar-alt" /> Due Date: <strong>{dueDate}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="cm-section">
        <div className="cm-section-title"><i className="fas fa-chart-bar" /> Monthly Water Consumption (m³)</div>
        <BarChart readings={readings} />
      </div>

      {/* ── Payments ── */}
      <div className="cm-section">
        <div className="cm-section-title"><i className="fas fa-check-circle" /> Successful Payments</div>
        {payments.length === 0
          ? <p style={{ color: '#5f6368', fontSize: 13 }}>No payment records yet.</p>
          : (
            <div className="cm-table-wrapper">
              <table className="cm-table">
                <thead>
                  <tr>
                    <th>Date Paid</th>
                    <th>Billing Month</th>
                    <th>Amount Paid</th>
                    <th>Ref Number</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => {
                    const billingDate = p.bills?.Bill_Date || p.Bill_Date;
                    return (
                      <tr key={p.Payment_ID}>
                        <td>{new Date(p.Payment_Date).toLocaleDateString('en-PH')}</td>
                        <td>{fullMonth(billingDate)}</td>
                        <td>{formatPeso(p.Amount_Paid)}</td>
                        <td><span className="ref-badge">{p.Reference_Number || 'N/A'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  );
};

export default ConsumerMain;
