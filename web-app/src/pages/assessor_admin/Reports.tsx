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

interface BillingReport {
  period: string;
  billsGenerated: number;
  totalAmount: number;
  paidBills: number;
  unpaidBills: number;
  collectionRate: string;
}

interface CollectionReport {
  date: string;
  collections: number;
  amount: number;
  cashPayments: number;
  onlinePayments: number;
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
  const [billingReports, setBillingReports] = useState<BillingReport[]>([]);
  const [collectionReports, setCollectionReports] = useState<CollectionReport[]>([]);
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
    loadBillingReport();
    loadCollectionReport();
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

  const loadBillingReport = async () => {
    try {
      const mockData: BillingReport[] = [
        {
          period: 'March 2026',
          billsGenerated: 145,
          totalAmount: 125000,
          paidBills: 120,
          unpaidBills: 25,
          collectionRate: '82.8%',
        },
        {
          period: 'February 2026',
          billsGenerated: 142,
          totalAmount: 118000,
          paidBills: 135,
          unpaidBills: 7,
          collectionRate: '95.1%',
        },
      ];
      setBillingReports(mockData);
    } catch (error) {
      console.error('Error loading billing report:', error);
      showToast('Failed to load billing report', 'error');
    }
  };

  const loadCollectionReport = async () => {
    try {
      const mockData: CollectionReport[] = [
        {
          date: '2026-03-18',
          collections: 15,
          amount: 12500,
          cashPayments: 10,
          onlinePayments: 5,
        },
        {
          date: '2026-03-17',
          collections: 18,
          amount: 15200,
          cashPayments: 12,
          onlinePayments: 6,
        },
      ];
      setCollectionReports(mockData);
    } catch (error) {
      console.error('Error loading collection report:', error);
      showToast('Failed to load collection report', 'error');
    }
  };

  const handleGenerateReports = () => {
    loadConsumerReport();
    loadBillingReport();
    loadCollectionReport();
    showToast('Reports generated successfully', 'success');
  };

  const handleExportConsumerReport = () => {
    showToast('Exporting consumer report...', 'info');
  };

  const handleExportBillingReport = () => {
    showToast('Exporting billing report...', 'info');
  };

  const handleExportCollections = () => {
    showToast('Exporting collections report...', 'info');
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
      id: 'billing',
      label: 'Billing Report',
      content: (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Billing Summary Report</h2>
          </div>
          <div className="card-body">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Bills Generated</th>
                  <th>Total Amount</th>
                  <th>Paid Bills</th>
                  <th>Unpaid Bills</th>
                  <th>Collection Rate</th>
                </tr>
              </thead>
              <tbody>
                {billingReports.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>
                      No billing data available
                    </td>
                  </tr>
                ) : (
                  billingReports.map((report, index) => (
                    <tr key={index}>
                      <td>{report.period}</td>
                      <td>{report.billsGenerated}</td>
                      <td>₱{report.totalAmount.toLocaleString()}</td>
                      <td>{report.paidBills}</td>
                      <td>{report.unpaidBills}</td>
                      <td>{report.collectionRate}</td>
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
      id: 'collections',
      label: 'Collections Report',
      content: (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Collections Report</h2>
          </div>
          <div className="card-body">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Collections</th>
                  <th>Amount</th>
                  <th>Cash Payments</th>
                  <th>Online Payments</th>
                </tr>
              </thead>
              <tbody>
                {collectionReports.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>
                      No collection data available
                    </td>
                  </tr>
                ) : (
                  collectionReports.map((report, index) => (
                    <tr key={index}>
                      <td>{report.date}</td>
                      <td>{report.collections}</td>
                      <td>₱{report.amount.toLocaleString()}</td>
                      <td>{report.cashPayments}</td>
                      <td>{report.onlinePayments}</td>
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
          <button className="btn btn-secondary" onClick={handleExportBillingReport}>
            <i className="fas fa-file-invoice-dollar"></i> Export Billing
          </button>
          <button className="btn btn-secondary" onClick={handleExportCollections}>
            <i className="fas fa-wallet"></i> Export Collections
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
