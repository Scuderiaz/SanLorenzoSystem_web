import React, { useState, useEffect } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import Modal from '../../components/Common/Modal';
import { useToast } from '../../components/Common/ToastContainer';
import './Ledger.css';

interface RecordEntry {
  Month_Year: string;
  Reading: number;
  Consumption: number;
  Water_Bill: number;
  Penalty: number;
  Meter_Fee: number;
  Amount_Paid: number;
  Date_Paid: string;
  OR_No: string;
  Balance: number;
}

interface ConsumerProfile {
  Name: string;
  Address: string;
  Account_No: string;
  Meter_No: string;
  Connection_Date: string;
  Zone_Name?: string;
}

const TreasurerLedger: React.FC = () => {
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [consumer, setConsumer] = useState<ConsumerProfile | null>(null);
  const [records, setRecords] = useState<RecordEntry[]>([]);

  const handleSearch = async (termToSearch = searchTerm) => {
    if (!termToSearch.trim()) {
      setRecords([]);
      setConsumer(null);
      return;
    }
    setLoading(true);
    setShowSuggestions(false);
    try {
      setConsumer({
        Name: 'NATURA VERDE FARM & PRIVATE RESORT',
        Address: 'DAGOTDOTAN, SAN LORENZO RUIZ',
        Account_No: '02-11-149-5',
        Meter_No: '0801000048',
        Connection_Date: 'OCTOBER 15, 2021',
        Zone_Name: '02'
      });

      const mockEntries: RecordEntry[] = [
        { Month_Year: 'DEC 2023', Reading: 542, Consumption: 15, Water_Bill: 330.0, Penalty: 33.0, Meter_Fee: 5.0, Amount_Paid: 368.0, Date_Paid: '2023-12-28', OR_No: '2468135', Balance: 5270.39 },
        { Month_Year: 'JAN 2024', Reading: 565, Consumption: 23, Water_Bill: 506.0, Penalty: 50.6, Meter_Fee: 5.0, Amount_Paid: 561.6, Date_Paid: '2024-01-30', OR_No: '2469001', Balance: 5270.39 },
        { Month_Year: 'FEB 2024', Reading: 582, Consumption: 17, Water_Bill: 374.0, Penalty: 37.4, Meter_Fee: 5.0, Amount_Paid: 416.4, Date_Paid: '2024-02-28', OR_No: '2470088', Balance: 5270.39 }
      ];
      setRecords(mockEntries);
    } catch (error) {
      showToast('No records found for this account', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchTerm.length >= 2) {
      const mockMatches = ['02-11-149-5 - NATURA VERDE FARM', 'JUAN DELA CRUZ'].filter(s => s.toLowerCase().includes(searchTerm.toLowerCase()));
      setSuggestions(mockMatches);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [searchTerm]);

  const columns = [
    { key: 'Month_Year', label: 'MONTH & YEAR' },
    { key: 'Reading', label: 'READING' },
    { key: 'Consumption', label: 'USAGE (m³)' },
    { key: 'Water_Bill', label: 'BILL', render: (v: number) => `₱${v.toFixed(2)}` },
    { key: 'Penalty', label: 'PENALTY', render: (v: number) => `₱${v.toFixed(2)}` },
    { key: 'OR_No', label: 'OR NO.', render: (v: string) => <span className="or-badge">{v}</span> },
    { key: 'Date_Paid', label: 'DATE PAID' },
    { key: 'Amount_Paid', label: 'PAID', render: (v: number) => <strong style={{ color: '#10b981' }}>₱${v.toFixed(2)}</strong> },
    { key: 'Balance', label: 'BALANCE', render: (v: number) => <span className="balance-due">₱${v.toLocaleString()}</span> }
  ];

  return (
    <MainLayout title="Financial Registry: Records of Payment">
      <div className="treasurer-ledger-page">
        {/* Registry Search & Control Hub */}
        <div className="registry-control-hub card shadow-sm border-0 mb-4" style={{ borderRadius: '24px' }}>
          <div className="card-body p-4">
            <div className="hub-layout">
              <div className="hub-search-main">
                <div className="input-group-custom">
                  <div className="input-icon-wrapper">
                    <i className="fas fa-search-dollar"></i>
                  </div>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search registry by Account No, Consumer Name, or Meter Serial..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    onFocus={() => searchTerm.length >= 2 && setShowSuggestions(true)}
                  />
                  
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="search-suggestions no-print">
                      {suggestions.map((suggestion, index) => (
                        <div 
                          key={index}
                          className="suggestion-item"
                          onClick={() => {
                            setSearchTerm(suggestion.split(' - ')[0]);
                            handleSearch(suggestion.split(' - ')[0]);
                          }}
                        >
                          <i className="fas fa-user-circle"></i>
                          {suggestion}
                        </div>
                      ))}
                    </div>
                  )}

                  <button className="btn btn-primary" onClick={() => handleSearch()} style={{ minWidth: '150px', borderRadius: '0 12px 12px 0' }}>
                    SEARCH
                  </button>
                </div>
              </div>

              <div className="hub-filters">
                <button className="btn-sync-registry" onClick={() => handleSearch()} title="Sync Records">
                  <i className="fas fa-sync-alt"></i>
                </button>
              </div>
            </div>

            {consumer && (
              <div className="profile-dashboard mt-4">
                <div className="profile-header-actions mb-4 d-flex justify-content-between align-items-center">
                  <div className="profile-item">
                    <span className="label">CONSUMER NAME</span>
                    <span className="name">{consumer.Name}</span>
                  </div>
                  <button className="btn btn-primary" onClick={() => setShowLedgerModal(true)} style={{ borderRadius: '12px', padding: '12px 24px' }}>
                    <i className="fas fa-file-contract mr-2"></i> View Official Ledger Record
                  </button>
                </div>
                
                <div className="profile-grid">
                  <div className="profile-item small">
                    <span className="label">ADDRESS</span>
                    <span className="value">{consumer.Address}</span>
                  </div>
                  <div className="profile-item small">
                    <span className="label">ACCT NO</span>
                    <span className="value">{consumer.Account_No}</span>
                  </div>
                  <div className="profile-item small">
                    <span className="label">METER NO</span>
                    <span className="value">{consumer.Meter_No}</span>
                  </div>
                  <div className="profile-item small">
                    <span className="label">CONNECTION DATE</span>
                    <span className="value">{consumer.Connection_Date}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Historical Archive Table */}
        <div className="card shadow-sm border-0" style={{ borderRadius: '24px' }}>
          <div className="card-header bg-white py-3">
            <h2 className="card-title m-0 h5 font-weight-bold" style={{ color: '#1B1B63' }}>Historical Records of Payment Archive</h2>
          </div>
          <div className="card-body p-0">
            <DataTable columns={columns} data={records} loading={loading} emptyMessage="Execute a search to view payment history." />
          </div>
        </div>

        {/* Official Portrait Ledger Modal */}
        {showLedgerModal && consumer && (
          <Modal isOpen={showLedgerModal} onClose={() => setShowLedgerModal(false)} title="Official Water Service Record" size="portrait">
            <div className="paper-ledger-container">
              <div className="ledger-official-header">
                <p>REPUBLIC OF THE PHILIPPINES</p>
                <h3>SAN LORENZO WATER SYSTEM</h3>
                <p>Guiguinto, Bulacan</p>
                <div style={{ marginTop: '10px', fontSize: '14px', fontWeight: 900, textDecoration: 'underline' }}>WATER SERVICE RECORD</div>
              </div>

              <div className="ledger-consumer-info">
                <div className="info-row-layout">
                  <div className="form-field"><span className="form-label">Acc. No.</span><div className="form-data underline">{consumer.Account_No}</div></div>
                  <div className="form-field flex-narrow"><span className="form-label">Zone</span><div className="form-data underline">{consumer.Zone_Name || '02'}</div></div>
                  <div className="form-field"><span className="form-label">Meter Serial No.</span><div className="form-data underline">{consumer.Meter_No}</div></div>
                </div>
                <div className="info-row-layout">
                  <div className="form-field flex-wide"><span className="form-label">Name</span><div className="form-data underline">{consumer.Name}</div></div>
                  <div className="form-field flex-narrow"><span className="form-label">Size</span><div className="form-data underline">1/2"</div></div>
                  <div className="form-field"><span className="form-label">Brand</span><div className="form-data underline">ELSTER</div></div>
                </div>
                <div className="info-row-layout">
                  <div className="form-field flex-wide"><span className="form-label">Address</span><div className="form-data underline">{consumer.Address}</div></div>
                  <div className="form-field flex-narrow"><span className="form-label">Class</span><div className="form-data underline">RES</div></div>
                  <div className="form-field"><span className="form-label">Date Con.</span><div className="form-data underline">{consumer.Connection_Date}</div></div>
                </div>
              </div>

              <div className="paper-table-wrapper">
                <table className="paper-ledger-table">
                  <thead>
                    <tr>
                      <th rowSpan={2}>Reading</th>
                      <th rowSpan={2}>Cu. M. Used</th>
                      <th rowSpan={2}>Water Bill</th>
                      <th rowSpan={2}>Penalty</th>
                      <th rowSpan={2}>Meter Fee</th>
                      <th rowSpan={2}>Amount Paid</th>
                      <th rowSpan={2}>Date Paid</th>
                      <th rowSpan={2}>O.R. No.</th>
                      <th colSpan={2}>Balance</th>
                    </tr>
                    <tr><th className="sub-th">PHP</th><th className="sub-th">cts.</th></tr>
                  </thead>
                  <tbody>
                    <tr className="year-header-row"><td colSpan={10}>2024</td></tr>
                    {records.map((t, idx) => (
                      <tr key={idx}>
                        <td className="text-right">{t.Reading}</td>
                        <td className="text-center">{t.Consumption}</td>
                        <td className="text-right">{t.Water_Bill.toFixed(2)}</td>
                        <td className="text-right">{t.Penalty.toFixed(2)}</td>
                        <td className="text-right">{t.Meter_Fee.toFixed(2)}</td>
                        <td className="text-right font-bold">{t.Amount_Paid.toFixed(2)}</td>
                        <td className="text-center">{t.Date_Paid}</td>
                        <td className="text-center font-bold">{t.OR_No}</td>
                        <td className="text-right">{Math.floor(t.Balance)}</td>
                        <td className="text-right">{(t.Balance % 1).toFixed(2).split('.')[1]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="ledger-footer-actions no-print">
                <button className="btn btn-secondary" onClick={() => setShowLedgerModal(false)}>Close Registry</button>
                <button className="btn btn-primary" onClick={() => window.print()}><i className="fas fa-print"></i> Generate Official Audit Report</button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </MainLayout>
  );
};

export default TreasurerLedger;
