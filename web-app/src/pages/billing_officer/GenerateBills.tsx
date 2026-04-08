import React, { useEffect, useMemo, useState, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import Modal from '../../components/Common/Modal';
import FormInput from '../../components/Common/FormInput';
import FormSelect from '../../components/Common/FormSelect';
import { useToast } from '../../components/Common/ToastContainer';
import './GenerateBills.css';

interface BillRow {
  Bill_ID: number;
  Consumer_ID: number;
  Account_Number: string;
  Consumer_Name: string;
  Address?: string;
  Classification?: string;
  Total_Amount: number;
  Due_Date?: string;
  Bill_Date?: string;
  Billing_Month?: string;
  Status: string;
}

interface ConsumerRow {
  Consumer_ID: number;
  First_Name?: string;
  Middle_Name?: string;
  Last_Name?: string;
  Address?: string;
  Account_Number?: string;
  Zone_ID: number;
  Zone_Name?: string;
  Classification_Name?: string;
}

interface ZoneRow {
  Zone_ID: number;
  Zone_Name?: string;
}

const formatZoneLabel = (zoneName?: string, zoneId?: number | string | null) =>
  zoneName || (zoneId ? `Zone ${zoneId}` : 'Not Assigned');

const formatCurrency = (value: number) =>
  `P${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value?: string) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH');
};

const formatBillingMonth = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const GenerateBills: React.FC = () => {
  const { showToast } = useToast();
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  const [bills, setBills] = useState<BillRow[]>([]);
  const [consumers, setConsumers] = useState<ConsumerRow[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedBill, setSelectedBill] = useState<BillRow | null>(null);
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [savingManualBill, setSavingManualBill] = useState(false);
  const [manualForm, setManualForm] = useState({
    consumerId: '',
    billDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    billingMonth: formatBillingMonth(new Date().toISOString()),
    coveredFrom: new Date().toISOString().split('T')[0],
    coveredTo: new Date().toISOString().split('T')[0],
    currentCharge: '',
    meterFee: '0',
    previousBalance: '0',
    previousPenalty: '0',
    penalty: '0',
    status: 'Unpaid',
  });

  const loadBills = useCallback(async () => {
    setLoading(true);
    try {
      const [billsResponse, consumersResponse, zonesResponse] = await Promise.all([
        fetch(`${API_URL}/bills`),
        fetch(`${API_URL}/consumers`),
        fetch(`${API_URL}/zones`),
      ]);

      const [billsResult, consumersResult, zonesResult] = await Promise.all([
        billsResponse.json(),
        consumersResponse.json(),
        zonesResponse.json(),
      ]);

      setBills(Array.isArray(billsResult) ? billsResult : (billsResult.data || []));
      setConsumers(Array.isArray(consumersResult) ? consumersResult : []);
      setZones(Array.isArray(zonesResult.data) ? zonesResult.data.map((zone: any) => ({
        Zone_ID: zone.Zone_ID ?? zone.zone_id,
        Zone_Name: zone.Zone_Name ?? zone.zone_name,
      })) : []);
    } catch (error) {
      console.error('Error loading bills:', error);
      showToast('Failed to load billing records', 'error');
    } finally {
      setLoading(false);
    }
  }, [API_URL, showToast]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  const consumerMap = useMemo(() => new Map(consumers.map((consumer) => [consumer.Consumer_ID, consumer])), [consumers]);
  const selectedManualConsumer = useMemo(
    () => consumers.find((consumer) => String(consumer.Consumer_ID) === manualForm.consumerId) || null,
    [consumers, manualForm.consumerId]
  );
  const manualBillSummary = useMemo(() => {
    const currentCharge = Number(manualForm.currentCharge || 0);
    const meterFee = Number(manualForm.meterFee || 0);
    const previousBalance = Number(manualForm.previousBalance || 0);
    const previousPenalty = Number(manualForm.previousPenalty || 0);
    const penalty = Number(manualForm.penalty || 0);
    const totalAmount = currentCharge + meterFee + previousBalance + previousPenalty + penalty;
    const totalAfterDueDate = totalAmount + penalty;

    return {
      totalAmount,
      totalAfterDueDate,
    };
  }, [manualForm.currentCharge, manualForm.meterFee, manualForm.penalty, manualForm.previousBalance, manualForm.previousPenalty]);

  const filteredBills = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return bills.filter((bill) => {
      const consumer = consumerMap.get(bill.Consumer_ID);
      const matchesSearch = !query || [bill.Account_Number, bill.Consumer_Name, bill.Address]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      const matchesZone = !zoneFilter || String(consumer?.Zone_ID || '') === zoneFilter;
      const matchesStatus = !statusFilter || bill.Status === statusFilter;
      return matchesSearch && matchesZone && matchesStatus;
    });
  }, [bills, consumerMap, searchTerm, statusFilter, zoneFilter]);

  const totalBills = filteredBills.length;
  const totalBilled = filteredBills.reduce((sum, bill) => sum + Number(bill.Total_Amount || 0), 0);
  const unpaidBills = filteredBills.filter((bill) => String(bill.Status || '').toLowerCase() !== 'paid').length;
  const overdueBills = filteredBills.filter((bill) => String(bill.Status || '').toLowerCase() === 'overdue').length;

  const columns = [
    { key: 'Account_Number', label: 'Account No.', sortable: true },
    { key: 'Consumer_Name', label: 'Consumer Name', sortable: true },
    { key: 'Billing_Month', label: 'Billing Month', sortable: true },
    { key: 'Bill_Date', label: 'Bill Date', sortable: true, render: (value: string) => formatDate(value) },
    { key: 'Due_Date', label: 'Due Date', sortable: true, render: (value: string) => formatDate(value) },
    { key: 'Total_Amount', label: 'Amount Due', sortable: true, render: (value: number) => formatCurrency(value) },
    {
      key: 'Status',
      label: 'Bill Status',
      sortable: true,
      render: (value: string) => <span className={`status-badge status-${String(value || 'unknown').toLowerCase().replace(/\s+/g, '-')}`}>{value}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_: unknown, bill: BillRow) => (
        <button className="btn btn-sm btn-info" onClick={() => setSelectedBill(bill)}>
          <i className="fas fa-eye"></i> View
        </button>
      ),
    },
  ];

  const zoneOptions = zones.map((zone) => ({ value: zone.Zone_ID, label: formatZoneLabel(zone.Zone_Name, zone.Zone_ID) }));
  const consumerOptions = consumers
    .slice()
    .sort((a, b) => String(a.Account_Number || '').localeCompare(String(b.Account_Number || '')))
    .map((consumer) => ({
      value: consumer.Consumer_ID,
      label: `${consumer.Account_Number || 'NO-ACCOUNT'} - ${[consumer.First_Name, consumer.Middle_Name, consumer.Last_Name].filter(Boolean).join(' ')}`,
    }));

  const resetManualForm = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    setManualForm({
      consumerId: '',
      billDate: today,
      dueDate: '',
      billingMonth: formatBillingMonth(today),
      coveredFrom: today,
      coveredTo: today,
      currentCharge: '',
      meterFee: '0',
      previousBalance: '0',
      previousPenalty: '0',
      penalty: '0',
      status: 'Unpaid',
    });
  }, []);

  const openManualEntry = () => {
    resetManualForm();
    setIsManualEntryOpen(true);
  };

  const handleSaveManualBill = async () => {
    if (!manualForm.consumerId || !manualForm.billDate || !manualForm.dueDate || !manualForm.billingMonth || !manualForm.currentCharge) {
      showToast('Please complete the required manual bill fields.', 'error');
      return;
    }

    try {
      setSavingManualBill(true);
      const response = await fetch(`${API_URL}/bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Consumer_ID: Number(manualForm.consumerId),
          Bill_Date: manualForm.billDate,
          Due_Date: manualForm.dueDate,
          Billing_Month: manualForm.billingMonth,
          Date_Covered_From: manualForm.coveredFrom || manualForm.billDate,
          Date_Covered_To: manualForm.coveredTo || manualForm.dueDate,
          Water_Charge: Number(manualForm.currentCharge || 0),
          Basic_Charge: Number(manualForm.currentCharge || 0),
          Environmental_Fee: Number(manualForm.meterFee || 0),
          Meter_Fee: Number(manualForm.meterFee || 0),
          Previous_Balance: Number(manualForm.previousBalance || 0),
          Previous_Penalty: Number(manualForm.previousPenalty || 0),
          Penalty: Number(manualForm.penalty || 0),
          Amount_Due: manualBillSummary.totalAmount,
          Total_Amount: manualBillSummary.totalAmount,
          Total_After_Due_Date: manualBillSummary.totalAfterDueDate,
          Status: manualForm.status,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.message || 'Failed to save manual bill.');
      }

      showToast('Manual bill created successfully.', 'success');
      setIsManualEntryOpen(false);
      resetManualForm();
      loadBills();
    } catch (error: any) {
      console.error('Error saving manual bill:', error);
      showToast(error.message || 'Failed to save manual bill.', 'error');
    } finally {
      setSavingManualBill(false);
    }
  };

  return (
    <MainLayout title="Bills Registry">
      <div className="generate-bills-page">
        <div className="page-intro" style={{ marginBottom: '10px' }}>
          <h3 style={{ color: '#1B1B63', fontSize: '18px', fontWeight: '800' }}>Generated Billing Records</h3>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>Review bills already generated by the system and monitor unpaid or overdue accounts.</p>
        </div>

        <div className="dashboard-cards" style={{ marginBottom: '20px' }}>
          <div className="card card-highlight-blue">
            <div className="card-header">
              <h2 className="card-title">Bills in View</h2>
              <i className="fas fa-file-invoice-dollar"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{totalBills}</div>
              <div className="card-label">Records matching the current filters</div>
            </div>
          </div>
          <div className="card card-highlight-green">
            <div className="card-header">
              <h2 className="card-title">Total Amount</h2>
              <i className="fas fa-wallet"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{formatCurrency(totalBilled)}</div>
              <div className="card-label">Combined billed amount</div>
            </div>
          </div>
          <div className="card card-highlight-gold">
            <div className="card-header">
              <h2 className="card-title">Unpaid Bills</h2>
              <i className="fas fa-hourglass-half"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{unpaidBills}</div>
              <div className="card-label">Still awaiting settlement</div>
            </div>
          </div>
          <div className="card card-highlight-red">
            <div className="card-header">
              <h2 className="card-title">Overdue Bills</h2>
              <i className="fas fa-exclamation-circle"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{overdueBills}</div>
              <div className="card-label">Require collection follow-up</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Bills Registry</h2>
          </div>
          <div className="card-body">
            <div className="filter-bar">
              <div className="search-box">
                <i className="fas fa-search"></i>
                <input
                  type="text"
                  placeholder="Search by account number or consumer name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="filters">
                <FormSelect label="" value={zoneFilter} onChange={setZoneFilter} options={zoneOptions} placeholder="All Map Zones" icon="fa-map-marker-alt" />
                <FormSelect
                  label=""
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: 'Unpaid', label: 'Unpaid' },
                    { value: 'Partially Paid', label: 'Partially Paid' },
                    { value: 'Paid', label: 'Paid' },
                    { value: 'Overdue', label: 'Overdue' },
                  ]}
                  placeholder="All Bill Statuses"
                  icon="fa-filter"
                />
                <button className="btn btn-secondary" onClick={loadBills} title="Refresh Records">
                  <i className="fas fa-sync-alt"></i>
                </button>
                <button className="btn btn-primary" onClick={openManualEntry} title="Manual Bill Entry">
                  <i className="fas fa-plus-circle"></i> Manual Bill Entry
                </button>
              </div>
            </div>
            <DataTable columns={columns} data={filteredBills} loading={loading} emptyMessage="No billing records found." />
          </div>
        </div>

        {selectedBill && (
          <Modal isOpen={Boolean(selectedBill)} title="Bill Details" onClose={() => setSelectedBill(null)} size="large" closeOnOverlayClick={true}>
            <div className="bill-preview">
              <div className="bill-info">
                <div className="bill-customer">
                  <p><strong>Account No.:</strong> {selectedBill.Account_Number}</p>
                  <p><strong>Name:</strong> {selectedBill.Consumer_Name}</p>
                  <p><strong>Address:</strong> {selectedBill.Address || 'N/A'}</p>
                  <p><strong>Classification:</strong> {selectedBill.Classification || 'N/A'}</p>
                </div>
                <div className="bill-details">
                  <p><strong>Bill No.:</strong> {selectedBill.Bill_ID}</p>
                  <p><strong>Billing Month:</strong> {selectedBill.Billing_Month || 'N/A'}</p>
                  <p><strong>Bill Date:</strong> {formatDate(selectedBill.Bill_Date)}</p>
                  <p><strong>Due Date:</strong> {formatDate(selectedBill.Due_Date)}</p>
                  <p><strong>Status:</strong> {selectedBill.Status}</p>
                </div>
              </div>
              <div className="bill-amount">
                <h3>Total Amount Due</h3>
                <h2>{formatCurrency(selectedBill.Total_Amount)}</h2>
              </div>
            </div>
          </Modal>
        )}

        <Modal
          isOpen={isManualEntryOpen}
          title="Manual Bill Entry"
          onClose={() => setIsManualEntryOpen(false)}
          size="large"
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setIsManualEntryOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveManualBill} disabled={savingManualBill}>
                <i className="fas fa-save"></i> {savingManualBill ? 'Saving...' : 'Save Manual Bill'}
              </button>
            </>
          }
        >
          <div className="manual-bill-grid">
            <FormSelect
              label="Consumer"
              value={manualForm.consumerId}
              onChange={(value) => setManualForm({ ...manualForm, consumerId: value })}
              options={consumerOptions}
              placeholder="Select consumer account"
              required
            />
            <FormInput
              label="Billing Month"
              value={manualForm.billingMonth}
              onChange={(value) => setManualForm({ ...manualForm, billingMonth: value })}
              placeholder="April 2026"
              required
            />
            <FormInput
              label="Bill Date"
              type="date"
              value={manualForm.billDate}
              onChange={(value) => setManualForm({ ...manualForm, billDate: value })}
              required
            />
            <FormInput
              label="Due Date"
              type="date"
              value={manualForm.dueDate}
              onChange={(value) => setManualForm({ ...manualForm, dueDate: value })}
              required
            />
            <FormInput
              label="Covered From"
              type="date"
              value={manualForm.coveredFrom}
              onChange={(value) => setManualForm({ ...manualForm, coveredFrom: value })}
            />
            <FormInput
              label="Covered To"
              type="date"
              value={manualForm.coveredTo}
              onChange={(value) => setManualForm({ ...manualForm, coveredTo: value })}
            />
            <FormInput
              label="Current Charge"
              type="number"
              value={manualForm.currentCharge}
              onChange={(value) => setManualForm({ ...manualForm, currentCharge: value })}
              placeholder="0.00"
              required
            />
            <FormInput
              label="Meter / Maintenance Fee"
              type="number"
              value={manualForm.meterFee}
              onChange={(value) => setManualForm({ ...manualForm, meterFee: value })}
              placeholder="0.00"
            />
            <FormInput
              label="Previous Balance"
              type="number"
              value={manualForm.previousBalance}
              onChange={(value) => setManualForm({ ...manualForm, previousBalance: value })}
              placeholder="0.00"
            />
            <FormInput
              label="Previous Penalty"
              type="number"
              value={manualForm.previousPenalty}
              onChange={(value) => setManualForm({ ...manualForm, previousPenalty: value })}
              placeholder="0.00"
            />
            <FormInput
              label="Penalty"
              type="number"
              value={manualForm.penalty}
              onChange={(value) => setManualForm({ ...manualForm, penalty: value })}
              placeholder="0.00"
            />
            <FormSelect
              label="Bill Status"
              value={manualForm.status}
              onChange={(value) => setManualForm({ ...manualForm, status: value })}
              options={[
                { value: 'Unpaid', label: 'Unpaid' },
                { value: 'Partially Paid', label: 'Partially Paid' },
                { value: 'Paid', label: 'Paid' },
                { value: 'Overdue', label: 'Overdue' },
              ]}
            />
          </div>

          <div className="manual-bill-preview">
            <div>
              <h4>Selected Consumer</h4>
              <p><strong>Account:</strong> {selectedManualConsumer?.Account_Number || 'None selected'}</p>
              <p><strong>Name:</strong> {[selectedManualConsumer?.First_Name, selectedManualConsumer?.Middle_Name, selectedManualConsumer?.Last_Name].filter(Boolean).join(' ') || 'N/A'}</p>
              <p><strong>Address:</strong> {selectedManualConsumer?.Address || 'N/A'}</p>
              <p><strong>Classification:</strong> {selectedManualConsumer?.Classification_Name || 'N/A'}</p>
            </div>
            <div>
              <h4>Bill Summary</h4>
              <p><strong>Amount Due:</strong> {formatCurrency(manualBillSummary.totalAmount)}</p>
              <p><strong>Total After Due Date:</strong> {formatCurrency(manualBillSummary.totalAfterDueDate)}</p>
            </div>
          </div>
        </Modal>
      </div>
    </MainLayout>
  );
};

export default GenerateBills;
