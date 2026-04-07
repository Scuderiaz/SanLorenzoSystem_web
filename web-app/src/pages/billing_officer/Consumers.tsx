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
  Middle_Name?: string;
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
      render: (_: any, consumer: Consumer) => `${consumer.First_Name || ''} ${consumer.Middle_Name ? consumer.Middle_Name.charAt(0) + '.' : ''} ${consumer.Last_Name || ''}`,
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
      render: (val: string) => (
        <span className={`status-badge status-${(val || 'unknown').toLowerCase()}`}>
          {val}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_: any, consumer: Consumer) => (
        <button className="btn btn-sm btn-info" onClick={() => handleViewDetails(consumer)}>
          <i className="fas fa-eye"></i> View
        </button>
      ),
    },
  ];

  return (
    <MainLayout title="Consumer Registry Cache">
      <div className="billing-consumers-page">
        {/* Advanced Search & Multi-Filter */}
        <div className="search-filters">
          <div className="search-group">
            <input
              type="text"
              placeholder="Search by name, account ID, or meter serial..."
              className="form-control"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button className="btn btn-primary" style={{ borderRadius: '12px' }}>
              <i className="fas fa-search"></i> Find Consumer
            </button>
          </div>
          <div className="filter-group">
            <FormSelect
              label=""
              value={zoneFilter}
              onChange={setZoneFilter}
              options={zoneOptions}
              placeholder="All Map Zones"
            />
            <select
              className="form-control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status Levels</option>
              <option value="Active">Active Account</option>
              <option value="Inactive">Inactive Account</option>
              <option value="Suspended">Suspended/Delinquent</option>
            </select>
            <button className="btn btn-secondary" style={{ padding: '10px 16px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #f1f5f9', fontWeight: '700', color: '#1B1B63' }} onClick={loadConsumers}>
                <i className="fas fa-sync-alt"></i>
            </button>
          </div>
        </div>

        {/* Dynamic Consumer List */}
        <div className="consumers-card">
          <div className="card-header">
            <h2 className="card-title">Detailed Consumer Records</h2>
            <span className="badge">{filteredConsumers.length} ACTIVE RECORDS</span>
          </div>
          <div className="card-body">
            <div style={{ padding: '24px' }}>
                <DataTable columns={columns} data={filteredConsumers} loading={loading} />
            </div>
          </div>
        </div>

        {showDetailsModal && selectedConsumer && (
          <Modal
            isOpen={showDetailsModal}
            title="Consumer Details"
            onClose={() => setShowDetailsModal(false)}
            size="large"
          >
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
          </Modal>
        )}
      </div>
    </MainLayout>
  );
};

export default Consumers;
