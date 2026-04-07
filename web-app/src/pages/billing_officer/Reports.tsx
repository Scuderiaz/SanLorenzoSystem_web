import React, { useEffect, useMemo, useState } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import Tabs, { Tab } from '../../components/Common/Tabs';
import FormInput from '../../components/Common/FormInput';
import FormSelect from '../../components/Common/FormSelect';
import { useToast } from '../../components/Common/ToastContainer';
import '../assessor_admin/Reports.css';

interface ConsumerRow {
  Consumer_ID: number;
  Zone_ID: number;
  Status: string;
}

interface BillRow {
  Bill_ID: number;
  Consumer_ID: number;
  Total_Amount: number;
  Status: string;
  Bill_Date?: string;
  Billing_Month?: string;
}

interface PaymentRow {
  Payment_ID: number;
  Consumer_ID: number;
  Amount_Paid: number;
  Payment_Date?: string;
  Status: string;
}

interface ZoneRow {
  Zone_ID: number;
  Zone_Name?: string;
}

const formatCurrency = (value: number) =>
  `P${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const monthKey = (value?: string) => {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-PH', { month: 'long', year: 'numeric' });
};

const BillingReports: React.FC = () => {
  const { showToast } = useToast();
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [consumers, setConsumers] = useState<ConsumerRow[]>([]);
  const [bills, setBills] = useState<BillRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadReports = async () => {
    setLoading(true);
    try {
      const [consumersResponse, billsResponse, paymentsResponse, zonesResponse] = await Promise.all([
        fetch(`${API_URL}/consumers`),
        fetch(`${API_URL}/bills`),
        fetch(`${API_URL}/payments`),
        fetch(`${API_URL}/zones`),
      ]);

      const [consumersResult, billsResult, paymentsResult, zonesResult] = await Promise.all([
        consumersResponse.json(),
        billsResponse.json(),
        paymentsResponse.json(),
        zonesResponse.json(),
      ]);

      setConsumers(Array.isArray(consumersResult) ? consumersResult : []);
      setBills(Array.isArray(billsResult) ? billsResult : (billsResult.data || []));
      setPayments(Array.isArray(paymentsResult) ? paymentsResult : (paymentsResult.data || []));
      setZones(Array.isArray(zonesResult.data) ? zonesResult.data.map((zone: any) => ({
        Zone_ID: zone.Zone_ID ?? zone.zone_id,
        Zone_Name: zone.Zone_Name ?? zone.zone_name,
      })) : []);
    } catch (error) {
      console.error('Error loading billing reports:', error);
      showToast('Failed to load billing reports', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const consumerMap = useMemo(() => new Map(consumers.map((consumer) => [consumer.Consumer_ID, consumer])), [consumers]);

  const filteredBills = useMemo(() => {
    return bills.filter((bill) => {
      const consumer = consumerMap.get(bill.Consumer_ID);
      const matchesZone = !zoneFilter || String(consumer?.Zone_ID || '') === zoneFilter;
      const billDate = bill.Bill_Date ? new Date(bill.Bill_Date) : null;
      const matchesFrom = !fromDate || !billDate || billDate >= new Date(fromDate);
      const matchesTo = !toDate || !billDate || billDate <= new Date(`${toDate}T23:59:59`);
      return matchesZone && matchesFrom && matchesTo;
    });
  }, [bills, consumerMap, fromDate, toDate, zoneFilter]);

  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      const consumer = consumerMap.get(payment.Consumer_ID);
      const matchesZone = !zoneFilter || String(consumer?.Zone_ID || '') === zoneFilter;
      const paymentDate = payment.Payment_Date ? new Date(payment.Payment_Date) : null;
      const matchesFrom = !fromDate || !paymentDate || paymentDate >= new Date(fromDate);
      const matchesTo = !toDate || !paymentDate || paymentDate <= new Date(`${toDate}T23:59:59`);
      return matchesZone && matchesFrom && matchesTo;
    });
  }, [payments, consumerMap, fromDate, toDate, zoneFilter]);

  const filteredConsumers = useMemo(() => {
    return consumers.filter((consumer) => !zoneFilter || String(consumer.Zone_ID) === zoneFilter);
  }, [consumers, zoneFilter]);

  const totalConsumers = filteredConsumers.length;
  const activeConsumers = filteredConsumers.filter((consumer) => String(consumer.Status || '').toLowerCase() === 'active').length;
  const totalBilled = filteredBills.reduce((sum, bill) => sum + Number(bill.Total_Amount || 0), 0);
  const totalCollected = filteredPayments.reduce((sum, payment) => sum + Number(payment.Amount_Paid || 0), 0);
  const totalOutstanding = filteredBills
    .filter((bill) => String(bill.Status || '').toLowerCase() !== 'paid')
    .reduce((sum, bill) => sum + Number(bill.Total_Amount || 0), 0);

  const consumerReports = useMemo(() => {
    return zones
      .map((zone) => {
        const zoneConsumers = consumers.filter((consumer) => consumer.Zone_ID === zone.Zone_ID);
        const total = zoneConsumers.length;
        const active = zoneConsumers.filter((consumer) => String(consumer.Status || '').toLowerCase() === 'active').length;
        const inactive = zoneConsumers.filter((consumer) => String(consumer.Status || '').toLowerCase() === 'inactive').length;
        return {
          zone: `Zone ${zone.Zone_ID}`,
          totalConsumers: total,
          active,
          inactive,
          percentage: total ? `${((active / total) * 100).toFixed(1)}%` : '0.0%',
        };
      })
      .filter((row) => !zoneFilter || row.zone === `Zone ${zoneFilter}`);
  }, [consumers, zoneFilter, zones]);

  const monthlyReports = useMemo(() => {
    const monthMap = new Map<string, { billsGenerated: number; totalInvoiced: number; totalCollected: number; unpaidBalance: number }>();

    filteredBills.forEach((bill) => {
      const key = monthKey(bill.Bill_Date || bill.Billing_Month);
      const entry = monthMap.get(key) || { billsGenerated: 0, totalInvoiced: 0, totalCollected: 0, unpaidBalance: 0 };
      entry.billsGenerated += 1;
      entry.totalInvoiced += Number(bill.Total_Amount || 0);
      if (String(bill.Status || '').toLowerCase() !== 'paid') {
        entry.unpaidBalance += Number(bill.Total_Amount || 0);
      }
      monthMap.set(key, entry);
    });

    filteredPayments.forEach((payment) => {
      const key = monthKey(payment.Payment_Date);
      const entry = monthMap.get(key) || { billsGenerated: 0, totalInvoiced: 0, totalCollected: 0, unpaidBalance: 0 };
      entry.totalCollected += Number(payment.Amount_Paid || 0);
      monthMap.set(key, entry);
    });

    return Array.from(monthMap.entries()).map(([period, entry]) => ({
      period,
      billsGenerated: entry.billsGenerated,
      totalInvoiced: entry.totalInvoiced,
      totalCollected: entry.totalCollected,
      collectionRate: entry.totalInvoiced > 0 ? `${((entry.totalCollected / entry.totalInvoiced) * 100).toFixed(1)}%` : '0.0%',
      unpaidBalance: entry.unpaidBalance,
    }));
  }, [filteredBills, filteredPayments]);

  const zoneOptions = zones.map((zone) => ({ value: zone.Zone_ID, label: `Zone ${zone.Zone_ID}` }));

  const tabs: Tab[] = [
    {
      id: 'consumers',
      label: 'Consumer Report',
      content: (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Consumer Summary Report</h2>
          </div>
          <div className="card-body">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Total Consumers</th>
                  <th>Active</th>
                  <th>Inactive</th>
                  <th>Activation Rate</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>Loading consumer report...</td></tr>
                ) : consumerReports.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>No consumer data available.</td></tr>
                ) : (
                  consumerReports.map((report) => (
                    <tr key={report.zone}>
                      <td>{report.zone}</td>
                      <td>{report.totalConsumers}</td>
                      <td>{report.active}</td>
                      <td>{report.inactive}</td>
                      <td>{report.percentage}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: 'monthly',
      label: 'Billing & Collection',
      content: (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Billing and Collection Summary</h2>
          </div>
          <div className="card-body">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Bills Generated</th>
                  <th>Total Invoiced</th>
                  <th>Total Collected</th>
                  <th>Collection Rate</th>
                  <th>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {monthlyReports.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>No billing data available.</td></tr>
                ) : (
                  monthlyReports.map((report) => (
                    <tr key={report.period}>
                      <td>{report.period}</td>
                      <td>{report.billsGenerated}</td>
                      <td>{formatCurrency(report.totalInvoiced)}</td>
                      <td>{formatCurrency(report.totalCollected)}</td>
                      <td>{report.collectionRate}</td>
                      <td>{formatCurrency(report.unpaidBalance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
  ];

  return (
    <MainLayout title="Billing Reports">
      <div className="reports-page">
        <div className="action-buttons">
          <button className="btn btn-primary" onClick={loadReports}>
            <i className="fas fa-sync-alt"></i> Refresh Reports
          </button>
        </div>

        <div className="report-controls">
          <div className="control-group">
            <FormInput label="Start Period" type="date" value={fromDate} onChange={setFromDate} icon="fa-calendar-alt" />
            <FormInput label="End Period" type="date" value={toDate} onChange={setToDate} icon="fa-calendar-check" />
            <FormSelect label="Coverage Area" value={zoneFilter} onChange={setZoneFilter} options={zoneOptions} placeholder="All Service Zones" icon="fa-map-marked-alt" />
          </div>
        </div>

        <div className="dashboard-cards">
          <div className="card card-highlight-blue">
            <div className="card-header">
              <h2 className="card-title">Consumers</h2>
              <i className="fas fa-users"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{totalConsumers}</div>
              <div className="card-label">{activeConsumers} active service accounts</div>
            </div>
          </div>
          <div className="card card-highlight-gold">
            <div className="card-header">
              <h2 className="card-title">Invoiced</h2>
              <i className="fas fa-file-invoice-dollar"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{formatCurrency(totalBilled)}</div>
              <div className="card-label">{filteredBills.length} bills in scope</div>
            </div>
          </div>
          <div className="card card-highlight-green">
            <div className="card-header">
              <h2 className="card-title">Collected</h2>
              <i className="fas fa-coins"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{formatCurrency(totalCollected)}</div>
              <div className="card-label">{filteredPayments.length} payment records</div>
            </div>
          </div>
          <div className="card card-highlight-red">
            <div className="card-header">
              <h2 className="card-title">Outstanding</h2>
              <i className="fas fa-exclamation-circle"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{formatCurrency(totalOutstanding)}</div>
              <div className="card-label">Unpaid and partially paid bills</div>
            </div>
          </div>
        </div>

        <Tabs tabs={tabs} defaultTab="consumers" />
      </div>
    </MainLayout>
  );
};

export default BillingReports;
