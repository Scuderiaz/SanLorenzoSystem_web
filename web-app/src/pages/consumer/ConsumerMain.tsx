import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage, loadConsumerDashboardWithFallback } from '../../services/userManagementApi';
import { getUserInitials } from '../../utils/profileImage';
import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './ConsumerMain.css';

interface ConsumerInfo {
  Consumer_ID: number;
  First_Name?: string | null;
  first_name?: string | null;
  Middle_Name?: string | null;
  middle_name?: string | null;
  Last_Name?: string | null;
  last_name?: string | null;
  Username?: string | null;
  username?: string | null;
  Profile_Picture_URL?: string | null;
  profile_picture_url?: string | null;
  Address?: string | null;
  address?: string | null;
  Purok?: string | null;
  purok?: string | null;
  Barangay?: string | null;
  barangay?: string | null;
  Municipality?: string | null;
  municipality?: string | null;
  Zip_Code?: string | null;
  zip_code?: string | null;
  Account_Number?: string | null;
  account_number?: string | null;
  Status?: string | null;
  status?: string | null;
  Account_Status?: string | null;
  account_status?: string | null;
  Meter_Number?: string | null;
  meter_number?: string | null;
  Meter_Status?: string | null;
  meter_status?: string | null;
  Zone_Name?: string | null;
  zone_name?: string | null;
  Classification_Name?: string | null;
  classification_name?: string | null;
  Connection_Date?: string | null;
  connection_date?: string | null;
}

interface Bill {
  Bill_ID: number;
  Bill_Date: string;
  Due_Date: string;
  Total_Amount: number;
  Amount_Due?: number;
  Total_After_Due_Date?: number;
  Billing_Month?: string | null;
  Status: 'Paid' | 'Unpaid';
}

interface Payment {
  Payment_ID: number;
  Payment_Date: string;
  Amount_Paid: number;
  Reference_Number: string;
  Bill_ID: number;
  Bill_Amount?: number | null;
  Billing_Month?: string | null;
  Bill_Date?: string;
  Due_Date?: string;
  bills?: { Bill_Date: string };
}

interface Reading {
  Reading_Date: string;
  Consumption: number;
}

interface ConsumptionChartProps {
  readings: Reading[];
}

const formatPeso = (value: number) =>
  `PHP ${(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fullMonth = (dateStr?: string | null) => {
  if (!dateStr) {
    return 'N/A';
  }

  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    return 'N/A';
  }

  return parsed.toLocaleString('en-PH', { month: 'long', year: 'numeric' });
};

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) {
    return 'N/A';
  }

  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    return 'N/A';
  }

  return parsed.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const displayBillingMonth = (billingMonth?: string | null, billDate?: string | null) => {
  const normalizedMonth = String(billingMonth || '').trim();
  if (normalizedMonth) {
    return normalizedMonth;
  }

  return fullMonth(billDate);
};

const formatName = (firstName?: string | null, middleName?: string | null, lastName?: string | null, fallback?: string | null) => {
  const fullName = [firstName, middleName, lastName]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
    .trim();

  if (fullName) {
    return fullName;
  }

  return String(fallback || 'Consumer').trim() || 'Consumer';
};

const statusClassName = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
  return normalized || 'unknown';
};

const CustomLabel = ({ x, y, value }: any) => {
  if (!value) {
    return null;
  }

  return (
    <g>
      <rect x={x - 22} y={y - 35} width={44} height={20} rx={6} fill="#18264d" />
      <text x={x} y={y - 21} textAnchor="middle" fill="#ffffff" fontSize={11} fontWeight={800}>
        {value}
      </text>
    </g>
  );
};

const ConsumptionChart: React.FC<ConsumptionChartProps> = ({ readings }) => {
  const [viewMode, setViewMode] = useState<'recent' | 'annual'>('recent');
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  if (!readings.length) {
    return <p className="cm-empty-copy">No reading data available yet.</p>;
  }

  const availableYears = Array.from(
    new Set(
      readings
        .map((reading) => new Date(reading.Reading_Date).getFullYear())
        .filter((year) => !Number.isNaN(year))
    )
  ).sort((a, b) => b - a);

  if (!availableYears.includes(currentYear)) {
    availableYears.unshift(currentYear);
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let chartData: Array<{ name: string; consumption: number }> = [];

  if (viewMode === 'annual') {
    chartData = monthNames.map((month) => ({ name: month, consumption: 0 }));
    readings.forEach((reading) => {
      const parsed = new Date(reading.Reading_Date);
      if (parsed.getFullYear() === selectedYear) {
        chartData[parsed.getMonth()].consumption = Number(reading.Consumption || 0);
      }
    });
  } else {
    const yearReadings = readings
      .filter((reading) => new Date(reading.Reading_Date).getFullYear() === selectedYear)
      .sort((left, right) => new Date(left.Reading_Date).getTime() - new Date(right.Reading_Date).getTime());

    chartData = yearReadings.map((reading) => ({
      name: monthNames[new Date(reading.Reading_Date).getMonth()],
      consumption: Number(reading.Consumption || 0),
    }));

    if (chartData.length > 0) {
      chartData = [{ name: '', consumption: 0 }, ...chartData];
    }
  }

  return (
    <div className="cm-chart-wrapper">
      <div className="cm-chart-controls">
        <div className="cm-view-toggle">
          <button
            type="button"
            className={`cm-toggle-btn ${viewMode === 'recent' ? 'active' : ''}`}
            onClick={() => setViewMode('recent')}
          >
            Recent
          </button>
          <button
            type="button"
            className={`cm-toggle-btn ${viewMode === 'annual' ? 'active' : ''}`}
            onClick={() => setViewMode('annual')}
          >
            Annual
          </button>
        </div>

        <div className="cm-year-select-wrapper">
          <label htmlFor="consumer-dashboard-year">Year</label>
          <select
            id="consumer-dashboard-year"
            value={selectedYear}
            onChange={(event) => setSelectedYear(Number(event.target.value))}
            className="cm-year-select"
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="cm-chart-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 56, right: 18, left: 0, bottom: 24 }}>
            <defs>
              <linearGradient id="consumerConsumptionFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.42} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(15, 23, 42, 0.08)" />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#5b6b86', fontSize: 13, fontWeight: 700 }}
              dy={14}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#5b6b86', fontSize: 13, fontWeight: 700 }}
            />
            <Tooltip
              cursor={{ stroke: '#2563eb', strokeWidth: 1, strokeDasharray: '6 6' }}
              contentStyle={{
                borderRadius: '14px',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                boxShadow: '0 18px 40px rgba(15, 23, 42, 0.12)',
                padding: '12px 14px',
              }}
              labelStyle={{ color: '#18264d', fontWeight: 800, marginBottom: '4px' }}
              itemStyle={{ color: '#2563eb', fontWeight: 700 }}
              formatter={(value: any) => [`${value} m3`, 'Consumption']}
            />
            <Area
              type="monotone"
              dataKey="consumption"
              stroke="#2563eb"
              strokeWidth={4}
              fillOpacity={1}
              fill="url(#consumerConsumptionFill)"
              dot={(props: any) => {
                const { cx, cy, value } = props;
                if (value > 0) {
                  return <circle cx={cx} cy={cy} r={6} fill="#ffffff" stroke="#2563eb" strokeWidth={3} />;
                }
                return <circle cx={cx} cy={cy} r={2} fill="#cbd5e1" />;
              }}
              activeDot={{ r: 8, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 3 }}
              animationDuration={1400}
            >
              <LabelList dataKey="consumption" content={<CustomLabel />} />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const ConsumerMain: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [consumer, setConsumer] = useState<ConsumerInfo | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dataSource, setDataSource] = useState<'api' | 'supabase' | 'offline' | null>(null);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const fetchDashboard = async () => {
      try {
        const { data, source } = await loadConsumerDashboardWithFallback(user.id);
        setDataSource(source);
        setConsumer(data.consumer as ConsumerInfo);
        setBills((data.bills || []) as Bill[]);
        setPayments((data.payments || []) as Payment[]);
        setReadings((data.readings || []) as Reading[]);
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to load dashboard.'));
      } finally {
        setLoading(false);
      }
    };

    void fetchDashboard();
  }, [user?.id]);

  const currentBill = bills.find((bill) => bill.Status === 'Unpaid') || null;
  const unpaidBills = bills.filter((bill) => bill.Status === 'Unpaid');
  const balanceBills = currentBill ? unpaidBills.filter((bill) => bill.Bill_ID !== currentBill.Bill_ID) : unpaidBills;
  const unpaidBalance = balanceBills.reduce((sum, bill) => sum + Number(bill.Total_Amount || 0), 0);
  const currentBillAmount = Number(
    currentBill?.Amount_Due ??
    currentBill?.Total_After_Due_Date ??
    currentBill?.Total_Amount ??
    0
  );
  const totalDue = currentBillAmount + unpaidBalance;
  const latestPayment = payments[0] || null;
  const latestReading = readings[readings.length - 1] || null;

  const displayName = formatName(
    consumer?.First_Name ?? consumer?.first_name,
    consumer?.Middle_Name ?? consumer?.middle_name,
    consumer?.Last_Name ?? consumer?.last_name,
    user?.fullName || user?.username || 'Consumer'
  );
  const accountNumber = consumer?.Account_Number ?? consumer?.account_number ?? `C-${String(consumer?.Consumer_ID || user?.id || 0).padStart(4, '0')}`;
  const serviceStatus = consumer?.Status ?? consumer?.status ?? 'Unknown';
  const accountStatus = consumer?.Account_Status ?? consumer?.account_status ?? 'Unknown';
  const dueDate = currentBill?.Due_Date ? formatDate(currentBill.Due_Date) : 'No due date';
  const profileImage = consumer?.Profile_Picture_URL ?? consumer?.profile_picture_url ?? user?.profile_picture_url ?? null;
  const serviceAddress = (
    consumer?.Address
    ?? consumer?.address
    ?? [
      consumer?.Purok ?? consumer?.purok,
      consumer?.Barangay ?? consumer?.barangay,
      consumer?.Municipality ?? consumer?.municipality,
      consumer?.Zip_Code ?? consumer?.zip_code,
    ].filter(Boolean).join(', ')
  ) || 'No service address recorded';

  const offlineMessage = dataSource === 'supabase'
    ? 'Cloud fallback active. Dashboard data is currently loading from Supabase.'
    : dataSource === 'offline'
      ? 'Offline snapshot active. Recent updates will appear after synchronization.'
      : '';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (error) {
    return (
      <div className="cm-page">
        <div className="cm-shell">
          <div className="cm-empty-state">
            <i className="fas fa-exclamation-circle" />
            <h2>Dashboard unavailable</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="cm-page">
        <div className="cm-shell cm-shell-loading">
          <div className="cm-loading-hero" />
          <div className="cm-loading-grid">
            <div className="cm-loading-card" />
            <div className="cm-loading-card" />
            <div className="cm-loading-card" />
            <div className="cm-loading-card" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cm-page">
      <div className="cm-shell">
        <section className="cm-hero">
          <div className="cm-hero-main">
            <div className="cm-avatar-panel">
              <div className="cm-avatar">
                {profileImage ? (
                  <img src={profileImage} alt={`${displayName} profile`} className="cm-avatar-image" />
                ) : (
                  <span>{getUserInitials(displayName)}</span>
                )}
              </div>
            </div>

            <div className="cm-hero-copy">
              <div className="cm-dashboard-label">Consumer Dashboard</div>
              <h1 className="cm-name">{displayName}</h1>
              <p className="cm-subtitle">
                Track your current bill, unpaid balance, recent payments, and monthly water consumption in one place.
              </p>
            </div>

            <span className={`cm-status-pill cm-hero-status ${statusClassName(serviceStatus)}`}>
              <i className="fas fa-circle" /> {serviceStatus}
            </span>

            <div className="cm-meta">
              <span className="cm-meta-item">
                <i className="fas fa-file-invoice" /> Account No. <strong>{accountNumber}</strong>
              </span>
              <span className="cm-meta-item">
                <i className="fas fa-user-circle" /> Username <strong>{consumer?.Username ?? consumer?.username ?? user?.username ?? 'N/A'}</strong>
              </span>
              <span className="cm-meta-item">
                <i className="fas fa-calendar-alt" /> Connected <strong>{formatDate(consumer?.Connection_Date ?? consumer?.connection_date)}</strong>
              </span>
            </div>
          </div>

          <div className="cm-header-actions">
            <Link to="/consumer/profile" className="cm-profile-btn">
              <i className="fas fa-user" /> My Profile
            </Link>
            <button className="cm-logout-btn" onClick={handleLogout}>
              <i className="fas fa-sign-out-alt" /> Logout
            </button>
          </div>
        </section>

        {offlineMessage && (
          <div className={`cm-banner ${dataSource === 'offline' ? 'offline' : 'fallback'}`}>
            <i className={`fas ${dataSource === 'offline' ? 'fa-wifi' : 'fa-cloud'}`} />
            <span>{offlineMessage}</span>
          </div>
        )}

        <section className="cm-stat-grid">
          <article className="cm-stat-card">
            <span className="cm-stat-label">Current Bill</span>
            <strong className="cm-stat-value">{currentBill ? formatPeso(currentBillAmount) : 'PHP 0.00'}</strong>
            <p className="cm-stat-note">
              {currentBill ? `Billing month: ${displayBillingMonth(currentBill.Billing_Month, currentBill.Bill_Date)}` : 'No unpaid current bill.'}
            </p>
          </article>

          <article className="cm-stat-card">
            <span className="cm-stat-label">Unpaid Balance</span>
            <strong className={`cm-stat-value ${unpaidBalance > 0 ? 'danger' : 'success'}`}>{formatPeso(unpaidBalance)}</strong>
            <p className="cm-stat-note">
              {balanceBills.length > 0 ? `${balanceBills.length} older unpaid bill(s)` : 'No carried balance.'}
            </p>
          </article>

          <article className="cm-stat-card cm-stat-card-highlight">
            <span className="cm-stat-label">Total Amount Due</span>
            <strong className="cm-stat-value">{formatPeso(totalDue)}</strong>
            <p className="cm-stat-note">Due date: {dueDate}</p>
          </article>

          <article className="cm-stat-card">
            <span className="cm-stat-label">Latest Reading</span>
            <strong className="cm-stat-value">{latestReading ? `${latestReading.Consumption} m3` : 'N/A'}</strong>
            <p className="cm-stat-note">
              {latestReading ? `Recorded ${formatDate(latestReading.Reading_Date)}` : 'No recent reading yet.'}
            </p>
          </article>
        </section>

        <div className="cm-content">
          <div className="cm-main-column">
            <section className="cm-card">
              <div className="cm-card-header">
                <div>
                  <h2 className="cm-card-title">
                    <i className="fas fa-chart-line" /> Monthly Water Consumption
                  </h2>
                  <p className="cm-card-subtitle">Review your recent and annual water usage based on recorded meter readings.</p>
                </div>
              </div>
              <ConsumptionChart readings={readings} />
            </section>

            <section className="cm-card">
              <div className="cm-card-header">
                <div>
                  <h2 className="cm-card-title">
                    <i className="fas fa-check-circle" /> Successful Payments
                  </h2>
                  <p className="cm-card-subtitle">A quick view of your completed payment history and reference numbers.</p>
                </div>
              </div>

              {payments.length === 0 ? (
                <p className="cm-empty-copy">No payment records yet.</p>
              ) : (
                <div className="cm-table-wrapper">
                  <table className="cm-table">
                    <thead>
                      <tr>
                        <th>Date Paid</th>
                        <th>Billing Month</th>
                        <th>Amount Paid</th>
                        <th>Reference Number</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => {
                        const billingDate = payment.bills?.Bill_Date || payment.Bill_Date;
                        return (
                          <tr key={payment.Payment_ID}>
                            <td>{formatDate(payment.Payment_Date)}</td>
                            <td>{displayBillingMonth(payment.Billing_Month, billingDate)}</td>
                            <td>{formatPeso(payment.Amount_Paid)}</td>
                            <td>
                              <span className="cm-ref-badge">{payment.Reference_Number || 'N/A'}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <aside className="cm-side-column">
            <section className="cm-card cm-side-card">
              <h2 className="cm-card-title">
                <i className="fas fa-file-invoice-dollar" /> Billing Summary
              </h2>
              <div className="cm-summary-list">
                <div className="cm-summary-row">
                  <span>Current billing month</span>
                  <strong>{currentBill ? displayBillingMonth(currentBill.Billing_Month, currentBill.Bill_Date) : 'None'}</strong>
                </div>
                <div className="cm-summary-row">
                  <span>Total amount due</span>
                  <strong>{formatPeso(totalDue)}</strong>
                </div>
                <div className="cm-summary-row">
                  <span>Due date</span>
                  <strong>{dueDate}</strong>
                </div>
                <div className="cm-summary-row">
                  <span>Last payment</span>
                  <strong>{latestPayment ? formatDate(latestPayment.Payment_Date) : 'No payment yet'}</strong>
                </div>
                <div className="cm-summary-row">
                  <span>Last payment amount</span>
                  <strong>{latestPayment ? formatPeso(latestPayment.Amount_Paid) : 'PHP 0.00'}</strong>
                </div>
              </div>
            </section>

            <section className="cm-card cm-side-card">
              <h2 className="cm-card-title">
                <i className="fas fa-tint" /> Service Overview
              </h2>
              <div className="cm-summary-list">
                <div className="cm-summary-row">
                  <span>Service status</span>
                  <strong>{serviceStatus}</strong>
                </div>
                <div className="cm-summary-row">
                  <span>Portal account</span>
                  <strong>{accountStatus}</strong>
                </div>
                <div className="cm-summary-row">
                  <span>Meter number</span>
                  <strong>{consumer?.Meter_Number ?? consumer?.meter_number ?? 'Not assigned'}</strong>
                </div>
                <div className="cm-summary-row">
                  <span>Meter status</span>
                  <strong>{consumer?.Meter_Status ?? consumer?.meter_status ?? 'Unknown'}</strong>
                </div>
                <div className="cm-summary-row">
                  <span>Zone</span>
                  <strong>{consumer?.Zone_Name ?? consumer?.zone_name ?? 'Not assigned'}</strong>
                </div>
                <div className="cm-summary-row">
                  <span>Classification</span>
                  <strong>{consumer?.Classification_Name ?? consumer?.classification_name ?? 'Not assigned'}</strong>
                </div>
                <div className="cm-summary-row cm-summary-row-wide">
                  <span>Service address</span>
                  <strong>{serviceAddress}</strong>
                </div>
              </div>
            </section>

            {balanceBills.length > 0 && (
              <section className="cm-card cm-side-card">
                <h2 className="cm-card-title">
                  <i className="fas fa-balance-scale" /> Previous Unpaid Bills
                </h2>
                <div className="cm-balance-list">
                  {balanceBills.map((bill) => (
                    <div key={bill.Bill_ID} className="cm-balance-row">
                      <span>{displayBillingMonth(bill.Billing_Month, bill.Bill_Date)}</span>
                      <strong>{formatPeso(bill.Total_Amount)}</strong>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ConsumerMain;
