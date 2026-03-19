import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import FormInput from '../../components/Common/FormInput';
import FormSelect from '../../components/Common/FormSelect';
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
    <MainLayout title="System Settings">
      <div className="settings-page">
        <div className="action-buttons">
          <button className="btn btn-primary" onClick={handleSaveWaterRates}>
            <i className="fas fa-save"></i> Save Water Rates
          </button>
          <button className="btn btn-primary" onClick={handleSaveSystemSettings}>
            <i className="fas fa-cogs"></i> Save System Settings
          </button>
          <button className="btn btn-secondary" onClick={handleRefreshRates}>
            <i className="fas fa-sync-alt"></i> Refresh Rates
          </button>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <i className="fas fa-tint"></i> Water Rates Configuration
            </h2>
          </div>
          <div className="card-body">
            <div className="form-grid">
              <FormInput
                label="Minimum Rate (0-10 cu.m)"
                type="number"
                value={waterRates.minimumRate}
                onChange={(value) => setWaterRates({ ...waterRates, minimumRate: value })}
                placeholder="160.00"
                icon="fa-tint"
              />
              <FormInput
                label="Rate 11-20 cu.m"
                type="number"
                value={waterRates.rate11to20}
                onChange={(value) => setWaterRates({ ...waterRates, rate11to20: value })}
                placeholder="16.00"
                icon="fa-tint"
              />
              <FormInput
                label="Rate 21-30 cu.m"
                type="number"
                value={waterRates.rate21to30}
                onChange={(value) => setWaterRates({ ...waterRates, rate21to30: value })}
                placeholder="18.00"
                icon="fa-tint"
              />
              <FormInput
                label="Rate 31-40 cu.m"
                type="number"
                value={waterRates.rate31to40}
                onChange={(value) => setWaterRates({ ...waterRates, rate31to40: value })}
                placeholder="20.00"
                icon="fa-tint"
              />
              <FormInput
                label="Rate 41+ cu.m"
                type="number"
                value={waterRates.rate41Plus}
                onChange={(value) => setWaterRates({ ...waterRates, rate41Plus: value })}
                placeholder="22.00"
                icon="fa-tint"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <i className="fas fa-cog"></i> System Configuration
            </h2>
          </div>
          <div className="card-body">
            <div className="form-grid">
              <FormInput
                label="System Name"
                value={systemSettings.systemName}
                onChange={(value) => setSystemSettings({ ...systemSettings, systemName: value })}
                placeholder="San Lorenzo Ruiz Water Billing System"
                icon="fa-building"
              />
              <FormSelect
                label="Currency"
                value={systemSettings.currency}
                onChange={(value) => setSystemSettings({ ...systemSettings, currency: value })}
                options={[
                  { value: 'PHP', label: 'PHP (₱)' },
                  { value: 'USD', label: 'USD ($)' },
                ]}
                icon="fa-dollar-sign"
              />
              <FormInput
                label="Due Date Days"
                type="number"
                value={systemSettings.dueDateDays}
                onChange={(value) => setSystemSettings({ ...systemSettings, dueDateDays: value })}
                placeholder="30"
                icon="fa-calendar"
              />
              <FormInput
                label="Late Fee Percentage"
                type="number"
                value={systemSettings.lateFee}
                onChange={(value) => setSystemSettings({ ...systemSettings, lateFee: value })}
                placeholder="5.0"
                icon="fa-percent"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Current Water Rates</h2>
          </div>
          <div className="card-body">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Consumption Range</th>
                  <th>Rate (₱)</th>
                  <th>Effective Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '20px' }}>
                      <i className="fas fa-spinner fa-spin"></i> Loading water rates...
                    </td>
                  </tr>
                ) : currentRates.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '20px' }}>
                      No water rates configured
                    </td>
                  </tr>
                ) : (
                  currentRates.map((rate) => (
                    <tr key={rate.id}>
                      <td>{rate.range}</td>
                      <td>₱{(rate.rate || 0).toFixed(2)}</td>
                      <td>{rate.effectiveDate}</td>
                      <td>
                        <span className="status-badge status-active">{rate.status}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Settings;
