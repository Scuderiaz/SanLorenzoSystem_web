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
        localStorage.setItem('water_rates', JSON.stringify({
            minimumRate: result.data.minimum_rate,
            minimumCubic: result.data.minimum_cubic,
            excessRate: result.data.excess_rate_per_cubic
        }));
      }
    } catch (error) {
      console.error('Error loading rates:', error);
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

  useEffect(() => {
    loadSavedSettings();
  }, [loadSavedSettings]);

  const handleSaveAllChanges = async () => {
    setLoading(true);
    try {
      // 1. Save Water Rates to Backend
      const rateResponse = await fetch(`${API_URL}/water-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minimum_cubic: waterRates.minimum_cubic,
          minimum_rate: waterRates.minimum_rate,
          excess_rate_per_cubic: waterRates.excess_rate_per_cubic,
          modified_by: 1 // Mock admin ID
        }),
      });

      const rateResult = await rateResponse.json();
      if (!rateResult.success) throw new Error(rateResult.message || 'Failed to sync water rates');

      // 2. Sync to localStorage for fallback
      localStorage.setItem('water_rates', JSON.stringify({
          minimumRate: waterRates.minimum_rate,
          minimumCubic: waterRates.minimum_cubic,
          excessRate: waterRates.excess_rate_per_cubic
      }));

      // 3. Save Global System settings to localStorage
      localStorage.setItem('system_settings', JSON.stringify(systemSettings));
      
      showToast('All system configurations updated and synchronized', 'success');
      loadSavedSettings();
    } catch (error: any) {
      console.error('Error saving configurations:', error);
      showToast(`Error: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout title="System Configuration">
      <div className="settings-page">
        {/* Unified Control Bar */}
        <div className="settings-actions-bar">
          <div className="action-info">
            <p>Update system-wide rules, billing logic, and water rate hierarchies.</p>
          </div>
          <button className="btn btn-primary btn-lg" onClick={handleSaveAllChanges} disabled={loading}>
            <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-save'}`}></i> 
            {loading ? 'Saving Changes...' : 'Save All Configuration'}
          </button>
        </div>

        <div className="settings-grid single-column">
          {/* Combined System Configuration Card */}
          <div className="settings-card premium-card">
            <div className="settings-card-header">
              <div className="header-icon">
                <i className="fas fa-sliders-h"></i>
              </div>
              <div>
                <h2 className="settings-card-title">System & Rate Configuration</h2>
                <p className="settings-card-subtitle">Manage water pricing and billing offsets</p>
              </div>
            </div>
            
            <div className="settings-form-optimized">
              <div className="settings-subsection">
                <h3 className="subsection-title">
                   WATER RATE TABLE
                </h3>
                <div className="form-row-grid">
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

              <div className="settings-divider"></div>

              <div className="settings-subsection">
                <h3 className="subsection-title">
                  BILLING & SYSTEM LOGIC
                </h3>
                <div className="form-row-grid">
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
      </div>
    </MainLayout>
  );
};

export default Settings;

