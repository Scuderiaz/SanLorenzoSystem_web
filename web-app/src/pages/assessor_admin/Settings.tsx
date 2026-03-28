import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import FormInput from '../../components/Common/FormInput';
import FormSelect from '../../components/Common/FormSelect';
import DataTable from '../../components/Common/DataTable';
import { useToast } from '../../components/Common/ToastContainer';
import './Settings.css';

interface WaterRate {
  id: number;
  range: string;
  rate: number;
  effectiveDate: string;
  status: string;
}

const Settings: React.FC = () => {
  const { showToast } = useToast();
  const [waterRates, setWaterRates] = useState({
    minimumRate: '160.00',
    rate11to20: '16.00',
    rate21to30: '18.00',
    rate31to40: '20.00',
    rate41Plus: '22.00',
  });

  const [systemSettings, setSystemSettings] = useState({
    systemName: 'San Lorenzo Ruiz Water Billing System',
    currency: 'PHP',
    dueDateDays: '30',
    lateFee: '5.0',
  });

  const [currentRates, setCurrentRates] = useState<WaterRate[]>([]);
  const [loading, setLoading] = useState(false);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  const loadCurrentRates = useCallback(async () => {
    setLoading(true);
    try {
      const mockRates: WaterRate[] = [
        { id: 1, range: '0-10 cu.m', rate: 160.0, effectiveDate: '2024-01-01', status: 'Active' },
        { id: 2, range: '11-20 cu.m', rate: 16.0, effectiveDate: '2024-01-01', status: 'Active' },
        { id: 3, range: '21-30 cu.m', rate: 18.0, effectiveDate: '2024-01-01', status: 'Active' },
        { id: 4, range: '31-40 cu.m', rate: 20.0, effectiveDate: '2024-01-01', status: 'Active' },
        { id: 5, range: '41+ cu.m', rate: 22.0, effectiveDate: '2024-01-01', status: 'Active' },
      ];
      setCurrentRates(mockRates);
    } catch (error) {
      console.error('Error loading rates:', error);
      showToast('Failed to load water rates', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadCurrentRates();
  }, [loadCurrentRates]);

  const handleSaveWaterRates = async () => {
    try {
      showToast('Water rates saved successfully', 'success');
    } catch (error) {
      console.error('Error saving water rates:', error);
      showToast('Failed to save water rates', 'error');
    }
  };

  const handleSaveSystemSettings = async () => {
    try {
      showToast('System settings saved successfully', 'success');
    } catch (error) {
      console.error('Error saving system settings:', error);
      showToast('Failed to save system settings', 'error');
    }
  };

  const handleRefreshRates = () => {
    loadCurrentRates();
    showToast('Water rates refreshed', 'success');
  };

  return (
    <MainLayout title="System Configuration">
      <div className="settings-page">
        {/* Top Control Bar */}
        <div className="action-buttons">
          <button className="btn btn-primary" onClick={handleSaveWaterRates}>
            <i className="fas fa-save"></i> Commit Water Rates
          </button>
          <button className="btn btn-primary" onClick={handleSaveSystemSettings}>
            <i className="fas fa-server"></i> Update Global Config
          </button>
          <button className="btn btn-secondary" onClick={handleRefreshRates} title="Reload Data">
            <i className="fas fa-sync-alt"></i> Refresh
          </button>
        </div>

        <div className="settings-grid">
          {/* Water Rates Section */}
          <div className="settings-card">
            <div className="settings-card-header">
              <i className="fas fa-tint"></i>
              <h2 className="settings-card-title">Water Rate Table</h2>
            </div>
            <div className="settings-form">
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <FormInput
                  label="Minimum (0-10 cu.m)"
                  type="number"
                  value={waterRates.minimumRate}
                  onChange={(value) => setWaterRates({ ...waterRates, minimumRate: value })}
                  icon="fa-money-bill-wave"
                />
                <FormInput
                  label="11-20 cu.m Tier"
                  type="number"
                  value={waterRates.rate11to20}
                  onChange={(value) => setWaterRates({ ...waterRates, rate11to20: value })}
                />
                <FormInput
                  label="21-30 cu.m Tier"
                  type="number"
                  value={waterRates.rate21to30}
                  onChange={(value) => setWaterRates({ ...waterRates, rate21to30: value })}
                />
                <FormInput
                  label="31-40 cu.m Tier"
                  type="number"
                  value={waterRates.rate31to40}
                  onChange={(value) => setWaterRates({ ...waterRates, rate31to40: value })}
                />
                <FormInput
                  label="41+ cu.m Tier"
                  type="number"
                  value={waterRates.rate41Plus}
                  onChange={(value) => setWaterRates({ ...waterRates, rate41Plus: value })}
                />
              </div>
            </div>
          </div>

          {/* Billing Options Sections */}
          <div className="settings-card">
            <div className="settings-card-header">
              <i className="fas fa-cog"></i>
              <h2 className="settings-card-title">Billing & System Logic</h2>
            </div>
            <div className="settings-form">
              <FormInput
                label="Organization Identification"
                value={systemSettings.systemName}
                onChange={(value) => setSystemSettings({ ...systemSettings, systemName: value })}
                icon="fa-university"
              />
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <FormSelect
                  label="Currency Unit"
                  value={systemSettings.currency}
                  onChange={(value) => setSystemSettings({ ...systemSettings, currency: value })}
                  options={[
                    { value: 'PHP', label: 'PHP (₱)' },
                    { value: 'USD', label: 'USD ($)' },
                  ]}
                  icon="fa-coins"
                />
                <FormInput
                  label="Due Date Offset"
                  type="number"
                  value={systemSettings.dueDateDays}
                  onChange={(value) => setSystemSettings({ ...systemSettings, dueDateDays: value })}
                />
              </div>
              <FormInput
                label="Late Fee Percentage (%)"
                type="number"
                value={systemSettings.lateFee}
                onChange={(value) => setSystemSettings({ ...systemSettings, lateFee: value })}
                icon="fa-percent"
              />
            </div>
          </div>
        </div>

        {/* Current Rates Table Card */}
        <div className="card" style={{ marginTop: '30px' }}>
          <div className="card-header">
            <h2 className="card-title">Active Operational Rates</h2>
          </div>
          <div className="card-body">
            <DataTable
              columns={[
                { key: 'range', label: 'Consumption Range' },
                { key: 'rate', label: 'Unit Rate (₱)', render: (v: number) => `₱${(v || 0).toFixed(2)}` },
                { key: 'effectiveDate', label: 'Effective Since' },
                { key: 'status', label: 'Status', render: (v: string) => <span className="status-badge active">{v}</span> }
              ]}
              data={currentRates}
              loading={loading}
              emptyMessage="No historical rates found."
            />
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Settings;
