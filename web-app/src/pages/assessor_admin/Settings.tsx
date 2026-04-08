import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import FormInput from '../../components/Common/FormInput';
import { useToast } from '../../components/Common/ToastContainer';
import { useAuth } from '../../context/AuthContext';
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
  const { user } = useAuth();
  const { showToast } = useToast();
  const [waterRates, setWaterRates] = useState({
    minimum_cubic: '10',
    minimum_rate: '75.00',
    excess_rate_per_cubic: '7.50',
  });

  const [systemSettings, setSystemSettings] = useState({
    currency: 'PHP',
    dueDateDays: '15',
    lateFee: '5.0',
  });

  const [currentRates, setCurrentRates] = useState<WaterRate[]>([]);
  const [loading, setLoading] = useState(false);
  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  const loadSavedSettings = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/admin/settings`);
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || 'Failed to load settings.');
      }

      const system = result.data?.systemSettings || {};
      setSystemSettings({
        currency: system.currency || 'PHP',
        dueDateDays: String(system.dueDateDays || '15'),
        lateFee: String(system.lateFee || '5.0'),
      });

      if (result.data?.waterRates) {
        const liveRate = result.data.waterRates;
        setCurrentRates([liveRate]);
        setWaterRates({
          minimum_cubic: String(liveRate.minimum_cubic),
          minimum_rate: String(liveRate.minimum_rate),
          excess_rate_per_cubic: String(liveRate.excess_rate_per_cubic),
        });
      } else {
        setCurrentRates([]);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      showToast('Failed to load saved settings', 'error');
    }
  }, [API_URL, showToast]);

  useEffect(() => {
    loadSavedSettings();
  }, [loadSavedSettings]);

  const handleSaveAllChanges = async () => {
    setLoading(true);
    try {
      const rateResponse = await fetch(`${API_URL}/water-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minimum_cubic: waterRates.minimum_cubic,
          minimum_rate: waterRates.minimum_rate,
          excess_rate_per_cubic: waterRates.excess_rate_per_cubic,
          modified_by: Number(user?.id || 1),
        }),
      });

      const rateResult = await rateResponse.json();
      if (!rateResult.success) {
        throw new Error(rateResult.message || 'Failed to sync water rates');
      }

      const settingsResponse = await fetch(`${API_URL}/admin/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...systemSettings,
          modifiedBy: Number(user?.id || 1),
        }),
      });

      const settingsResult = await settingsResponse.json();
      if (!settingsResult.success) {
        throw new Error(settingsResult.message || 'Failed to save system settings');
      }

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
                <h3 className="subsection-title">WATER RATE TABLE</h3>
                <div className="form-row-grid">
                  <FormInput
                    label="MINIMUM CONSUMPTION (CU.M)"
                    type="number"
                    value={waterRates.minimum_cubic}
                    onChange={(value) => setWaterRates({ ...waterRates, minimum_cubic: value })}
                    icon="fa-faucet"
                  />
                  <FormInput
                    label="MINIMUM CHARGE (PHP)"
                    type="number"
                    value={waterRates.minimum_rate}
                    onChange={(value) => setWaterRates({ ...waterRates, minimum_rate: value })}
                    icon="fa-money-bill-wave"
                  />
                  <FormInput
                    label="EXCESS RATE PER CU.M (PHP)"
                    type="number"
                    value={waterRates.excess_rate_per_cubic}
                    onChange={(value) => setWaterRates({ ...waterRates, excess_rate_per_cubic: value })}
                    icon="fa-plus-circle"
                  />
                </div>
              </div>

              <div className="settings-divider"></div>

              <div className="settings-subsection">
                <h3 className="subsection-title">BILLING & SYSTEM LOGIC</h3>
                <div className="form-row-grid">
                  <FormInput
                    label="CURRENCY"
                    value={systemSettings.currency}
                    onChange={(value) => setSystemSettings({ ...systemSettings, currency: value })}
                    icon="fa-coins"
                  />
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

              {currentRates.length > 0 && (
                <>
                  <div className="settings-divider"></div>
                  <div className="settings-subsection">
                    <h3 className="subsection-title">CURRENT LIVE RATE SNAPSHOT</h3>
                    <p style={{ margin: 0, color: '#64748b', fontWeight: 600 }}>
                      Effective {new Date(currentRates[0].effective_date).toLocaleDateString()} with minimum charge of PHP {toAmount(currentRates[0].minimum_rate).toFixed(2)}.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Settings;
