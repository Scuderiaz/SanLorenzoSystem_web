import React, { useState, useEffect } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import Modal from '../../components/Common/Modal';
import FormSelect from '../../components/Common/FormSelect';
import { useToast } from '../../components/Common/ToastContainer';
import './Consumers.css';

interface Consumer {
  Consumer_ID: number;
  Account_Number: string;
  First_Name: string;
  Last_Name: string;
  Address: string;
  Zone_ID: number;
  Zone_Name?: string;
  Classification_ID: number;
  Classification_Name?: string;
  Status: string;
  Contact_Number?: string;
  Meter_Number?: string;
  Connection_Date?: string;
}

const Consumers: React.FC = () => {
  const { showToast } = useToast();
  const [consumers, setConsumers] = useState<Consumer[]>([]);
  const [filteredConsumers, setFilteredConsumers] = useState<Consumer[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedConsumer, setSelectedConsumer] = useState<Consumer | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  useEffect(() => {
    loadConsumers();
    loadZones();
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

  const filterConsumers = () => {
    let filtered = consumers;

    if (searchTerm) {
      filtered = filtered.filter(
        (c) =>
          c.First_Name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.Last_Name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.Account_Number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.Address?.toLowerCase().includes(searchTerm.toLowerCase())
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
    setShowDetailsModal(true);
  };

  const zoneOptions = zones.map((z) => ({ value: z.Zone_ID, label: z.Zone_Name }));

  const columns = [
    {
      key: 'Account_Number',
      label: 'Account Number',
      sortable: true,
    },
    {
      key: 'consumerName',
      label: 'Consumer Name',
      sortable: true,
      render: (consumer: Consumer) => `${consumer.First_Name} ${consumer.Last_Name}`,
    },
    {
      key: 'Address',
      label: 'Address',
      sortable: true,
    },
    {
      key: 'Zone_Name',
      label: 'Zone',
      sortable: true,
    },
    {
      key: 'Classification_Name',
      label: 'Classification',
      sortable: true,
    },
    {
      key: 'Status',
      label: 'Status',
      sortable: true,
      render: (consumer: Consumer) => (
        <span className={`status-badge status-${(consumer.Status || 'unknown').toLowerCase()}`}>
          {consumer.Status}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (consumer: Consumer) => (
        <button className="btn btn-sm btn-info" onClick={() => handleViewDetails(consumer)}>
          <i className="fas fa-eye"></i> View
        </button>
      ),
    },
  ];

  return (
    <MainLayout title="Consumer Management">
      <div className="billing-consumers-page">
        <div className="card">
          <div className="card-body">
            <div className="search-filters">
              <div className="search-group">
                <input
                  type="text"
                  placeholder="Search by name, account number, or address..."
                  className="form-control"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <button className="btn btn-primary">
                  <i className="fas fa-search"></i> Search
                </button>
              </div>
              <div className="filter-group">
                <FormSelect
                  label=""
                  value={zoneFilter}
                  onChange={setZoneFilter}
                  options={zoneOptions}
                  placeholder="All Zones"
                />
                <select
                  className="form-control"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All Status</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Suspended">Suspended</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Consumer List</h2>
            <span className="badge">{filteredConsumers.length} consumers</span>
          </div>
          <div className="card-body">
            <DataTable columns={columns} data={filteredConsumers} loading={loading} />
          </div>
        </div>

        {showDetailsModal && selectedConsumer && (
          <Modal
            isOpen={showDetailsModal}
            title="Consumer Details"
            onClose={() => setShowDetailsModal(false)}
            size="large"
          >
            <div className="details-grid">
              <div className="detail-section">
                <h3>
                  <i className="fas fa-user"></i> Personal Information
                </h3>
                <div className="detail-row">
                  <span className="detail-label">Account Number:</span>
                  <span className="detail-value">{selectedConsumer.Account_Number}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Name:</span>
                  <span className="detail-value">
                    {selectedConsumer.First_Name} {selectedConsumer.Last_Name}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Contact Number:</span>
                  <span className="detail-value">{selectedConsumer.Contact_Number || 'N/A'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Address:</span>
                  <span className="detail-value">{selectedConsumer.Address}</span>
                </div>
              </div>

              <div className="detail-section">
                <h3>
                  <i className="fas fa-info-circle"></i> Service Information
                </h3>
                <div className="detail-row">
                  <span className="detail-label">Zone:</span>
                  <span className="detail-value">{selectedConsumer.Zone_Name}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Classification:</span>
                  <span className="detail-value">{selectedConsumer.Classification_Name}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Meter Number:</span>
                  <span className="detail-value">{selectedConsumer.Meter_Number || 'N/A'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Connection Date:</span>
                  <span className="detail-value">{selectedConsumer.Connection_Date || 'N/A'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Status:</span>
                  <span className="detail-value">
                    <span className={`status-badge status-${(selectedConsumer.Status || 'unknown').toLowerCase()}`}>
                      {selectedConsumer.Status}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </MainLayout>
  );
};

export default Consumers;
