import React, { useEffect, useMemo, useState } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import Modal from '../../components/Common/Modal';
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
  Zone_ID: number;
}

interface ZoneRow {
  Zone_ID: number;
  Zone_Name?: string;
}

const formatCurrency = (value: number) =>
  `P${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value?: string) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH');
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

  const loadBills = async () => {
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
  };

  useEffect(() => {
    loadBills();
  }, []);

  const consumerMap = useMemo(() => new Map(consumers.map((consumer) => [consumer.Consumer_ID, consumer])), [consumers]);

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

  const zoneOptions = zones.map((zone) => ({ value: zone.Zone_ID, label: `Zone ${zone.Zone_ID}` }));

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
              </div>
            </div>
            <DataTable columns={columns} data={filteredBills} loading={loading} emptyMessage="No billing records found." />
          </div>
        </div>

        {selectedBill && (
          <Modal isOpen={Boolean(selectedBill)} title="Bill Details" onClose={() => setSelectedBill(null)} size="large">
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
      </div>
    </MainLayout>
  );
};

export default GenerateBills;
