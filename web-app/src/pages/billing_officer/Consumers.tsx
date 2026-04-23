import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import FormInput from '../../components/Common/FormInput';
import FormSelect from '../../components/Common/FormSelect';
import Modal from '../../components/Common/Modal';
import TableToolbar from '../../components/Common/TableToolbar';
import { useToast } from '../../components/Common/ToastContainer';
import { getErrorMessage, loadClassificationsWithFallback, loadConsumersWithFallback, loadZonesWithFallback, requestJson } from '../../services/userManagementApi';
import { formatAccountNumberForDisplay } from '../../utils/accountNumber';
import './Consumers.css';

interface Consumer {
  Consumer_ID: number;
  First_Name: string;
  Middle_Name?: string;
  Last_Name: string;
  Address: string;
  Purok?: string;
  Barangay?: string;
  Municipality?: string;
  Zip_Code?: string;
  Zone_ID: number;
  Zone_Name?: string;
  Classification_ID: number;
  Classification_Name?: string;
  Account_Number: string;
  Meter_Number: string;
  Meter_Status?: string;
  Status: string;
  Contact_Number: string;
  Connection_Date: string;
}

interface Zone {
  Zone_ID: number;
  Zone_Name: string;
}

interface Classification {
  Classification_ID: number;
  Classification_Name: string;
}

const formatZoneLabel = (zoneName?: string, zoneId?: number | string | null) =>
  zoneName || (zoneId ? `Zone ${zoneId}` : 'Not Assigned');

const ACCOUNT_NUMBER_PATTERN = /^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+(-[A-Z0-9]+)?$/i;
const PHONE_PATTERN = /^(09\d{9}|639\d{9}|\+639\d{9})$/;
const BARANGAYS = [
  'Daculang Bolo', 'Dagotdotan', 'Langga', 'Laniton',
  'Maisog', 'Mampurog', 'Manlimonsito', 'Matacong (Pob.)',
  'Salvacion', 'San Antonio', 'San Isidro', 'San Ramon',
].sort();
const PUROK_OPTIONS = ['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5'];
const toOptionalNumber = (value: string) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizePhoneInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const hasLeadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasLeadingPlus ? `+${digits}` : digits;
};

const Consumers: React.FC = () => {
  const { showToast } = useToast();
  const [consumers, setConsumers] = useState<Consumer[]>([]);
  const [filteredConsumers, setFilteredConsumers] = useState<Consumer[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedConsumer, setSelectedConsumer] = useState<Consumer | null>(null);
  const [editingConsumer, setEditingConsumer] = useState<Consumer | null>(null);
  const [consumerToDelete, setConsumerToDelete] = useState<Consumer | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('');
  const [meterStatusFilter, setMeterStatusFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    firstName: '',
    middleName: '',
    lastName: '',
    address: '',
    purok: '',
    barangay: '',
    municipality: 'San Lorenzo Ruiz',
    zipCode: '4610',
    zoneId: '',
    classificationId: '',
    accountNumber: '',
    meterNumber: '',
    meterStatus: 'Active',
    contactNumber: '',
    connectionDate: '',
    status: 'Pending',
  });
  const loadConsumers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, source } = await loadConsumersWithFallback();
      setConsumers(data);
      if (source === 'supabase') {
        showToast('Consumers loaded using Supabase fallback.', 'warning');
      }
    } catch (error) {
      console.error('Error loading consumers:', error);
      showToast(getErrorMessage(error, 'Failed to load consumers.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadZones = useCallback(async () => {
    try {
      const { data } = await loadZonesWithFallback();
      setZones((data || []).map((zone: any) => ({
        Zone_ID: zone.Zone_ID ?? zone.zone_id,
        Zone_Name: zone.Zone_Name ?? zone.zone_name,
      })));
    } catch (error) {
      console.error('Error loading zones:', error);
      showToast(getErrorMessage(error, 'Failed to load zones.'), 'error');
    }
  }, [showToast]);

  const loadClassifications = useCallback(async () => {
    try {
      const { data } = await loadClassificationsWithFallback();
      setClassifications((data || []).map((classification: any) => ({
        Classification_ID: classification.Classification_ID ?? classification.classification_id,
        Classification_Name: classification.Classification_Name ?? classification.classification_name,
      })));
    } catch (error) {
      console.error('Error loading classifications:', error);
      showToast(getErrorMessage(error, 'Failed to load classifications.'), 'error');
    }
  }, [showToast]);

  const filterConsumers = useCallback(() => {
    let filtered = [...consumers];

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.First_Name?.toLowerCase().includes(search) ||
          c.Last_Name?.toLowerCase().includes(search) ||
          c.Account_Number?.toLowerCase().includes(search) ||
          c.Address?.toLowerCase().includes(search)
      );
    }

    if (zoneFilter) {
      filtered = filtered.filter((c) => c.Zone_ID === parseInt(zoneFilter));
    }

    if (classificationFilter) {
      filtered = filtered.filter((c) => String(c.Classification_ID) === classificationFilter);
    }

    if (meterStatusFilter) {
      filtered = filtered.filter((c) => String(c.Meter_Status || 'Active') === meterStatusFilter);
    }

    if (statusFilter) {
      filtered = filtered.filter((c) => c.Status === statusFilter);
    }

    setFilteredConsumers(filtered);
  }, [classificationFilter, consumers, meterStatusFilter, searchTerm, statusFilter, zoneFilter]);

  useEffect(() => {
    loadConsumers();
    loadZones();
    loadClassifications();
  }, [loadClassifications, loadConsumers, loadZones]);

  useEffect(() => {
    filterConsumers();
  }, [filterConsumers]);

  useEffect(() => {
    const composedAddress = [formData.purok, formData.barangay, formData.municipality, formData.zipCode]
      .filter(Boolean)
      .join(', ');

    if (formData.address !== composedAddress) {
      setFormData((current) => ({ ...current, address: composedAddress }));
    }
  }, [formData.purok, formData.barangay, formData.municipality, formData.zipCode, formData.address]);

  const handleViewDetails = (consumer: Consumer) => {
    setSelectedConsumer(consumer);
    setIsDetailsModalOpen(true);
  };

  const handleAddConsumer = () => {
    setEditingConsumer(null);
    setFormData({
      firstName: '',
      username: '',
      password: '',
      middleName: '',
      lastName: '',
      address: '',
      purok: '',
      barangay: '',
      municipality: 'San Lorenzo Ruiz',
      zipCode: '4610',
      zoneId: '',
      classificationId: '',
      accountNumber: '',
      meterNumber: '',
      meterStatus: 'Active',
      contactNumber: '',
      connectionDate: new Date().toISOString().split('T')[0],
      status: 'Pending',
    });
    setIsFormModalOpen(true);
  };

  const handleEditConsumer = (consumer: Consumer) => {
    setEditingConsumer(consumer);
    setFormData({
      firstName: consumer.First_Name,
      username: '',
      password: '',
      middleName: consumer.Middle_Name || '',
      lastName: consumer.Last_Name,
      address: consumer.Address,
      purok: consumer.Purok || '',
      barangay: consumer.Barangay || '',
      municipality: consumer.Municipality || 'San Lorenzo Ruiz',
      zipCode: consumer.Zip_Code || '4610',
      zoneId: consumer.Zone_ID.toString(),
      classificationId: consumer.Classification_ID.toString(),
      accountNumber: consumer.Account_Number,
      meterNumber: consumer.Meter_Number,
      meterStatus: consumer.Meter_Status || 'Active',
      contactNumber: consumer.Contact_Number,
      connectionDate: consumer.Connection_Date,
      status: consumer.Status,
    });
    setIsFormModalOpen(true);
    setIsDetailsModalOpen(false);
  };

  const handleDeleteConsumer = async () => {
    if (!consumerToDelete) return;
    try {
      const result = await requestJson<{ success: boolean; message?: string }>(`/consumers/${consumerToDelete.Consumer_ID}`, {
        method: 'DELETE',
      }, 'Failed to delete consumer.');

      if (result.success) {
        showToast(result.message || 'Consumer deleted successfully', 'success');
        loadConsumers();
        setIsDetailsModalOpen(false);
        setConsumerToDelete(null);
      } else {
        showToast(result.message || 'Failed to delete consumer', 'error');
      }
    } catch (error) {
      console.error('Error deleting consumer:', error);
      showToast(getErrorMessage(error, 'Failed to delete consumer.'), 'error');
    }
  };

  const handleSaveConsumer = async () => {
    if (formData.accountNumber.trim() && !ACCOUNT_NUMBER_PATTERN.test(formData.accountNumber.trim())) {
      showToast('Account number must follow the format xx-xx-xxx or xx-xx-xxx-x.', 'error');
      return;
    }

    if (formData.contactNumber.trim() && !PHONE_PATTERN.test(formData.contactNumber.trim())) {
      showToast('Contact number must be a valid Philippine mobile number.', 'error');
      return;
    }

    if (!editingConsumer && (!formData.username || !formData.password)) {
      showToast('Username and password are required for new consumers.', 'error');
      return;
    }

    if (!formData.zoneId) {
      showToast('Please select a zone before saving the consumer.', 'error');
      return;
    }

    if (!formData.classificationId) {
      showToast('Please select a classification before saving the consumer.', 'error');
      return;
    }

    try {
      const body = {
        Username: formData.username,
        Password: formData.password,
        First_Name: formData.firstName,
        Middle_Name: formData.middleName,
        Last_Name: formData.lastName,
        Address: formData.address,
        Purok: formData.purok,
        Barangay: formData.barangay,
        Municipality: formData.municipality,
        Zip_Code: formData.zipCode,
        Zone_ID: toOptionalNumber(formData.zoneId),
        Classification_ID: toOptionalNumber(formData.classificationId),
        Account_Number: formData.accountNumber.trim(),
        Meter_Number: formData.meterNumber,
        Meter_Status: formData.meterStatus,
        Contact_Number: formData.contactNumber,
        Connection_Date: formData.connectionDate,
        Status: formData.status,
      };

      const result = await requestJson<{ success?: boolean; message?: string }>(
        editingConsumer ? `/consumers/${editingConsumer.Consumer_ID}` : '/consumers',
        {
        method: editingConsumer ? 'PUT' : 'POST',
        body: JSON.stringify(body),
        },
        'Failed to save consumer.'
      );

      if (result.success !== false) {
        showToast(
          result.message || (editingConsumer ? 'Consumer updated successfully' : 'Consumer created successfully'),
          'success'
        );
        setIsFormModalOpen(false);
        loadConsumers();
      } else {
        showToast(result.message || 'Failed to save consumer', 'error');
      }
    } catch (error) {
      console.error('Error saving consumer:', error);
      showToast(getErrorMessage(error, 'Failed to save consumer.'), 'error');
    }
  };

  const columns = [
    {
      key: 'Account_Number',
      label: 'Account #',
      sortable: true,
      render: (value: string) => formatAccountNumberForDisplay(value),
    },
    {
      key: 'name',
      label: 'Consumer Name',
      sortable: true,
      render: (_: any, row: Consumer) => `${row.First_Name} ${row.Middle_Name ? row.Middle_Name.charAt(0) + '.' : ''} ${row.Last_Name}`,
    },
    { key: 'Address', label: 'Address', sortable: true },
    {
      key: 'Zone_Name',
      label: 'Zone',
      sortable: true,
      render: (_: string, row: Consumer) => formatZoneLabel(row.Zone_Name, row.Zone_ID),
    },
    { key: 'Classification_Name', label: 'Type', sortable: true },
    {
      key: 'Meter_Status',
      label: 'Meter Status',
      sortable: true,
      render: (value: string) => (
        <span className={`status-badge status-${(value || 'active').toLowerCase()}`}>{value || 'Active'}</span>
      ),
    },
    {
      key: 'Status',
      label: 'Account Status',
      render: (value: string) => (
        <span className={`status-badge status-${(value || 'unknown').toLowerCase()}`}>{value}</span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_: any, row: Consumer) => (
        <div className="action-buttons-inline">
          <button className="btn-icon" title="View Details" onClick={() => handleViewDetails(row)}>
            <i className="fas fa-eye"></i>
          </button>
          <button className="btn-icon" title="Edit" onClick={() => handleEditConsumer(row)}>
            <i className="fas fa-edit"></i>
          </button>
          <button className="btn-icon btn-danger" title="Delete" onClick={() => setConsumerToDelete(row)}>
            <i className="fas fa-trash"></i>
          </button>
        </div>
      ),
    },
  ];

  const zoneOptions = zones.map((z) => ({ value: z.Zone_ID, label: formatZoneLabel(z.Zone_Name, z.Zone_ID) }));
  const classificationOptions = classifications.map((c) => ({
    value: c.Classification_ID,
    label: c.Classification_Name,
  }));
  const meterStatusOptions = [
    { value: 'Active', label: 'Active Meter' },
    { value: 'Inactive', label: 'Inactive Meter' },
    { value: 'Defective', label: 'Defective Meter' },
    { value: 'Disconnected', label: 'Disconnected Meter' },
  ];
  const hasActiveFilters = Boolean(searchTerm.trim() || zoneFilter || classificationFilter || meterStatusFilter || statusFilter);
  const clearFilters = () => {
    setSearchTerm('');
    setZoneFilter('');
    setClassificationFilter('');
    setMeterStatusFilter('');
    setStatusFilter('');
  };

  return (
    <MainLayout title="Consumer Registry">
      <div className="billing-consumers-page">
        <TableToolbar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Search by name, account number, or address..."
          quickFilters={
            <>
              <FormSelect
                label=""
                value={zoneFilter}
                onChange={setZoneFilter}
                options={zoneOptions}
                placeholder="All Map Zones"
              />
              <FormSelect
                label=""
                value={classificationFilter}
                onChange={setClassificationFilter}
                options={classificationOptions}
                placeholder="All Consumer Types"
              />
              <FormSelect
                label=""
                value={meterStatusFilter}
                onChange={setMeterStatusFilter}
                options={meterStatusOptions}
                placeholder="All Meter Statuses"
              />
              <FormSelect
                label=""
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'Active', label: 'Active Account' },
                  { value: 'Inactive', label: 'Inactive Account' },
                  { value: 'Pending', label: 'Pending Account' },
                  { value: 'Disconnected', label: 'Disconnected Account' },
                ]}
                placeholder="All Account Statuses"
              />
            </>
          }
          actions={
            <>
              <button className="btn btn-primary" onClick={handleAddConsumer}>
                <i className="fas fa-plus"></i> New Consumer
              </button>
              <button className="btn btn-secondary" onClick={loadConsumers} title="Refresh Records">
                <i className="fas fa-sync-alt"></i>
              </button>
            </>
          }
          loading={loading}
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
        />

        <div className="consumers-card">
          <div className="card-body p-0">
            <DataTable
              columns={columns}
              data={filteredConsumers}
              loading={loading}
              emptyMessage="No consumers found matching your search criteria."
            />
          </div>
        </div>

        {/* Details Modal */}
        <Modal
          isOpen={isDetailsModalOpen}
          onClose={() => setIsDetailsModalOpen(false)}
          title="Consumer Information"
          size="large"
          closeOnOverlayClick={true}
          footer={
            <div style={{ display: 'flex', gap: '15px' }}>
              <button className="btn btn-secondary" onClick={() => setIsDetailsModalOpen(false)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                style={{ backgroundColor: '#1B1B63', borderColor: '#1B1B63' }}
                onClick={() => selectedConsumer && handleEditConsumer(selectedConsumer)}
              >
                <i className="fas fa-edit"></i> Edit Records
              </button>
            </div>
          }
        >
          {selectedConsumer && (
            <div className="details-container" style={{ padding: '20px' }}>
              <div className="details-columns" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                {/* Personal Data Column */}
                <div className="detail-col">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '18px', color: '#1B1B63', marginBottom: '25px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                    <i className="fas fa-user-circle"></i> Personal Data
                  </h3>
                  <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                    <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Account No:</span>
                    <span className="view-value" style={{ fontWeight: 600, color: '#333' }}>{formatAccountNumberForDisplay(selectedConsumer.Account_Number)}</span>
                  </div>
                  <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                    <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Name:</span>
                    <span className="view-value" style={{ fontWeight: 800, color: '#1B1B63', fontSize: '1.1em' }}>
                      {selectedConsumer.First_Name} {selectedConsumer.Middle_Name ? selectedConsumer.Middle_Name + ' ' : ''}{selectedConsumer.Last_Name}
                    </span>
                  </div>
                  <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                    <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Address:</span>
                    <span className="view-value" style={{ fontWeight: 600, color: '#333', textAlign: 'right', maxWidth: '60%' }}>{selectedConsumer.Address}</span>
                  </div>
                </div>

                {/* Account Info Column */}
                <div className="detail-col">
                  <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '18px', color: '#1B1B63', marginBottom: '25px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                    <i className="fas fa-id-card"></i> Account Info
                  </h3>
                  <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                    <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Map Zone:</span>
                    <span className="view-value" style={{ fontWeight: 700, color: '#333' }}>{formatZoneLabel(selectedConsumer.Zone_Name, selectedConsumer.Zone_ID)}</span>
                  </div>
                  <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                    <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Classification:</span>
                    <span className="view-value" style={{ fontWeight: 700, color: '#333' }}>{selectedConsumer.Classification_Name}</span>
                  </div>
                  <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                    <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Meter Status:</span>
                    <span className={`status-badge status-${(selectedConsumer.Meter_Status || 'active').toLowerCase()}`} style={{ fontSize: '0.85em', padding: '4px 12px' }}>
                      {selectedConsumer.Meter_Status || 'Active'}
                    </span>
                  </div>
                  <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                    <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Status:</span>
                    <span className={`status-badge status-${(selectedConsumer.Status || 'active').toLowerCase()}`} style={{ fontSize: '0.85em', padding: '4px 12px' }}>
                      {selectedConsumer.Status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Modal>

        {/* Form Modal */}
        <Modal
          isOpen={isFormModalOpen}
          onClose={() => setIsFormModalOpen(false)}
          title={editingConsumer ? 'Update Consumer' : 'Add New Consumer'}
          size="large"
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setIsFormModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveConsumer}><i className="fas fa-save"></i> Save Changes</button>
            </>
          }
        >
          <div className="billing-consumer-modal-grid">
            {!editingConsumer && (
              <>
                <div className="billing-consumer-modal-section-title">Account Access</div>
                <FormInput label="Username" value={formData.username} onChange={(v) => setFormData({ ...formData, username: v })} required />
                <FormInput label="Password" type="password" value={formData.password} onChange={(v) => setFormData({ ...formData, password: v })} required />
              </>
            )}
            <div className="billing-consumer-modal-section-title">Personal Information</div>
            <FormInput label="First Name" value={formData.firstName} onChange={(v) => setFormData({ ...formData, firstName: v })} required />
            <FormInput label="Middle Name" value={formData.middleName} onChange={(v) => setFormData({ ...formData, middleName: v })} />
            <FormInput label="Last Name" value={formData.lastName} onChange={(v) => setFormData({ ...formData, lastName: v })} required />
            <FormInput
              label="Account Number"
              value={formData.accountNumber}
              onChange={(v) => setFormData({ ...formData, accountNumber: v })}
              required
              placeholder="xx-xx-xxx or xx-xx-xxx-x"
            />
            <FormInput label="Meter Number" value={formData.meterNumber} onChange={(v) => setFormData({ ...formData, meterNumber: v })} />
            <FormSelect
              label="Meter Status"
              value={formData.meterStatus}
              onChange={(v) => setFormData({ ...formData, meterStatus: v })}
              options={[
                { value: 'Active', label: 'Active' },
                { value: 'Inactive', label: 'Inactive' },
                { value: 'Defective', label: 'Defective' },
                { value: 'Disconnected', label: 'Disconnected' },
              ]}
            />
            <div className="billing-consumer-modal-section-title">Address Details</div>
            <FormSelect label="Purok" value={formData.purok} onChange={(v) => setFormData({ ...formData, purok: v })} options={PUROK_OPTIONS.map((item) => ({ value: item, label: item }))} />
            <FormSelect label="Barangay" value={formData.barangay} onChange={(v) => setFormData({ ...formData, barangay: v })} options={BARANGAYS.map((item) => ({ value: item, label: item }))} />
            <FormInput label="Municipality" value={formData.municipality} onChange={(v) => setFormData({ ...formData, municipality: v })} />
            <FormInput label="Zip Code" value={formData.zipCode} onChange={(v) => setFormData({ ...formData, zipCode: v })} />
            <FormInput label="Address" value={formData.address} onChange={() => {}} />
            <div className="billing-consumer-modal-section-title">Service Details</div>
            <FormInput label="Contact #" value={formData.contactNumber} onChange={(v) => setFormData({ ...formData, contactNumber: normalizePhoneInput(v) })} />
            <FormSelect label="Zone" value={formData.zoneId} onChange={(v) => setFormData({ ...formData, zoneId: v })} options={zoneOptions} required />
            <FormSelect label="Type" value={formData.classificationId} onChange={(v) => setFormData({ ...formData, classificationId: v })} options={classificationOptions} required />
            <FormSelect
              label="Account Status"
              value={formData.status}
              onChange={(v) => setFormData({ ...formData, status: v })}
              options={[
                { value: 'Pending', label: 'Pending' },
                { value: 'Active', label: 'Active' },
                { value: 'Inactive', label: 'Inactive' },
              ]}
            />
            <FormInput label="Date Joined" type="date" value={formData.connectionDate} onChange={(v) => setFormData({ ...formData, connectionDate: v })} />
          </div>
        </Modal>

        <Modal
          isOpen={!!consumerToDelete}
          onClose={() => setConsumerToDelete(null)}
          title="Delete Consumer"
          size="small"
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setConsumerToDelete(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleDeleteConsumer}>
                <i className="fas fa-trash"></i> Confirm Delete
              </button>
            </>
          }
        >
          {consumerToDelete && (
            <p style={{ margin: 0, color: '#475569', fontWeight: 600 }}>
              Delete consumer <strong>{consumerToDelete.First_Name} {consumerToDelete.Last_Name}</strong>? This action cannot be undone.
            </p>
          )}
        </Modal>
      </div>
    </MainLayout>
  );
};

export default Consumers;
