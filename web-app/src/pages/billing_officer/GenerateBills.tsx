import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import Tabs, { Tab } from '../../components/Common/Tabs';
import Modal from '../../components/Common/Modal';
import { useToast } from '../../components/Common/ToastContainer';
import FormSelect from '../../components/Common/FormSelect';
import './GenerateBills.css';

interface Bill {
  Bill_ID: number;
  Account_Number: string;
  Consumer_Name: string;
  Previous_Reading: number;
  Current_Reading: number;
  Consumption: number;
  Bill_Amount: number;
  Due_Date: string;
  Status: string;
  Billing_Period?: string;
  Bill_Date?: string;
  Address?: string;
  Classification?: string;
}

const GenerateBills: React.FC = () => {
  const { showToast } = useToast();
  const [bills, setBills] = useState<Bill[]>([]);
  const [filteredBills, setFilteredBills] = useState<Bill[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [showBillModal, setShowBillModal] = useState(false);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  const loadBills = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch Latest Rates and Settings
      let rateConfig = {
        minimum_cubic: 10,
        minimum_rate: 75.00,
        excess_rate_per_cubic: 7.50
      };
      let systemConfig = {
        dueDateDays: 15
      };

      try {
        const [rateRes, systemSettingsRaw] = await Promise.all([
          fetch(`${API_URL}/water-rates/latest`).then(res => res.json()),
          localStorage.getItem('system_settings')
        ]);

        if (rateRes.success && rateRes.data) {
          rateConfig = {
            minimum_cubic: rateRes.data.minimum_cubic,
            minimum_rate: rateRes.data.minimum_rate,
            excess_rate_per_cubic: rateRes.data.excess_rate_per_cubic
          };
        } else {
            // Fallback to localStorage with new keys
            const savedRates = JSON.parse(localStorage.getItem('water_rates') || '{}');
            rateConfig = {
                minimum_cubic: parseFloat(savedRates.minimumCubic || '10'),
                minimum_rate: parseFloat(savedRates.minimumRate || '75.00'),
                excess_rate_per_cubic: parseFloat(savedRates.excessRate || '7.50')
            };
        }

        if (systemSettingsRaw) {
          const parsedSystem = JSON.parse(systemSettingsRaw);
          systemConfig.dueDateDays = parseInt(parsedSystem.dueDateDays || '15');
        }
      } catch (error) {
        console.error('Error fetching billing config:', error);
      }

      // 2. Helper for Simplified calculation
      const calculateBill = (cons: number) => {
        if (cons <= rateConfig.minimum_cubic) {
          return rateConfig.minimum_rate;
        }
        return rateConfig.minimum_rate + ((cons - rateConfig.minimum_cubic) * rateConfig.excess_rate_per_cubic);
      };

      // 3. Helper for Due Date
      const getDueDate = (readingStr: string) => {
        const date = new Date(readingStr);
        date.setDate(date.getDate() + systemConfig.dueDateDays);
        return date.toISOString().split('T')[0];
      };

      // 4. Fetch Real Bills from API
      const response = await fetch(`${API_URL}/bills`);
      const data = await response.json();
      
      // Handle array or success: true data structure
      const billList = Array.isArray(data) ? data : (data.data || []);
      
      setBills(billList);
    } catch (error) {
      console.error('Error loading bills:', error);
      showToast('Failed to load bills', 'error');
    } finally {
      setLoading(false);
    }
  }, [API_URL, showToast]);

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

  const filterBills = useCallback(() => {
    let filtered = bills;

    if (searchTerm) {
      filtered = filtered.filter(
        (b) =>
          b.Account_Number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          b.Consumer_Name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredBills(filtered);
  }, [bills, searchTerm]);

  useEffect(() => {
    loadBills();
    loadZones();
  }, [loadBills, loadZones]);

  useEffect(() => {
    filterBills();
  }, [filterBills]);

  const handleViewBill = (bill: Bill) => {
    setSelectedBill(bill);
    setShowBillModal(true);
  };

  const handleRefreshBills = () => {
    loadBills();
    showToast('Bills refreshed', 'success');
  };

  const recentBillsColumns = [
    {
      key: 'Account_Number',
      label: 'Account No.',
      sortable: true,
    },
    {
      key: 'Consumer_Name',
      label: 'Consumer Name',
      sortable: true,
    },
    {
      key: 'Previous_Reading',
      label: 'Previous Reading',
      sortable: true,
    },
    {
      key: 'Current_Reading',
      label: 'Current Reading',
      sortable: true,
    },
    {
      key: 'Consumption',
      label: 'Consumption',
      sortable: true,
      render: (val: number) => `${val || 0} cu.m`,
    },
    {
      key: 'Bill_Amount',
      label: 'Bill Amount',
      sortable: true,
      render: (val: number) => `₱${(val || 0).toFixed(2)}`,
    },
    {
      key: 'Due_Date',
      label: 'Due Date',
      sortable: true,
    },
    {
      key: 'Status',
      label: 'Status',
      sortable: true,
      render: (val: string) => (
        <span className={`status-badge status-${(val || 'unknown').toLowerCase()}`}>{val || 'Unknown'}</span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_: any, bill: Bill) => (
        <button className="btn btn-sm btn-info" onClick={() => handleViewBill(bill)}>
          <i className="fas fa-eye"></i> View
        </button>
      ),
    },
  ];

  const tabs: Tab[] = [
    {
      id: 'recent',
      label: 'Recent Bills',
      content: (
        <div className="tab-content">
          <div className="filter-bar">
            <div className="search-box">
              <i className="fas fa-search"></i>
              <input
                type="text"
                placeholder="Search by account no. or consumer name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="filters">
              <FormSelect
                label=""
                value={zoneFilter}
                onChange={setZoneFilter}
                options={zones.map(z => ({ value: z.Zone_ID, label: z.Zone_Name }))}
                placeholder="All Map Zones"
                icon="fa-map-marker-alt"
              />
              <button className="btn btn-secondary" onClick={loadBills} title="Refresh Records">
                <i className="fas fa-sync-alt"></i>
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Auto-Generated Bills</h2>
              <div>
                <span style={{ color: '#28a745' }}>
                  <i className="fas fa-info-circle"></i> Bills are automatically generated when
                  meter readings are synced
                </span>
              </div>
            </div>
            <div className="card-body">
              <DataTable columns={recentBillsColumns} data={filteredBills} loading={loading} />
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-secondary" onClick={handleRefreshBills}>
              <i className="fas fa-sync-alt"></i> Refresh Bills
            </button>
          </div>
        </div>
      ),
    },
    {
      id: 'history',
      label: 'Bill History',
      content: (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Bill History</h2>
          </div>
          <div className="card-body">
            <DataTable columns={recentBillsColumns} data={bills} loading={loading} />
          </div>
        </div>
      ),
    },
  ];

  return (
    <MainLayout title="Billing & Collections Audit">
      <div className="generate-bills-page">
        <div className="page-intro" style={{ marginBottom: '10px' }}>
            <h3 style={{ color: '#1B1B63', fontSize: '18px', fontWeight: '800' }}>Operational Billing Registry</h3>
            <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>Analyze and review generated water bills before finalizing the collection lifecycle.</p>
        </div>
        <Tabs tabs={tabs} defaultTab="recent" />

        {showBillModal && selectedBill && (
          <Modal
            isOpen={showBillModal}
            title="Water Bill"
            onClose={() => setShowBillModal(false)}
            size="large"
          >
            <div className="bill-preview">
              <div className="bill-header">
                <div className="bill-title">
                  <h2>San Lorenzo Ruiz Waterworks System</h2>
                  <p>Municipality of San Lorenzo Ruiz</p>
                  <h3>WATER BILL</h3>
                </div>
              </div>
              <div className="bill-info">
                <div className="bill-customer">
                  <p>
                    <strong>Account No.:</strong> {selectedBill.Account_Number}
                  </p>
                  <p>
                    <strong>Name:</strong> {selectedBill.Consumer_Name}
                  </p>
                  <p>
                    <strong>Address:</strong> {selectedBill.Address}
                  </p>
                  <p>
                    <strong>Classification:</strong> {selectedBill.Classification}
                  </p>
                </div>
                <div className="bill-details">
                  <p>
                    <strong>Bill No.:</strong> {selectedBill.Bill_ID}
                  </p>
                  <p>
                    <strong>Billing Period:</strong> {selectedBill.Billing_Period}
                  </p>
                  <p>
                    <strong>Bill Date:</strong> {selectedBill.Bill_Date}
                  </p>
                  <p>
                    <strong>Due Date:</strong> {selectedBill.Due_Date}
                  </p>
                </div>
              </div>
              <div className="bill-consumption">
                <table>
                  <thead>
                    <tr>
                      <th>Previous Reading</th>
                      <th>Current Reading</th>
                      <th>Consumption</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{selectedBill.Previous_Reading}</td>
                      <td>{selectedBill.Current_Reading}</td>
                      <td>{selectedBill.Consumption} cu.m</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="bill-amount">
                <h3>Total Amount Due</h3>
                <h2>₱{(selectedBill.Bill_Amount || 0).toFixed(2)}</h2>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </MainLayout>
  );
};

export default GenerateBills;
