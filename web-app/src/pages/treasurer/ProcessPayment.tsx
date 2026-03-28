import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import Modal from '../../components/Common/Modal';
import { useToast } from '../../components/Common/ToastContainer';
import './ProcessPayment.css';

interface Consumer {
  Account_Number: string;
  Consumer_Name: string;
  Address: string;
  Classification: string;
  Current_Bill: number;
  Previous_Balance: number;
  Penalties: number;
  Total_Amount_Due: number;
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
  const [currentReceipt, setCurrentReceipt] = useState<Payment | null>(null);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  const loadPaymentHistory = useCallback(async () => {
    setLoading(true);
    try {
      const mockPayments: Payment[] = [
        {
          Receipt_No: 'OR-2026-001',
          Account_Number: 'ACC-001',
          Consumer_Name: 'Juan Dela Cruz',
          Amount: 850.0,
          Payment_Date: '2026-03-18',
          Payment_Method: 'Cash',
          Status: 'Validated',
        },
      ];
      setPayments(mockPayments);
    } catch (error) {
      console.error('Error loading payment history:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPaymentHistory();
  }, [loadPaymentHistory]);

  const handleSearchConsumer = async () => {
    if (!searchTerm.trim()) {
      showToast('Please enter account number or consumer name', 'error');
      return;
    }

    try {
      const mockConsumer: Consumer = {
        Account_Number: 'ACC-001',
        Consumer_Name: 'Juan Dela Cruz',
        Address: '123 Main St, Zone 1',
        Classification: 'Residential',
        Current_Bill: 450.0,
        Previous_Balance: 400.0,
        Penalties: 50.0,
        Total_Amount_Due: 900.0,
      };
      setSelectedConsumer(mockConsumer);
      setAmountPaid(mockConsumer.Total_Amount_Due.toString());
    } catch (error) {
      console.error('Error searching consumer:', error);
      showToast('Consumer not found', 'error');
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
      const currentDate = new Date().toISOString().split('T')[0];
      const newPayment: Payment = {
        Receipt_No: receiptNumber,
        Account_Number: selectedConsumer.Account_Number,
        Consumer_Name: selectedConsumer.Consumer_Name,
        Amount: parseFloat(amountPaid),
        Payment_Date: currentDate,
        Payment_Method: paymentMethod,
        Status: 'Pending',
      };

      setCurrentReceipt(newPayment);
      setShowReceiptModal(true);
      showToast('Payment processed successfully', 'success');
      
      // Clear form
      setSelectedConsumer(null);
      setSearchTerm('');
      setAmountPaid('');
      setReceiptNumber('');
      
      loadPaymentHistory();
    } catch (error) {
      console.error('Error processing payment:', error);
      showToast('Failed to process payment', 'error');
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
        {/* Recent Collections Feed */}
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

        {/* Payment Processing Hub */}
        <div className="card">
          <div className="card-header" style={{ marginBottom: '30px' }}>
            <h2 className="card-title">Manual Official Receipt (OR) Processor</h2>
          </div>
          <div className="card-body">
            {/* High-Fidelity Process Guide */}
            <div className="process-steps">
              <i className="fas fa-shield-alt"></i>
              <span><strong>Protocol:</strong> Search → Collect Cash → Accomplish Booklet → Verify Booklet OR → Finalize & Record Transaction</span>
            </div>

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

            {/* Verification Status Banner */}
            <div className="info-box">
              <i className="fas fa-paper-plane"></i>
              <span>This collection event will be automatically queued for <strong>Billing Department validation</strong>.</span>
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

        {/* Transaction Success Overlay */}
        {showReceiptModal && currentReceipt && (
          <Modal
            isOpen={showReceiptModal}
            title="Collection Authorization Proof"
            onClose={() => setShowReceiptModal(false)}
            size="medium"
          >
            <div className="receipt-preview">
              <div className="receipt-header">
                <img 
                  src="/images/Waterworks System Payment Logo 1.svg" 
                  alt="San Lorenzo Ruiz Water Logo" 
                  style={{ height: '50px', width: 'auto', marginBottom: '10px', objectFit: 'contain' }}
                />
                <p>Digital Collection Record</p>
              </div>
              <div className="receipt-details">
                <div className="receipt-row">
                  <span>OR Sequence:</span>
                  <span>{currentReceipt.Receipt_No}</span>
                </div>
                <div className="receipt-row">
                  <span>Authorized At:</span>
                  <span>{currentReceipt.Payment_Date}</span>
                </div>
                <div className="receipt-row">
                  <span>Acct No:</span>
                  <span>{currentReceipt.Account_Number}</span>
                </div>
                <div className="receipt-row">
                  <span>Internal Consumer:</span>
                  <span>{currentReceipt.Consumer_Name}</span>
                </div>
                <div className="receipt-row">
                  <span style={{ fontSize: '16px', color: '#10b981' }}>Gross Amount:</span>
                  <span style={{ fontSize: '18px', color: '#1B1B63' }}>₱{(currentReceipt.Amount || 0).toFixed(2)}</span>
                </div>
                <div className="receipt-row">
                  <span>Mechanism:</span>
                  <span>{currentReceipt.Payment_Method}</span>
                </div>
              </div>
              <div className="receipt-footer">
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowReceiptModal(false)}>
                        <i className="fas fa-print"></i> Print Proof
                    </button>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setShowReceiptModal(false)}>
                        <i className="fas fa-envelope"></i> Send Copy
                    </button>
                  </div>
                <p style={{ marginTop: '20px' }}>Collection successfully audited internally.</p>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </MainLayout>
  );
};

export default ProcessPayment;
