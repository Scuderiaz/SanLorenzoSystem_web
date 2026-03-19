import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    loadPaymentHistory();
  }, []);

  const loadPaymentHistory = async () => {
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
  };

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
    { key: 'Amount', label: 'Amount', sortable: true, render: (payment: Payment) => `₱${(payment.Amount || 0).toFixed(2)}` },
    { key: 'Payment_Method', label: 'Payment Method', sortable: true },
    { key: 'Payment_Date', label: 'Date/Time', sortable: true },
    { key: 'Status', label: 'Validation Status', sortable: true, render: (payment: Payment) => (
      <span className={`status-badge status-${(payment.Status || 'unknown').toLowerCase()}`}>{payment.Status}</span>
    )},
  ];

  const handleClear = () => {
    setSearchTerm('');
    setSelectedConsumer(null);
    setAmountPaid('');
    setReceiptNumber('');
  };

  return (
    <MainLayout title="Payment Processing">
      <div className="process-payment-page">
        {/* Recent Payments Table */}
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="card-title">Recent Payments (Sent to Billing for Validation)</h2>
            <button className="btn btn-primary">View All</button>
          </div>
          <div className="card-body">
            <DataTable columns={paymentColumns} data={payments} loading={loading} />
          </div>
        </div>

        {/* Payment Form */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Process Payment with Manual OR</h2>
          </div>
          <div className="card-body">
            {/* Process Steps Indicator */}
            <div className="process-steps" style={{ 
              background: '#fff3cd', 
              padding: '12px 15px', 
              borderRadius: '4px', 
              marginBottom: '20px',
              border: '1px solid #ffc107'
            }}>
              <i className="fas fa-info-circle" style={{ marginRight: '8px' }}></i>
              <strong>Process:</strong> 1. Search consumer → 2. Receive cash → 3. Fill manual OR booklet → 4. Enter OR number → 5. Record payment
            </div>

            {/* Form Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Left Column */}
              <div>
                <div className="form-group">
                  <label>Account Number</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Enter account number or search name"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearchConsumer()}
                  />
                </div>

                <div className="form-group">
                  <label>Outstanding Balance</label>
                  <input
                    type="text"
                    className="form-control"
                    value={selectedConsumer ? `₱${(selectedConsumer.Total_Amount_Due || 0).toFixed(2)}` : '₱0.00'}
                    readOnly
                    style={{ background: '#f8f9fa' }}
                  />
                </div>

                <div className="form-group">
                  <label>Amount Paid (Cash Received)</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="Enter amount received"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                  />
                </div>
              </div>

              {/* Right Column */}
              <div>
                <div className="form-group">
                  <label>Consumer Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={selectedConsumer?.Consumer_Name || 'Consumer name will appear here'}
                    readOnly
                    style={{ background: '#f8f9fa' }}
                  />
                </div>

                <div className="form-group">
                  <label>Payment Method</label>
                  <select
                    className="form-control"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="Cash">Cash</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Manual OR Number <span style={{ color: 'red' }}>*</span></label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Enter OR from booklet"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Info Message */}
            <div style={{ 
              background: '#d1ecf1', 
              padding: '10px 15px', 
              borderRadius: '4px', 
              marginTop: '20px',
              marginBottom: '20px',
              border: '1px solid #bee5eb'
            }}>
              <i className="fas fa-arrow-right" style={{ marginRight: '8px', color: '#0c5460' }}></i>
              Payment will be sent to: <strong>Billing Officer for Validation</strong>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={handleClear}
              >
                Clear
              </button>
              <button 
                type="button" 
                className="btn btn-primary"
                onClick={handleProcessPayment}
              >
                <i className="fas fa-check"></i> Record Payment & Send for Validation
              </button>
            </div>
          </div>
        </div>

        {showReceiptModal && currentReceipt && (
          <Modal
            isOpen={showReceiptModal}
            title="Payment Receipt"
            onClose={() => setShowReceiptModal(false)}
            size="medium"
          >
            <div className="receipt-preview">
              <div className="receipt-header">
                <h3>San Lorenzo Ruiz Waterworks System</h3>
                <p>Official Receipt</p>
              </div>
              <div className="receipt-details">
                <div className="receipt-row">
                  <span>Receipt No.:</span>
                  <span>{currentReceipt.Receipt_No}</span>
                </div>
                <div className="receipt-row">
                  <span>Date:</span>
                  <span>{currentReceipt.Payment_Date}</span>
                </div>
                <div className="receipt-row">
                  <span>Account No.:</span>
                  <span>{currentReceipt.Account_Number}</span>
                </div>
                <div className="receipt-row">
                  <span>Consumer:</span>
                  <span>{currentReceipt.Consumer_Name}</span>
                </div>
                <div className="receipt-row">
                  <span>Amount Paid:</span>
                  <span>₱{(currentReceipt.Amount || 0).toFixed(2)}</span>
                </div>
                <div className="receipt-row">
                  <span>Payment Method:</span>
                  <span>{currentReceipt.Payment_Method}</span>
                </div>
              </div>
              <div className="receipt-footer">
                <p>Thank you for your payment!</p>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </MainLayout>
  );
};

export default ProcessPayment;
