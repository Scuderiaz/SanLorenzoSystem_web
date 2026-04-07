import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import Modal from '../../components/Common/Modal';
import { useToast } from '../../components/Common/ToastContainer';
import './ProcessPayment.css';

interface Consumer {
  Bill_ID?: number;
  Consumer_ID?: number;
  Account_Number: string;
  Consumer_Name: string;
  Address: string;
  Classification: string;
  Billing_Month: string;
  Previous_Reading: number;
  Current_Reading: number;
  Consumption: number;
  Basic_Charge: number;
  Environmental_Fee: number;
  Current_Bill: number;
  Previous_Balance: number;
  Penalties: number;
  Total_Amount_Due: number;
  Status: string;
}

interface Payment {
  Receipt_No: string;
  Account_Number: string;
  Consumer_Name: string;
  Amount: number;
  Payment_Date: string;
  Payment_Method: string;
  Status: string;
}

const ProcessPayment: React.FC = () => {
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConsumer, setSelectedConsumer] = useState<Consumer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showFullBillModal, setShowFullBillModal] = useState(false);
  const [currentReceipt, setCurrentReceipt] = useState<Payment | null>(null);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  const loadPaymentHistory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/payments`);
      const data = await response.json();
      const list = Array.isArray(data) ? data : (data.data || []);
      setPayments(list);
    } catch (error) {
      console.error('Error loading payment history:', error);
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    loadPaymentHistory();
  }, [loadPaymentHistory]);

  const handleSearchConsumer = async () => {
    if (!searchTerm.trim()) {
      showToast('Please enter account number or consumer name', 'error');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/bills?Account_Number=${searchTerm}&status=Unpaid`);
      const data = await response.json();
      
      if (data && data.length > 0) {
        const bill = data[0]; // Take the oldest unpaid bill
        const mappedConsumer: Consumer = {
          Bill_ID: bill.Bill_ID, // Adding Bill_ID to help with payment
          Consumer_ID: bill.Consumer_ID,
          Account_Number: bill.Account_Number || searchTerm,
          Consumer_Name: bill.Consumer_Name,
          Address: bill.Address || 'N/A',
          Classification: bill.Classification || 'Residential',
          Billing_Month: bill.Billing_Month || 'Current',
          Previous_Reading: 0,
          Current_Reading: 0,
          Consumption: 0,
          Basic_Charge: bill.Total_Amount,
          Environmental_Fee: 0,
          Current_Bill: bill.Total_Amount,
          Previous_Balance: 0,
          Penalties: 0,
          Total_Amount_Due: bill.Total_Amount,
          Status: bill.Status,
        };
        setSelectedConsumer(mappedConsumer);
        setAmountPaid(bill.Total_Amount.toString());
        showToast('Valid statement for settlement identified.', 'success');
      } else {
        showToast('No outstanding unpaid bills found for this account.', 'warning');
        setSelectedConsumer(null);
      }
    } catch (error) {
      console.error('Error searching consumer:', error);
      showToast('Account verification failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessPayment = async () => {
    if (!selectedConsumer) {
      showToast('Please search and select a consumer first', 'error');
      return;
    }

    if (!receiptNumber.trim()) {
      showToast('Please enter receipt number', 'error');
      return;
    }

    if (!amountPaid || parseFloat(amountPaid) <= 0) {
      showToast('Please enter valid amount paid', 'error');
      return;
    }

    try {
      setLoading(true);
      const currentDate = new Date().toISOString().split('T')[0];
      
      const payload = {
        Bill_ID: (selectedConsumer as any).Bill_ID,
        Consumer_ID: (selectedConsumer as any).Consumer_ID,
        Amount_Paid: parseFloat(amountPaid),
        Payment_Date: currentDate,
        Payment_Method: paymentMethod,
        Reference_No: receiptNumber,
      };

      const response = await fetch(`${API_URL}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (response.ok) {
        const newPayment: Payment = {
          Receipt_No: receiptNumber,
          Account_Number: selectedConsumer.Account_Number,
          Consumer_Name: selectedConsumer.Consumer_Name,
          Amount: parseFloat(amountPaid),
          Payment_Date: currentDate,
          Payment_Method: paymentMethod,
          Status: 'Paid',
        };

        setCurrentReceipt(newPayment);
        setShowReceiptModal(true);
        showToast('Collection Record successfully finalized. Synced for audit.', 'success');
        
        // Clear form
        setSelectedConsumer(null);
        setSearchTerm('');
        setAmountPaid('');
        setReceiptNumber('');
        
        loadPaymentHistory();
      } else {
        showToast(result.message || 'Payment processing failed.', 'error');
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      showToast('Failed to record collection.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const paymentColumns = [
    { key: 'Receipt_No', label: 'Receipt No.', sortable: true },
    { key: 'Account_Number', label: 'Account No.', sortable: true },
    { key: 'Consumer_Name', label: 'Consumer Name', sortable: true },
    { 
      key: 'Amount', 
      label: 'Amount', 
      sortable: true, 
      render: (val: number) => `₱${(val || 0).toFixed(2)}` 
    },
    { key: 'Payment_Method', label: 'Method', sortable: true },
    { key: 'Payment_Date', label: 'Date', sortable: true },
    { 
      key: 'Status', 
      label: 'Status', 
      sortable: true, 
      render: (val: string) => (
        <span className={`status-badge status-${(val || 'unknown').toLowerCase()}`}>{val || 'Unknown'}</span>
      )
    },
  ];

  const handleClear = () => {
    setSearchTerm('');
    setSelectedConsumer(null);
    setAmountPaid('');
    setReceiptNumber('');
  };

  return (
    <MainLayout title="Collections Point (Manual OR Entry)">
      <div className="process-payment-page">
        {/* Payment Processing Hub - MOVED TO TOP */}
        <div className="card">
          <div className="card-header" style={{ marginBottom: '30px' }}>
            <h2 className="card-title">Manual Official Receipt (OR) Processor</h2>
          </div>
          <div className="card-body">
            {/* DETAILED VIEW: FULL BILL BREAKDOWN (MOVED FROM VIEW BILL) */}
            {selectedConsumer && (
              <div className="bill-detail-breakdown">
                <div className="breakdown-header">
                  <i className="fas fa-file-invoice-dollar"></i>
                  <span>Detailed Bill Status for {selectedConsumer.Billing_Month}</span>
                </div>
                <div className="breakdown-grid">
                  <div className="breakdown-item">
                    <span className="label">Prev/Current Reading</span>
                    <span className="value">{selectedConsumer.Previous_Reading} / {selectedConsumer.Current_Reading}</span>
                  </div>
                  <div className="breakdown-item">
                    <span className="label">Consumption (m³)</span>
                    <span className="value">{selectedConsumer.Consumption}</span>
                  </div>
                  <div className="breakdown-item">
                    <span className="label">Basic Tariff</span>
                    <span className="value">₱{selectedConsumer.Basic_Charge.toFixed(2)}</span>
                  </div>
                  <div className="breakdown-item">
                    <span className="label">Fees (Env/Maint)</span>
                    <span className="value">₱{selectedConsumer.Environmental_Fee.toFixed(2)}</span>
                  </div>
                  <div className="breakdown-item highlight">
                    <span className="label">Arrears/Penalty</span>
                    <span className="value">₱{(selectedConsumer.Previous_Balance + selectedConsumer.Penalties).toFixed(2)}</span>
                  </div>
                  <div className="breakdown-item highlight-total">
                    <span className="label">TOTAL DUE</span>
                    <span className="value">₱{selectedConsumer.Total_Amount_Due.toFixed(2)}</span>
                  </div>
                </div>
                <div className="breakdown-footer">
                  <span className={`status-badge status-${selectedConsumer.Status.toLowerCase()}`}>
                    Status: {selectedConsumer.Status}
                  </span>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowFullBillModal(true)}>
                      <i className="fas fa-file-invoice"></i> View Full Statement
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>
                      <i className="fas fa-print"></i> Print Quick Summary
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Premium Form Layout */}
            <div className="form-grid">
              {/* Data Ingestion Column */}
              <div className="form-column">
                <div className="form-group">
                  <label>Primary Account Identifier</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Account No. or Name"
                      style={{ flex: 1 }}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearchConsumer()}
                    />
                    <button className="btn btn-secondary" onClick={handleSearchConsumer}>
                      <i className="fas fa-search"></i>
                    </button>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '20px' }}>
                  <label>Consolidated Outstanding Balance</label>
                  <input
                    type="text"
                    className="form-control"
                    value={selectedConsumer ? `₱${(selectedConsumer.Total_Amount_Due || 0).toFixed(2)}` : '₱0.00'}
                    readOnly
                  />
                </div>

                <div className="form-group" style={{ marginTop: '20px' }}>
                  <label>Actual Collection Value (PHP)</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="Enter cash amount"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                  />
                </div>
              </div>

              {/* Validation Column */}
              <div className="form-column">
                <div className="form-group">
                  <label>Consumer Identity Verification</label>
                  <input
                    type="text"
                    className="form-control"
                    value={selectedConsumer?.Consumer_Name || 'Entity identity required...'}
                    readOnly
                  />
                </div>

                <div className="form-group" style={{ marginTop: '20px' }}>
                  <label>Collection Source Indicator</label>
                  <select
                    className="form-control"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="Cash">Physical Cash</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginTop: '20px' }}>
                  <label>Official Booklet Receipt No. (OR)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Input OR sequence number"
                    style={{ borderColor: '#f59e0b50', borderStyle: receiptNumber ? 'solid' : 'dashed' }}
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Strategic Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
              <button 
                type="button" 
                className="btn btn-secondary"
                style={{ padding: '12px 24px', borderRadius: '12px', fontWeight: '700' }}
                onClick={handleClear}
              >
                Clear Entry
              </button>
              <button 
                type="button" 
                className="btn btn-primary"
                style={{ padding: '12px 36px', borderRadius: '12px', fontWeight: '800', background: 'linear-gradient(135deg, #1B1B63, #15154d)' }}
                onClick={handleProcessPayment}
              >
                <i className="fas fa-check-double"></i> Authorize Collection & Record
              </button>
            </div>
          </div>
        </div>

        {/* Recent Collections Feed - MOVED TO BOTTOM */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Recent Daily Collections Audit</h2>
            <button className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '700' }}>
                <i className="fas fa-external-link-alt"></i> Collection Summary
            </button>
          </div>
          <div className="card-body">
            <div style={{ padding: '24px' }}>
                <DataTable columns={paymentColumns} data={payments} loading={loading} />
            </div>
          </div>
        </div>

        {/* Transaction Success Overlay */}
        {showReceiptModal && currentReceipt && (
          <Modal
            isOpen={showReceiptModal}
            title="Collection Authorization Proof"
            onClose={() => setShowReceiptModal(false)}
            size="medium"
          >
            <div className="official-receipt-print">
              {/* PH Government Style Header */}
              <div className="receipt-header-official">
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <p style={{ margin: 0, fontSize: '10px', fontWeight: '800' }}>REPUBLIC OF THE PHILIPPINES</p>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: '900' }}>SAN LORENZO RUIZ WATERWORKS SYSTEM</p>
                  <p style={{ margin: 0, fontSize: '10px' }}>PROVINCE OF CAMARINES NORTE</p>
                  <h2 style={{ color: '#1B1B63', fontSize: '20px', margin: '10px 0', borderTop: '1px solid #1B1B63', borderBottom: '1px solid #1B1B63', padding: '5px 0' }}>OFFICIAL RECEIPT</h2>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                    <span><strong>OR No:</strong> <span style={{ color: '#dc2626', fontSize: '18px' }}>{currentReceipt.Receipt_No}</span></span>
                    <span><strong>Date:</strong> {currentReceipt.Payment_Date}</span>
                  </div>
                </div>
              </div>

              {/* Consumer & Acct Metadata */}
              <div className="receipt-metadata">
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '5px', fontSize: '13px' }}>
                  <strong>PAYOR:</strong>
                  <span style={{ borderBottom: '1px solid #e2e8f0', display: 'block' }}>{currentReceipt.Consumer_Name}</span>
                  
                  <strong>ACCT NO:</strong>
                  <span style={{ borderBottom: '1px solid #e2e8f0', display: 'block' }}>{currentReceipt.Account_Number}</span>
                </div>
              </div>

              {/* Structured Financial Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderTop: '1.5px solid #1B1B63', borderBottom: '1.5px solid #1B1B63' }}>
                    <th style={{ textAlign: 'left', padding: '8px' }}>NATURE OF COLLECTION</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px' }}>Water Utility Bill (Current)</td>
                    <td style={{ textAlign: 'right', padding: '8px' }}>₱{(currentReceipt.Amount * 0.8).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px' }}>Arrears / Penalties</td>
                    <td style={{ textAlign: 'right', padding: '8px' }}>₱{(currentReceipt.Amount * 0.2).toFixed(2)}</td>
                  </tr>
                  <tr style={{ borderTop: '1px double #1B1B63', fontWeight: '900', fontSize: '15px' }}>
                    <td style={{ padding: '8px' }}>TOTAL PAID</td>
                    <td style={{ textAlign: 'right', padding: '8px', color: '#10b981' }}>₱{(currentReceipt.Amount || 0).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Authorization Footer */}
              <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div style={{ fontSize: '10px', color: '#64748b', maxWidth: '200px' }}>
                  * This digital record is automatically synchronized with the Billing Officer for financial reconciliation.
                </div>
                <div style={{ textAlign: 'center', borderTop: '1.5px solid #1B1B63', minWidth: '180px', paddingTop: '5px' }}>
                  <p style={{ margin: 0, fontWeight: '900', color: '#1B1B63' }}>TREASURER OFFICER</p>
                  <p style={{ margin: 0, fontSize: '10px' }}>Authorized Signature</p>
                </div>
              </div>

              {/* Modal Actions (Hidden in Print) */}
              <div className="receipt-actions no-print" style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
                <button className="btn btn-primary" style={{ flex: 1, padding: '15px' }} onClick={() => window.print()}>
                    <i className="fas fa-print"></i> AUTHORIZE & PRINT RECEIPT
                </button>
                <button className="btn btn-secondary" style={{ flex: 1, padding: '15px' }} onClick={() => setShowReceiptModal(false)}>
                    Close
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* Full Bill Statement Modal - MOVED FROM VIEW BILL PAGE */}
        {showFullBillModal && selectedConsumer && (
          <Modal
            isOpen={showFullBillModal}
            title="Strategic Financial Statement"
            onClose={() => setShowFullBillModal(false)}
            size="large"
          >
            <div className="bill-container-modal">
              {/* Official Header */}
              <div className="bill-header" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #1B1B63', paddingBottom: '20px', marginBottom: '30px' }}>
                <img src="/images/Waterworks System Payment Logo 1.svg" alt="Logo" style={{ height: '70px' }} />
                <div style={{ textAlign: 'right' }}>
                  <h2 style={{ margin: 0, color: '#1B1B63' }}>San Lorenzo Ruiz Waterworks</h2>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Municipal Treasury Office</p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Camarines Norte, Philippines</p>
                </div>
              </div>

              {/* Bill Details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginBottom: '30px' }}>
                <div>
                  <h4 style={{ color: '#1B1B63', marginBottom: '10px', borderBottom: '1px solid #e2e8f0' }}>Consumer Information</h4>
                  <p><strong>Account:</strong> {selectedConsumer.Account_Number}</p>
                  <p><strong>Name:</strong> {selectedConsumer.Consumer_Name}</p>
                  <p><strong>Address:</strong> {selectedConsumer.Address}</p>
                </div>
                <div>
                  <h4 style={{ color: '#1B1B63', marginBottom: '10px', borderBottom: '1px solid #e2e8f0' }}>Billing Summary</h4>
                  <p><strong>Month:</strong> {selectedConsumer.Billing_Month}</p>
                  <p><strong>Due Date:</strong> 2026-03-31</p>
                  <p><strong>Status:</strong> {selectedConsumer.Status}</p>
                </div>
              </div>

              {/* Consumption Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                    <th style={{ padding: '12px', borderBottom: '1px solid #e2e8f0' }}>Previous</th>
                    <th style={{ padding: '12px', borderBottom: '1px solid #e2e8f0' }}>Current</th>
                    <th style={{ padding: '12px', borderBottom: '1px solid #e2e8f0' }}>Usage</th>
                    <th style={{ padding: '12px', borderBottom: '1px solid #e2e8f0' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '12px' }}>{selectedConsumer.Previous_Reading}</td>
                    <td style={{ padding: '12px' }}>{selectedConsumer.Current_Reading}</td>
                    <td style={{ padding: '12px' }}>{selectedConsumer.Consumption} m³</td>
                    <td style={{ padding: '12px' }}>₱{selectedConsumer.Basic_Charge.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Financial Breakdown */}
              <div style={{ marginLeft: 'auto', width: '300px', backgroundColor: '#f8fafc', padding: '20px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span>Basic:</span>
                  <span>₱{selectedConsumer.Basic_Charge.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span>Fees:</span>
                  <span>₱{selectedConsumer.Environmental_Fee.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span>Balance:</span>
                  <span>₱{selectedConsumer.Previous_Balance.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span>Penalty:</span>
                  <span>₱{selectedConsumer.Penalties.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #1B1B63', paddingTop: '10px', marginTop: '10px', fontWeight: '900', color: '#1B1B63' }}>
                  <span>TOTAL:</span>
                  <span>₱{selectedConsumer.Total_Amount_Due.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ marginTop: '40px', display: 'flex', gap: '15px' }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => window.print()}>
                  <i className="fas fa-print"></i> Authorize & Print Statement
                </button>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowFullBillModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </MainLayout>
  );
};

export default ProcessPayment;
