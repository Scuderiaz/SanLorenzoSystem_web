import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import Tabs, { Tab } from '../../components/Common/Tabs';
import FormInput from '../../components/Common/FormInput';
import FormSelect from '../../components/Common/FormSelect';
import { useToast } from '../../components/Common/ToastContainer';
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

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  const loadZones = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/zones`);
      const result = await response.json();
      if (result.success) {
        setZones(result.data);
      }
    } catch (error) {
      console.error('Error loading zones:', error);
    }
  }, [API_URL]);

  const loadReportOverview = useCallback(async () => {
    try {
      // In a real app, these would come from an API
      // For now, aligning with March 2026 mock data
      setTotalConsumers('150');
      setTotalBills('145');
      setTotalRevenue('₱125,000.00');
    } catch (error) {
      console.error('Error loading report overview:', error);
    }
  }, []);

  useEffect(() => {
    loadZones();
    loadReportOverview();
    loadConsumerReport();
    loadMonthlyReport();
  }, [loadZones, loadReportOverview]);

  const loadConsumerReport = async () => {
    setLoading(true);
    try {
      const mockData: ConsumerReport[] = [
        { zone: 'Zone 1', totalConsumers: 45, active: 42, inactive: 3, percentage: '93.3%' },
        { zone: 'Zone 2', totalConsumers: 38, active: 35, inactive: 3, percentage: '92.1%' },
        { zone: 'Zone 3', totalConsumers: 35, active: 33, inactive: 2, percentage: '94.3%' },
        { zone: 'Zone 4', totalConsumers: 32, active: 30, inactive: 2, percentage: '93.8%' },
      ];
      setConsumerReports(mockData);
    } catch (error) {
      console.error('Error loading consumer report:', error);
      showToast('Failed to load consumer report', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadMonthlyReport = async () => {
    try {
      const mockData: MonthlyUnifiedReport[] = [
        {
          period: 'March 2026',
          billsGenerated: 145,
          totalInvoiced: 125000,
          totalCollected: 103500,
          collectionRate: '82.8%',
          unpaidBalance: 21500,
        },
        {
          period: 'February 2026',
          billsGenerated: 142,
          totalInvoiced: 118000,
          totalCollected: 112218,
          collectionRate: '95.1%',
          unpaidBalance: 5782,
        },
      ];
      setMonthlyReports(mockData);
    } catch (error) {
      console.error('Error loading monthly report:', error);
      showToast('Failed to load monthly report', 'error');
    }
  };

  const handleGenerateReports = () => {
    loadConsumerReport();
    loadMonthlyReport();
    showToast('Reports generated successfully', 'success');
  };

  const handleExportConsumerReport = () => {
    showToast('Exporting consumer report...', 'info');
  };

  const handleExportMonthlyReport = () => {
    showToast('Exporting monthly billing & collection report...', 'info');
  };

  const zoneOptions = zones.map((z) => ({ value: z.Zone_ID, label: z.Zone_Name }));

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
                      <td>₱{report.totalInvoiced.toLocaleString()}</td>
                      <td>₱{report.totalCollected.toLocaleString()}</td>
                      <td style={{ 
                        color: parseFloat(report.collectionRate) >= 90 ? '#10b981' : '#f59e0b',
                        fontWeight: 'bold'
                      }}>
                        {report.collectionRate}
                      </td>
                      <td style={{ color: report.unpaidBalance > 0 ? '#ef4444' : 'inherit' }}>
                        ₱{report.unpaidBalance.toLocaleString()}
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
        {/* Top Actions */}
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

        {/* Global Filters */}
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

        {/* Real-time Summary Metrics */}
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
