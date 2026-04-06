import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import Tabs, { Tab } from '../../components/Common/Tabs';
import Modal from '../../components/Common/Modal';
import { useToast } from '../../components/Common/ToastContainer';
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
      // 1. Get rates and settings from localStorage
      const savedRates = JSON.parse(localStorage.getItem('water_rates') || '{}');
      const savedSystem = JSON.parse(localStorage.getItem('system_settings') || '{}');

      // 2. Default Values (Fallback)
      const config = {
        min10: parseFloat(savedRates.minimumRate || '160.00'),
        r11_20: parseFloat(savedRates.rate11to20 || '16.00'),
        r21_30: parseFloat(savedRates.rate21to30 || '18.00'),
        r31_40: parseFloat(savedRates.rate31to40 || '20.00'),
        rPlus: parseFloat(savedRates.rate41Plus || '22.00'),
        offset: parseInt(savedSystem.dueDateDays || '30')
      };

      // 3. Helper for Progressive Math
      const calculateBill = (cons: number) => {
        let total = config.min10; // First 10
        if (cons > 10) {
          const tier1 = Math.min(cons - 10, 10);
          total += tier1 * config.r11_20;
        }
        if (cons > 20) {
          const tier2 = Math.min(cons - 20, 10);
          total += tier2 * config.r21_30;
        }
        if (cons > 30) {
          const tier3 = Math.min(cons - 30, 10);
          total += tier3 * config.r31_40;
        }
        if (cons > 40) {
          const tier4 = cons - 40;
          total += tier4 * config.rPlus;
        }
        return total;
      };

      // 4. Helper for Due Date
      const getDueDate = (readingStr: string) => {
        const date = new Date(readingStr);
        date.setDate(date.getDate() + config.offset);
        return date.toISOString().split('T')[0];
      };

      const mockBills: Bill[] = [
        {
          Bill_ID: 2024001,
          Account_Number: '02-11-149-5',
          Consumer_Name: 'NATURA VERDE FARM',
          Previous_Reading: 517,
          Current_Reading: 542,
          Consumption: 25,
          Bill_Amount: calculateBill(25), 
          Due_Date: getDueDate('2026-03-01'), 
          Status: 'Unpaid',
          Billing_Period: 'March 2026',
          Bill_Date: '2026-03-01',
          Address: 'DAGOTDOTAN, SLR',
          Classification: 'Commercial',
        },
        {
          Bill_ID: 2024002,
          Account_Number: '02-05-102-1',
          Consumer_Name: 'JUAN DELA CRUZ',
          Previous_Reading: 120,
          Current_Reading: 128,
          Consumption: 8,
          Bill_Amount: calculateBill(8),
          Due_Date: getDueDate('2026-03-01'),
          Status: 'Unpaid',
          Billing_Period: 'March 2026',
          Bill_Date: '2026-03-01',
          Address: 'P-1 MATACONG, SLR',
          Classification: 'Residential',
        },
      ];
      setBills(mockBills);
    } catch (error) {
      showToast('Failed to load bills', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

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
        <div>
          <div className="search-filters">
            <div className="search-container">
              <input
                type="text"
                placeholder="Search by account no. or consumer name..."
                className="search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button className="btn btn-secondary">
                <i className="fas fa-search"></i>
              </button>
            </div>
            <div className="filter-container">
              <select
                value={zoneFilter}
                onChange={(e) => setZoneFilter(e.target.value)}
                className="form-control"
              >
                <option value="">All Zones</option>
                {zones.map((z) => (
                  <option key={z.Zone_ID} value={z.Zone_ID}>
                    {z.Zone_Name}
                  </option>
                ))}
              </select>
              <button className="btn btn-secondary">Filter</button>
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
