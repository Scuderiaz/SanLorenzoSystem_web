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
      showToast('Please enter account number or consumer name', 'error');
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
    <MainLayout title="View Bill">
      <div className="view-bill-page">
        <div className="search-section">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Search Consumer Bill</h2>
            </div>
            <div className="card-body">
              <div className="search-container">
                <FormInput
                  label="Account Number or Consumer Name"
                  type="text"
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="Enter account number or consumer name..."
                />
                <div className="search-actions">
                  <button className="btn btn-primary" onClick={handleSearchBill} disabled={loading}>
                    <i className="fas fa-search"></i> {loading ? 'Searching...' : 'Search Bill'}
                  </button>
                  <button className="btn btn-secondary" onClick={handleClearSearch}>
                    <i className="fas fa-times"></i> Clear
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {selectedBill && (
          <div className="bill-section">
            <div className="bill-actions">
              <button className="btn btn-primary" onClick={handlePrintBill}>
                <i className="fas fa-print"></i> Print Bill
              </button>
            </div>

            <div className="bill-container">
              <div className="bill-header">
                <div className="bill-logo">
                  <div className="logo-placeholder">
                    <i className="fas fa-tint"></i>
                  </div>
                </div>
                <div className="bill-title">
                  <h1>San Lorenzo Ruiz Waterworks System</h1>
                  <h2>Municipality of San Lorenzo Ruiz</h2>
                  <p>Camarines Norte, Philippines</p>
                  <h3>WATER BILL</h3>
                </div>
                <div className="bill-qr">
                  <div className="qr-placeholder">
                    <i className="fas fa-qrcode"></i>
                  </div>
                </div>
              </div>

              <div className="bill-info">
                <div className="bill-section">
                  <h3>Consumer Information</h3>
                  <div className="info-row">
                    <span className="info-label">Account No.:</span>
                    <span className="info-value">{selectedBill.Account_Number}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Consumer Name:</span>
                    <span className="info-value">{selectedBill.Consumer_Name}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Address:</span>
                    <span className="info-value">{selectedBill.Address}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Classification:</span>
                    <span className="info-value">{selectedBill.Classification}</span>
                  </div>
                </div>

                <div className="bill-section">
                  <h3>Billing Details</h3>
                  <div className="info-row">
                    <span className="info-label">Bill No.:</span>
                    <span className="info-value">{selectedBill.Bill_ID}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Billing Period:</span>
                    <span className="info-value">{selectedBill.Billing_Period}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Bill Date:</span>
                    <span className="info-value">{selectedBill.Bill_Date}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Due Date:</span>
                    <span className="info-value">{selectedBill.Due_Date}</span>
                  </div>
                </div>
              </div>

              <div className="consumption-section">
                <h3>Water Consumption</h3>
                <table className="consumption-table">
                  <thead>
                    <tr>
                      <th>Previous Reading</th>
                      <th>Current Reading</th>
                      <th>Consumption (cu.m)</th>
                      <th>Rate per cu.m</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{selectedBill.Previous_Reading}</td>
                      <td>{selectedBill.Current_Reading}</td>
                      <td>{selectedBill.Consumption}</td>
                      <td>₱{(selectedBill.Rate || 0).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="charges-section">
                <h3>Charges Breakdown</h3>
                <table className="charges-table">
                  <tbody>
                    <tr>
                      <td>Basic Water Charge</td>
                      <td>₱{(selectedBill.Basic_Charge || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td>Environmental Fee</td>
                      <td>₱{(selectedBill.Environmental_Fee || 0).toFixed(2)}</td>
                    </tr>
                    <tr className="subtotal">
                      <td><strong>Current Bill Amount</strong></td>
                      <td><strong>₱{(selectedBill.Total_Amount || 0).toFixed(2)}</strong></td>
                    </tr>
                    <tr>
                      <td>Previous Balance</td>
                      <td>₱{(selectedBill.Previous_Balance || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td>Penalties/Late Fees</td>
                      <td>₱{(selectedBill.Penalties || 0).toFixed(2)}</td>
                    </tr>
                    <tr className="total">
                      <td><strong>TOTAL AMOUNT DUE</strong></td>
                      <td><strong>₱{(selectedBill.Total_Amount_Due || 0).toFixed(2)}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="payment-info">
                <div className="payment-section">
                  <h3>Payment Information</h3>
                  <p><strong>Status:</strong> <span className={`status-${(selectedBill.Status || 'unknown').toLowerCase()}`}>{selectedBill.Status || 'Unknown'}</span></p>
                  <p><strong>Payment Due:</strong> {selectedBill.Due_Date}</p>
                  <p><strong>Late Payment:</strong> Additional penalties may apply after due date</p>
                </div>

                <div className="payment-methods">
                  <h3>Payment Options</h3>
                  <ul>
                    <li><i className="fas fa-building"></i> Municipal Treasurer's Office</li>
                    <li><i className="fas fa-mobile-alt"></i> Mobile Payment (Coming Soon)</li>
                    <li><i className="fas fa-credit-card"></i> Online Banking (Coming Soon)</li>
                  </ul>
                </div>
              </div>

              <div className="bill-footer">
                <p><strong>Important:</strong> Please present this bill when making payment. Keep this copy for your records.</p>
                <p><em>This is a computer-generated bill. No signature required.</em></p>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default ViewBill;
