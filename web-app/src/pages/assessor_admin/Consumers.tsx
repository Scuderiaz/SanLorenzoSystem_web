import React, { useState, useEffect } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable, { Column } from '../../components/Common/DataTable';
import Modal from '../../components/Common/Modal';
import FormInput from '../../components/Common/FormInput';
import FormSelect from '../../components/Common/FormSelect';
import { useToast } from '../../components/Common/ToastContainer';
import './Consumers.css';

interface Consumer {
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

  const [searchTerm, setSearchTerm] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [formData, setFormData] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    address: '',
    zoneId: '',
    classificationId: '',
    accountNumber: '',
    meterNumber: '',
    contactNumber: '',
    connectionDate: '',
    status: 'Active',
  });

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  useEffect(() => {
    loadConsumers();
    loadZones();
    loadClassifications();
  }, []);

  useEffect(() => {
    filterConsumers();
  }, [consumers, searchTerm, zoneFilter, statusFilter]);

  const loadConsumers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/consumers`);
      const data = await response.json();
      setConsumers(data);
    } catch (error) {
      console.error('Error loading consumers:', error);
      showToast('Failed to load consumers', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadZones = async () => {
    try {
      const response = await fetch(`${API_URL}/zones`);
      const result = await response.json();
      if (result.success) {
        setZones(result.data);
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

  const filterConsumers = () => {
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

    if (statusFilter) {
      filtered = filtered.filter((c) => c.Status === statusFilter);
    }

    setFilteredConsumers(filtered);
  };

  const handleViewDetails = (consumer: Consumer) => {
    setSelectedConsumer(consumer);
    setIsDetailsModalOpen(true);
  };

  const handleAddConsumer = () => {
    setEditingConsumer(null);
    setFormData({
      firstName: '',
      middleName: '',
      lastName: '',
      address: '',
      zoneId: '',
      classificationId: '',
      accountNumber: '',
      meterNumber: '',
      contactNumber: '',
      connectionDate: new Date().toISOString().split('T')[0],
      status: 'Active',
    });
    setIsFormModalOpen(true);
  };

  const handleEditConsumer = (consumer: Consumer) => {
    setEditingConsumer(consumer);
    setFormData({
      firstName: consumer.First_Name,
      middleName: consumer.Middle_Name || '',
      lastName: consumer.Last_Name,
      address: consumer.Address,
      zoneId: consumer.Zone_ID.toString(),
      classificationId: consumer.Classification_ID.toString(),
      accountNumber: consumer.Account_Number,
      meterNumber: consumer.Meter_Number,
      contactNumber: consumer.Contact_Number,
      connectionDate: consumer.Connection_Date,
      status: consumer.Status,
    });
    setIsFormModalOpen(true);
    setIsDetailsModalOpen(false);
  };

  const handleDeleteConsumer = async (consumer: Consumer) => {
    if (!window.confirm(`Are you sure you want to delete consumer "${consumer.First_Name} ${consumer.Last_Name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/consumers/${consumer.Consumer_ID}`, {
        method: 'DELETE',
      });
      const result = await response.json();

      if (result.success) {
        showToast('Consumer deleted successfully', 'success');
        loadConsumers();
        setIsDetailsModalOpen(false);
      } else {
        showToast(result.message || 'Failed to delete consumer', 'error');
      }
    } catch (error) {
      console.error('Error deleting consumer:', error);
      showToast('Failed to delete consumer', 'error');
    }
  };

  const handleSaveConsumer = async () => {
    if (!formData.firstName || !formData.lastName || !formData.accountNumber) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    try {
      const url = editingConsumer
        ? `${API_URL}/consumers/${editingConsumer.Consumer_ID}`
        : `${API_URL}/consumers`;

      const method = editingConsumer ? 'PUT' : 'POST';

      const body = {
        First_Name: formData.firstName,
        Middle_Name: formData.middleName,
        Last_Name: formData.lastName,
        Address: formData.address,
        Zone_ID: parseInt(formData.zoneId),
        Classification_ID: parseInt(formData.classificationId),
        Account_Number: formData.accountNumber,
        Meter_Number: formData.meterNumber,
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
          editingConsumer ? 'Consumer updated successfully' : 'Consumer created successfully',
          'success'
        );
        setIsFormModalOpen(false);
        loadConsumers();
      } else {
        showToast(result.message || 'Failed to save consumer', 'error');
      }
    } catch (error) {
      console.error('Error saving consumer:', error);
      showToast('Failed to save consumer', 'error');
    }
  };

  const columns: Column[] = [
    { key: 'Account_Number', label: 'Account Number', sortable: true },
    {
      key: 'name',
      label: 'Consumer Name',
      sortable: true,
      render: (_, row: Consumer) => `${row.First_Name} ${row.Middle_Name ? row.Middle_Name.charAt(0) + '.' : ''} ${row.Last_Name}`,
    },
    { key: 'Address', label: 'Address', sortable: true },
    { key: 'Zone_Name', label: 'Zone', sortable: true },
    { key: 'Classification_Name', label: 'Classification', sortable: true },
    {
      key: 'Status',
      label: 'Status',
      render: (value: string) => (
        <span className={`status-badge status-${(value || 'unknown').toLowerCase()}`}>{value || 'Unknown'}</span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row: Consumer) => (
        <div className="action-buttons-inline">
          <button
            className="btn-icon"
            title="View Details"
            onClick={() => handleViewDetails(row)}
          >
            <i className="fas fa-eye"></i>
          </button>
          <button
            className="btn-icon"
            title="Edit Consumer"
            onClick={() => handleEditConsumer(row)}
          >
            <i className="fas fa-edit"></i>
          </button>
          <button
            className="btn-icon btn-danger"
            title="Delete Consumer"
            onClick={() => handleDeleteConsumer(row)}
          >
            <i className="fas fa-trash"></i>
          </button>
        </div>
      ),
    },
  ];

  const zoneOptions = zones.map((z) => ({ value: z.Zone_ID, label: z.Zone_Name }));
  const classificationOptions = classifications.map((c) => ({
    value: c.Classification_ID,
    label: c.Classification_Name,
  }));

  return (
    <MainLayout title="Consumer Registry">
      <div className="consumers-page">
        {/* Top Actions */}
        <div className="action-buttons">
          <button className="btn btn-primary" onClick={handleAddConsumer}>
            <i className="fas fa-plus"></i> New Consumer
          </button>
          <button className="btn btn-secondary" onClick={() => { loadConsumers(); showToast('Consumer list refreshed', 'success'); }} title="Refresh Records">
            <i className="fas fa-sync-alt"></i> Refresh
          </button>
          <button className="btn btn-secondary">
            <i className="fas fa-download"></i> Export Records
          </button>
        </div>

        {/* Search & Filters */}
        <div className="search-controls">
          <div className="search-field">
            <i className="fas fa-search"></i>
            <input 
              type="text" 
              placeholder="Search by name, account number, or address..." 
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
                { value: 'Active', label: 'Active Status' },
                { value: 'Inactive', label: 'Inactive Status' },
                { value: 'Disconnected', label: 'Disconnected' },
              ]}
              placeholder="All Account Status"
            />
          </div>
        </div>

        <div className="consumers-card">
          <div className="card-body">
            <DataTable
              columns={columns}
              data={filteredConsumers}
              loading={loading}
              emptyMessage="No consumers found matching your search criteria."
            />
          </div>
        </div>

        {/* Consumer Details Modal */}
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
                    <i className="fas fa-user"></i> Personal Data
                  </h3>
                  <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                    <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Account No:</span>
                    <span className="view-value" style={{ fontWeight: 600, color: '#333' }}>{selectedConsumer.Account_Number}</span>
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
                    <i className="fas fa-credit-card"></i> Account Info
                  </h3>
                  <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                    <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Map Zone:</span>
                    <span className="view-value" style={{ fontWeight: 700, color: '#333' }}>{selectedConsumer.Zone_Name}</span>
                  </div>
                  <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                    <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Classification:</span>
                    <span className="view-value" style={{ fontWeight: 700, color: '#333' }}>{selectedConsumer.Classification_Name}</span>
                  </div>
                  <div className="view-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px' }}>
                    <span className="view-label" style={{ color: '#666', fontWeight: 500 }}>Status:</span>
                    <span className={`status-badge status-${(selectedConsumer.Status || 'unknown').toLowerCase()}`} style={{ fontSize: '0.85em', padding: '4px 12px' }}>
                      {selectedConsumer.Status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Modal>

        {/* Consumer Form Modal */}
        <Modal
          isOpen={isFormModalOpen}
          onClose={() => setIsFormModalOpen(false)}
          title={editingConsumer ? 'Edit Consumer' : 'Add New Consumer'}
          size="large"
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setIsFormModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveConsumer}>
                <i className="fas fa-save"></i> Save
              </button>
            </>
          }
        >
          <div className="form-grid">
            <FormInput
              label="First Name"
              value={formData.firstName}
              onChange={(value) => setFormData({ ...formData, firstName: value })}
              required
              icon="fa-user"
            />
            <FormInput
              label="Middle Name"
              value={formData.middleName}
              onChange={(value) => setFormData({ ...formData, middleName: value })}
              icon="fa-user-tag"
            />
            <FormInput
              label="Last Name"
              value={formData.lastName}
              onChange={(value) => setFormData({ ...formData, lastName: value })}
              required
              icon="fa-user"
            />
            <FormInput
              label="Account Number"
              value={formData.accountNumber}
              onChange={(value) => setFormData({ ...formData, accountNumber: value })}
              required
              icon="fa-hashtag"
            />
            <FormInput
              label="Meter Number"
              value={formData.meterNumber}
              onChange={(value) => setFormData({ ...formData, meterNumber: value })}
              icon="fa-tachometer-alt"
            />
            <FormInput
              label="Address"
              value={formData.address}
              onChange={(value) => setFormData({ ...formData, address: value })}
              icon="fa-map-marker-alt"
            />
            <FormInput
              label="Contact Number"
              value={formData.contactNumber}
              onChange={(value) => setFormData({ ...formData, contactNumber: value })}
              icon="fa-phone"
            />
            <FormSelect
              label="Zone"
              value={formData.zoneId}
              onChange={(value) => setFormData({ ...formData, zoneId: value })}
              options={zoneOptions}
              required
              icon="fa-map-marker-alt"
            />
            <FormSelect
              label="Classification"
              value={formData.classificationId}
              onChange={(value) => setFormData({ ...formData, classificationId: value })}
              options={classificationOptions}
              required
              icon="fa-tag"
            />
            <FormInput
              label="Connection Date"
              type="date"
              value={formData.connectionDate}
              onChange={(value) => setFormData({ ...formData, connectionDate: value })}
              icon="fa-calendar"
            />
            <FormSelect
              label="Status"
              value={formData.status}
              onChange={(value) => setFormData({ ...formData, status: value })}
              options={[
                { value: 'Active', label: 'Active' },
                { value: 'Inactive', label: 'Inactive' },
                { value: 'Disconnected', label: 'Disconnected' },
              ]}
              required
              icon="fa-info-circle"
            />
          </div>
        </Modal>
      </div>
    </MainLayout>
  );
};

export default Consumers;
