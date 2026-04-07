import React, { useState, useEffect } from 'react';
import DataTable, { Column } from '../../../components/Common/DataTable';
import Modal from '../../../components/Common/Modal';
import FormInput from '../../../components/Common/FormInput';
import FormSelect from '../../../components/Common/FormSelect';
import { useToast } from '../../../components/Common/ToastContainer';
import '../Consumers.css';

interface Concessionaire {
  Consumer_ID: number;
  First_Name: string;
  Middle_Name?: string;
  Last_Name: string;
  Address: string;
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

const ConcessionairesTab: React.FC = () => {
  const { showToast } = useToast();
  const [concessionaires, setConcessionaires] = useState<Concessionaire[]>([]);
  const [filteredConcessionaires, setFilteredConcessionaires] = useState<Concessionaire[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedConcessionaire, setSelectedConcessionaire] = useState<Concessionaire | null>(null);
  const [editingConcessionaire, setEditingConcessionaire] = useState<Concessionaire | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    firstName: '',
    middleName: '',
    lastName: '',
    address: '',
    zoneId: '',
    classificationId: '',
    accountNumber: '',
    meterNumber: '',
    meterStatus: 'Active',
    contactNumber: '',
    connectionDate: '',
    status: 'Active',
  });

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  useEffect(() => {
    loadConcessionaires();
    loadZones();
    loadClassifications();
  }, []);

  useEffect(() => {
    filterConcessionaires();
  }, [concessionaires, searchTerm, zoneFilter, statusFilter]);

  const loadConcessionaires = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/consumers`);
      const data = await response.json();
      setConcessionaires(data);
    } catch (error) {
      console.error('Error loading concessionaires:', error);
      showToast('Failed to load concessionaires', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadZones = async () => {
    try {
      const response = await fetch(`${API_URL}/zones`);
      const result = await response.json();
      if (result.success) {
        setZones((result.data || []).map((zone: any) => ({
          Zone_ID: zone.Zone_ID ?? zone.zone_id,
          Zone_Name: zone.Zone_Name ?? zone.zone_name,
        })));
      }
    } catch (error) {
      console.error('Error loading zones:', error);
    }
  };

  const loadClassifications = async () => {
    try {
      const response = await fetch(`${API_URL}/classifications`);
      const result = await response.json();
      if (result.success) {
        setClassifications(result.data);
      }
    } catch (error) {
      console.error('Error loading classifications:', error);
    }
  };

  const filterConcessionaires = () => {
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

    if (zoneFilter) {
      filtered = filtered.filter((c) => c.Zone_ID === parseInt(zoneFilter));
    }

    if (statusFilter) {
      filtered = filtered.filter((c) => c.Status === statusFilter);
    }

    setFilteredConcessionaires(filtered);
  };

  const handleViewDetails = (concessionaire: Concessionaire) => {
    setSelectedConcessionaire(concessionaire);
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
      zoneId: '',
      classificationId: '',
      accountNumber: '',
      meterNumber: '',
      meterStatus: 'Active',
      contactNumber: '',
      connectionDate: new Date().toISOString().split('T')[0],
      status: 'Active',
    });
    setIsFormModalOpen(true);
  };

  const handleEditConcessionaire = (concessionaire: Concessionaire) => {
    setEditingConcessionaire(concessionaire);
    setFormData({
      firstName: concessionaire.First_Name,
      username: '',
      password: '',
      middleName: concessionaire.Middle_Name || '',
      lastName: concessionaire.Last_Name,
      address: concessionaire.Address,
      zoneId: concessionaire.Zone_ID.toString(),
      classificationId: concessionaire.Classification_ID.toString(),
      accountNumber: concessionaire.Account_Number,
      meterNumber: concessionaire.Meter_Number,
      meterStatus: concessionaire.Meter_Status || 'Active',
      contactNumber: concessionaire.Contact_Number,
      connectionDate: concessionaire.Connection_Date,
      status: concessionaire.Status,
    });
    setIsFormModalOpen(true);
    setIsDetailsModalOpen(false);
  };

  const handleDeleteConcessionaire = async (concessionaire: Concessionaire) => {
    if (!window.confirm(`Are you sure you want to delete concessionaire "${concessionaire.First_Name} ${concessionaire.Last_Name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/consumers/${concessionaire.Consumer_ID}`, {
        method: 'DELETE',
      });
      const result = await response.json();

      if (result.success) {
        showToast('Concessionaire deleted successfully', 'success');
        loadConcessionaires();
        setIsDetailsModalOpen(false);
      } else {
        showToast(result.message || 'Failed to delete concessionaire', 'error');
      }
    } catch (error) {
      console.error('Error deleting concessionaire:', error);
      showToast('Failed to delete concessionaire', 'error');
    }
  };

  const handleSaveConcessionaire = async () => {
    if (!formData.firstName || !formData.lastName || !formData.accountNumber || !formData.zoneId || !formData.classificationId) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    if (!editingConcessionaire && (!formData.username || !formData.password)) {
      showToast('Username and password are required for new concessionaires.', 'error');
      return;
    }

    try {
      const url = editingConcessionaire
        ? `${API_URL}/consumers/${editingConcessionaire.Consumer_ID}`
        : `${API_URL}/consumers`;

      const method = editingConcessionaire ? 'PUT' : 'POST';

      const body = {
        Username: formData.username,
        Password: formData.password,
        First_Name: formData.firstName,
        Middle_Name: formData.middleName,
        Last_Name: formData.lastName,
        Address: formData.address,
        Zone_ID: parseInt(formData.zoneId),
        Classification_ID: parseInt(formData.classificationId),
        Account_Number: formData.accountNumber,
        Meter_Number: formData.meterNumber,
        Meter_Status: formData.meterStatus,
        Contact_Number: formData.contactNumber,
        Connection_Date: formData.connectionDate,
        Status: formData.status,
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (result.success || response.ok) {
        showToast(
          editingConcessionaire ? 'Concessionaire updated successfully' : 'Concessionaire created successfully',
          'success'
        );
        setIsFormModalOpen(false);
        loadConcessionaires();
      } else {
        showToast(result.message || 'Failed to save concessionaire', 'error');
      }
    } catch (error) {
      console.error('Error saving concessionaire:', error);
      showToast('Failed to save concessionaire', 'error');
    }
  };

  const columns: Column[] = [
    { key: 'Account_Number', label: 'Account #', sortable: true },
    {
      key: 'name',
      label: 'Concessionaire Name',
      sortable: true,
      render: (_, row: Concessionaire) => `${row.First_Name} ${row.Middle_Name ? row.Middle_Name.charAt(0) + '.' : ''} ${row.Last_Name}`,
    },
    { key: 'Address', label: 'Address', sortable: true },
    {
      key: 'Zone_Name',
      label: 'Zone',
      sortable: true,
      render: (_: string, row: Concessionaire) => `Zone ${row.Zone_ID}`,
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
      render: (_, row: Concessionaire) => (
        <div className="action-buttons-inline">
          <button className="btn-icon" title="View Details" onClick={() => handleViewDetails(row)}>
            <i className="fas fa-eye"></i>
          </button>
          <button className="btn-icon" title="Edit" onClick={() => handleEditConcessionaire(row)}>
            <i className="fas fa-edit"></i>
          </button>
          <button className="btn-icon btn-danger" title="Delete" onClick={() => handleDeleteConcessionaire(row)}>
            <i className="fas fa-trash"></i>
          </button>
        </div>
      ),
    },
  ];

  const zoneOptions = zones.map((z) => ({ value: z.Zone_ID, label: `Zone ${z.Zone_ID}` }));
  const classificationOptions = classifications.map((c) => ({
    value: c.Classification_ID,
    label: c.Classification_Name,
  }));

  return (
    <div className="concessionaires-tab">
      {/* Search & Actions Bar */}
      <div className="filter-bar" style={{ marginBottom: '20px' }}>
        <div className="search-box">
          <i className="fas fa-search"></i>
          <input 
            type="text" 
            placeholder="Search by name, account number..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filters">
          <FormSelect
            label=""
            value={zoneFilter}
            onChange={setZoneFilter}
            options={zoneOptions}
            placeholder="All Map Zones"
          />
          <FormSelect
            label=""
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'Active', label: 'Active Account' },
              { value: 'Inactive', label: 'Inactive Account' },
            ]}
            placeholder="All Account Statuses"
          />
        </div>
        <div className="main-actions">
          <button className="btn btn-primary" onClick={handleAddConcessionaire}>
            <i className="fas fa-plus"></i> New Concessionaire
          </button>
          <button className="btn btn-secondary" onClick={loadConcessionaires} title="Refresh Records">
            <i className="fas fa-sync-alt"></i>
          </button>
        </div>
      </div>

      <div className="consumers-card">
        <DataTable
          columns={columns}
          data={filteredConcessionaires}
          loading={loading}
          emptyMessage="No concessionaires found matching your search criteria."
        />
      </div>

      {/* Details Modal */}
      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        title="Concessionaire Information"
        size="large"
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
          <div className="details-container" style={{ padding: '20px' }}>
            <div className="details-columns" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
              {/* Personal Data Column */}
              <div className="detail-col">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '18px', color: '#1B1B63', marginBottom: '25px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                  <i className="fas fa-user-circle"></i> Personal Data
                </h3>
                <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                  <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Account No:</span>
                  <span className="view-value" style={{ fontWeight: 600, color: '#333' }}>{selectedConcessionaire.Account_Number}</span>
                </div>
                <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                  <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Name:</span>
                  <span className="view-value" style={{ fontWeight: 800, color: '#1B1B63', fontSize: '1.1em' }}>
                    {selectedConcessionaire.First_Name} {selectedConcessionaire.Middle_Name ? selectedConcessionaire.Middle_Name + ' ' : ''}{selectedConcessionaire.Last_Name}
                  </span>
                </div>
                <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                  <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Address:</span>
                  <span className="view-value" style={{ fontWeight: 600, color: '#333', textAlign: 'right', maxWidth: '60%' }}>{selectedConcessionaire.Address}</span>
                </div>
              </div>

              {/* Account Info Column */}
              <div className="detail-col">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '18px', color: '#1B1B63', marginBottom: '25px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                  <i className="fas fa-id-card"></i> Account Info
                </h3>
                <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                  <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Map Zone:</span>
                  <span className="view-value" style={{ fontWeight: 700, color: '#333' }}>{`Zone ${selectedConcessionaire.Zone_ID}`}</span>
                </div>
                <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                  <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Classification:</span>
                  <span className="view-value" style={{ fontWeight: 700, color: '#333' }}>{selectedConcessionaire.Classification_Name}</span>
                </div>
                <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                  <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Meter Status:</span>
                  <span className={`status-badge status-${(selectedConcessionaire.Meter_Status || 'active').toLowerCase()}`} style={{ fontSize: '0.85em', padding: '4px 12px' }}>
                    {selectedConcessionaire.Meter_Status || 'Active'}
                  </span>
                </div>
                <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                  <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Status:</span>
                  <span className={`status-badge status-${(selectedConcessionaire.Status || 'active').toLowerCase()}`} style={{ fontSize: '0.85em', padding: '4px 12px' }}>
                    {selectedConcessionaire.Status}
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
        title={editingConcessionaire ? 'Update Concessionaire' : 'Add New Concessionaire'}
        size="large"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsFormModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveConcessionaire}><i className="fas fa-save"></i> Save Changes</button>
          </>
        }
      >
        <div className="form-grid">
          {!editingConcessionaire && (
            <>
              <FormInput label="Username" value={formData.username} onChange={(v) => setFormData({ ...formData, username: v })} required />
              <FormInput label="Password" type="password" value={formData.password} onChange={(v) => setFormData({ ...formData, password: v })} required />
            </>
          )}
          <FormInput label="First Name" value={formData.firstName} onChange={(v) => setFormData({ ...formData, firstName: v })} required />
          <FormInput label="Middle Name" value={formData.middleName} onChange={(v) => setFormData({ ...formData, middleName: v })} />
          <FormInput label="Last Name" value={formData.lastName} onChange={(v) => setFormData({ ...formData, lastName: v })} required />
          <FormInput label="Account Number" value={formData.accountNumber} onChange={(v) => setFormData({ ...formData, accountNumber: v })} required />
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
          <FormInput label="Address" value={formData.address} onChange={(v) => setFormData({ ...formData, address: v })} />
          <FormInput label="Contact #" value={formData.contactNumber} onChange={(v) => setFormData({ ...formData, contactNumber: v })} />
          <FormSelect label="Zone" value={formData.zoneId} onChange={(v) => setFormData({ ...formData, zoneId: v })} options={zoneOptions} required />
          <FormSelect label="Type" value={formData.classificationId} onChange={(v) => setFormData({ ...formData, classificationId: v })} options={classificationOptions} required />
          <FormSelect
            label="Account Status"
            value={formData.status}
            onChange={(v) => setFormData({ ...formData, status: v })}
            options={[
              { value: 'Active', label: 'Active' },
              { value: 'Inactive', label: 'Inactive' },
            ]}
          />
          <FormInput label="Date Joined" type="date" value={formData.connectionDate} onChange={(v) => setFormData({ ...formData, connectionDate: v })} />
        </div>
      </Modal>
    </div>
  );
};

export default ConcessionairesTab;
