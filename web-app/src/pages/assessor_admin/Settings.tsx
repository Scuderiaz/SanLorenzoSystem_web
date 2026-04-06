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

  const loadSavedSettings = useCallback(() => {
    const savedRates = localStorage.getItem('water_rates');
    const savedSystem = localStorage.getItem('system_settings');
    
    if (savedRates) {
      setWaterRates(JSON.parse(savedRates));
    }
    if (savedSystem) {
      setSystemSettings(JSON.parse(savedSystem));
    }
  }, []);

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
    loadSavedSettings();
    loadCurrentRates();
  }, [loadSavedSettings, loadCurrentRates]);

  const handleSaveWaterRates = async () => {
    try {
      localStorage.setItem('water_rates', JSON.stringify(waterRates));
      showToast('Water rates committed successfully', 'success');
      loadCurrentRates(); // Keep consistency
    } catch (error) {
      console.error('Error saving water rates:', error);
      showToast('Failed to save water rates', 'error');
    }
  };

  const handleSaveSystemSettings = async () => {
    try {
      localStorage.setItem('system_settings', JSON.stringify(systemSettings));
      showToast('System configuration updated', 'success');
    } catch (error) {
      console.error('Error saving system settings:', error);
      showToast('Failed to update configuration', 'error');
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
          {/* Combined System Configuration Card */}
          <div className="settings-card combined-config" style={{ borderRadius: '24px', border: '1px solid #e2e8f0' }}>
            <div className="settings-card-header" style={{ borderBottom: 'none', marginBottom: '0' }}>
              <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '12px', marginRight: '15px' }}>
                <i className="fas fa-tools" style={{ fontSize: '24px', color: '#1B1B63', background: 'none', padding: '0' }}></i>
              </div>
              <h2 className="settings-card-title" style={{ fontSize: '20px', fontWeight: 800 }}>System & Rate Configuration</h2>
            </div>
            
            <div className="settings-form" style={{ marginTop: '30px' }}>
              <div className="settings-subsection">
                <h3 className="subsection-title" style={{ color: '#1B1B63', fontWeight: 900, marginBottom: '25px', letterSpacing: '0.05em' }}>WATER RATE TABLE</h3>
                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                  <FormInput
                    label="MINIMUM (0-10 CU.M)"
                    type="number"
                    value={waterRates.minimumRate}
                    onChange={(value) => setWaterRates({ ...waterRates, minimumRate: value })}
                    icon="fa-money-bill-wave"
                  />
                  <FormInput
                    label="11-20 CU.M TIER"
                    type="number"
                    value={waterRates.rate11to20}
                    onChange={(value) => setWaterRates({ ...waterRates, rate11to20: value })}
                  />
                  <FormInput
                    label="21-30 CU.M TIER"
                    type="number"
                    value={waterRates.rate21to30}
                    onChange={(value) => setWaterRates({ ...waterRates, rate21to30: value })}
                  />
                  <FormInput
                    label="31-40 CU.M TIER"
                    type="number"
                    value={waterRates.rate31to40}
                    onChange={(value) => setWaterRates({ ...waterRates, rate31to40: value })}
                  />
                  <FormInput
                    label="41+ CU.M TIER"
                    type="number"
                    value={waterRates.rate41Plus}
                    onChange={(value) => setWaterRates({ ...waterRates, rate41Plus: value })}
                  />
                </div>
              </div>

              <div style={{ height: '1px', background: '#f1f5f9', margin: '40px 0' }}></div>

              <div className="settings-subsection">
                <h3 className="subsection-title" style={{ color: '#1B1B63', fontWeight: 900, marginBottom: '25px', letterSpacing: '0.05em' }}>BILLING & SYSTEM LOGIC</h3>
                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '30px' }}>
                  <FormInput
                    label="DUE DATE OFFSET (DAYS)"
                    type="number"
                    value={systemSettings.dueDateDays}
                    onChange={(value) => setSystemSettings({ ...systemSettings, dueDateDays: value })}
                    icon="fa-calendar-day"
                  />
                  <FormInput
                    label="LATE FEE PERCENTAGE (%)"
                    type="number"
                    value={systemSettings.lateFee}
                    onChange={(value) => setSystemSettings({ ...systemSettings, lateFee: value })}
                    icon="fa-percent"
                  />
                </div>
              </div>
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
