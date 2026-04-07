import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import FormInput from '../../components/Common/FormInput';
import FormSelect from '../../components/Common/FormSelect';
import DataTable from '../../components/Common/DataTable';
import { useToast } from '../../components/Common/ToastContainer';
import './Settings.css';

const toAmount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

interface WaterRate {
  rate_id: number;
  minimum_cubic: number;
  minimum_rate: number;
  excess_rate_per_cubic: number;
  effective_date: string;
  modified_by?: number;
  modified_date: string;
}

const Settings: React.FC = () => {
  const { showToast } = useToast();
  const [waterRates, setWaterRates] = useState({
    minimum_cubic: '10',
    minimum_rate: '75.00',
    excess_rate_per_cubic: '7.50',
  });

  const [systemSettings, setSystemSettings] = useState({
    systemName: 'San Lorenzo Ruiz Water Billing System',
    currency: 'PHP',
    dueDateDays: '15',
    lateFee: '5.0',
  });

  const [currentRates, setCurrentRates] = useState<WaterRate[]>([]);
  const [loading, setLoading] = useState(false);
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  const loadSavedSettings = useCallback(async () => {
    // 1. Load system settings from localStorage (UI only for now)
    const savedSystem = localStorage.getItem('system_settings');
    if (savedSystem) {
      setSystemSettings(JSON.parse(savedSystem));
    }

    // 2. Load water rates from API
    try {
      const response = await fetch(`${API_URL}/water-rates/latest`);
      const result = await response.json();
      if (result.success && result.data) {
        setWaterRates({
          minimum_cubic: result.data.minimum_cubic.toString(),
          minimum_rate: result.data.minimum_rate.toString(),
          excess_rate_per_cubic: result.data.excess_rate_per_cubic.toString(),
        });
        // Also save to localStorage for offline fallback/speed
        localStorage.setItem('water_rates', JSON.stringify({
            minimumRate: result.data.minimum_rate,
            minimumCubic: result.data.minimum_cubic,
            excessRate: result.data.excess_rate_per_cubic
        }));
      }
    } catch (error) {
      console.error('Error loading rates from API:', error);
      // Fallback to localStorage if API fails
      const savedRates = localStorage.getItem('water_rates');
      if (savedRates) {
        const parsed = JSON.parse(savedRates);
        setWaterRates({
            minimum_cubic: (parsed.minimumCubic || '10').toString(),
            minimum_rate: (parsed.minimumRate || '75.00').toString(),
            excess_rate_per_cubic: (parsed.excessRate || '7.50').toString(),
        });
      }
    }
  }, [API_URL]);

  const loadHistoricalRates = useCallback(async () => {
    setLoading(true);
    try {
      // For now, we'll just show the latest as the table data
      // In a real app, we might have an endpoint for historical list
      const response = await fetch(`${API_URL}/water-rates/latest`);
      const result = await response.json();
      if (result.success && result.data) {
        setCurrentRates([result.data]);
      } else {
        // Fallback for UI mockup if no data yet
        setCurrentRates([]);
      }
    } catch (error) {
      console.error('Error loading historical rates:', error);
      showToast('Failed to load water rate history', 'error');
    } finally {
      setLoading(false);
    }
  }, [API_URL, showToast]);

  useEffect(() => {
    loadSavedSettings();
    loadHistoricalRates();
  }, [loadSavedSettings, loadHistoricalRates]);

  const handleSaveWaterRates = async () => {
    try {
      const response = await fetch(`${API_URL}/water-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minimum_cubic: waterRates.minimum_cubic,
          minimum_rate: waterRates.minimum_rate,
          excess_rate_per_cubic: waterRates.excess_rate_per_cubic,
          modified_by: 1 // Mock admin ID
        }),
      });

      const result = await response.json();
      if (result.success) {
        // Also update localStorage for fallback
        localStorage.setItem('water_rates', JSON.stringify({
            minimumRate: waterRates.minimum_rate,
            minimumCubic: waterRates.minimum_cubic,
            excessRate: waterRates.excess_rate_per_cubic
        }));
        
        showToast('Water rates committed to database', 'success');
        loadHistoricalRates();
      } else {
        throw new Error(result.message);
      }
    } catch (error: any) {
      console.error('Error saving water rates:', error);
      showToast(`Failed to save rates: ${error.message}`, 'error');
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
    loadHistoricalRates();
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
                    label="MINIMUM CONSUMPTION (CU.M)"
                    type="number"
                    value={waterRates.minimum_cubic}
                    onChange={(value) => setWaterRates({ ...waterRates, minimum_cubic: value })}
                    icon="fa-faucet"
                  />
                  <FormInput
                    label="MINIMUM CHARGE (₱)"
                    type="number"
                    value={waterRates.minimum_rate}
                    onChange={(value) => setWaterRates({ ...waterRates, minimum_rate: value })}
                    icon="fa-money-bill-wave"
                  />
                  <FormInput
                    label="EXCESS RATE PER CU.M (₱)"
                    type="number"
                    value={waterRates.excess_rate_per_cubic}
                    onChange={(value) => setWaterRates({ ...waterRates, excess_rate_per_cubic: value })}
                    icon="fa-plus-circle"
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
                { key: 'minimum_cubic', label: 'Min. Consumption', render: (v: number) => `${v} cu.m` },
                { key: 'minimum_rate', label: 'Min. Charge', render: (v: number) => `₱${toAmount(v).toFixed(2)}` },
                { key: 'excess_rate_per_cubic', label: 'Excess Rate', render: (v: number) => `₱${toAmount(v).toFixed(2)} / cu.m` },
                { key: 'effective_date', label: 'Effective Date', render: (v: string) => new Date(v).toLocaleDateString() },
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

