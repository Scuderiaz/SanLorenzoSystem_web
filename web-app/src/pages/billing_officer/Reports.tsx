import React, { useEffect, useMemo, useState, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import Tabs, { Tab } from '../../components/Common/Tabs';
import DataTable, { Column } from '../../components/Common/DataTable';
import FormInput from '../../components/Common/FormInput';
import FormSelect from '../../components/Common/FormSelect';
import { useToast } from '../../components/Common/ToastContainer';
import {
  getErrorMessage,
  loadBillsWithFallback,
  loadConsumersWithFallback,
  loadPaymentsWithFallback,
  loadZonesWithFallback,
} from '../../services/userManagementApi';
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
  Total_After_Due_Date?: number;
  Amount_Due?: number;
  Status: string;
  Bill_Date?: string;
  Billing_Month?: string;
}

interface PaymentRow {
  Payment_ID: number;
  Bill_ID?: number;
  Consumer_ID: number;
  Amount_Paid: number;
  Payment_Date?: string;
  Status: string;
}

interface ZoneRow {
  Zone_ID: number;
  Zone_Name?: string;
}

const formatZoneLabel = (zoneName?: string, zoneId?: number | string | null) =>
  zoneName || (zoneId ? `Zone ${zoneId}` : 'Not Assigned');

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

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [consumers, setConsumers] = useState<ConsumerRow[]>([]);
  const [bills, setBills] = useState<BillRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const [consumersResult, billsResult, paymentsResult, zonesResult] = await Promise.all([
        loadConsumersWithFallback(),
        loadBillsWithFallback(),
        loadPaymentsWithFallback(),
        loadZonesWithFallback(),
      ]);

      setConsumers(consumersResult.data || []);
      setBills(billsResult.data || []);
      setPayments(paymentsResult.data || []);
      setZones(zonesResult.data || []);

      if ([consumersResult.source, billsResult.source, paymentsResult.source, zonesResult.source].includes('supabase')) {
        showToast('Reports loaded using Supabase fallback for part of the data.', 'warning');
      }
    } catch (error) {
      console.error('Error loading billing reports:', error);
      showToast(getErrorMessage(error, 'Failed to load billing reports.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

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

  const paymentTotalsByBill = useMemo(() => {
    return filteredPayments.reduce((totals, payment) => {
      const normalizedStatus = String(payment.Status || '').toLowerCase();
      if (!['validated', 'paid'].includes(normalizedStatus)) {
        return totals;
      }

      if (!payment.Bill_ID) {
        return totals;
      }

      totals.set(payment.Bill_ID, (totals.get(payment.Bill_ID) || 0) + Number(payment.Amount_Paid || 0));
      return totals;
    }, new Map<number, number>());
  }, [filteredPayments]);

  const finalizedPayments = useMemo(
    () => filteredPayments.filter((payment) => ['validated', 'paid'].includes(String(payment.Status || '').toLowerCase())),
    [filteredPayments]
  );

  const totalConsumers = filteredConsumers.length;
  const activeConsumers = filteredConsumers.filter((consumer) => String(consumer.Status || '').toLowerCase() === 'active').length;
  const totalBilled = filteredBills.reduce((sum, bill) => sum + Number(bill.Total_Amount || 0), 0);
  const totalCollected = finalizedPayments.reduce((sum, payment) => sum + Number(payment.Amount_Paid || 0), 0);
  const totalOutstanding = filteredBills.reduce((sum, bill) => {
    const billTotal = Number((bill.Total_After_Due_Date ?? bill.Amount_Due ?? bill.Total_Amount) || 0);
    const paidAmount = paymentTotalsByBill.get(bill.Bill_ID) || 0;
    return sum + Math.max(0, billTotal - paidAmount);
  }, 0);

  const consumerReports = useMemo(() => {
    return zones
      .map((zone) => {
        const zoneConsumers = consumers.filter((consumer) => consumer.Zone_ID === zone.Zone_ID);
        const total = zoneConsumers.length;
        const active = zoneConsumers.filter((consumer) => String(consumer.Status || '').toLowerCase() === 'active').length;
        const inactive = zoneConsumers.filter((consumer) => String(consumer.Status || '').toLowerCase() === 'inactive').length;
        return {
          zoneId: zone.Zone_ID,
          zone: formatZoneLabel(zone.Zone_Name, zone.Zone_ID),
          totalConsumers: total,
          active,
          inactive,
          percentage: total ? `${((active / total) * 100).toFixed(1)}%` : '0.0%',
        };
      })
      .filter((row) => !zoneFilter || String(row.zoneId) === zoneFilter);
  }, [consumers, zoneFilter, zones]);

  const monthlyReports = useMemo(() => {
    const monthMap = new Map<string, { billsGenerated: number; totalInvoiced: number; totalCollected: number; unpaidBalance: number }>();

    filteredBills.forEach((bill) => {
      const key = monthKey(bill.Bill_Date || bill.Billing_Month);
      const entry = monthMap.get(key) || { billsGenerated: 0, totalInvoiced: 0, totalCollected: 0, unpaidBalance: 0 };
      const billTotal = Number((bill.Total_After_Due_Date ?? bill.Amount_Due ?? bill.Total_Amount) || 0);
      const paidAmount = paymentTotalsByBill.get(bill.Bill_ID) || 0;
      entry.billsGenerated += 1;
      entry.totalInvoiced += Number(bill.Total_Amount || 0);
      entry.unpaidBalance += Math.max(0, billTotal - paidAmount);
      monthMap.set(key, entry);
    });

    filteredPayments.forEach((payment) => {
      const normalizedStatus = String(payment.Status || '').toLowerCase();
      if (!['validated', 'paid'].includes(normalizedStatus)) {
        return;
      }
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
  }, [filteredBills, filteredPayments, paymentTotalsByBill]);

  const zoneOptions = zones.map((zone) => ({ value: zone.Zone_ID, label: formatZoneLabel(zone.Zone_Name, zone.Zone_ID) }));

  const consumerReportColumns = useMemo<Column[]>(() => [
    { key: 'zone', label: 'Zone', sortable: true },
    { key: 'totalConsumers', label: 'Total Consumers', sortable: true },
    { key: 'active', label: 'Active', sortable: true },
    { key: 'inactive', label: 'Inactive', sortable: true },
    { key: 'percentage', label: 'Activation Rate', sortable: true },
  ], []);

  const monthlyReportColumns = useMemo<Column[]>(() => [
    { key: 'period', label: 'Period', sortable: true },
    { key: 'billsGenerated', label: 'Bills Generated', sortable: true },
    {
      key: 'totalInvoiced',
      label: 'Total Invoiced',
      sortable: true,
      render: (value: number) => formatCurrency(value),
    },
    {
      key: 'totalCollected',
      label: 'Total Collected',
      sortable: true,
      render: (value: number) => formatCurrency(value),
    },
    { key: 'collectionRate', label: 'Collection Rate', sortable: true },
    {
      key: 'unpaidBalance',
      label: 'Outstanding',
      sortable: true,
      render: (value: number) => formatCurrency(value),
    },
  ], []);

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
            <DataTable
              columns={consumerReportColumns}
              data={consumerReports}
              loading={loading}
              emptyMessage="No consumer data available."
              enableFiltering
              filterPlaceholder="Search consumer report by zone or totals..."
            />
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
            <DataTable
              columns={monthlyReportColumns}
              data={monthlyReports}
              loading={loading}
              emptyMessage="No billing data available."
              enableFiltering
              filterPlaceholder="Search billing summary by period or totals..."
            />
          </div>
        </div>
      ),
    },
  ];

  return (
    <MainLayout title="Billing Reports">
      <div className="reports-page">
        <div className="report-controls">
          <div className="control-group">
            <FormInput label="Start Period" type="date" value={fromDate} onChange={setFromDate} icon="fa-calendar-alt" />
            <FormInput label="End Period" type="date" value={toDate} onChange={setToDate} icon="fa-calendar-check" />
            <FormSelect label="Coverage Area" value={zoneFilter} onChange={setZoneFilter} options={zoneOptions} placeholder="All Service Zones" icon="fa-map-marked-alt" />
          </div>
          <div className="report-actions">
            <button className="btn btn-primary" onClick={loadReports}>
              <i className="fas fa-sync-alt"></i> Refresh Reports
            </button>
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
              <div className="card-label">{finalizedPayments.length} finalized payment records</div>
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
