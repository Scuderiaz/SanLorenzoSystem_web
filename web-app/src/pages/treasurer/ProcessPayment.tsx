import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import Modal from '../../components/Common/Modal';
import { useToast } from '../../components/Common/ToastContainer';
import './ProcessPayment.css';

const toAmount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

interface ConsumerLookup {
  Consumer_ID: number;
  Consumer_Name: string;
  Account_Number: string;
  Address: string;
  Classification: string | null;
  Meter_Number: string | null;
  Connection_Date: string | null;
}

interface BillInfo {
  Bill_ID: number;
  Consumer_ID: number;
  Account_Number: string;
  Consumer_Name: string;
  Address: string;
  Classification: string | null;
  Billing_Month: string | null;
  Due_Date: string | null;
  Basic_Charge: number;
  Environmental_Fee: number;
  Current_Bill: number;
  Previous_Balance: number;
  Penalties: number;
  Total_Amount_Due: number;
  Status: string;
}

interface PaymentHistoryRow {
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
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConsumer, setSelectedConsumer] = useState<BillInfo | null>(null);
  const [consumerProfile, setConsumerProfile] = useState<ConsumerLookup | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [payments, setPayments] = useState<PaymentHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showFullBillModal, setShowFullBillModal] = useState(false);
  const [currentReceipt, setCurrentReceipt] = useState<PaymentHistoryRow | null>(null);

  const loadPaymentHistory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/payments`);
      const data = await response.json();
      const list = Array.isArray(data) ? data : (data.data || []);
      setPayments((list || []).map((payment: any) => ({
        Receipt_No: payment.OR_Number || payment.Reference_No || `PAY-${payment.Payment_ID}`,
        Account_Number: payment.Account_Number || 'N/A',
        Consumer_Name: payment.Consumer_Name || 'Unknown Consumer',
        Amount: toAmount(payment.Amount_Paid),
        Payment_Date: payment.Payment_Date,
        Payment_Method: payment.Payment_Method || 'Cash',
        Status: payment.Status || 'Pending',
      })));
    } catch (error) {
      console.error('Error loading payment history:', error);
      showToast('Failed to load payment history', 'error');
    } finally {
      setLoading(false);
    }
  }, [API_URL, showToast]);

  useEffect(() => {
    loadPaymentHistory();
  }, [loadPaymentHistory]);

  const handleSearchConsumer = useCallback(async () => {
    if (!searchTerm.trim()) {
      showToast('Please enter account number or consumer name', 'error');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/treasurer/account-lookup?q=${encodeURIComponent(searchTerm.trim())}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Account verification failed.');
      }

      const lookup = result.data || {};
      const consumer = lookup.consumer || null;
      const summary = lookup.summary || {};
      const currentBill = lookup.currentBill || null;

      if (!consumer || !currentBill) {
        setSelectedConsumer(null);
        setConsumerProfile(null);
        showToast('No active bill found for this account.', 'warning');
        return;
      }

      const mappedConsumer: BillInfo = {
        Bill_ID: currentBill.Bill_ID,
        Consumer_ID: currentBill.Consumer_ID,
        Account_Number: consumer.Account_Number,
        Consumer_Name: consumer.Consumer_Name,
        Address: consumer.Address,
        Classification: consumer.Classification,
        Billing_Month: currentBill.Billing_Month || summary.billingMonth || 'Current',
        Due_Date: currentBill.Due_Date || summary.dueDate || null,
        Basic_Charge: toAmount(currentBill.Basic_Charge),
        Environmental_Fee: toAmount(currentBill.Environmental_Fee),
        Current_Bill: toAmount(summary.currentBillAmount || currentBill.Total_Amount),
        Previous_Balance: toAmount(summary.previousBalance),
        Penalties: toAmount(currentBill.Penalty || currentBill.Penalties),
        Total_Amount_Due: toAmount(summary.totalDue || currentBill.Total_Amount),
        Status: currentBill.Status || 'Unpaid',
      };

      setConsumerProfile(consumer);
      setSelectedConsumer(mappedConsumer);
      setAmountPaid(String(mappedConsumer.Total_Amount_Due));
      showToast('Valid statement for settlement identified.', 'success');
    } catch (error: any) {
      console.error('Error searching consumer:', error);
      setSelectedConsumer(null);
      setConsumerProfile(null);
      showToast(error.message || 'Account verification failed.', 'error');
    } finally {
      setLoading(false);
    }
  }, [API_URL, searchTerm, showToast]);

  const handleProcessPayment = useCallback(async () => {
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
      const currentDate = new Date().toISOString();
      const payload = {
        Bill_ID: selectedConsumer.Bill_ID,
        Consumer_ID: selectedConsumer.Consumer_ID,
        Amount_Paid: parseFloat(amountPaid),
        Payment_Date: currentDate,
        Payment_Method: paymentMethod,
        Reference_No: receiptNumber,
        OR_Number: receiptNumber,
        Status: 'Pending',
      };

      const response = await fetch(`${API_URL}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || 'Payment processing failed.');
      }

      const newPayment: PaymentHistoryRow = {
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
      showToast('Collection record saved and queued for validation.', 'success');
      setSelectedConsumer(null);
      setConsumerProfile(null);
      setSearchTerm('');
      setAmountPaid('');
      setReceiptNumber('');
      loadPaymentHistory();
    } catch (error: any) {
      console.error('Error processing payment:', error);
      showToast(error.message || 'Failed to record collection.', 'error');
    } finally {
      setLoading(false);
    }
  }, [API_URL, amountPaid, loadPaymentHistory, paymentMethod, receiptNumber, selectedConsumer, showToast]);

  const paymentColumns = useMemo(() => [
    { key: 'Receipt_No', label: 'Receipt No.', sortable: true },
    { key: 'Account_Number', label: 'Account No.', sortable: true },
    { key: 'Consumer_Name', label: 'Consumer Name', sortable: true },
    {
      key: 'Amount',
      label: 'Amount',
      sortable: true,
      render: (val: number) => `P${toAmount(val).toFixed(2)}`,
    },
    { key: 'Payment_Method', label: 'Method', sortable: true },
    {
      key: 'Payment_Date',
      label: 'Date',
      sortable: true,
      render: (value: string) => value ? new Date(value).toLocaleString() : 'N/A',
    },
    {
      key: 'Status',
      label: 'Status',
      sortable: true,
      render: (val: string) => (
        <span className={`status-badge status-${(val || 'unknown').toLowerCase()}`}>{val || 'Unknown'}</span>
      ),
    },
  ], []);

  const handleClear = () => {
    setSearchTerm('');
    setSelectedConsumer(null);
    setConsumerProfile(null);
    setAmountPaid('');
    setReceiptNumber('');
  };

  return (
    <MainLayout title="Collections Point (Manual OR Entry)">
      <div className="process-payment-page">
        <div className="card">
          <div className="card-header" style={{ marginBottom: '30px' }}>
            <h2 className="card-title">Manual Official Receipt (OR) Processor</h2>
          </div>
          <div className="card-body">
            {selectedConsumer && (
              <div className="bill-detail-breakdown">
                <div className="breakdown-header">
                  <i className="fas fa-file-invoice-dollar"></i>
                  <span>Detailed Bill Status for {selectedConsumer.Billing_Month}</span>
                </div>
                <div className="breakdown-grid">
                  <div className="breakdown-item">
                    <span className="label">Account Number</span>
                    <span className="value">{selectedConsumer.Account_Number}</span>
                  </div>
                  <div className="breakdown-item">
                    <span className="label">Classification</span>
                    <span className="value">{selectedConsumer.Classification || 'N/A'}</span>
                  </div>
                  <div className="breakdown-item">
                    <span className="label">Basic Tariff</span>
                    <span className="value">P{selectedConsumer.Basic_Charge.toFixed(2)}</span>
                  </div>
                  <div className="breakdown-item">
                    <span className="label">Fees (Env/Maint)</span>
                    <span className="value">P{selectedConsumer.Environmental_Fee.toFixed(2)}</span>
                  </div>
                  <div className="breakdown-item highlight">
                    <span className="label">Arrears/Penalty</span>
                    <span className="value">P{(selectedConsumer.Previous_Balance + selectedConsumer.Penalties).toFixed(2)}</span>
                  </div>
                  <div className="breakdown-item highlight-total">
                    <span className="label">TOTAL DUE</span>
                    <span className="value">P{selectedConsumer.Total_Amount_Due.toFixed(2)}</span>
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

            <div className="form-grid">
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
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchConsumer()}
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
                    value={selectedConsumer ? `P${selectedConsumer.Total_Amount_Due.toFixed(2)}` : 'P0.00'}
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
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
              <button type="button" className="btn btn-secondary" style={{ padding: '12px 24px', borderRadius: '12px', fontWeight: '700' }} onClick={handleClear}>
                Clear Entry
              </button>
              <button type="button" className="btn btn-primary" style={{ padding: '12px 36px', borderRadius: '12px', fontWeight: '800' }} onClick={handleProcessPayment}>
                <i className="fas fa-check-double"></i> Authorize Collection & Record
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Recent Daily Collections Audit</h2>
            <button className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '700' }} onClick={loadPaymentHistory}>
              <i className="fas fa-sync-alt"></i> Refresh
            </button>
          </div>
          <div className="card-body">
            <div style={{ padding: '24px' }}>
              <DataTable columns={paymentColumns} data={payments} loading={loading} emptyMessage="No payment history found." />
            </div>
          </div>
        </div>

        {showReceiptModal && currentReceipt && (
          <Modal isOpen={showReceiptModal} title="Collection Authorization Proof" onClose={() => setShowReceiptModal(false)} size="medium" closeOnOverlayClick={true}>
            <div className="official-receipt-print">
              <div className="receipt-header-official">
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <p style={{ margin: 0, fontSize: '10px', fontWeight: '800' }}>REPUBLIC OF THE PHILIPPINES</p>
                  <p style={{ margin: 0, fontSize: '12px', fontWeight: '900' }}>SAN LORENZO RUIZ WATERWORKS SYSTEM</p>
                  <p style={{ margin: 0, fontSize: '10px' }}>PROVINCE OF CAMARINES NORTE</p>
                  <h2 style={{ color: '#1B1B63', fontSize: '20px', margin: '10px 0', borderTop: '1px solid #1B1B63', borderBottom: '1px solid #1B1B63', padding: '5px 0' }}>OFFICIAL RECEIPT</h2>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                    <span><strong>OR No:</strong> <span style={{ color: '#dc2626', fontSize: '18px' }}>{currentReceipt.Receipt_No}</span></span>
                    <span><strong>Date:</strong> {new Date(currentReceipt.Payment_Date).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="receipt-metadata">
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '5px', fontSize: '13px' }}>
                  <strong>PAYOR:</strong>
                  <span style={{ borderBottom: '1px solid #e2e8f0', display: 'block' }}>{currentReceipt.Consumer_Name}</span>
                  <strong>ACCT NO:</strong>
                  <span style={{ borderBottom: '1px solid #e2e8f0', display: 'block' }}>{currentReceipt.Account_Number}</span>
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderTop: '1.5px solid #1B1B63', borderBottom: '1.5px solid #1B1B63' }}>
                    <th style={{ textAlign: 'left', padding: '8px' }}>NATURE OF COLLECTION</th>
                    <th style={{ textAlign: 'right', padding: '8px' }}>AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px' }}>Water Utility Bill</td>
                    <td style={{ textAlign: 'right', padding: '8px' }}>P{(currentReceipt.Amount || 0).toFixed(2)}</td>
                  </tr>
                  <tr style={{ borderTop: '1px double #1B1B63', fontWeight: '900', fontSize: '15px' }}>
                    <td style={{ padding: '8px' }}>TOTAL PAID</td>
                    <td style={{ textAlign: 'right', padding: '8px', color: '#10b981' }}>P{(currentReceipt.Amount || 0).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div style={{ fontSize: '10px', color: '#64748b', maxWidth: '200px' }}>
                  * This digital record is automatically synchronized with the Billing Officer for financial reconciliation.
                </div>
                <div style={{ textAlign: 'center', borderTop: '1.5px solid #1B1B63', minWidth: '180px', paddingTop: '5px' }}>
                  <p style={{ margin: 0, fontWeight: '900', color: '#1B1B63' }}>TREASURER OFFICER</p>
                  <p style={{ margin: 0, fontSize: '10px' }}>Authorized Signature</p>
                </div>
              </div>

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

        {showFullBillModal && selectedConsumer && consumerProfile && (
          <Modal isOpen={showFullBillModal} title="Strategic Financial Statement" onClose={() => setShowFullBillModal(false)} size="large" closeOnOverlayClick={true}>
            <div className="bill-container-modal">
              <div className="bill-header" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #1B1B63', paddingBottom: '20px', marginBottom: '30px' }}>
                <img src="/images/Waterworks System Payment Logo 1.svg" alt="Logo" style={{ height: '70px' }} />
                <div style={{ textAlign: 'right' }}>
                  <h2 style={{ margin: 0, color: '#1B1B63' }}>San Lorenzo Ruiz Waterworks</h2>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Municipal Treasury Office</p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Camarines Norte, Philippines</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginBottom: '30px' }}>
                <div>
                  <h4 style={{ color: '#1B1B63', marginBottom: '10px', borderBottom: '1px solid #e2e8f0' }}>Consumer Information</h4>
                  <p><strong>Account:</strong> {consumerProfile.Account_Number}</p>
                  <p><strong>Name:</strong> {consumerProfile.Consumer_Name}</p>
                  <p><strong>Address:</strong> {consumerProfile.Address}</p>
                </div>
                <div>
                  <h4 style={{ color: '#1B1B63', marginBottom: '10px', borderBottom: '1px solid #e2e8f0' }}>Billing Summary</h4>
                  <p><strong>Month:</strong> {selectedConsumer.Billing_Month || 'Current'}</p>
                  <p><strong>Due Date:</strong> {selectedConsumer.Due_Date ? new Date(selectedConsumer.Due_Date).toLocaleDateString() : 'N/A'}</p>
                  <p><strong>Status:</strong> {selectedConsumer.Status}</p>
                </div>
              </div>

              <div style={{ marginLeft: 'auto', width: '300px', backgroundColor: '#f8fafc', padding: '20px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span>Basic:</span>
                  <span>P{selectedConsumer.Basic_Charge.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span>Fees:</span>
                  <span>P{selectedConsumer.Environmental_Fee.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span>Balance:</span>
                  <span>P{selectedConsumer.Previous_Balance.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span>Penalty:</span>
                  <span>P{selectedConsumer.Penalties.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #1B1B63', paddingTop: '10px', marginTop: '10px', fontWeight: '900', color: '#1B1B63' }}>
                  <span>TOTAL:</span>
                  <span>P{selectedConsumer.Total_Amount_Due.toFixed(2)}</span>
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
