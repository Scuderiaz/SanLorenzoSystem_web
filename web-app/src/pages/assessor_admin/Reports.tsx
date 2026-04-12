import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import Tabs, { Tab } from '../../components/Common/Tabs';
import FormInput from '../../components/Common/FormInput';
import FormSelect from '../../components/Common/FormSelect';
import { useToast } from '../../components/Common/ToastContainer';
import { getErrorMessage, loadZonesWithFallback, requestJson } from '../../services/userManagementApi';
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
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);
      if (zoneFilter) params.set('zoneId', zoneFilter);

      const result = await requestJson<any>(`/admin/reports/overview?${params.toString()}`, {}, 'Failed to load report overview.');

      setTotalConsumers(String(result.data?.totalConsumers ?? 0));
      setTotalBills(String(result.data?.totalBills ?? 0));
      setTotalRevenue(`PHP ${Number(result.data?.totalRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    } catch (error) {
      console.error('Error loading report overview:', error);
      showToast(getErrorMessage(error, 'Failed to load report overview.'), 'error');
    }
  }, [fromDate, toDate, zoneFilter, showToast]);

  const loadConsumerReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (zoneFilter) params.set('zoneId', zoneFilter);

      const result = await requestJson<any>(`/admin/reports/consumers?${params.toString()}`, {}, 'Failed to load consumer report.');

      setConsumerReports(result.data || []);
    } catch (error) {
      console.error('Error loading consumer report:', error);
      showToast(getErrorMessage(error, 'Failed to load consumer report.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, zoneFilter]);

  const loadMonthlyReport = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);
      if (zoneFilter) params.set('zoneId', zoneFilter);

      const result = await requestJson<any>(`/admin/reports/monthly?${params.toString()}`, {}, 'Failed to load monthly report.');

      setMonthlyReports(result.data || []);
    } catch (error) {
      console.error('Error loading monthly report:', error);
      showToast(getErrorMessage(error, 'Failed to load monthly report.'), 'error');
    }
  }, [fromDate, toDate, zoneFilter, showToast]);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  useEffect(() => {
    loadReportOverview();
    loadConsumerReport();
    loadMonthlyReport();
  }, [loadConsumerReport, loadMonthlyReport, loadReportOverview]);

  const handleGenerateReports = () => {
    loadReportOverview();
    loadConsumerReport();
    loadMonthlyReport();
    showToast('Reports generated successfully', 'success');
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
                  <th>Percentage</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>
                      <i className="fas fa-spinner fa-spin"></i> Loading consumer report...
                    </td>
                  </tr>
                ) : consumerReports.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>
                      No consumer data available
                    </td>
                  </tr>
                ) : (
                  consumerReports.map((report, index) => (
                    <tr key={index}>
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
      label: 'Monthly Billing & Collection Report',
      content: (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Monthly Billing & Collection Summary</h2>
          </div>
          <div className="card-body">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Bills Generated</th>
                  <th>Total Invoiced</th>
                  <th>Actual Collections</th>
                  <th>Collection Rate</th>
                  <th>Unpaid Balance</th>
                </tr>
              </thead>
              <tbody>
                {monthlyReports.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>
                      No report data available
                    </td>
                  </tr>
                ) : (
                  monthlyReports.map((report, index) => (
                    <tr key={index}>
                      <td>{report.period}</td>
                      <td>{report.billsGenerated}</td>
                      <td>PHP {report.totalInvoiced.toLocaleString()}</td>
                      <td>PHP {report.totalCollected.toLocaleString()}</td>
                      <td style={{
                        color: parseFloat(report.collectionRate) >= 90 ? '#10b981' : '#f59e0b',
                        fontWeight: 'bold'
                      }}>
                        {report.collectionRate}
                      </td>
                      <td style={{ color: report.unpaidBalance > 0 ? '#ef4444' : 'inherit' }}>
                        PHP {report.unpaidBalance.toLocaleString()}
                      </td>
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
