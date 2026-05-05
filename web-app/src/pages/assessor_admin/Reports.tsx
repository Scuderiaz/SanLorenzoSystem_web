import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import Tabs, { Tab } from '../../components/Common/Tabs';
import DataTable, { Column } from '../../components/Common/DataTable';
import FormInput from '../../components/Common/FormInput';
import FormSelect from '../../components/Common/FormSelect';
import { useToast } from '../../components/Common/ToastContainer';
import { getErrorMessage, loadZonesWithFallback, requestJsonWithOfflineSnapshot } from '../../services/userManagementApi';
import './Reports.css';

interface ConsumerReport {
  zone: string;
  totalConsumers: number;
  active: number;
  inactive: number;
  percentage: string;
}

interface MonthlyUnifiedReport {
  period: string;
  billsGenerated: number;
  totalInvoiced: number;
  totalCollected: number;
  collectionRate: string;
  unpaidBalance: number;
}

const formatZoneLabel = (zoneName?: string, zoneId?: number | string | null) =>
  zoneName || (zoneId ? `Zone ${zoneId}` : 'Not Assigned');

const Reports: React.FC = () => {
  const { showToast } = useToast();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [zones, setZones] = useState<any[]>([]);

  const [totalConsumers, setTotalConsumers] = useState('Loading...');
  const [totalBills, setTotalBills] = useState('Loading...');
  const [totalRevenue, setTotalRevenue] = useState('Loading...');

  const [consumerReports, setConsumerReports] = useState<ConsumerReport[]>([]);
  const [monthlyReports, setMonthlyReports] = useState<MonthlyUnifiedReport[]>([]);
  const [loading, setLoading] = useState(false);

  const loadZones = useCallback(async () => {
    try {
      const result = await loadZonesWithFallback();
      setZones(result.data || []);
      if (result.source === 'supabase') {
        showToast('Zones loaded using Supabase fallback.', 'warning');
      }
    } catch (error) {
      console.error('Error loading zones:', error);
      showToast(getErrorMessage(error, 'Failed to load zones.'), 'error');
    }
  }, [showToast]);

  const loadReportOverview = useCallback(async () => {
    const params = new URLSearchParams();
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    if (zoneFilter) params.set('zoneId', zoneFilter);

    const result = await requestJsonWithOfflineSnapshot<any>(
      `/admin/reports/overview?${params.toString()}`,
      `dataset.adminReportsOverview.${fromDate || 'all'}.${toDate || 'all'}.${zoneFilter || 'all'}`,
      'Failed to load report overview.',
      (payload) => payload?.data || {}
    );

    setTotalConsumers(String(result.data?.totalConsumers ?? 0));
    setTotalBills(String(result.data?.totalBills ?? 0));
    setTotalRevenue(`PHP ${Number(result.data?.totalRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    return result.source;
  }, [fromDate, toDate, zoneFilter]);

  const loadConsumerReport = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (zoneFilter) params.set('zoneId', zoneFilter);

    try {
      const result = await requestJsonWithOfflineSnapshot<any[]>(
        `/admin/reports/consumers?${params.toString()}`,
        `dataset.adminReportsConsumers.${zoneFilter || 'all'}`,
        'Failed to load Consumer report.',
        (payload) => payload?.data || []
      );

      setConsumerReports(result.data || []);
      return result.source;
    } finally {
      setLoading(false);
    }
  }, [zoneFilter]);

  const loadMonthlyReport = useCallback(async () => {
    const params = new URLSearchParams();
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    if (zoneFilter) params.set('zoneId', zoneFilter);

    const result = await requestJsonWithOfflineSnapshot<any[]>(
      `/admin/reports/monthly?${params.toString()}`,
      `dataset.adminReportsMonthly.${fromDate || 'all'}.${toDate || 'all'}.${zoneFilter || 'all'}`,
      'Failed to load monthly report.',
      (payload) => payload?.data || []
    );

    setMonthlyReports(result.data || []);
    return result.source;
  }, [fromDate, toDate, zoneFilter]);

  const loadAllReports = useCallback(async () => {
    try {
      const sources = await Promise.all([
        loadReportOverview(),
        loadConsumerReport(),
        loadMonthlyReport(),
      ]);

      if (sources.includes('offline')) {
        showToast('Reports loaded from the offline snapshot.', 'warning');
      }
      return true;
    } catch (error) {
      console.error('Error loading reports:', error);
      showToast(getErrorMessage(error, 'Failed to load reports.'), 'error');
      return false;
    }
  }, [loadConsumerReport, loadMonthlyReport, loadReportOverview, showToast]);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  useEffect(() => {
    loadAllReports();
  }, [loadAllReports]);

  const handleGenerateReports = async () => {
    const loaded = await loadAllReports();
    if (loaded) {
      showToast('Reports generated successfully', 'success');
    }
  };

  const handleExportConsumerReport = () => {
    showToast('Consumer report export is not available yet.', 'info');
  };

  const handleExportMonthlyReport = () => {
    showToast('Monthly report export is not available yet.', 'info');
  };

  const zoneOptions = zones.map((z) => ({
    value: z.Zone_ID ?? z.zone_id,
    label: formatZoneLabel(z.Zone_Name ?? z.zone_name, z.Zone_ID ?? z.zone_id),
  }));

  const consumerReportColumns: Column[] = [
    { key: 'zone', label: 'Zone', sortable: true },
    { key: 'totalConsumers', label: 'Total Consumers', sortable: true },
    { key: 'active', label: 'Active', sortable: true },
    { key: 'inactive', label: 'Inactive', sortable: true },
    { key: 'percentage', label: 'Percentage', sortable: true },
  ];

  const monthlyReportColumns: Column[] = [
    { key: 'period', label: 'Period', sortable: true },
    { key: 'billsGenerated', label: 'Bills Generated', sortable: true },
    {
      key: 'totalInvoiced',
      label: 'Total Invoiced',
      sortable: true,
      render: (value: number) => `PHP ${value.toLocaleString()}`,
    },
    {
      key: 'totalCollected',
      label: 'Actual Collections',
      sortable: true,
      render: (value: number) => `PHP ${value.toLocaleString()}`,
    },
    {
      key: 'collectionRate',
      label: 'Collection Rate',
      sortable: true,
      render: (value: string) => (
        <span style={{
          color: parseFloat(value) >= 90 ? '#10b981' : '#f59e0b',
          fontWeight: 'bold'
        }}>
          {value}
        </span>
      ),
    },
    {
      key: 'unpaidBalance',
      label: 'Unpaid Balance',
      sortable: true,
      render: (value: number) => (
        <span style={{ color: value > 0 ? '#ef4444' : 'inherit' }}>
          PHP {value.toLocaleString()}
        </span>
      ),
    },
  ];

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
              enablePagination
              pageSize={10}
              emptyMessage="No Consumer data available"
              enableFiltering
              filterPlaceholder="Search Consumer report by zone or totals..."
            />
          </div>
        </div>
      ),
    },
    {
      id: 'monthly',
      label: 'Monthly Billing & Collection Report',
      content: (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Monthly Billing & Collection Summary</h2>
          </div>
          <div className="card-body">
            <DataTable
              columns={monthlyReportColumns}
              data={monthlyReports}
              loading={loading}
              enablePagination
              pageSize={10}
              emptyMessage="No report data available"
              enableFiltering
              filterPlaceholder="Search monthly report by period or values..."
            />
          </div>
        </div>
      ),
    },
  ];

  return (
    <MainLayout title="Strategic Analytics">
      <div className="reports-page">
        <div className="action-buttons">
          <button className="btn btn-primary" onClick={handleGenerateReports}>
            <i className="fas fa-sync-alt"></i> Run All Reports
          </button>
          <button className="btn btn-secondary" onClick={handleExportConsumerReport}>
            <i className="fas fa-file-pdf"></i> Export Consumers
          </button>
          <button className="btn btn-secondary" onClick={handleExportMonthlyReport}>
            <i className="fas fa-file-invoice-dollar"></i> Export Monthly Report
          </button>
        </div>

        <div className="report-controls">
          <div className="control-group">
            <FormInput
              label="Start Period"
              type="date"
              value={fromDate}
              onChange={setFromDate}
              icon="fa-calendar-alt"
            />
            <FormInput
              label="End Period"
              type="date"
              value={toDate}
              onChange={setToDate}
              icon="fa-calendar-check"
            />
            <FormSelect
              label="Coverage Area"
              value={zoneFilter}
              onChange={setZoneFilter}
              options={zoneOptions}
              placeholder="All Service Zones"
              icon="fa-map-marked-alt"
            />
          </div>
        </div>

        <div className="dashboard-cards">
          <div className="card card-highlight-blue">
            <div className="card-header">
              <h2 className="card-title">Base Consumers</h2>
              <i className="fas fa-users"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{totalConsumers}</div>
              <div className="card-label">Active connection pool</div>
            </div>
          </div>
          <div className="card card-highlight-gold">
            <div className="card-header">
              <h2 className="card-title">Invoiced Volume</h2>
              <i className="fas fa-file-invoice"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{totalBills}</div>
              <div className="card-label">Total bills this period</div>
            </div>
          </div>
          <div className="card card-highlight-green">
            <div className="card-header">
              <h2 className="card-title">Gross Collection</h2>
              <i className="fas fa-coins"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{totalRevenue}</div>
              <div className="card-label">Verified revenue</div>
            </div>
          </div>
        </div>

        <Tabs tabs={tabs} defaultTab="consumers" />
      </div>
    </MainLayout>
  );
};

export default Reports;


