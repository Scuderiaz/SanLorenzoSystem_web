import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import FormInput from '../../components/Common/FormInput';
import FormSelect from '../../components/Common/FormSelect';
import { useToast } from '../../components/Common/ToastContainer';
import { useAuth } from '../../context/AuthContext';
import {
  getErrorMessage,
  loadAdminSettingsWithFallback,
  loadClassificationsWithFallback,
  loadWaterRatesWithFallback,
  requestJson,
} from '../../services/userManagementApi';
import './Settings.css';

interface WaterRate {
  rate_id: number;
  classification_id: number;
  classification_name: string;
  minimum_cubic: number;
  minimum_rate: number;
  excess_rate_per_cubic: number;
  effective_date: string;
  modified_by?: number | null;
  modified_date?: string;
}

interface ClassificationOption {
  Classification_ID: number;
  Classification_Name: string;
}

const todayDateValue = () => new Date().toISOString().split('T')[0];

const emptyRateForm = () => ({
  classificationId: '',
  minimumCubic: '10',
  minimumRate: '75.00',
  excessRatePerCubic: '7.50',
  effectiveDate: todayDateValue(),
});

const toAmount = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (value: unknown) =>
  `PHP ${toAmount(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value?: string) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

const isActiveRate = (effectiveDate?: string) => {
  if (!effectiveDate) return false;
  const date = new Date(effectiveDate);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() <= Date.now();
};

const Settings: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [waterRates, setWaterRates] = useState<WaterRate[]>([]);
  const [classifications, setClassifications] = useState<ClassificationOption[]>([]);
  const [rateForm, setRateForm] = useState(emptyRateForm());
  const [editingRateId, setEditingRateId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingRate, setSavingRate] = useState(false);
  const [savingSystem, setSavingSystem] = useState(false);

  const [systemSettings, setSystemSettings] = useState({
    currency: 'PHP',
    dueDateDays: '15',
    lateFee: '10.0',
  });

  const resetRateForm = useCallback(() => {
    setEditingRateId(null);
    setRateForm(emptyRateForm());
  }, []);

  const loadPageData = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsResult, waterRatesResult, classificationsResult] = await Promise.all([
        loadAdminSettingsWithFallback(),
        loadWaterRatesWithFallback({ activeOnly: false }),
        loadClassificationsWithFallback(),
      ]);

      const system = settingsResult.data?.systemSettings || {};
      setSystemSettings({
        currency: system.currency || 'PHP',
        dueDateDays: String(system.dueDateDays || '15'),
        lateFee: String(system.lateFee || '10.0'),
      });

      setWaterRates((waterRatesResult.data || []).map((rate: any) => ({
        rate_id: Number(rate.rate_id ?? rate.Rate_ID),
        classification_id: Number(rate.classification_id ?? rate.Classification_ID),
        classification_name: rate.classification_name ?? rate.Classification_Name ?? 'Unknown Classification',
        minimum_cubic: Number(rate.minimum_cubic ?? rate.Minimum_Cubic ?? 0),
        minimum_rate: Number(rate.minimum_rate ?? rate.Minimum_Rate ?? 0),
        excess_rate_per_cubic: Number(rate.excess_rate_per_cubic ?? rate.Excess_Rate_Per_Cubic ?? 0),
        effective_date: rate.effective_date ?? rate.Effective_Date ?? '',
        modified_by: rate.modified_by ?? rate.Modified_By ?? null,
        modified_date: rate.modified_date ?? rate.Modified_Date ?? '',
      })));

      setClassifications((classificationsResult.data || []).map((classification: any) => ({
        Classification_ID: Number(classification.Classification_ID ?? classification.classification_id),
        Classification_Name: classification.Classification_Name ?? classification.classification_name ?? 'Unnamed Classification',
      })));

      if ([settingsResult.source, waterRatesResult.source, classificationsResult.source].includes('supabase')) {
        showToast('Some settings data loaded using Supabase fallback.', 'warning');
      }
    } catch (error) {
      console.error('Error loading settings page data:', error);
      showToast(getErrorMessage(error, 'Failed to load settings.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  const classificationOptions = useMemo(
    () => classifications.map((classification) => ({
      value: classification.Classification_ID,
      label: classification.Classification_Name,
    })),
    [classifications]
  );

  const latestActiveRates = useMemo(() => {
    const latestMap = new Map<number, WaterRate>();
    waterRates
      .filter((rate) => isActiveRate(rate.effective_date))
      .sort((left, right) => new Date(right.effective_date).getTime() - new Date(left.effective_date).getTime() || right.rate_id - left.rate_id)
      .forEach((rate) => {
        if (!latestMap.has(rate.classification_id)) {
          latestMap.set(rate.classification_id, rate);
        }
      });

    return Array.from(latestMap.values()).sort((left, right) => left.classification_name.localeCompare(right.classification_name));
  }, [waterRates]);

  const editRate = (rate: WaterRate) => {
    setEditingRateId(rate.rate_id);
    setRateForm({
      classificationId: String(rate.classification_id),
      minimumCubic: String(rate.minimum_cubic),
      minimumRate: String(rate.minimum_rate),
      excessRatePerCubic: String(rate.excess_rate_per_cubic),
      effectiveDate: String(rate.effective_date || '').split('T')[0] || todayDateValue(),
    });
  };

  const handleSaveRate = async () => {
    if (!rateForm.classificationId || !rateForm.minimumCubic || !rateForm.minimumRate || !rateForm.excessRatePerCubic || !rateForm.effectiveDate) {
      showToast('Complete the classification and rate fields before saving.', 'error');
      return;
    }

    setSavingRate(true);
    try {
      await requestJson(
        editingRateId ? `/water-rates/${editingRateId}` : '/water-rates',
        {
          method: editingRateId ? 'PUT' : 'POST',
          body: JSON.stringify({
            classification_id: Number(rateForm.classificationId),
            minimum_cubic: Number(rateForm.minimumCubic),
            minimum_rate: Number(rateForm.minimumRate),
            excess_rate_per_cubic: Number(rateForm.excessRatePerCubic),
            effective_date: new Date(rateForm.effectiveDate).toISOString(),
            modified_by: Number(user?.id || 1),
          }),
        },
        editingRateId ? 'Failed to update water rate.' : 'Failed to create water rate.'
      );

      showToast(editingRateId ? 'Water rate updated successfully.' : 'Classification water rate created successfully.', 'success');
      resetRateForm();
      loadPageData();
    } catch (error) {
      console.error('Error saving water rate:', error);
      showToast(getErrorMessage(error, 'Failed to save water rate.'), 'error');
    } finally {
      setSavingRate(false);
    }
  };

  const handleDeleteRate = async (rate: WaterRate) => {
    const confirmed = window.confirm(`Delete the ${rate.classification_name} rate effective ${formatDate(rate.effective_date)}?`);
    if (!confirmed) {
      return;
    }

    try {
      await requestJson(
        `/water-rates/${rate.rate_id}`,
        { method: 'DELETE' },
        'Failed to delete water rate.'
      );

      if (editingRateId === rate.rate_id) {
        resetRateForm();
      }

      showToast('Water rate deleted successfully.', 'success');
      loadPageData();
    } catch (error) {
      console.error('Error deleting water rate:', error);
      showToast(getErrorMessage(error, 'Failed to delete water rate.'), 'error');
    }
  };

  const handleSaveSystemSettings = async () => {
    setSavingSystem(true);
    try {
      await requestJson(
        '/admin/settings',
        {
          method: 'POST',
          body: JSON.stringify({
            ...systemSettings,
            modifiedBy: Number(user?.id || 1),
          }),
        },
        'Failed to save system settings.'
      );

      showToast('Billing and system settings updated successfully.', 'success');
      loadPageData();
    } catch (error) {
      console.error('Error saving system settings:', error);
      showToast(getErrorMessage(error, 'Failed to save system settings.'), 'error');
    } finally {
      setSavingSystem(false);
    }
  };

  const columns = [
    {
      key: 'classification_name',
      label: 'Classification',
      sortable: true,
      filterType: 'select' as const,
      filterLabel: 'Classification',
    },
    {
      key: 'minimum_cubic',
      label: 'Minimum Cubic',
      sortable: true,
      render: (value: number) => `${value} m3`,
    },
    {
      key: 'minimum_rate',
      label: 'Minimum Rate',
      sortable: true,
      render: (value: number) => formatCurrency(value),
    },
    {
      key: 'excess_rate_per_cubic',
      label: 'Excess / Cubic',
      sortable: true,
      render: (value: number) => formatCurrency(value),
    },
    {
      key: 'effective_date',
      label: 'Effective Date',
      sortable: true,
      render: (value: string, row: WaterRate) => (
        <div className="rate-effective-cell">
          <span>{formatDate(value)}</span>
          <span className={`rate-status-pill ${isActiveRate(row.effective_date) ? 'active' : 'upcoming'}`}>
            {isActiveRate(row.effective_date) ? 'Active' : 'Upcoming'}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_: unknown, row: WaterRate) => (
        <div className="rate-row-actions">
          <button className="btn btn-sm btn-secondary" onClick={() => editRate(row)}>
            <i className="fas fa-pen"></i> Edit
          </button>
          <button className="btn btn-sm btn-danger" onClick={() => handleDeleteRate(row)}>
            <i className="fas fa-trash"></i> Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <MainLayout title="System Configuration">
      <div className="settings-page settings-rates-page">
        <section className="settings-hero">
          <div>
            <p className="settings-kicker">Water Rates Control Center</p>
            <h2>Manage classification-based billing rates with a clear live registry.</h2>
            <p className="settings-hero-copy">
              Configure Residential, Commercial, Institutional, and future classifications separately so billing always uses the correct active rate.
            </p>
          </div>
          <div className="settings-hero-actions">
            <button className="btn btn-secondary" onClick={loadPageData} disabled={loading}>
              <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`}></i>
              {loading ? 'Refreshing...' : 'Refresh Data'}
            </button>
          </div>
        </section>

        <section className="rate-snapshot-strip">
          {latestActiveRates.length > 0 ? latestActiveRates.map((rate) => (
            <article key={rate.rate_id} className="rate-snapshot-card">
              <div className="rate-snapshot-head">
                <span className="rate-snapshot-name">{rate.classification_name}</span>
                <span className="rate-status-pill active">Live</span>
              </div>
              <div className="rate-snapshot-value">{formatCurrency(rate.minimum_rate)}</div>
              <p className="rate-snapshot-copy">
                {rate.minimum_cubic} m3 minimum, then {formatCurrency(rate.excess_rate_per_cubic)} per excess cubic meter.
              </p>
              <span className="rate-snapshot-meta">Effective {formatDate(rate.effective_date)}</span>
            </article>
          )) : (
            <article className="rate-snapshot-card empty">
              <div className="rate-snapshot-head">
                <span className="rate-snapshot-name">No active rates yet</span>
              </div>
              <p className="rate-snapshot-copy">Create a classification-based rate below to start automatic billing.</p>
            </article>
          )}
        </section>

        <div className="settings-workspace-grid">
          <section className="settings-card rate-editor-card">
            <div className="settings-card-header compact">
              <div className="header-icon">
                <i className="fas fa-faucet"></i>
              </div>
              <div>
                <h3 className="settings-card-title">{editingRateId ? 'Edit Water Rate' : 'Add Water Rate'}</h3>
                <p className="settings-card-subtitle">Assign a dedicated rate structure to one classification and effective date.</p>
              </div>
            </div>

            <div className="settings-form-optimized">
              <div className="form-row-grid">
                <FormSelect
                  label="Classification"
                  value={rateForm.classificationId}
                  onChange={(value) => setRateForm((current) => ({ ...current, classificationId: value }))}
                  options={classificationOptions}
                  placeholder="Select classification"
                  required
                  icon="fa-layer-group"
                />
                <FormInput
                  label="Effective Date"
                  type="date"
                  value={rateForm.effectiveDate}
                  onChange={(value) => setRateForm((current) => ({ ...current, effectiveDate: value }))}
                  icon="fa-calendar-day"
                />
                <FormInput
                  label="Minimum Cubic"
                  type="number"
                  value={rateForm.minimumCubic}
                  onChange={(value) => setRateForm((current) => ({ ...current, minimumCubic: value }))}
                  icon="fa-tint"
                />
                <FormInput
                  label="Minimum Rate"
                  type="number"
                  value={rateForm.minimumRate}
                  onChange={(value) => setRateForm((current) => ({ ...current, minimumRate: value }))}
                  icon="fa-money-bill-wave"
                />
                <FormInput
                  label="Excess Rate per Cubic"
                  type="number"
                  value={rateForm.excessRatePerCubic}
                  onChange={(value) => setRateForm((current) => ({ ...current, excessRatePerCubic: value }))}
                  icon="fa-plus-circle"
                />
              </div>

              <div className="rate-editor-footer">
                <div className="rate-editor-note">
                  Bills will use the latest active rate for the consumer’s classification based on the bill date.
                </div>
                <div className="rate-editor-actions">
                  <button className="btn btn-secondary" onClick={resetRateForm} disabled={savingRate}>
                    Clear Form
                  </button>
                  <button className="btn btn-primary btn-lg" onClick={handleSaveRate} disabled={savingRate}>
                    <i className={`fas ${savingRate ? 'fa-spinner fa-spin' : editingRateId ? 'fa-save' : 'fa-plus-circle'}`}></i>
                    {savingRate ? 'Saving...' : editingRateId ? 'Save Rate Changes' : 'Create Rate'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="settings-card system-settings-card">
            <div className="settings-card-header compact">
              <div className="header-icon warm">
                <i className="fas fa-sliders-h"></i>
              </div>
              <div>
                <h3 className="settings-card-title">Billing Logic</h3>
                <p className="settings-card-subtitle">Keep due dates, late fees, and currency settings aligned with your water rate policies.</p>
              </div>
            </div>

            <div className="settings-form-optimized">
              <div className="form-row-grid single-stack">
                <FormInput
                  label="Currency"
                  value={systemSettings.currency}
                  onChange={(value) => setSystemSettings((current) => ({ ...current, currency: value }))}
                  icon="fa-coins"
                />
                <FormInput
                  label="Due Date Offset (Days)"
                  type="number"
                  value={systemSettings.dueDateDays}
                  onChange={(value) => setSystemSettings((current) => ({ ...current, dueDateDays: value }))}
                  icon="fa-calendar-alt"
                />
                <FormInput
                  label="Late Fee Percentage (%)"
                  type="number"
                  value={systemSettings.lateFee}
                  onChange={(value) => setSystemSettings((current) => ({ ...current, lateFee: value }))}
                  icon="fa-percent"
                />
              </div>

              <div className="rate-editor-footer">
                <div className="rate-editor-note">
                  These values continue to apply on top of the classification-based water charge.
                </div>
                <div className="rate-editor-actions">
                  <button className="btn btn-primary btn-lg" onClick={handleSaveSystemSettings} disabled={savingSystem}>
                    <i className={`fas ${savingSystem ? 'fa-spinner fa-spin' : 'fa-save'}`}></i>
                    {savingSystem ? 'Saving...' : 'Save Billing Settings'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="settings-card rate-registry-card">
          <div className="settings-card-header compact">
            <div className="header-icon slate">
              <i className="fas fa-table"></i>
            </div>
            <div>
              <h3 className="settings-card-title">Water Rate Registry</h3>
              <p className="settings-card-subtitle">Search by classification, review effective dates, and maintain rate history in one place.</p>
            </div>
          </div>

          <DataTable
            columns={columns}
            data={waterRates}
            loading={loading}
            emptyMessage="No water rates found."
            enableFiltering={true}
            filterPlaceholder="Search classification, rate, or effective date..."
            filterActions={
              <button className="btn btn-secondary" onClick={loadPageData} title="Refresh water rates">
                <i className="fas fa-sync-alt"></i>
              </button>
            }
          />
        </section>
      </div>
    </MainLayout>
  );
};

export default Settings;
