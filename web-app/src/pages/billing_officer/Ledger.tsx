import React, { useState, useEffect } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import Modal from '../../components/Common/Modal';
import { useToast } from '../../components/Common/ToastContainer';
import './Ledger.css';

interface LedgerEntry {
  Account_Number: string;
  Consumer_Name: string;
  Address: string;
  Classification: string;
  Current_Balance: number;
  Last_Payment: string;
  Status: string;
}

interface Transaction {
  date: string;
  type: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

const Ledger: React.FC = () => {
  const { showToast } = useToast();
  const [ledgerData, setLedgerData] = useState<LedgerEntry[]>([]);
  const [filteredData, setFilteredData] = useState<LedgerEntry[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [classifications, setClassifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('');
  const [selectedConsumer, setSelectedConsumer] = useState<LedgerEntry | null>(null);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  useEffect(() => {
    loadLedgerData();
    loadZones();
    loadClassifications();
  }, []);

  useEffect(() => {
    filterData();
  }, [ledgerData, searchTerm, zoneFilter, classificationFilter]);

  const loadLedgerData = async () => {
    setLoading(true);
    try {
      const mockData: LedgerEntry[] = [
        {
          Account_Number: 'ACC-001',
          Consumer_Name: 'Juan Dela Cruz',
          Address: '123 Main St, Zone 1',
          Classification: 'Residential',
          Current_Balance: 850.0,
          Last_Payment: '2026-02-15',
          Status: 'Active',
        },
        {
          Account_Number: 'ACC-002',
          Consumer_Name: 'Maria Santos',
          Address: '456 Oak Ave, Zone 2',
          Classification: 'Commercial',
          Current_Balance: 0.0,
          Last_Payment: '2026-03-10',
          Status: 'Active',
        },
      ];
      setLedgerData(mockData);
    } catch (error) {
      console.error('Error loading ledger data:', error);
      showToast('Failed to load ledger data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadZones = async () => {
    try {
      const response = await fetch(`${API_URL}/zones`);
      const result = await response.json();
      if (result.success) {
        setZones(result.data);
      }
    } catch (error) {
      console.error('Error loading zones:', error);
    }
  };

  const loadClassifications = async () => {
    try {
      const response = await fetch(`${API_URL}/classifications`);
      const result = await response.json();
      if (result.success) {
        setClassifications(result.data);
      }
    } catch (error) {
      console.error('Error loading classifications:', error);
    }
  };

  const filterData = () => {
    let filtered = ledgerData;

    if (searchTerm) {
      filtered = filtered.filter(
        (entry) =>
          entry.Account_Number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          entry.Consumer_Name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredData(filtered);
  };

  const handleViewLedger = (entry: LedgerEntry) => {
    setSelectedConsumer(entry);
    loadTransactions(entry.Account_Number);
    setShowLedgerModal(true);
  };

  const loadTransactions = async (accountNumber: string) => {
    try {
      const mockTransactions: Transaction[] = [
        {
          date: '2026-03-01',
          type: 'Bill',
          description: 'Water Bill - March 2026',
          debit: 850.0,
          credit: 0,
          balance: 850.0,
        },
        {
          date: '2026-02-15',
          type: 'Payment',
          description: 'Payment Received - OR-2026-001',
          debit: 0,
          credit: 800.0,
          balance: 0,
        },
      ];
      setTransactions(mockTransactions);
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  };

  const columns = [
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
      key: 'Address',
      label: 'Address',
      sortable: true,
    },
    {
      key: 'Classification',
      label: 'Classification',
      sortable: true,
    },
    {
      key: 'Current_Balance',
      label: 'Current Balance',
      sortable: true,
      render: (entry: LedgerEntry) => (
        <span className={entry.Current_Balance > 0 ? 'balance-due' : 'balance-paid'}>
          ₱{(entry.Current_Balance || 0).toFixed(2)}
        </span>
      ),
    },
    {
      key: 'Last_Payment',
      label: 'Last Payment',
      sortable: true,
    },
    {
      key: 'Status',
      label: 'Status',
      sortable: true,
      render: (entry: LedgerEntry) => (
        <span className={`status-badge status-${(entry.Status || 'unknown').toLowerCase()}`}>{entry.Status || 'Unknown'}</span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (entry: LedgerEntry) => (
        <button className="btn btn-sm btn-info" onClick={() => handleViewLedger(entry)}>
          <i className="fas fa-book"></i> View Ledger
        </button>
      ),
    },
  ];

  return (
    <MainLayout title="Digital Ledger">
      <div className="ledger-page">
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
              <i className="fas fa-search"></i> Search
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
            <select
              value={classificationFilter}
              onChange={(e) => setClassificationFilter(e.target.value)}
              className="form-control"
            >
              <option value="">All Classifications</option>
              {classifications.map((c) => (
                <option key={c.Classification_ID} value={c.Classification_ID}>
                  {c.Classification_Name}
                </option>
              ))}
            </select>
            <button className="btn btn-secondary">Filter</button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Consumer List</h2>
          </div>
          <div className="card-body">
            <DataTable columns={columns} data={filteredData} loading={loading} />
          </div>
        </div>

        {showLedgerModal && selectedConsumer && (
          <Modal
            isOpen={showLedgerModal}
            title={`Ledger - ${selectedConsumer.Consumer_Name}`}
            onClose={() => setShowLedgerModal(false)}
            size="large"
          >
            <div className="ledger-view">
              <div className="ledger-info">
                <div className="info-row">
                  <span className="label">Account Number:</span>
                  <span className="value">{selectedConsumer.Account_Number}</span>
                </div>
                <div className="info-row">
                  <span className="label">Address:</span>
                  <span className="value">{selectedConsumer.Address}</span>
                </div>
                <div className="info-row">
                  <span className="label">Classification:</span>
                  <span className="value">{selectedConsumer.Classification}</span>
                </div>
                <div className="info-row">
                  <span className="label">Current Balance:</span>
                  <span
                    className={`value ${
                      selectedConsumer.Current_Balance > 0 ? 'balance-due' : 'balance-paid'
                    }`}
                  >
                    ₱{(selectedConsumer.Current_Balance || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <h3>Transaction History</h3>
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Debit</th>
                    <th>Credit</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn, index) => (
                    <tr key={index}>
                      <td>{txn.date}</td>
                      <td>
                        <span className={`txn-type txn-${(txn.type || 'unknown').toLowerCase()}`}>{txn.type || 'Unknown'}</span>
                      </td>
                      <td>{txn.description}</td>
                      <td className="amount-debit">
                        {txn.debit > 0 ? `₱${(txn.debit || 0).toFixed(2)}` : '-'}
                      </td>
                      <td className="amount-credit">
                        {txn.credit > 0 ? `₱${(txn.credit || 0).toFixed(2)}` : '-'}
                      </td>
                      <td className="amount-balance">₱{(txn.balance || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Modal>
        )}
      </div>
    </MainLayout>
  );
};

export default Ledger;
