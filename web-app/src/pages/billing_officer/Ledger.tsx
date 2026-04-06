import React, { useState, useEffect, useCallback } from 'react';
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
  meterReading?: number;
  consumption?: number;
  waterBilling?: number;
  penalty?: number;
  meterFee?: number;
  payment?: number;
  receiptNumber?: string;
  balance?: number;
  isYearHeader?: boolean;
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

  const loadLedgerData = useCallback(async () => {
    setLoading(true);
    try {
      const mockData: LedgerEntry[] = [
        {
          Account_Number: '02-11-149-5',
          Consumer_Name: 'NATURA VERDE FARM & PRIVATE RESORT',
          Address: 'DAGOTDOTAN',
          Classification: 'COM.',
          Current_Balance: 5270.39,
          Last_Payment: '2025-03-14',
          Status: 'Active',
        },
        {
          Account_Number: '02-11-150-1',
          Consumer_Name: 'JUAN DELA CRUZ',
          Address: 'SAN LORENZO',
          Classification: 'RES.',
          Current_Balance: 0.0,
          Last_Payment: '2025-04-01',
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

  const loadClassifications = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/classifications`);
      const result = await response.json();
      if (result.success) {
        setClassifications(result.data);
      }
    } catch (error) {
      console.error('Error loading classifications:', error);
    }
  }, [API_URL]);

  const filterData = useCallback(() => {
    let filtered = ledgerData;

    if (searchTerm) {
      filtered = filtered.filter(
        (entry) =>
          entry.Account_Number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          entry.Consumer_Name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredData(filtered);
  }, [ledgerData, searchTerm]);

  useEffect(() => {
    loadLedgerData();
    loadZones();
    loadClassifications();
  }, [loadLedgerData, loadZones, loadClassifications]);

  useEffect(() => {
    filterData();
  }, [filterData]);

  const handleViewLedger = (entry: LedgerEntry) => {
    setSelectedConsumer(entry);
    loadTransactions(entry.Account_Number);
    setShowLedgerModal(true);
  };

  const loadTransactions = async (accountNumber: string) => {
    try {
      const mockTransactions: Transaction[] = [
        { date: '2024', isYearHeader: true },
        {
          date: 'JAN',
          meterReading: 3986,
          consumption: 36,
          waterBilling: 540.00,
          penalty: 0,
          meterFee: 0,
          payment: 540.00,
          receiptNumber: '06407676',
          balance: 0,
        },
        {
          date: 'FEB',
          meterReading: 4008,
          consumption: 22,
          waterBilling: 330.00,
          penalty: 0,
          meterFee: 0,
          payment: 330.00,
          receiptNumber: '06408556',
          balance: 0,
        },
        {
          date: 'MAR',
          meterReading: 4026,
          consumption: 18,
          waterBilling: 270.00,
          penalty: 0,
          meterFee: 0,
          payment: 217.00,
          receiptNumber: '9730714',
          balance: 53.00,
        },
        {
          date: 'APR',
          meterReading: 4051,
          consumption: 25,
          waterBilling: 375.00,
          penalty: 0,
          meterFee: 0,
          payment: 375.00,
          receiptNumber: '9730987',
          balance: 0,
        },
        { date: '2025', isYearHeader: true },
        {
          date: 'JAN',
          meterReading: 4167,
          consumption: 11,
          waterBilling: 165.00,
          penalty: 0,
          meterFee: 0,
          payment: 0,
          receiptNumber: '',
          balance: 165.00,
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
      label: 'Type',
      sortable: true,
    },
    {
      key: 'Current_Balance',
      label: 'Outstanding Balance',
      sortable: true,
      render: (val: number) => (
        <span className={val > 0 ? 'balance-due' : 'balance-paid'}>
          ₱{(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Registry',
      render: (_: any, entry: LedgerEntry) => (
        <button className="btn btn-sm btn-info" onClick={() => handleViewLedger(entry)}>
          <i className="fas fa-book"></i> View Records
        </button>
      ),
    },
  ];

  return (
    <MainLayout title="Billing Collections Ledger">
      <div className="ledger-page">
        {/* Registry Search & Control Hub */}
        <div className="registry-control-hub card shadow-sm border-0 mb-4" style={{ borderRadius: '20px' }}>
          <div className="card-body p-4">
            <div className="hub-layout">
              {/* Search Group */}
              <div className="hub-search-main">
                <div className="input-group-custom">
                  <div className="input-icon-wrapper">
                    <i className="fas fa-search"></i>
                  </div>
                  <input
                    type="text"
                    placeholder="Search registry by name, account ID, or meter serial..."
                    className="form-control"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              {/* Filters Group */}
              <div className="hub-filters">
                <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} className="form-select-custom">
                  <option value="">All Map Zones</option>
                  {zones.map((z) => <option key={z.Zone_ID} value={z.Zone_ID}>{z.Zone_Name}</option>)}
                </select>

                <select value={classificationFilter} onChange={(e) => setClassificationFilter(e.target.value)} className="form-select-custom">
                  <option value="">All Types</option>
                  {classifications.map((c) => <option key={c.Classification_ID} value={c.Classification_ID}>{c.Classification_Name}</option>)}
                </select>

                <button className="btn-sync-registry" onClick={loadLedgerData} title="Sync Records">
                  <i className="fas fa-sync-alt"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Collections Table */}
        <div className="card shadow-sm border-0" style={{ borderRadius: '24px', overflow: 'hidden' }}>
          <div className="card-header bg-white py-4 border-light">
            <h2 className="card-title" style={{ fontSize: '18px', fontWeight: '800', color: '#1B1B63' }}>Collections Financial Registry</h2>
          </div>
          <div className="card-body p-0">
            <div style={{ padding: '24px' }}>
                <DataTable columns={columns} data={filteredData} loading={loading} />
            </div>
          </div>
        </div>

        {/* High-Fidelity Paper Ledger Modal */}
        {showLedgerModal && selectedConsumer && (
          <Modal
            isOpen={showLedgerModal}
            onClose={() => setShowLedgerModal(false)}
            size="portrait"
            title="Digital Water Service Record"
          >
            <div className="paper-ledger-container">
              {/* Official Ledger Header */}
              <div className="ledger-official-header">
                <div className="official-text">
                  <h3>WATER SERVICE RECORD</h3>
                  <p>REPUBLIC OF THE PHILIPPINES</p>
                  <p>MUNICIPALITY OF SAN LORENZO RUIZ</p>
                </div>
              </div>

              {/* Exact Consumer Background Info Rows */}
              <div className="ledger-consumer-info">
                <div className="info-row-layout">
                  {/* Row 1: Account, Zone, Meter Serial */}
                  <div className="form-field">
                    <span className="form-label">Account No.</span>
                    <span className="form-data underline">{selectedConsumer.Account_Number}</span>
                  </div>
                  <div className="form-field flex-narrow">
                    <span className="form-label">Zone</span>
                    <span className="form-data underline">Zone 2</span>
                  </div>
                  <div className="form-field">
                    <span className="form-label">Meter Serial No.</span>
                    <span className="form-data underline">0801000048</span>
                  </div>
                </div>

                <div className="info-row-layout">
                  {/* Row 2: Name, Meter Size, Brand */}
                  <div className="form-field flex-wide">
                    <span className="form-label">Consumer Name</span>
                    <span className="form-data underline">{selectedConsumer.Consumer_Name}</span>
                  </div>
                  <div className="form-field flex-narrow">
                    <span className="form-label">Meter Size</span>
                    <span className="form-data underline">1/2"</span>
                  </div>
                  <div className="form-field">
                    <span className="form-label">Brand</span>
                    <span className="form-data underline">ARAD</span>
                  </div>
                </div>

                <div className="info-row-layout">
                  {/* Row 3: Address, Classification, Connection Date */}
                  <div className="form-field flex-wide">
                    <span className="form-label">Address</span>
                    <span className="form-data underline">{selectedConsumer.Address}</span>
                  </div>
                  <div className="form-field">
                    <span className="form-label">Classification</span>
                    <span className="form-data underline">{selectedConsumer.Classification}</span>
                  </div>
                  <div className="form-field">
                    <span className="form-label">Connection Date</span>
                    <span className="form-data underline">2020-05-15</span>
                  </div>
                </div>
              </div>

              {/* Physical Ledger Table Grid */}
              <div className="paper-table-wrapper">
                <table className="paper-ledger-table">
                  <thead>
                    <tr>
                      <th rowSpan={2}>Date</th>
                      <th rowSpan={2}>Meter Reading</th>
                      <th rowSpan={2}>Consumption</th>
                      <th rowSpan={2}>Water Billing</th>
                      <th rowSpan={2}>Penalty</th>
                      <th rowSpan={2}>Meter</th>
                      <th rowSpan={2}>Payment</th>
                      <th rowSpan={2}>Receipt Number</th>
                      <th colSpan={2}>Balance</th>
                    </tr>
                    <tr>
                      <th className="sub-th">PHP</th>
                      <th className="sub-th">cts.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((txn, index) => {
                      if (txn.isYearHeader) {
                        return (
                          <tr key={index} className="year-header-row">
                            <td colSpan={10} className="font-bold">{txn.date}</td>
                          </tr>
                        );
                      }
                      const balanceParts = (txn.balance || 0).toFixed(2).split('.');
                      return (
                        <tr key={index}>
                          <td className="text-center font-bold">{txn.date}</td>
                          <td className="text-right">{txn.meterReading}</td>
                          <td className="text-right">{txn.consumption}</td>
                          <td className="text-right">{txn.waterBilling?.toFixed(2)}</td>
                          <td className="text-right">{txn.penalty && txn.penalty > 0 ? txn.penalty.toFixed(2) : ''}</td>
                          <td className="text-right">{txn.meterFee && txn.meterFee > 0 ? txn.meterFee.toFixed(2) : ''}</td>
                          <td className="text-right font-bold">{txn.payment && txn.payment > 0 ? txn.payment.toFixed(2) : ''}</td>
                          <td className="text-center">{txn.receiptNumber}</td>
                          <td className="text-right">{balanceParts[0]}</td>
                          <td className="text-right">{balanceParts[1]}</td>
                        </tr>
                      );
                    })}
                    {/* Filling empty rows for paper feel */}
                    {[...Array(8)].map((_, i) => (
                      <tr key={`empty-${i}`} className="empty-row">
                        <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="ledger-footer-actions no-print">
                <button className="btn btn-secondary" onClick={() => setShowLedgerModal(false)}>Close Registry</button>
                <button className="btn btn-primary" onClick={() => window.print()}>
                  <i className="fas fa-print"></i> Generate Official Audit Report
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </MainLayout>
  );
};

export default Ledger;
