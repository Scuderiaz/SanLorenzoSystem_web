import React, { useState, useEffect, useCallback } from 'react';
import DataTable, { Column } from '../../../components/Common/DataTable';
import Modal from '../../../components/Common/Modal';
import FormInput from '../../../components/Common/FormInput';
import FormSelect from '../../../components/Common/FormSelect';
import TableToolbar from '../../../components/Common/TableToolbar';
import { useToast } from '../../../components/Common/ToastContainer';
import { getErrorMessage, loadClassificationsWithFallback, loadConsumersWithFallback, loadZonesWithFallback, requestJson } from '../../../services/userManagementApi';
import { formatAccountNumberForDisplay } from '../../../utils/accountNumber';
import '../Consumers.css';

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

const ConcessionairesTab: React.FC = () => {
  const { showToast } = useToast();
  const [concessionaires, setConcessionaires] = useState<Consumer[]>([]);
  const [filteredConcessionaires, setFilteredConcessionaires] = useState<Consumer[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedConcessionaire, setSelectedConcessionaire] = useState<Consumer | null>(null);
  const [editingConcessionaire, setEditingConcessionaire] = useState<Consumer | null>(null);
  const [consumerToDelete, setConsumerToDelete] = useState<Consumer | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('');
  const [barangayFilter, setBarangayFilter] = useState('');
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
  const loadConcessionaires = useCallback(async () => {
    setLoading(true);
    try {
      const { data, source } = await loadConsumersWithFallback();
      setConcessionaires(data);
      if (source === 'supabase') {
        showToast('Consumers loaded using Supabase fallback.', 'warning');
      }
    } catch (error) {
      console.error('Error loading concessionaires:', error);
      showToast(getErrorMessage(error, 'Failed to load concessionaires.'), 'error');
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

  const filterConcessionaires = useCallback(() => {
    let filtered = [...concessionaires];

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

    if (classificationFilter) {
      filtered = filtered.filter((c) => String(c.Classification_ID) === classificationFilter);
    }

    if (barangayFilter) {
      filtered = filtered.filter((c) => String(c.Barangay || '').trim() === barangayFilter);
    }

    if (meterStatusFilter) {
      filtered = filtered.filter((c) => String(c.Meter_Status || 'Active') === meterStatusFilter);
    }

    if (statusFilter) {
      filtered = filtered.filter((c) => c.Status === statusFilter);
    }

    setFilteredConcessionaires(filtered);
  }, [barangayFilter, classificationFilter, concessionaires, meterStatusFilter, searchTerm, statusFilter]);

  useEffect(() => {
    loadConcessionaires();
    loadZones();
    loadClassifications();
  }, [loadClassifications, loadConcessionaires, loadZones]);

  useEffect(() => {
    filterConcessionaires();
  }, [filterConcessionaires]);

  useEffect(() => {
    const composedAddress = [formData.purok, formData.barangay, formData.municipality, formData.zipCode]
      .filter(Boolean)
      .join(', ');

    if (formData.address !== composedAddress) {
      setFormData((current) => ({ ...current, address: composedAddress }));
    }
  }, [formData.purok, formData.barangay, formData.municipality, formData.zipCode, formData.address]);

  const handleViewDetails = (Consumer: Consumer) => {
    setSelectedConcessionaire(Consumer);
    setIsDetailsModalOpen(true);
  };

  const handleAddConcessionaire = () => {
    setEditingConcessionaire(null);
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

  const handleEditConcessionaire = (Consumer: Consumer) => {
    setEditingConcessionaire(Consumer);
    setFormData({
      firstName: Consumer.First_Name,
      username: '',
      password: '',
      middleName: Consumer.Middle_Name || '',
      lastName: Consumer.Last_Name,
      address: Consumer.Address,
      purok: Consumer.Purok || '',
      barangay: Consumer.Barangay || '',
      municipality: Consumer.Municipality || 'San Lorenzo Ruiz',
      zipCode: Consumer.Zip_Code || '4610',
      zoneId: Consumer.Zone_ID.toString(),
      classificationId: Consumer.Classification_ID.toString(),
      accountNumber: Consumer.Account_Number,
      meterNumber: Consumer.Meter_Number,
      meterStatus: Consumer.Meter_Status || 'Active',
      contactNumber: Consumer.Contact_Number,
      connectionDate: Consumer.Connection_Date,
      status: Consumer.Status,
    });
    setIsFormModalOpen(true);
    setIsDetailsModalOpen(false);
  };

  const handleDeleteConcessionaire = async () => {
    if (!consumerToDelete) return;
    try {
      const result = await requestJson<{ success: boolean; message?: string }>(`/consumers/${consumerToDelete.Consumer_ID}`, {
        method: 'DELETE',
      }, 'Failed to delete Concessionaire.');

      if (result.success) {
        showToast(result.message || 'Concessionaire deleted successfully', 'success');
        loadConcessionaires();
        setIsDetailsModalOpen(false);
        setConsumerToDelete(null);
      } else {
        showToast(result.message || 'Failed to delete Concessionaire', 'error');
      }
    } catch (error) {
      console.error('Error deleting Concessionaire:', error);
      showToast(getErrorMessage(error, 'Failed to delete Concessionaire.'), 'error');
    }
  };

  const handleSaveConcessionaire = async () => {
    if (formData.accountNumber.trim() && !ACCOUNT_NUMBER_PATTERN.test(formData.accountNumber.trim())) {
      showToast('Account number must follow the format xx-xx-xxx or xx-xx-xxx-x.', 'error');
      return;
    }

    if (formData.contactNumber.trim() && !PHONE_PATTERN.test(formData.contactNumber.trim())) {
      showToast('Contact number must be a valid Philippine mobile number.', 'error');
      return;
    }

    if (!editingConcessionaire && (!formData.username || !formData.password)) {
      showToast('Username and password are required for new concessionaires.', 'error');
      return;
    }

    if (!formData.zoneId) {
      showToast('Please select a zone before saving the Concessionaire.', 'error');
      return;
    }

    if (!formData.classificationId) {
      showToast('Please select a classification before saving the Concessionaire.', 'error');
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
        editingConcessionaire ? `/consumers/${editingConcessionaire.Consumer_ID}` : '/consumers',
        {
        method: editingConcessionaire ? 'PUT' : 'POST',
        body: JSON.stringify(body),
        },
        'Failed to save Concessionaire.'
      );

      if (result.success !== false) {
        showToast(
          result.message || (editingConcessionaire ? 'Concessionaire updated successfully' : 'Concessionaire created successfully'),
          'success'
        );
        setIsFormModalOpen(false);
        loadConcessionaires();
      } else {
        showToast(result.message || 'Failed to save Concessionaire', 'error');
      }
    } catch (error) {
      console.error('Error saving Concessionaire:', error);
      showToast(getErrorMessage(error, 'Failed to save Concessionaire.'), 'error');
    }
  };

  const columns: Column[] = [
    {
      key: 'Account_Number',
      label: 'Account #',
      sortable: true,
      render: (value: string) => formatAccountNumberForDisplay(value),
    },
    {
      key: 'name',
      label: 'Concessionaire Name',
      sortable: true,
      render: (_, row: Consumer) => `${row.First_Name} ${row.Middle_Name ? row.Middle_Name.charAt(0) + '.' : ''} ${row.Last_Name}`,
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
        <span className={`status-badge status-${(value || 'unknown').toLowerCase()}`}>{value || 'Unknown'}</span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row: Consumer) => (
        <div className="action-buttons-inline">
          <button className="btn-icon" title="View Details" onClick={() => handleViewDetails(row)}>
            <i className="fas fa-eye"></i>
          </button>
          <button className="btn-icon" title="Edit" onClick={() => handleEditConcessionaire(row)}>
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
  const barangayOptions = Array.from(
    new Set(concessionaires.map((consumer) => String(consumer.Barangay || '').trim()).filter(Boolean))
  )
    .sort((left, right) => left.localeCompare(right))
    .map((barangay) => ({ value: barangay, label: barangay }));
  const meterStatusOptions = [
    { value: 'Active', label: 'Active Meter' },
    { value: 'Inactive', label: 'Inactive Meter' },
    { value: 'Defective', label: 'Defective Meter' },
    { value: 'Disconnected', label: 'Disconnected Meter' },
  ];
  const hasActiveFilters = Boolean(searchTerm.trim() || classificationFilter || barangayFilter || meterStatusFilter || statusFilter);
  const clearFilters = () => {
    setSearchTerm('');
    setClassificationFilter('');
    setBarangayFilter('');
    setMeterStatusFilter('');
    setStatusFilter('');
  };

  return (
    <div className="concessionaires-tab">
      <TableToolbar
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by name, account number, or address..."
        quickFilters={
          <>
              <FormSelect
                label=""
                value={classificationFilter}
                onChange={setClassificationFilter}
                options={classificationOptions}
                placeholder="All Concessionaire Types"
              />
              <FormSelect
                label=""
                value={barangayFilter}
                onChange={setBarangayFilter}
                options={barangayOptions}
                placeholder="All Barangays"
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
            <button className="btn btn-primary" onClick={handleAddConcessionaire}>
              <i className="fas fa-plus"></i> New Concessionaire
            </button>
            <button className="btn btn-secondary" onClick={loadConcessionaires} title="Refresh Records">
              <i className="fas fa-sync-alt"></i>
            </button>
          </>
        }
        loading={loading}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
      />

      <div className="consumers-card">
        <DataTable
          columns={columns}
          data={filteredConcessionaires}
          loading={loading}
          enablePagination
          pageSize={10}
          emptyMessage="No concessionaires found matching your search criteria."
        />
      </div>

      {/* Details Modal */}
      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        title="Concessionaire Information"
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
              onClick={() => selectedConcessionaire && handleEditConcessionaire(selectedConcessionaire)}
            >
              <i className="fas fa-edit"></i> Edit Records
            </button>
          </div>
        }
      >
        {selectedConcessionaire && (
          <div className="consumer-detail-modal">
            <div className="consumer-detail-grid">
              <section className="consumer-detail-section">
                <h3 className="consumer-detail-section-title">
                  <i className="fas fa-user-circle"></i> Personal Data
                </h3>
                <div className="consumer-detail-row">
                  <span className="consumer-detail-label">Account No.</span>
                  <span className="consumer-detail-value">{formatAccountNumberForDisplay(selectedConcessionaire.Account_Number)}</span>
                </div>
                <div className="consumer-detail-row">
                  <span className="consumer-detail-label">Name</span>
                  <span className="consumer-detail-value consumer-detail-value-name">
                    {selectedConcessionaire.First_Name} {selectedConcessionaire.Middle_Name ? `${selectedConcessionaire.Middle_Name} ` : ''}{selectedConcessionaire.Last_Name}
                  </span>
                </div>
                <div className="consumer-detail-row consumer-detail-row-address">
                  <span className="consumer-detail-label">Address</span>
                  <span className="consumer-detail-value">{selectedConcessionaire.Address}</span>
                </div>
              </section>

              <section className="consumer-detail-section">
                <h3 className="consumer-detail-section-title">
                  <i className="fas fa-id-card"></i> Account Info
                </h3>
                <div className="consumer-detail-row">
                  <span className="consumer-detail-label">Map Zone</span>
                  <span className="consumer-detail-value">{formatZoneLabel(selectedConcessionaire.Zone_Name, selectedConcessionaire.Zone_ID)}</span>
                </div>
                <div className="consumer-detail-row">
                  <span className="consumer-detail-label">Classification</span>
                  <span className="consumer-detail-value">{selectedConcessionaire.Classification_Name}</span>
                </div>
                <div className="consumer-detail-row">
                  <span className="consumer-detail-label">Meter Status</span>
                  <span className={`status-badge status-${(selectedConcessionaire.Meter_Status || 'active').toLowerCase()}`}>
                    {selectedConcessionaire.Meter_Status || 'Active'}
                  </span>
                </div>
                <div className="consumer-detail-row">
                  <span className="consumer-detail-label">Status</span>
                  <span className={`status-badge status-${(selectedConcessionaire.Status || 'unknown').toLowerCase()}`}>
                    {selectedConcessionaire.Status}
                  </span>
                </div>
              </section>
            </div>
          </div>
        )}
      </Modal>

      {/* Form Modal */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={editingConcessionaire ? 'Update Concessionaire' : 'Add New Concessionaire'}
        size="large"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsFormModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveConcessionaire}><i className="fas fa-save"></i> Save Changes</button>
          </>
        }
      >
        <div className="consumer-modal-grid">
          {!editingConcessionaire && (
            <>
              <div className="consumer-modal-section-title">Account Access</div>
              <FormInput label="Username" value={formData.username} onChange={(v) => setFormData({ ...formData, username: v })} required />
              <FormInput label="Password" type="password" value={formData.password} onChange={(v) => setFormData({ ...formData, password: v })} required />
            </>
          )}
          <div className="consumer-modal-section-title">Personal Information</div>
          <FormInput label="First Name" value={formData.firstName} onChange={(v) => setFormData({ ...formData, firstName: v })} required />
          <FormInput label="Middle Name" value={formData.middleName} onChange={(v) => setFormData({ ...formData, middleName: v })} />
          <FormInput label="Last Name" value={formData.lastName} onChange={(v) => setFormData({ ...formData, lastName: v })} required />
          <FormInput label="Account Number" value={formData.accountNumber} onChange={(v) => setFormData({ ...formData, accountNumber: v })} required placeholder="xx-xx-xxx or xx-xx-xxx-x" />
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
          <div className="consumer-modal-section-title">Address Details</div>
          <FormSelect label="Purok" value={formData.purok} onChange={(v) => setFormData({ ...formData, purok: v })} options={PUROK_OPTIONS.map((item) => ({ value: item, label: item }))} />
          <FormSelect label="Barangay" value={formData.barangay} onChange={(v) => setFormData({ ...formData, barangay: v })} options={BARANGAYS.map((item) => ({ value: item, label: item }))} />
          <FormInput label="Municipality" value={formData.municipality} onChange={(v) => setFormData({ ...formData, municipality: v })} />
          <FormInput label="Zip Code" value={formData.zipCode} onChange={(v) => setFormData({ ...formData, zipCode: v })} />
          <FormInput label="Address" value={formData.address} onChange={() => {}} />
          <div className="consumer-modal-section-title">Service Details</div>
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
        title="Delete Concessionaire"
        size="small"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConsumerToDelete(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleDeleteConcessionaire}><i className="fas fa-trash"></i> Confirm Delete</button>
          </>
        }
      >
        {consumerToDelete && (
          <p style={{ margin: 0, color: '#475569', fontWeight: 600 }}>
            Delete Concessionaire <strong>{consumerToDelete.First_Name} {consumerToDelete.Last_Name}</strong>? This action cannot be undone.
          </p>
        )}
      </Modal>
    </div>
  );
};

export default ConcessionairesTab;



