import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import Modal from '../../components/Common/Modal';
import { useToast } from '../../components/Common/ToastContainer';
import { formatAccountNumberForDisplay } from '../../utils/accountNumber';
import {
  getErrorMessage,
  loadAccountLookupWithFallback,
  loadConsumersWithFallback,
  loadPaymentsWithFallback,
  requestJson,
} from '../../services/userManagementApi';
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
  Overdue_Penalty: number;
  Late_Fee_Percentage: number;
  Is_Overdue: boolean;
  Total_Amount_Due: number;
  Status: string;
}

interface PaymentHistoryRow {
  Payment_ID: number;
  Receipt_No: string;
  Account_Number: string;
  Consumer_Name: string;
  Amount: number;
  Payment_Date: string;
  Payment_Method: string;
  Status: string;
}

interface QuickLookupAccount {
  Consumer_ID: number;
  Account_Number: string;
  First_Name?: string;
  Middle_Name?: string;
  Last_Name?: string;
  Address?: string;
}

const mapPaymentHistoryRow = (payment: any): PaymentHistoryRow => ({
  Payment_ID: payment.Payment_ID,
  Receipt_No: payment.OR_Number || payment.Reference_No || `PAY-${payment.Payment_ID}`,
  Account_Number: formatAccountNumberForDisplay(payment.Account_Number, 'N/A'),
  Consumer_Name: payment.Consumer_Name || 'Unknown Consumer',
  Amount: toAmount(payment.Amount_Paid),
  Payment_Date: payment.Payment_Date,
  Payment_Method: payment.Payment_Method || 'Cash',
  Status: payment.Status || 'Pending',
});

const ProcessPayment: React.FC = () => {
  const { showToast } = useToast();
  const location = useLocation();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConsumer, setSelectedConsumer] = useState<BillInfo | null>(null);
  const [consumerProfile, setConsumerProfile] = useState<ConsumerLookup | null>(null);
  const [quickLookupAccounts, setQuickLookupAccounts] = useState<QuickLookupAccount[]>([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [payments, setPayments] = useState<PaymentHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showFullBillModal, setShowFullBillModal] = useState(false);
  const [showQuickSummaryModal, setShowQuickSummaryModal] = useState(false);
  const [currentReceipt, setCurrentReceipt] = useState<PaymentHistoryRow | null>(null);
  const [editingPayment, setEditingPayment] = useState<PaymentHistoryRow | null>(null);
  const [editedReceiptNumber, setEditedReceiptNumber] = useState('');
  const searchLookupRef = useRef<HTMLDivElement | null>(null);

  const loadPaymentHistory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadPaymentsWithFallback();
      setPayments((result.data || []).map(mapPaymentHistoryRow));
      if (result.source === 'supabase') {
        showToast('Payment history loaded using Supabase fallback.', 'warning');
      }
    } catch (error) {
      console.error('Error loading payment history:', error);
      showToast(getErrorMessage(error, 'Failed to load payment history.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadPaymentHistory();
  }, [loadPaymentHistory]);

  const loadQuickLookupAccounts = useCallback(async () => {
    try {
      const result = await loadConsumersWithFallback();
      setQuickLookupAccounts(result.data || []);
      if (result.source === 'supabase') {
        showToast('Account suggestions loaded using Supabase fallback.', 'warning');
      }
    } catch (error) {
      console.error('Error loading account suggestions:', error);
      showToast(getErrorMessage(error, 'Failed to load account suggestions.'), 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadQuickLookupAccounts();
  }, [loadQuickLookupAccounts]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchLookupRef.current && !searchLookupRef.current.contains(event.target as Node)) {
        setShowSearchSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const prefilledAccountQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('account')?.trim() || '';
  }, [location.search]);

  const performConsumerSearch = useCallback(async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query) {
      showToast('Please enter account number or consumer name', 'error');
      return;
    }

    try {
      setLoading(true);
      const result = await loadAccountLookupWithFallback(query);
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
        Current_Bill: toAmount(summary.currentBillAmount ?? currentBill.Total_Amount),
        Previous_Balance: toAmount(summary.previousBalance),
        Penalties: toAmount(summary.overduePenalty ?? currentBill.Penalty ?? currentBill.Penalties),
        Overdue_Penalty: toAmount(summary.overduePenalty ?? currentBill.Penalty ?? currentBill.Penalties),
        Late_Fee_Percentage: toAmount(summary.lateFeePercentage),
        Is_Overdue: Boolean(summary.isOverdue),
        Total_Amount_Due: toAmount(summary.totalDue ?? currentBill.Total_Amount),
        Status: currentBill.Status || 'Unpaid',
      };

      setConsumerProfile(consumer);
      setSelectedConsumer(mappedConsumer);
      setSearchTerm(query);
      setShowSearchSuggestions(false);
      setAmountPaid(mappedConsumer.Status?.toLowerCase() === 'paid' ? '0' : String(mappedConsumer.Total_Amount_Due));
      if (result.source === 'supabase') {
        showToast('Account lookup used Supabase fallback.', 'warning');
      }
      showToast('Valid statement for settlement identified.', 'success');
    } catch (error) {
      console.error('Error searching consumer:', error);
      setSelectedConsumer(null);
      setConsumerProfile(null);
      showToast(getErrorMessage(error, 'Account verification failed.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const handleSearchConsumer = useCallback(async () => {
    await performConsumerSearch(searchTerm);
  }, [performConsumerSearch, searchTerm]);

  useEffect(() => {
    if (!prefilledAccountQuery) {
      return;
    }

    setSearchTerm(prefilledAccountQuery);
    performConsumerSearch(prefilledAccountQuery);
  }, [performConsumerSearch, prefilledAccountQuery]);

  const handleProcessPayment = useCallback(async () => {
    if (!selectedConsumer) {
      showToast('Please search and select a consumer first', 'error');
      return;
    }
    if (!amountPaid || parseFloat(amountPaid) <= 0) {
      showToast('There is no payable balance for this account.', 'error');
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
        Status: 'Validated',
      };

      const result = await requestJson<any>(
        '/payments',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        'Payment processing failed.'
      );

      const newPayment: PaymentHistoryRow = {
        Payment_ID: result.Payment_ID || Date.now(),
        Receipt_No: result.OR_Number || result.or_number || result.Reference_No || result.reference_number || `PAY-${result.Payment_ID || Date.now()}`,
        Account_Number: selectedConsumer.Account_Number,
        Consumer_Name: selectedConsumer.Consumer_Name,
        Amount: parseFloat(amountPaid),
        Payment_Date: currentDate,
        Payment_Method: paymentMethod,
        Status: 'Validated',
      };

      setCurrentReceipt(newPayment);
      setShowReceiptModal(true);
      showToast('Collection recorded successfully.', 'success');
      setSelectedConsumer(null);
      setConsumerProfile(null);
      setSearchTerm('');
      setAmountPaid('');
      loadPaymentHistory();
    } catch (error) {
      console.error('Error processing payment:', error);
      showToast(getErrorMessage(error, 'Failed to record collection.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [amountPaid, loadPaymentHistory, paymentMethod, selectedConsumer, showToast]);

  const handleViewPayment = useCallback((payment: PaymentHistoryRow) => {
    setCurrentReceipt(payment);
    setShowReceiptModal(true);
  }, []);

  const handleSaveReceiptCorrection = useCallback(async () => {
    if (!editingPayment) {
      return;
    }

    const nextReceiptNumber = editedReceiptNumber.trim();
    if (!nextReceiptNumber) {
      showToast('Please enter the corrected official receipt number.', 'error');
      return;
    }

    try {
      setLoading(true);
      await requestJson<{ success: boolean }>(
        `/payments/${editingPayment.Payment_ID}`,
        {
          method: 'PUT',
          body: JSON.stringify({
          OR_Number: nextReceiptNumber,
          Reference_No: nextReceiptNumber,
          }),
        },
        'Failed to update receipt number.'
      );

      showToast('Receipt number updated successfully.', 'success');
      setPayments((current) => current.map((payment) => (
        payment.Payment_ID === editingPayment.Payment_ID
          ? { ...payment, Receipt_No: nextReceiptNumber }
          : payment
      )));
      setEditingPayment(null);
      setEditedReceiptNumber('');
      loadPaymentHistory();
    } catch (error) {
      console.error('Error updating receipt number:', error);
      showToast(getErrorMessage(error, 'Failed to update receipt number.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [editedReceiptNumber, editingPayment, loadPaymentHistory, showToast]);

  const paymentColumns = useMemo(() => [
    { key: 'Receipt_No', label: 'Receipt No.', sortable: true },
    {
      key: 'Account_Number',
      label: 'Account No.',
      sortable: true,
      render: (value: string) => formatAccountNumberForDisplay(value, 'N/A'),
    },
    { key: 'Consumer_Name', label: 'Consumer Name', sortable: true },
    {
      key: 'Amount',
      label: 'Amount',
      sortable: true,
      render: (val: number) => `P${toAmount(val).toFixed(2)}`,
    },
    {
      key: 'Payment_Method',
      label: 'Method',
      sortable: true,
      filterType: 'select',
      filterLabel: 'Method',
    },
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
      filterType: 'select',
      filterLabel: 'Status',
      render: (val: string) => (
        <span className={`status-badge status-${(val || 'unknown').toLowerCase()}`}>{val || 'Unknown'}</span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_: unknown, payment: PaymentHistoryRow) => (
        <button className="btn btn-secondary btn-sm" onClick={() => handleViewPayment(payment)}>
          <i className="fas fa-eye"></i> View
        </button>
      ),
    },
  ], [handleViewPayment]);

  const selectedAccountPayments = useMemo(() => {
    if (!selectedConsumer) {
      return [];
    }

    return payments
      .filter((payment) => payment.Account_Number === selectedConsumer.Account_Number)
      .sort((a, b) => new Date(b.Payment_Date).getTime() - new Date(a.Payment_Date).getTime());
  }, [payments, selectedConsumer]);

  const selectedAccountPaymentSummary = useMemo(() => {
    const totalPaid = selectedAccountPayments.reduce((sum, payment) => sum + toAmount(payment.Amount), 0);
    const latestPayment = selectedAccountPayments[0] || null;

    return {
      totalPaid,
      latestPayment,
      count: selectedAccountPayments.length,
    };
  }, [selectedAccountPayments]);

  const searchSuggestions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    const mapped = quickLookupAccounts.map((account) => ({
      ...account,
      Consumer_Name: [account.First_Name, account.Middle_Name, account.Last_Name].filter(Boolean).join(' ').trim(),
    }));

    const filtered = query
      ? mapped.filter((account) =>
          account.Account_Number?.toLowerCase().includes(query) ||
          account.Consumer_Name.toLowerCase().includes(query) ||
          account.Address?.toLowerCase().includes(query)
        )
      : mapped;

    return filtered.slice(0, 6);
  }, [quickLookupAccounts, searchTerm]);

  const handleClear = () => {
    setSearchTerm('');
    setSelectedConsumer(null);
    setConsumerProfile(null);
    setAmountPaid('');
    setShowSearchSuggestions(false);
  };

  return (
    <MainLayout title="Collections Point">
      <div className="process-payment-page">
        <div className="card">
          <div className="card-header" style={{ marginBottom: '30px' }}>
            <h2 className="card-title">Official Receipt Payment Processor</h2>
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
                    <span className="value">{formatAccountNumberForDisplay(selectedConsumer.Account_Number)}</span>
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
                    <span className="label">Arrears / Penalty</span>
                    <span className="value">P{(selectedConsumer.Previous_Balance + selectedConsumer.Penalties).toFixed(2)}</span>
                  </div>
                  <div className="breakdown-item">
                    <span className="label">Late Charge Status</span>
                    <span className="value">
                      {selectedConsumer.Is_Overdue
                        ? `Overdue (${selectedConsumer.Late_Fee_Percentage}% applied)`
                        : `Not yet overdue (${selectedConsumer.Late_Fee_Percentage}% if past due)`}
                    </span>
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
                  <div className="breakdown-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowQuickSummaryModal(true)}>
                      <i className="fas fa-print"></i> Print Quick Summary
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowFullBillModal(true)}>
                      <i className="fas fa-file-invoice"></i> View Full Statement
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="payment-form-grid">
              <div className="payment-form-column">
                <div className="payment-form-group">
                  <label>Primary Account Identifier</label>
                  <div className="account-search-wrap" ref={searchLookupRef}>
                    <div className="account-search-row">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Account No. or Name"
                        style={{ flex: 1 }}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onFocus={() => setShowSearchSuggestions(true)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearchConsumer()}
                      />
                      <button className="btn btn-secondary" onClick={handleSearchConsumer}>
                        <i className="fas fa-search"></i>
                      </button>
                    </div>
                    {showSearchSuggestions && searchSuggestions.length > 0 && (
                      <div className="account-search-suggestions">
                        {searchSuggestions.map((account) => {
                          const consumerName = [account.First_Name, account.Middle_Name, account.Last_Name].filter(Boolean).join(' ').trim();
                          return (
                            <button
                              key={account.Consumer_ID}
                              type="button"
                              className="account-search-suggestion"
                              onClick={() => performConsumerSearch(account.Account_Number || consumerName)}
                            >
                              <div className="account-search-suggestion-main">
                                <strong>{formatAccountNumberForDisplay(account.Account_Number, 'No account number')}</strong>
                                <span>{consumerName || 'Unnamed consumer'}</span>
                              </div>
                              <span className="account-search-suggestion-address">{account.Address || 'No saved address'}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="payment-form-group" style={{ marginTop: '20px' }}>
                  <label>Consolidated Outstanding Balance</label>
                  <input
                    type="text"
                    className="form-control"
                    value={selectedConsumer ? `P${selectedConsumer.Total_Amount_Due.toFixed(2)}` : 'P0.00'}
                    readOnly
                  />
                </div>

                <div className="payment-form-group amount-highlight-group" style={{ marginTop: '20px' }}>
                  <label>Actual Collection Value (PHP)</label>
                  <input
                    type="number"
                    className="form-control amount-highlight-input"
                    placeholder={selectedConsumer?.Status?.toLowerCase() === 'paid' ? 'Already paid' : 'Enter cash amount'}
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    disabled={selectedConsumer?.Status?.toLowerCase() === 'paid'}
                  />
                </div>
              </div>

              <div className="payment-form-column">
                <div className="payment-form-group">
                  <label>Consumer Identity Verification</label>
                  <input
                    type="text"
                    className="form-control"
                    value={selectedConsumer?.Consumer_Name || 'Entity identity required...'}
                    readOnly
                  />
                </div>

                <div className="payment-form-group" style={{ marginTop: '20px' }}>
                  <label>Collection Source Indicator</label>
                  <select
                    className="form-control"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="Cash">Physical Cash</option>
                  </select>
                </div>

                <div className="payment-form-group" style={{ marginTop: '20px' }}>
                  <label>Official Receipt Number (Auto-Generated)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Generated automatically when payment is saved"
                    value={selectedConsumer ? 'Generated on save' : ''}
                    readOnly
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', paddingTop: '20px', borderTop: '1px solid #f1f5f9' }}>
              <button type="button" className="btn btn-secondary" style={{ padding: '12px 24px', borderRadius: '12px', fontWeight: '700' }} onClick={handleClear}>
                Clear Entry
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '12px 36px', borderRadius: '12px', fontWeight: '800' }}
                onClick={handleProcessPayment}
                disabled={selectedConsumer?.Status?.toLowerCase() === 'paid'}
              >
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
              <DataTable
                columns={paymentColumns}
                data={payments}
                loading={loading}
                emptyMessage="No payment history found."
                enableFiltering
                filterPlaceholder="Search by receipt number, account, or consumer..."
              />
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
                  <span style={{ borderBottom: '1px solid #e2e8f0', display: 'block' }}>{formatAccountNumberForDisplay(currentReceipt.Account_Number, 'N/A')}</span>
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
                  <p><strong>Account:</strong> {formatAccountNumberForDisplay(consumerProfile.Account_Number)}</p>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span>Penalty Rule:</span>
                  <span>{selectedConsumer.Is_Overdue ? `${selectedConsumer.Late_Fee_Percentage}% applied` : `${selectedConsumer.Late_Fee_Percentage}% if overdue`}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #1B1B63', paddingTop: '10px', marginTop: '10px', fontWeight: '900', color: '#1B1B63' }}>
                  <span>TOTAL:</span>
                  <span>P{selectedConsumer.Total_Amount_Due.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" style={{ minWidth: '160px' }} onClick={() => setShowFullBillModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </Modal>
        )}

        {showQuickSummaryModal && selectedConsumer && consumerProfile && (
          <Modal
            isOpen={showQuickSummaryModal}
            title="Quick Summary"
            onClose={() => setShowQuickSummaryModal(false)}
            size="large"
            closeOnOverlayClick={true}
          >
            <div className="quick-summary-print">
              <div className="quick-summary-header">
                <div>
                  <p className="quick-summary-kicker">Municipal Treasury Snapshot</p>
                  <h2>San Lorenzo Ruiz Waterworks Office</h2>
                  <p>Overall bill and payment summary for cashier reference</p>
                </div>
                <div className="quick-summary-meta">
                  <span><strong>Generated:</strong> {new Date().toLocaleString()}</span>
                  <span><strong>Billing Month:</strong> {selectedConsumer.Billing_Month || 'Current'}</span>
                  <span><strong>Due Date:</strong> {selectedConsumer.Due_Date ? new Date(selectedConsumer.Due_Date).toLocaleDateString() : 'N/A'}</span>
                </div>
              </div>

              <div className="quick-summary-sections">
                <section className="quick-summary-panel">
                  <h3>Consumer Profile</h3>
                  <div className="quick-summary-list">
                    <div><span>Account</span><strong>{formatAccountNumberForDisplay(consumerProfile.Account_Number)}</strong></div>
                    <div><span>Name</span><strong>{consumerProfile.Consumer_Name}</strong></div>
                    <div><span>Address</span><strong>{consumerProfile.Address}</strong></div>
                    <div><span>Classification</span><strong>{selectedConsumer.Classification || 'N/A'}</strong></div>
                    <div><span>Status</span><strong>{selectedConsumer.Status}</strong></div>
                  </div>
                </section>

                <section className="quick-summary-panel">
                  <h3>Current Bill Snapshot</h3>
                  <div className="quick-summary-list">
                    <div><span>Basic Charge</span><strong>P{selectedConsumer.Basic_Charge.toFixed(2)}</strong></div>
                    <div><span>Fees</span><strong>P{selectedConsumer.Environmental_Fee.toFixed(2)}</strong></div>
                    <div><span>Previous Balance</span><strong>P{selectedConsumer.Previous_Balance.toFixed(2)}</strong></div>
                    <div><span>Penalty</span><strong>P{selectedConsumer.Penalties.toFixed(2)}</strong></div>
                    <div><span>Penalty Rule</span><strong>{selectedConsumer.Is_Overdue ? `${selectedConsumer.Late_Fee_Percentage}% applied` : `${selectedConsumer.Late_Fee_Percentage}% if overdue`}</strong></div>
                    <div className="quick-summary-total"><span>Total Due</span><strong>P{selectedConsumer.Total_Amount_Due.toFixed(2)}</strong></div>
                  </div>
                </section>
              </div>

              <div className="quick-summary-totals">
                <div className="quick-summary-stat">
                  <span>Recorded Payments</span>
                  <strong>{selectedAccountPaymentSummary.count}</strong>
                </div>
                <div className="quick-summary-stat">
                  <span>Total Paid to Date</span>
                  <strong>P{selectedAccountPaymentSummary.totalPaid.toFixed(2)}</strong>
                </div>
                <div className="quick-summary-stat">
                  <span>Latest Receipt</span>
                  <strong>{selectedAccountPaymentSummary.latestPayment?.Receipt_No || 'No payment yet'}</strong>
                </div>
              </div>

              <div className="quick-summary-history">
                <h3>Recent Payment Records</h3>
                {selectedAccountPayments.length > 0 ? (
                  <table className="quick-summary-table">
                    <thead>
                      <tr>
                        <th>Receipt No.</th>
                        <th>Date</th>
                        <th>Method</th>
                        <th>Status</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedAccountPayments.slice(0, 5).map((payment) => (
                        <tr key={payment.Payment_ID}>
                          <td>{payment.Receipt_No}</td>
                          <td>{payment.Payment_Date ? new Date(payment.Payment_Date).toLocaleString() : 'N/A'}</td>
                          <td>{payment.Payment_Method}</td>
                          <td>{payment.Status}</td>
                          <td>P{toAmount(payment.Amount).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="quick-summary-empty">
                    No recorded payments yet for this account.
                  </div>
                )}
              </div>

              <div className="quick-summary-actions no-print">
                <button className="btn btn-primary" onClick={() => window.print()}>
                  <i className="fas fa-print"></i> Print Quick Summary
                </button>
                <button className="btn btn-secondary" onClick={() => setShowQuickSummaryModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </Modal>
        )}

        {editingPayment && (
          <Modal
            isOpen={Boolean(editingPayment)}
            title="Correct Official Receipt Number"
            onClose={() => {
              setEditingPayment(null);
              setEditedReceiptNumber('');
            }}
            size="medium"
            footer={(
              <>
                <button className="btn btn-secondary" onClick={() => {
                  setEditingPayment(null);
                  setEditedReceiptNumber('');
                }}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSaveReceiptCorrection} disabled={loading}>
                  <i className="fas fa-save"></i> Save Correction
                </button>
              </>
            )}
          >
            <div className="form-group">
              <label>Correct Official Receipt Number</label>
              <input
                type="text"
                className="form-control amount-highlight-input"
                value={editedReceiptNumber}
                onChange={(e) => setEditedReceiptNumber(e.target.value)}
                placeholder="Enter corrected OR number"
              />
            </div>
            <div className="info-box" style={{ marginTop: '20px', marginBottom: 0 }}>
              <i className="fas fa-info-circle"></i>
              This updates the receipt number only. The payment amount and bill status stay unchanged.
            </div>
          </Modal>
        )}
      </div>
    </MainLayout>
  );
};

export default ProcessPayment;
