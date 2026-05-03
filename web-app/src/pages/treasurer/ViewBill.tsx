import React, { useState, useEffect } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import FormInput from '../../components/Common/FormInput';
import { useToast } from '../../components/Common/ToastContainer';
import './ViewBill.css';

interface Bill {
  Bill_ID: string;
  Account_Number: string;
  Consumer_Name: string;
  Address: string;
  Classification: string;
  Billing_Period: string;
  Bill_Date: string;
  Due_Date: string;
  Previous_Reading: number;
  Current_Reading: number;
  Consumption: number;
  Rate: number;
  Basic_Charge: number;
  Environmental_Fee: number;
  Total_Amount: number;
  Previous_Balance: number;
  Penalties: number;
  Total_Amount_Due: number;
  Status: string;
}

const ViewBill: React.FC = () => {
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(false);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  const handleSearchBill = async () => {
    if (!searchTerm.trim()) {
      showToast('Please enter account number or Consumer name', 'error');
      return;
    }

    setLoading(true);
    try {
      const mockBill: Bill = {
        Bill_ID: 'BILL-2026-001',
        Account_Number: 'ACC-001',
        Consumer_Name: 'Juan Dela Cruz',
        Address: '123 Main St, Zone 1, San Lorenzo Ruiz',
        Classification: 'Residential',
        Billing_Period: 'March 2026',
        Bill_Date: '2026-03-01',
        Due_Date: '2026-03-31',
        Previous_Reading: 100,
        Current_Reading: 125,
        Consumption: 25,
        Rate: 15.0,
        Basic_Charge: 375.0,
        Environmental_Fee: 25.0,
        Total_Amount: 400.0,
        Previous_Balance: 450.0,
        Penalties: 50.0,
        Total_Amount_Due: 900.0,
        Status: 'Unpaid',
      };
      setSelectedBill(mockBill);
    } catch (error) {
      console.error('Error searching bill:', error);
      showToast('Bill not found', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintBill = () => {
    if (!selectedBill) return;
    window.print();
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setSelectedBill(null);
  };

  return (
    <MainLayout title="Strategic Bill Information & Lookup">
      <div className="view-bill-page">
        {/* Advanced Search Portal */}
        <div className="search-section">
          <div className="card">
            <div className="card-header" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '20px' }}>
              <h2 className="card-title">Concessionaire Identity Filter</h2>
            </div>
            <div className="card-body">
                <div style={{ padding: '24px' }}>
                    <div className="search-container">
                        <FormInput
                        label="Account Number or Legal Name"
                        type="text"
                        value={searchTerm}
                        onChange={setSearchTerm}
                        placeholder="Enter identifier..."
                        icon="fa-id-badge"
                        />
                        <div className="search-actions">
                        <button className="btn btn-primary" style={{ padding: '12px 24px', borderRadius: '12px', fontWeight: '800' }} onClick={handleSearchBill} disabled={loading}>
                            <i className="fas fa-search"></i> {loading ? 'Analyzing...' : 'Execute Lookup'}
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '12px 24px', borderRadius: '12px', fontWeight: '700' }} onClick={handleClearSearch}>
                            <i className="fas fa-eraser"></i> Clear
                        </button>
                        </div>
                    </div>
                </div>
            </div>
          </div>
        </div>

        {/* Dynamic Bill Presentation */}
        {selectedBill && (
          <div className="bill-section">
            <div className="bill-actions">
              <button className="btn btn-primary" style={{ padding: '12px 28px', borderRadius: '12px', fontWeight: '800', background: 'linear-gradient(135deg, #1B1B63, #15154d)' }} onClick={handlePrintBill}>
                <i className="fas fa-file-invoice"></i> AUTHORIZE & PRINT STATEMENT
              </button>
            </div>

            <div className="bill-container">
              {/* Header: Official Insignia */}
              <div className="bill-header">
                <div className="bill-logo">
                  <img 
                    src="/slr-water-billing-logo.png" 
                    alt="San Lorenzo Ruiz Water Logo" 
                    className="bill-logo-img" 
                    style={{ height: '80px', width: 'auto', objectFit: 'contain' }}
                  />
                </div>
                <div className="bill-title">
                  <h1>San Lorenzo Ruiz Waterworks System</h1>
                  <h2>Strategic Finance Department</h2>
                  <p>Municipality of San Lorenzo Ruiz, Camarines Norte</p>
                  <h3>BILL STATEMENT</h3>
                </div>
                <div className="bill-qr">
                  <div className="qr-placeholder">
                    <i className="fas fa-barcode"></i>
                  </div>
                </div>
              </div>

              {/* Body: High-Hierarchy Information */}
              <div className="bill-info">
                <div className="info-block">
                  <h3>Concessionaire Profile</h3>
                  <div className="info-row">
                    <span className="info-label">Account No.</span>
                    <span className="info-value">{selectedBill.Account_Number}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Legal Name</span>
                    <span className="info-value">{selectedBill.Consumer_Name}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Address</span>
                    <span className="info-value">{selectedBill.Address}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Type</span>
                    <span className="info-value">{selectedBill.Classification}</span>
                  </div>
                </div>

                <div className="info-block">
                  <h3>Audit Metadata</h3>
                  <div className="info-row">
                    <span className="info-label">Bill ID</span>
                    <span className="info-value">{selectedBill.Bill_ID}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Period</span>
                    <span className="info-value">{selectedBill.Billing_Period}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Issued</span>
                    <span className="info-value">{selectedBill.Bill_Date}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label" style={{ color: '#dc2626' }}>Deadline</span>
                    <span className="info-value" style={{ color: '#dc2626' }}>{selectedBill.Due_Date}</span>
                  </div>
                </div>
              </div>

              {/* Consumption Audit */}
              <div className="consumption-section">
                <h3>Consumption Analytics (cu.m)</h3>
                <table className="consumption-table">
                  <thead>
                    <tr>
                      <th>Historical Reading</th>
                      <th>Current Reading</th>
                      <th>Metred Volume</th>
                      <th>Unit Tariff</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{selectedBill.Previous_Reading}</td>
                      <td>{selectedBill.Current_Reading}</td>
                      <td>{selectedBill.Consumption} mÂ³</td>
                      <td>â‚±{(selectedBill.Rate || 0).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Financial Breakdown */}
              <div className="charges-section">
                <h3>Financial Audit Summary</h3>
                <table className="charges-table">
                  <tbody>
                    <tr>
                      <td>Core Utility Charge</td>
                      <td>â‚±{(selectedBill.Basic_Charge || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td>Environmental Compliance Fee</td>
                      <td>â‚±{(selectedBill.Environmental_Fee || 0).toFixed(2)}</td>
                    </tr>
                    <tr className="subtotal">
                      <td><strong>Net Period Charges</strong></td>
                      <td><strong>â‚±{(selectedBill.Total_Amount || 0).toFixed(2)}</strong></td>
                    </tr>
                    <tr>
                      <td>Arrears / Previous Balance</td>
                      <td>â‚±{(selectedBill.Previous_Balance || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td>Late Fulfillment Penalties</td>
                      <td>â‚±{(selectedBill.Penalties || 0).toFixed(2)}</td>
                    </tr>
                    <tr className="total">
                      <td><strong>GROSS LIQUIDITY DUE</strong></td>
                      <td><strong>â‚±{(selectedBill.Total_Amount_Due || 0).toFixed(2)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Payment Protocols */}
              <div className="payment-info">
                <div className="payment-block">
                  <h3>State Status</h3>
                  <p><strong>Compliance:</strong> <span className={`status-${(selectedBill.Status || 'unknown').toLowerCase()}`}>{selectedBill.Status || 'Payment Pending'}</span></p>
                  <p><strong>Settlement Deadline:</strong> {selectedBill.Due_Date}</p>
                  <p style={{ fontStyle: 'italic', fontSize: '11px' }}>* Penalties accrue post-deadline.</p>
                </div>

                <div className="payment-methods">
                  <h3>Authorized Collection Points</h3>
                  <ul>
                    <li><i className="fas fa-landmark"></i> Municipal Treasury Core</li>
                    <li><i className="fas fa-network-wired" style={{ opacity: 0.5 }}></i> Digital Uplink (Pending)</li>
                  </ul>
                </div>
              </div>

              {/* Bill Footer */}
              <div className="bill-footer">
                <p><strong>Disclaimers:</strong> This statement is an official internal audit document. Present this record to the Treasurer for immediate settlement.</p>
                <p><em>Computer Generated Statement - San Lorenzo Ruiz Waterworks Infrastructure</em></p>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default ViewBill;



