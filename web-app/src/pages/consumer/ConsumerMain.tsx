import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage, loadConsumerDashboardWithFallback } from '../../services/userManagementApi';
import { api } from '../../services/api';
import Modal from '../../components/Common/Modal';
import { getUserInitials } from '../../utils/profileImage';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
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

interface Ticket {
  Ticket_ID?: number;
  Ticket_Number: string;
  Connection_Type?: string;
  Status: string;
  Application_Date?: string | null;
  Approved_Date?: string | null;
  Remarks?: string | null;
  Disconnection_Reason?: string | null;
  Reconnection_Reason?: string | null;
}

interface Concern {
  concern_id: number;
  category: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  resolved_at?: string | null;
  remarks?: string | null;
}

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
  Contact_Number?: string | null;
  contact_number?: string | null;
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
  Reading_ID?: number | null;
  Bill_Date: string;
  Due_Date: string;
  Date_Covered_From?: string | null;
  Date_Covered_To?: string | null;
  Total_Amount: number;
  Amount_Due?: number;
  Water_Charge?: number;
  Basic_Charge?: number;
  Environmental_Fee?: number;
  Meter_Fee?: number;
  Connection_Fee?: number;
  Previous_Balance?: number;
  Previous_Penalty?: number;
  Penalties?: number;
  Penalty?: number;
  Total_After_Due_Date?: number;
  Billing_Month?: string | null;
  Account_Number?: string | null;
  Classification?: string | null;
  Status: string;
}

interface Payment {
  Payment_ID: number;
  Payment_Date: string;
  Amount_Paid: number;
  Payment_Method?: string | null;
  Reference_Number?: string | null;
  Reference_No?: string | null;
  OR_Number?: string | null;
  Status?: string | null;
  Bill_ID: number;
  Bill_Amount?: number | null;
  Billing_Month?: string | null;
  Bill_Date?: string;
  Due_Date?: string;
  Account_Number?: string | null;
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

const normalizeStatus = (value?: string | null) => String(value || '').trim().toLowerCase();

const detailValue = (value?: string | number | null) => {
  const normalized = String(value ?? '').trim();
  return normalized || 'N/A';
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

const formatDateTime = (dateStr?: string | null) => {
  if (!dateStr) {
    return 'N/A';
  }

  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    return 'N/A';
  }

  return parsed.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const isUnsetProfileField = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) {
    return true;
  }
  return ['not specified', 'n/a', 'na', 'none', 'null', 'undefined'].includes(normalized);
};

const getMissingProfileFieldsForApplication = (consumer: ConsumerInfo | null) => {
  if (!consumer) {
    return ['First name', 'Last name', 'Contact number', 'Purok', 'Barangay', 'Municipality', 'ZIP code'];
  }

  const firstName = String(consumer.First_Name ?? consumer.first_name ?? '').trim();
  const lastName = String(consumer.Last_Name ?? consumer.last_name ?? '').trim();
  const contactNumber = String(consumer.Contact_Number ?? consumer.contact_number ?? '').trim();
  const purok = String(consumer.Purok ?? consumer.purok ?? '').trim();
  const barangay = String(consumer.Barangay ?? consumer.barangay ?? '').trim();
  const municipality = String(consumer.Municipality ?? consumer.municipality ?? '').trim();
  const zipCode = String(consumer.Zip_Code ?? consumer.zip_code ?? '').trim();

  const missing: string[] = [];
  if (isUnsetProfileField(firstName)) missing.push('First name');
  if (isUnsetProfileField(lastName)) missing.push('Last name');
  if (isUnsetProfileField(contactNumber)) missing.push('Contact number');
  if (isUnsetProfileField(purok)) missing.push('Purok');
  if (isUnsetProfileField(barangay)) missing.push('Barangay');
  if (isUnsetProfileField(municipality)) missing.push('Municipality');
  if (isUnsetProfileField(zipCode)) missing.push('ZIP code');

  return missing;
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
          <label htmlFor="Consumer-dashboard-year">Year</label>
          <select
            id="Consumer-dashboard-year"
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

  const [Consumer, setConsumer] = useState<ConsumerInfo | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dataSource, setDataSource] = useState<'api' | 'supabase' | 'offline' | null>(null);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applySuccess, setApplySuccess] = useState('');
  const [applyError, setApplyError] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyForm, setApplyForm] = useState({
    firstName: '', middleName: '', lastName: '', phone: '',
    purok: '', barangay: '', municipality: 'San Lorenzo Ruiz', zipCode: '4610',
  });

  const [concerns, setConcerns] = useState<Concern[]>([]);
  const [showConcernModal, setShowConcernModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [concernLoading, setConcernLoading] = useState(false);
  const [concernError, setConcernError] = useState('');
  const [concernSuccess, setConcernSuccess] = useState('');
  const [showReconnectionModal, setShowReconnectionModal] = useState(false);
  const [reconnectionReason, setReconnectionReason] = useState('');
  const [reconnectionLoading, setReconnectionLoading] = useState(false);
  const [reconnectionError, setReconnectionError] = useState('');
  const [reconnectionSuccess, setReconnectionSuccess] = useState('');
  const [concernForm, setConcernForm] = useState({
    category: 'Leakage',
    subject: '',
    description: '',
    priority: 'Normal'
  });

  const fetchDashboard = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, source } = await loadConsumerDashboardWithFallback(user.id);
      setDataSource(source);
      setConsumer(data.Consumer as ConsumerInfo);
      setBills((data.bills || []) as Bill[]);
      setPayments((data.payments || []) as Payment[]);
      setReadings((data.readings || []) as Reading[]);
      setTicket((data as any).ticket || null);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load dashboard.'));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const fetchConcerns = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await api.get(`/consumer/concerns/${user.id}`);
      if (res.data?.success) {
        setConcerns(res.data.concerns || []);
      }
    } catch (err) {
      console.error('Failed to fetch concerns:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const load = async () => {
      try {
        await Promise.all([fetchDashboard(), fetchConcerns()]);
      } catch {
        // Individual loaders already handle their own errors.
      }
    };

    void load();
  }, [fetchConcerns, fetchDashboard, user?.id]);

  useEffect(() => {
    if (!showHistoryModal) return;

    void fetchConcerns();
    const intervalId = window.setInterval(() => {
      void fetchConcerns();
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [fetchConcerns, showHistoryModal]);

  const sortedBills = [...bills].sort((left, right) =>
    new Date(right.Bill_Date || right.Due_Date || '').getTime() - new Date(left.Bill_Date || left.Due_Date || '').getTime()
  );
  const currentBill = sortedBills.find((bill) => normalizeStatus(bill.Status) === 'unpaid') || null;
  const unpaidBills = sortedBills.filter((bill) => normalizeStatus(bill.Status) === 'unpaid');
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
    Consumer?.First_Name ?? Consumer?.first_name,
    Consumer?.Middle_Name ?? Consumer?.middle_name,
    Consumer?.Last_Name ?? Consumer?.last_name,
    user?.fullName || user?.username || 'Consumer'
  );
  const accountNumber = Consumer?.Account_Number ?? Consumer?.account_number ?? 'Pending';
  const serviceStatus = Consumer?.Status ?? Consumer?.status ?? 'Unknown';
  const accountStatus = Consumer?.Account_Status ?? Consumer?.account_status ?? 'Unknown';
  const accountApprovalPending = normalizeStatus(accountStatus) === 'pending';
  const ticketApprovalPending = normalizeStatus(ticket?.Status) === 'pending';
  const showApprovalPendingMessage = accountApprovalPending || ticketApprovalPending;
  const isDisconnectedAccount =
    normalizeStatus(serviceStatus) === 'disconnected'
    || normalizeStatus(accountStatus) === 'disconnected'
    || normalizeStatus(ticket?.Status) === 'disconnected';
  const hasPendingReconnectionRequest =
    normalizeStatus(ticket?.Status) === 'pending'
    && normalizeStatus(ticket?.Connection_Type) === 'reconnection';
  const disconnectedReasonFromRemarks = String(ticket?.Remarks || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .reverse()
    .find((line) => /^\[disconnect\]\s*/i.test(line))
    ?.replace(/^\[disconnect\]\s*/i, '')
    ?.trim();
  const disconnectionReason =
    ticket?.Disconnection_Reason
    || disconnectedReasonFromRemarks
    || 'No reason was recorded by the billing office.';
  const dueDate = currentBill?.Due_Date ? formatDate(currentBill.Due_Date) : 'No due date';
  const profileImage = Consumer?.Profile_Picture_URL ?? Consumer?.profile_picture_url ?? user?.profile_picture_url ?? null;
  const serviceAddress = (
    Consumer?.Address
    ?? Consumer?.address
    ?? [
      Consumer?.Purok ?? Consumer?.purok,
      Consumer?.Barangay ?? Consumer?.barangay,
      Consumer?.Municipality ?? Consumer?.municipality,
      Consumer?.Zip_Code ?? Consumer?.zip_code,
    ].filter(Boolean).join(', ')
  ) || 'No service address recorded';
  const missingProfileFieldsForApplication = getMissingProfileFieldsForApplication(Consumer);
  const canApplyForConnection = missingProfileFieldsForApplication.length === 0;
  const missingProfileSummary = missingProfileFieldsForApplication.join(', ');

  const offlineMessage = dataSource === 'supabase'
    ? 'Cloud fallback active. Dashboard data is currently loading from Supabase.'
    : dataSource === 'offline'
      ? 'Offline snapshot active. Recent updates will appear after synchronization.'
      : '';
  const selectedPaymentBill = selectedPayment
    ? bills.find((bill) => Number(bill.Bill_ID) === Number(selectedPayment.Bill_ID)) || null
    : null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleOpenApplyModal = () => {
    if (!canApplyForConnection) {
      navigate('/consumer/profile');
      return;
    }

    setApplyForm({
      firstName: String(Consumer?.First_Name ?? Consumer?.first_name ?? '').trim(),
      middleName: String(Consumer?.Middle_Name ?? Consumer?.middle_name ?? '').trim(),
      lastName: String(Consumer?.Last_Name ?? Consumer?.last_name ?? '').trim(),
      phone: String(Consumer?.Contact_Number ?? Consumer?.contact_number ?? '').trim(),
      purok: String(Consumer?.Purok ?? Consumer?.purok ?? '').trim(),
      barangay: String(Consumer?.Barangay ?? Consumer?.barangay ?? '').trim(),
      municipality: String(Consumer?.Municipality ?? Consumer?.municipality ?? 'San Lorenzo Ruiz').trim() || 'San Lorenzo Ruiz',
      zipCode: String(Consumer?.Zip_Code ?? Consumer?.zip_code ?? '4610').trim() || '4610',
    });
    setApplySuccess('');
    setApplyError('');
    setShowApplyModal(true);
  };

  const handlePrintTicket = (tkt: Ticket) => {
    const printDate = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const applicantName = displayName || user?.username || 'Consumer';
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ticket - ${tkt.Ticket_Number}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:20px;color:#111;display:flex;justify-content:center;align-items:flex-start;min-height:100vh}.ticket{border:2px solid #1B1B63;border-radius:12px;padding:40px;width:680px;background:white;box-sizing:border-box}.ticket-header{text-align:center;border-bottom:1px dashed #ccc;padding-bottom:20px;margin-bottom:20px}.ticket-logo-title{font-size:15px;font-weight:700;color:#1B1B63}.ticket-number{font-size:22px;font-weight:900;color:#1B1B63;letter-spacing:1px;margin:18px 0 6px;text-align:center}.ticket-label{font-size:11px;color:#888;text-align:center;text-transform:uppercase;letter-spacing:1px}.ticket-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px}.ticket-row span{color:#555}.ticket-row strong{color:#111}.status-badge{display:inline-block;padding:4px 14px;background:#FEF3C7;color:#92400E;border-radius:99px;font-size:12px;font-weight:700;margin:10px 0}.charges{margin-top:16px;background:#f9f9f9;border-radius:8px;padding:14px}.charges-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:10px}.charge-row{display:flex;justify-content:space-between;font-size:13px;padding:4px 0}.charge-total{font-weight:700;border-top:1px solid #ddd;margin-top:6px;padding-top:8px}.ticket-footer{margin-top:20px;text-align:center;font-size:11px;color:#888;line-height:1.6}@media print{@page{margin:10mm}body{padding:0}}</style></head><body><div class="ticket"><div class="ticket-header"><div class="ticket-logo-title">San Lorenzo Ruiz Waterworks System</div><div style="font-size:12px;color:#555;margin-top:4px">Water Connection Application Receipt</div></div><div class="ticket-label">Ticket Number</div><div class="ticket-number">${tkt.Ticket_Number}</div><div style="text-align:center;margin-bottom:20px;"><span class="status-badge">${(tkt.Status || 'PENDING').toUpperCase()}</span></div><div class="ticket-row"><span>Applicant</span><strong>${applicantName}</strong></div><div class="ticket-row"><span>Connection Type</span><strong>${tkt.Connection_Type || 'New Connection'}</strong></div><div class="ticket-row"><span>Date Applied</span><strong>${tkt.Application_Date ? formatDate(tkt.Application_Date) : printDate}</strong></div>${tkt.Approved_Date ? `<div class="ticket-row"><span>Approved On</span><strong>${formatDate(tkt.Approved_Date)}</strong></div>` : ''}<div class="ticket-row"><span>Username</span><strong>${user?.username || 'N/A'}</strong></div><div class="charges"><div class="charges-title">Registration Charges</div><div class="charge-row"><span>Connection Fee</span><span>PHP 300.00</span></div><div class="charge-row"><span>Membership Fee</span><span>PHP 50.00</span></div><div class="charge-row"><span>Meter Full Deposit</span><span>PHP 1,500.00</span></div><div class="charge-row charge-total"><span>Total Amount</span><strong>PHP 1,850.00</strong></div></div><div class="ticket-footer">Please bring this ticket to the Municipal Office.<br>Present this reference number during your visit.<br><br>San Lorenzo Ruiz, Camarines Norte — Water Billing System</div></div></body></html>`;
    const win = window.open('', '_blank', 'width=800,height=900');
    if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 500); }
  };

  const handleDownloadTicket = async (tkt: Ticket) => {
    const printDate = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const applicantName = displayName || user?.username || 'Consumer';

    // Create a temporary container for the ticket
    const container = document.createElement('div');
    container.innerHTML = `
      <div id="ticket-pdf" style="
        width: 680px;
        background: white;
        padding: 40px;
        font-family: Arial, sans-serif;
        color: #111;
        border: 2px solid #1B1B63;
        border-radius: 12px;
        box-sizing: border-box;
        margin: 0 auto;
      ">
        <div style="text-align: center; border-bottom: 1px dashed #ccc; padding-bottom: 20px; margin-bottom: 20px;">
          <div style="font-size: 15px; font-weight: 700; color: #1B1B63;">San Lorenzo Ruiz Waterworks System</div>
          <div style="font-size: 12px; color: #555; margin-top: 4px;">Water Connection Application Receipt</div>
        </div>
        <div style="font-size: 11px; color: #888; text-align: center; text-transform: uppercase; letter-spacing: 1px;">Ticket Number</div>
        <div style="font-size: 22px; font-weight: 900; color: #1B1B63; letter-spacing: 1px; margin: 18px 0 6px; text-align: center;">${tkt.Ticket_Number}</div>
        <div style="text-align: center; margin-bottom: 20px;">
          <span style="display: inline-block; padding: 4px 14px; background: #FEF3C7; color: #92400E; border-radius: 99px; font-size: 12px; font-weight: 700;">${(tkt.Status || 'PENDING').toUpperCase()}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px;">
          <span style="color: #555;">Applicant</span>
          <strong style="color: #111;">${applicantName}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px;">
          <span style="color: #555;">Connection Type</span>
          <strong style="color: #111;">${tkt.Connection_Type || 'New Connection'}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px;">
          <span style="color: #555;">Date Applied</span>
          <strong style="color: #111;">${tkt.Application_Date ? formatDate(tkt.Application_Date) : printDate}</strong>
        </div>
        ${tkt.Approved_Date ? `<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px;">
          <span style="color: #555;">Approved On</span>
          <strong style="color: #111;">${formatDate(tkt.Approved_Date)}</strong>
        </div>` : ''}
        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px;">
          <span style="color: #555;">Username</span>
          <strong style="color: #111;">${user?.username || 'N/A'}</strong>
        </div>
        <div style="margin-top: 16px; background: #f9f9f9; border-radius: 8px; padding: 14px;">
          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 10px;">Registration Charges</div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0;">
            <span style="color: #555;">Connection Fee</span>
            <span>PHP 300.00</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0;">
            <span style="color: #555;">Membership Fee</span>
            <span>PHP 50.00</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0;">
            <span style="color: #555;">Meter Full Deposit</span>
            <span>PHP 1,500.00</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; padding: 8px 0 4px; margin-top: 6px; border-top: 1px solid #ddd; font-weight: 700;">
            <span style="color: #111;">Total Amount</span>
            <strong style="color: #111;">PHP 1,850.00</strong>
          </div>
        </div>
        <div style="margin-top: 20px; text-align: center; font-size: 11px; color: #888; line-height: 1.6;">
          Please bring this ticket to the Municipal Office.<br>
          Present this reference number during your visit.<br><br>
          San Lorenzo Ruiz, Camarines Norte — Water Billing System
        </div>
      </div>
    `;
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    try {
      const ticketElement = container.querySelector('#ticket-pdf') as HTMLElement;
      const canvas = await html2canvas(ticketElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      // Convert canvas pixels to mm (72 DPI: 1mm = 2.83px, canvas is at scale 2)
      const imgWidthMm = (canvas.width / 2) * 0.264583;
      const imgHeightMm = (canvas.height / 2) * 0.264583;
      // Fit to page width with minimal margins (5mm each side)
      const maxWidth = pdfWidth - 10; // 5mm margin each side
      const maxHeight = pdfHeight - 10; // 5mm margin top/bottom
      // Scale to fill width, but don't exceed page height
      const scale = Math.min(maxWidth / imgWidthMm, maxHeight / imgHeightMm);
      const finalWidth = imgWidthMm * scale;
      const finalHeight = imgHeightMm * scale;
      const imgX = (pdfWidth - finalWidth) / 2;
      const imgY = (pdfHeight - finalHeight) / 2;

      pdf.addImage(imgData, 'PNG', imgX, imgY, finalWidth, finalHeight);
      pdf.save(`Water-Connection-Ticket-${tkt.Ticket_Number}.pdf`);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      // Fallback to print if download fails
      handlePrintTicket(tkt);
    } finally {
      document.body.removeChild(container);
    }
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canApplyForConnection) {
      setApplyError(`Please complete your profile first: ${missingProfileSummary}.`);
      return;
    }
    setApplyLoading(true);
    setApplyError('');
    try {
      const res = await api.post('/consumer/apply', { accountId: user?.id, ...applyForm });
      if (res.data?.success) {
        setApplySuccess(res.data.ticketNumber);
        setTicket({ Ticket_Number: res.data.ticketNumber, Status: 'Pending', Connection_Type: 'New Connection', Application_Date: new Date().toISOString() });
      } else {
        setApplyError(res.data?.message || 'Submission failed.');
      }
    } catch (err: any) {
      setApplyError(err.response?.data?.message || err.message || 'Failed to submit application.');
    } finally {
      setApplyLoading(false);
    }
  };

  const handleConcernSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConcernLoading(true);
    setConcernError('');
    setConcernSuccess('');
    try {
      const res = await api.post('/consumer/report-concern', { accountId: user?.id, ...concernForm });
      if (res.data?.success) {
        setConcernSuccess('Problem reported successfully! Our team will review it.');
        setConcernForm({ category: 'Leakage', subject: '', description: '', priority: 'Normal' });
        // Refresh concerns
        await fetchConcerns();
      } else {
        setConcernError(res.data?.message || 'Submission failed.');
      }
    } catch (err: any) {
      setConcernError(err.response?.data?.message || err.message || 'Failed to submit report.');
    } finally {
      setConcernLoading(false);
    }
  };

  const handleReconnectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const reason = reconnectionReason.trim();
    if (!reason) {
      setReconnectionError('Please provide a reason for reconnection.');
      return;
    }

    setReconnectionLoading(true);
    setReconnectionError('');
    setReconnectionSuccess('');
    try {
      const res = await api.post('/consumer/reconnection-request', {
        accountId: user?.id,
        reason,
      });
      if (res.data?.success) {
        const ticketNumber = String(res.data.ticketNumber || '').trim();
        setReconnectionSuccess('Reconnection request submitted. The office will review your request.');
        setTicket((prev) => ({
          Ticket_Number: ticketNumber || prev?.Ticket_Number || 'PENDING-RECONNECTION',
          Status: 'Pending',
          Connection_Type: 'Reconnection',
          Application_Date: new Date().toISOString(),
          Remarks: `[reconnection-request] ${reason}`,
          Disconnection_Reason: prev?.Disconnection_Reason || disconnectionReason,
        }));
      } else {
        setReconnectionError(res.data?.message || 'Failed to submit reconnection request.');
      }
    } catch (err: any) {
      setReconnectionError(err.response?.data?.message || err.message || 'Failed to submit reconnection request.');
    } finally {
      setReconnectionLoading(false);
    }
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
                <i className="fas fa-user-circle" /> Username <strong>{Consumer?.Username ?? Consumer?.username ?? user?.username ?? 'N/A'}</strong>
              </span>
              <span className="cm-meta-item">
                <i className="fas fa-calendar-alt" /> Connected <strong>{formatDate(Consumer?.Connection_Date ?? Consumer?.connection_date)}</strong>
              </span>
            </div>
          </div>

          <div className="cm-header-actions">
            <button
              className="cm-report-btn"
              onClick={() => { setConcernError(''); setConcernSuccess(''); setShowConcernModal(true); }}
              disabled={accountApprovalPending}
              title={accountApprovalPending ? 'Available after account approval' : 'Report a problem'}
            >
              <i className="fas fa-exclamation-triangle" /> Report Problem
            </button>
            <button className="cm-history-btn" onClick={() => setShowHistoryModal(true)} title="View my reports">
              <i className="fas fa-history" /> My Reports
            </button>
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

        {/* Water Connection Application Banner — always accessible outside locked area */}
        {isDisconnectedAccount ? (
          <div className="cm-application-banner cm-application-banner--disconnected">
            <div className="cm-application-banner-icon">
              <i className="fas fa-plug-circle-xmark" />
            </div>
            <div className="cm-application-banner-body">
              <div className="cm-application-banner-title">
                Service Disconnected
                <span className="cm-status-badge disconnected">Disconnected</span>
              </div>
              <div className="cm-application-banner-meta">
                <span><strong>Account:</strong> {accountNumber}</span>
                {ticket?.Ticket_Number && <span><strong>Ticket:</strong> {ticket.Ticket_Number}</span>}
                {ticket?.Application_Date && <span><strong>Updated:</strong> {formatDate(ticket.Application_Date)}</span>}
              </div>
              <p className="cm-application-banner-message">
                Your service is currently disconnected. Please review the reason below and request reconnection when ready.
              </p>
              <p className="cm-application-banner-remarks"><i className="fas fa-comment-alt" /> {disconnectionReason}</p>
              {hasPendingReconnectionRequest ? (
                <p className="cm-application-banner-message" style={{ marginTop: '8px' }}>
                  Reconnection request is already pending review.
                </p>
              ) : null}
            </div>
            {!hasPendingReconnectionRequest ? (
              <button
                type="button"
                className="cm-application-banner-apply"
                onClick={() => {
                  setReconnectionError('');
                  setReconnectionSuccess('');
                  setReconnectionReason('');
                  setShowReconnectionModal(true);
                }}
              >
                <i className="fas fa-plug-circle-check" /> Apply for Reconnection
              </button>
            ) : null}
          </div>
        ) : ticket && normalizeStatus(ticket.Status) !== 'approved' ? (
          <div className={`cm-application-banner cm-application-banner--${statusClassName(ticket.Status)}`}>
            <div className="cm-application-banner-icon">
              <i className={`fas ${
                normalizeStatus(ticket.Status) === 'approved' ? 'fa-check-circle'
                : normalizeStatus(ticket.Status) === 'rejected' ? 'fa-times-circle'
                : 'fa-file-alt'
              }`} />
            </div>
            <div className="cm-application-banner-body">
              <div className="cm-application-banner-title">
                Water Connection Application
                <span className={`cm-status-badge ${statusClassName(ticket.Status)}`}>{ticket.Status}</span>
              </div>
              <div className="cm-application-banner-meta">
                <span><strong>Ticket:</strong> {ticket.Ticket_Number}</span>
                {ticket.Application_Date && <span><strong>Applied:</strong> {formatDate(ticket.Application_Date)}</span>}
                {ticket.Approved_Date && <span><strong>Approved:</strong> {formatDate(ticket.Approved_Date)}</span>}
                {ticket.Connection_Type && <span><strong>Type:</strong> {ticket.Connection_Type}</span>}
              </div>
              {showApprovalPendingMessage && (
                <p className="cm-application-banner-message">
                  Your account is waiting for approval. You can still access your dashboard while the office reviews your application.
                </p>
              )}
              {ticket.Remarks && (
                <p className="cm-application-banner-remarks"><i className="fas fa-comment-alt" /> {ticket.Remarks}</p>
              )}
            </div>
            <div className="cm-ticket-actions">
              <button
                type="button"
                className="cm-application-banner-download"
                onClick={() => handleDownloadTicket(ticket)}
                title="Download ticket as PDF"
              >
                <i className="fas fa-download" /> Download PDF
              </button>
              <button
                type="button"
                className="cm-application-banner-print"
                onClick={() => handlePrintTicket(ticket)}
                title="Print ticket"
              >
                <i className="fas fa-print" /> Print
              </button>
            </div>
          </div>
        ) : !ticket && normalizeStatus(serviceStatus) !== 'active' ? (
          <div className="cm-application-banner cm-application-banner--none">
            <div className="cm-application-banner-icon">
              <i className="fas fa-tint" />
            </div>
            <div className="cm-application-banner-body">
              <div className="cm-application-banner-title">No Water Connection Application</div>
              <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>
                {canApplyForConnection
                  ? 'Apply for a water service connection to get started. The office will review your application.'
                  : `Complete your profile first before applying. Missing: ${missingProfileSummary}.`}
              </p>
            </div>
            <button
              type="button"
              className="cm-application-banner-apply"
              onClick={handleOpenApplyModal}
              title={canApplyForConnection ? 'Apply for Water Connection' : 'Complete your profile first'}
            >
              <i className={`fas ${canApplyForConnection ? 'fa-plus' : 'fa-user-edit'}`} /> {canApplyForConnection ? 'Apply for Water Connection' : 'Complete Profile First'}
            </button>
          </div>
        ) : null}

        <div className={`cm-dashboard-content ${accountApprovalPending ? 'cm-dashboard-locked' : ''}`}>
          {accountApprovalPending && (
            <div className="cm-pending-overlay">
              <div className="cm-pending-overlay-content">
                <i className="fas fa-lock" />
                <span>Dashboard Locked</span>
                <small>Available after account approval</small>
              </div>
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
            <strong className="cm-stat-value danger">{formatPeso(unpaidBalance)}</strong>
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
                  <strong>{Consumer?.Meter_Number ?? Consumer?.meter_number ?? 'Not assigned'}</strong>
                </div>
                <div className="cm-summary-row">
                  <span>Meter status</span>
                  <strong>{Consumer?.Meter_Status ?? Consumer?.meter_status ?? 'Unknown'}</strong>
                </div>
                <div className="cm-summary-row">
                  <span>Zone</span>
                  <strong>{Consumer?.Zone_Name ?? Consumer?.zone_name ?? 'Not assigned'}</strong>
                </div>
                <div className="cm-summary-row">
                  <span>Classification</span>
                  <strong>{Consumer?.Classification_Name ?? Consumer?.classification_name ?? 'Not assigned'}</strong>
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

        <section className="cm-card cm-history-card">
          <div className="cm-card-header">
            <div>
              <h2 className="cm-card-title">
                <i className="fas fa-file-invoice" /> All Bills
              </h2>
              <p className="cm-card-subtitle">Review every billing record and open the full bill breakdown when needed.</p>
            </div>
            <span className="cm-history-count">{sortedBills.length} bill{sortedBills.length === 1 ? '' : 's'}</span>
          </div>

          {sortedBills.length === 0 ? (
            <p className="cm-empty-copy">No billing records yet.</p>
          ) : (
            <div className="cm-table-wrapper">
              <table className="cm-table">
                <thead>
                  <tr>
                    <th>Billing Month</th>
                    <th>Bill Date</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBills.map((bill) => (
                    <tr
                      key={bill.Bill_ID}
                      className="cm-clickable-row"
                      onClick={() => setSelectedBill(bill)}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedBill(bill);
                        }
                      }}
                    >
                      <td data-label="Billing Month">{displayBillingMonth(bill.Billing_Month, bill.Bill_Date)}</td>
                      <td data-label="Bill Date">{formatDate(bill.Bill_Date)}</td>
                      <td data-label="Due Date">{formatDate(bill.Due_Date)}</td>
                      <td data-label="Amount">{formatPeso(Number(bill.Total_Amount || bill.Amount_Due || 0))}</td>
                      <td data-label="Status">
                        <span className={`cm-status-badge ${statusClassName(bill.Status)}`}>{bill.Status || 'Unknown'}</span>
                      </td>
                      <td data-label="Details">
                        <button
                          type="button"
                          className="cm-table-action"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedBill(bill);
                          }}
                        >
                          View Bill
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="cm-card cm-history-card">
          <div className="cm-card-header">
            <div>
              <h2 className="cm-card-title">
                <i className="fas fa-check-circle" /> Payments Made
              </h2>
              <p className="cm-card-subtitle">Track completed payments, references, and the bill each payment was applied to.</p>
            </div>
            <span className="cm-history-count">{payments.length} payment{payments.length === 1 ? '' : 's'}</span>
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
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => {
                    const billingDate = payment.bills?.Bill_Date || payment.Bill_Date;
                    return (
                      <tr
                        key={payment.Payment_ID}
                        className="cm-clickable-row"
                        onClick={() => setSelectedPayment(payment)}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedPayment(payment);
                          }
                        }}
                      >
                        <td data-label="Date Paid">{formatDate(payment.Payment_Date)}</td>
                        <td data-label="Billing Month">{displayBillingMonth(payment.Billing_Month, billingDate)}</td>
                        <td data-label="Amount Paid">{formatPeso(payment.Amount_Paid)}</td>
                        <td data-label="Reference Number">
                          <span className="cm-ref-badge">{payment.Reference_Number || payment.Reference_No || payment.OR_Number || 'N/A'}</span>
                        </td>
                        <td data-label="Details">
                          <button
                            type="button"
                            className="cm-table-action"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedPayment(payment);
                            }}
                          >
                            View Payment
                          </button>
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

        <Modal
          isOpen={Boolean(selectedBill)}
          onClose={() => setSelectedBill(null)}
          title="Full Bill Details"
          size="medium"
          footer={(
            <button type="button" className="cm-modal-close-btn" onClick={() => setSelectedBill(null)}>
              Close
            </button>
          )}
        >
          {selectedBill && (
            <div className="cm-detail-modal">
              <div className="cm-detail-hero">
                <div>
                  <span className="cm-detail-kicker">Billing Month</span>
                  <h3>{displayBillingMonth(selectedBill.Billing_Month, selectedBill.Bill_Date)}</h3>
                  <p>Account No. {detailValue(selectedBill.Account_Number || accountNumber)}</p>
                </div>
                <span className={`cm-status-badge ${statusClassName(selectedBill.Status)}`}>{selectedBill.Status || 'Unknown'}</span>
              </div>

              <div className="cm-detail-grid">
                <div className="cm-detail-item">
                  <span>Bill Date</span>
                  <strong>{formatDate(selectedBill.Bill_Date)}</strong>
                </div>
                <div className="cm-detail-item">
                  <span>Due Date</span>
                  <strong>{formatDate(selectedBill.Due_Date)}</strong>
                </div>
                <div className="cm-detail-item">
                  <span>Covered From</span>
                  <strong>{formatDate(selectedBill.Date_Covered_From)}</strong>
                </div>
                <div className="cm-detail-item">
                  <span>Covered To</span>
                  <strong>{formatDate(selectedBill.Date_Covered_To)}</strong>
                </div>
                <div className="cm-detail-item">
                  <span>Classification</span>
                  <strong>{detailValue(selectedBill.Classification || Consumer?.Classification_Name || Consumer?.classification_name)}</strong>
                </div>
                <div className="cm-detail-item">
                  <span>Reading Reference</span>
                  <strong>{detailValue(selectedBill.Reading_ID ? `#${selectedBill.Reading_ID}` : null)}</strong>
                </div>
              </div>

              <div className="cm-breakdown-card">
                <h4>Billing Breakdown</h4>
                <div className="cm-breakdown-row">
                  <span>Basic charge</span>
                  <strong>{formatPeso(Number(selectedBill.Basic_Charge || selectedBill.Water_Charge || 0))}</strong>
                </div>
                <div className="cm-breakdown-row">
                  <span>Water charge</span>
                  <strong>{formatPeso(Number(selectedBill.Water_Charge || 0))}</strong>
                </div>
                <div className="cm-breakdown-row">
                  <span>Meter maintenance fee</span>
                  <strong>{formatPeso(Number(selectedBill.Meter_Fee || selectedBill.Environmental_Fee || 0))}</strong>
                </div>
                <div className="cm-breakdown-row">
                  <span>Connection fee</span>
                  <strong>{formatPeso(Number(selectedBill.Connection_Fee || 0))}</strong>
                </div>
                <div className="cm-breakdown-row">
                  <span>Previous balance</span>
                  <strong>{formatPeso(Number(selectedBill.Previous_Balance || 0))}</strong>
                </div>
                <div className="cm-breakdown-row">
                  <span>Previous penalty</span>
                  <strong>{formatPeso(Number(selectedBill.Previous_Penalty || 0))}</strong>
                </div>
                <div className="cm-breakdown-row">
                  <span>Penalty</span>
                  <strong>{formatPeso(Number(selectedBill.Penalties || selectedBill.Penalty || 0))}</strong>
                </div>
                <div className="cm-breakdown-row total">
                  <span>Total amount</span>
                  <strong>{formatPeso(Number(selectedBill.Total_Amount || 0))}</strong>
                </div>
                <div className="cm-breakdown-row total-after-due">
                  <span>Total after due date</span>
                  <strong>{formatPeso(Number(selectedBill.Total_After_Due_Date || selectedBill.Total_Amount || 0))}</strong>
                </div>
              </div>
            </div>
          )}
        </Modal>

        <Modal
          isOpen={Boolean(selectedPayment)}
          onClose={() => setSelectedPayment(null)}
          title="Full Payment Details"
          size="medium"
          footer={(
            <button type="button" className="cm-modal-close-btn" onClick={() => setSelectedPayment(null)}>
              Close
            </button>
          )}
        >
          {selectedPayment && (
            <div className="cm-detail-modal">
              <div className="cm-detail-hero payment">
                <div>
                  <span className="cm-detail-kicker">Payment Made</span>
                  <h3>{formatPeso(Number(selectedPayment.Amount_Paid || 0))}</h3>
                  <p>{formatDate(selectedPayment.Payment_Date)}</p>
                </div>
                <span className={`cm-status-badge ${statusClassName(selectedPayment.Status || 'paid')}`}>
                  {selectedPayment.Status || 'Paid'}
                </span>
              </div>

              <div className="cm-detail-grid">
                <div className="cm-detail-item">
                  <span>Billing Month</span>
                  <strong>{displayBillingMonth(selectedPayment.Billing_Month || selectedPaymentBill?.Billing_Month, selectedPayment.Bill_Date || selectedPaymentBill?.Bill_Date)}</strong>
                </div>
                <div className="cm-detail-item">
                  <span>Payment Method</span>
                  <strong>{detailValue(selectedPayment.Payment_Method || 'Cash')}</strong>
                </div>
                <div className="cm-detail-item">
                  <span>Reference Number</span>
                  <strong>{detailValue(selectedPayment.Reference_Number || selectedPayment.Reference_No)}</strong>
                </div>
                <div className="cm-detail-item">
                  <span>OR Number</span>
                  <strong>{detailValue(selectedPayment.OR_Number)}</strong>
                </div>
                <div className="cm-detail-item">
                  <span>Linked Bill Amount</span>
                  <strong>{formatPeso(Number(selectedPayment.Bill_Amount || selectedPaymentBill?.Total_Amount || 0))}</strong>
                </div>
                <div className="cm-detail-item">
                  <span>Linked Bill Due Date</span>
                  <strong>{formatDate(selectedPayment.Due_Date || selectedPaymentBill?.Due_Date)}</strong>
                </div>
                <div className="cm-detail-item">
                  <span>Account Number</span>
                  <strong>{detailValue(selectedPayment.Account_Number || accountNumber)}</strong>
                </div>
                <div className="cm-detail-item">
                  <span>Payment Record</span>
                  <strong>#{selectedPayment.Payment_ID}</strong>
                </div>
              </div>
            </div>
          )}
        </Modal>

        {/* Apply for Water Connection Modal */}
        <Modal
          isOpen={showApplyModal}
          onClose={() => setShowApplyModal(false)}
          title="Apply for Water Connection"
          size="medium"
          footer={
            applySuccess ? (
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="cm-modal-close-btn" onClick={() => handlePrintTicket({ Ticket_Number: applySuccess, Status: 'Pending', Connection_Type: 'New Connection', Application_Date: new Date().toISOString() })}>
                  <i className="fas fa-print" /> Print Ticket
                </button>
                <button type="button" className="cm-modal-close-btn" onClick={() => setShowApplyModal(false)}>
                  Close
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="cm-modal-close-btn" onClick={() => setShowApplyModal(false)} disabled={applyLoading}>
                  Cancel
                </button>
                <button type="submit" form="apply-form" className="cm-application-banner-apply" disabled={applyLoading} style={{ padding: '10px 22px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
                  {applyLoading ? <><i className="fas fa-spinner fa-spin" /> Submitting...</> : <><i className="fas fa-paper-plane" /> Submit Application</>}
                </button>
              </div>
            )
          }
        >
          {applySuccess ? (
            <div style={{ textAlign: 'center', padding: '24px 16px' }}>
              <i className="fas fa-check-circle" style={{ fontSize: '52px', color: '#16a34a', marginBottom: '16px', display: 'block' }} />
              <h3 style={{ color: '#0f172a', marginBottom: '8px' }}>Application Submitted!</h3>
              <p style={{ color: '#64748b', marginBottom: '20px' }}>Your application has been received and is now pending review by the office.</p>
              <div className="cm-application-ticket-number">{applySuccess}</div>
              <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '10px' }}>
                <i className="fas fa-info-circle" /> This ticket number also appears on your dashboard.
              </p>
            </div>
          ) : (
            <form id="apply-form" onSubmit={handleApplySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {applyError && (
                <div className="cm-apply-error"><i className="fas fa-exclamation-circle" /> {applyError}</div>
              )}
              <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                Your application details are pulled from your profile. Update your profile first if anything is incorrect.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="cm-apply-field">
                  <label>First Name</label>
                  <input type="text" value={applyForm.firstName} onChange={e => setApplyForm(f => ({ ...f, firstName: e.target.value }))} placeholder="First name" required readOnly />
                </div>
                <div className="cm-apply-field">
                  <label>Middle Name</label>
                  <input type="text" value={applyForm.middleName} onChange={e => setApplyForm(f => ({ ...f, middleName: e.target.value }))} placeholder="Middle name (optional)" readOnly />
                </div>
                <div className="cm-apply-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Last Name</label>
                  <input type="text" value={applyForm.lastName} onChange={e => setApplyForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Last name" required readOnly />
                </div>
                <div className="cm-apply-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Contact Number</label>
                  <input type="tel" value={applyForm.phone} onChange={e => setApplyForm(f => ({ ...f, phone: e.target.value }))} placeholder="09XXXXXXXXX" required readOnly />
                </div>
                <div className="cm-apply-field">
                  <label>Purok</label>
                  <input type="text" value={applyForm.purok} onChange={e => setApplyForm(f => ({ ...f, purok: e.target.value }))} placeholder="Purok" readOnly />
                </div>
                <div className="cm-apply-field">
                  <label>Barangay</label>
                  <input type="text" value={applyForm.barangay} onChange={e => setApplyForm(f => ({ ...f, barangay: e.target.value }))} placeholder="Barangay" required readOnly />
                </div>
                <div className="cm-apply-field">
                  <label>Municipality</label>
                  <input type="text" value={applyForm.municipality} onChange={e => setApplyForm(f => ({ ...f, municipality: e.target.value }))} placeholder="Municipality" readOnly />
                </div>
                <div className="cm-apply-field">
                  <label>ZIP Code</label>
                  <input type="text" value={applyForm.zipCode} onChange={e => setApplyForm(f => ({ ...f, zipCode: e.target.value }))} placeholder="4610" readOnly />
                </div>
              </div>
            </form>
          )}
        </Modal>

        {/* Report a Problem Modal */}
        <Modal
          isOpen={showConcernModal}
          onClose={() => setShowConcernModal(false)}
          title="Report a Problem"
          size="medium"
          footer={
            concernSuccess ? (
              <button type="button" className="cm-modal-close-btn" onClick={() => setShowConcernModal(false)}>
                Close
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="cm-modal-close-btn" onClick={() => setShowConcernModal(false)} disabled={concernLoading}>
                  Cancel
                </button>
                <button type="submit" form="concern-form" className="cm-application-banner-apply" disabled={concernLoading} style={{ padding: '10px 22px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
                  {concernLoading ? <><i className="fas fa-spinner fa-spin" /> Submitting...</> : <><i className="fas fa-paper-plane" /> Submit Report</>}
                </button>
              </div>
            )
          }
        >
          {concernSuccess ? (
            <div className="cm-concern-success-panel">
              <i className="fas fa-check-circle cm-concern-success-icon" />
              <h3>Report Submitted!</h3>
              <p>{concernSuccess}</p>
            </div>
          ) : (
            <form id="concern-form" onSubmit={handleConcernSubmit} className="cm-concern-form">
              {concernError && (
                <div className="cm-apply-error"><i className="fas fa-exclamation-circle" /> {concernError}</div>
              )}
              <p className="cm-concern-help">
                Please provide details about the issue you're experiencing. Our technical team will investigate it as soon as possible.
              </p>
              <div className="cm-apply-field">
                <label>Issue Category</label>
                <select
                  value={concernForm.category} 
                  onChange={e => setConcernForm(f => ({ ...f, category: e.target.value }))}
                  className="cm-concern-select"
                >
                  <option value="Leakage">Water Leakage</option>
                  <option value="No Water">No Water Supply</option>
                  <option value="Low Pressure">Low Water Pressure</option>
                  <option value="Billing">Billing Concern</option>
                  <option value="Meter">Meter Problem</option>
                  <option value="Other">Other Issues</option>
                </select>
              </div>
              <div className="cm-apply-field">
                <label>Subject</label>
                <input 
                  type="text" 
                  value={concernForm.subject} 
                  onChange={e => setConcernForm(f => ({ ...f, subject: e.target.value }))} 
                  placeholder="e.g., Leaking pipe near meter" 
                  required 
                />
              </div>
              <div className="cm-apply-field">
                <label>Description</label>
                <textarea
                  value={concernForm.description} 
                  onChange={e => setConcernForm(f => ({ ...f, description: e.target.value }))} 
                  placeholder="Please describe the problem in detail..." 
                  required 
                  className="cm-concern-textarea"
                />
              </div>
              <div className="cm-apply-field">
                <label>Urgency</label>
                <div className="cm-concern-priority-group">
                  {['Low', 'Normal', 'High'].map(p => (
                    <label key={p} className="cm-concern-priority-option">
                      <input 
                        type="radio" 
                        name="priority" 
                        value={p} 
                        checked={concernForm.priority === p} 
                        onChange={e => setConcernForm(f => ({ ...f, priority: e.target.value }))} 
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
            </form>
          )}
        </Modal>

        <Modal
          isOpen={showReconnectionModal}
          onClose={() => {
            if (reconnectionLoading) return;
            setShowReconnectionModal(false);
          }}
          title="Apply for Reconnection"
          size="medium"
          closeOnOverlayClick={!reconnectionLoading}
          footer={(
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="cm-modal-close-btn"
                onClick={() => setShowReconnectionModal(false)}
                disabled={reconnectionLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="reconnection-form"
                className="cm-application-banner-apply"
                disabled={reconnectionLoading}
                style={{ padding: '10px 22px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
              >
                {reconnectionLoading ? <><i className="fas fa-spinner fa-spin" /> Submitting...</> : <><i className="fas fa-paper-plane" /> Submit Request</>}
              </button>
            </div>
          )}
        >
          <form id="reconnection-form" onSubmit={handleReconnectionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {reconnectionError ? <div className="cm-apply-error"><i className="fas fa-exclamation-circle" /> {reconnectionError}</div> : null}
            {reconnectionSuccess ? <div className="cm-apply-success"><i className="fas fa-check-circle" /> {reconnectionSuccess}</div> : null}
            <p style={{ fontSize: '14px', color: '#475569', margin: 0 }}>
              Tell us why you are requesting reconnection. This reason will be reviewed by the billing office.
            </p>
            <div className="cm-apply-field">
              <label>Reason for reconnection</label>
              <textarea
                value={reconnectionReason}
                onChange={(e) => setReconnectionReason(e.target.value)}
                placeholder="Enter your request reason"
                required
                disabled={reconnectionLoading}
                className="cm-reconnection-textarea"
              />
            </div>
          </form>
        </Modal>

        {/* My Reports History Modal */}
        <Modal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          title="My Problem Reports"
          size="large"
          footer={
            <button type="button" className="cm-modal-close-btn" onClick={() => setShowHistoryModal(false)}>
              Close
            </button>
          }
        >
          {concerns.length === 0 ? (
            <div className="cm-history-empty">
              <i className="fas fa-clipboard-check" />
              <p>You haven't reported any problems yet.</p>
            </div>
          ) : (
            <div className="cm-table-wrapper cm-history-table-wrapper">
              <table className="cm-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Office Update</th>
                  </tr>
                </thead>
                <tbody>
                  {concerns.map(c => (
                    <tr key={c.concern_id}>
                      <td data-label="Date" className="cm-history-date-cell">{formatDate(c.created_at)}</td>
                      <td data-label="Category">{c.category}</td>
                      <td data-label="Subject">{c.subject}</td>
                      <td data-label="Status">
                        <span className={`cm-status-badge ${statusClassName(c.status)}`}>{c.status}</span>
                      </td>
                      <td data-label="Office Update">
                        {c.remarks ? (
                          <div className="cm-concern-office-update">
                            <p>{c.remarks}</p>
                            <small>{c.resolved_at ? `Updated ${formatDateTime(c.resolved_at)}` : 'Updated by office'}</small>
                          </div>
                        ) : (
                          <span className="cm-concern-office-update-empty">No reply yet</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
};

export default ConsumerMain;
