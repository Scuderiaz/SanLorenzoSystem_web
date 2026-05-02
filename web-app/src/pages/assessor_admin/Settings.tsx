import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const AUTO_REFRESH_INTERVAL_MS = 30000;

const formatDateToManilaKey = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    const fallback = new Date(date);
    fallback.setMinutes(fallback.getMinutes() - fallback.getTimezoneOffset());
    return fallback.toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
};

const todayDateValue = () => formatDateToManilaKey(new Date());

const toDateKey = (value?: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const dateOnlyMatch = raw.match(DATE_ONLY_PATTERN);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}`;
  }
  const datePrefixMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (datePrefixMatch) {
    return `${datePrefixMatch[1]}-${datePrefixMatch[2]}-${datePrefixMatch[3]}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateToManilaKey(parsed);
  }
  return '';
};

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
  const dateKey = toDateKey(value);
  if (!dateKey) return value || 'N/A';
  const [year, month, day] = dateKey.split('-').map(Number);
  const safeDate = new Date(year, (month || 1) - 1, day || 1);
  return safeDate.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

const isActiveRate = (effectiveDate?: string) => {
  const dateKey = toDateKey(effectiveDate);
  if (!dateKey) return false;
  return dateKey <= todayDateValue();
};

const isFutureRate = (effectiveDate?: string) => {
  const dateKey = toDateKey(effectiveDate);
  if (!dateKey) return false;
  return dateKey > todayDateValue();
};

const toClassificationTheme = (classificationName?: string) => {
  const normalized = String(classificationName || '').trim().toLowerCase();
  if (normalized.includes('commercial')) return 'theme-commercial';
  if (normalized.includes('institutional')) return 'theme-institutional';
  if (normalized.includes('residential')) return 'theme-residential';
  return 'theme-default';
};

const Settings: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [waterRates, setWaterRates] = useState<WaterRate[]>([]);
  const [classifications, setClassifications] = useState<ClassificationOption[]>([]);
  const [rateForm, setRateForm] = useState(emptyRateForm());
  const [editingRateId, setEditingRateId] = useState<number | null>(null);
  const [rateToDelete, setRateToDelete] = useState<WaterRate | null>(null);
  const [deletingRateId, setDeletingRateId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingRate, setSavingRate] = useState(false);
  const [savingSystem, setSavingSystem] = useState(false);
  const hasShownSupabaseFallbackWarning = useRef(false);

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
      const loadWaterRatesFromApi = async () => {
        const payload = await requestJson<any>(
          '/water-rates?active_only=false',
          {},
          'Failed to load water rates.'
        );
        return payload?.data || [];
      };

      const [settingsResult, waterRatesResult, classificationsResult] = await Promise.all([
        loadAdminSettingsWithFallback(),
        loadWaterRatesFromApi(),
        loadClassificationsWithFallback(),
      ]);

      const system = settingsResult.data?.systemSettings || {};
      setSystemSettings({
        currency: system.currency || 'PHP',
        dueDateDays: String(system.dueDateDays || '15'),
        lateFee: String(system.lateFee || '10.0'),
      });

      const normalizedRates = (waterRatesResult || []).map((rate: any) => ({
        rate_id: Number(rate.rate_id ?? rate.Rate_ID ?? 0),
        classification_id: Number(rate.classification_id ?? rate.Classification_ID ?? 0),
        classification_name: rate.classification_name ?? rate.Classification_Name ?? 'Unknown Classification',
        minimum_cubic: Number(rate.minimum_cubic ?? rate.Minimum_Cubic ?? 0),
        minimum_rate: Number(rate.minimum_rate ?? rate.Minimum_Rate ?? 0),
        excess_rate_per_cubic: Number(rate.excess_rate_per_cubic ?? rate.Excess_Rate_Per_Cubic ?? 0),
        effective_date: toDateKey(rate.effective_date ?? rate.Effective_Date ?? ''),
        modified_by: rate.modified_by ?? rate.Modified_By ?? null,
        modified_date: rate.modified_date ?? rate.Modified_Date ?? '',
      }));

      const dedupedRates: WaterRate[] = [];
      const seenRateKeys = new Set<string>();
      for (const rate of normalizedRates) {
        const uniqueKey = rate.rate_id > 0
          ? `id:${rate.rate_id}`
          : `fallback:${rate.classification_id}:${rate.effective_date}:${rate.minimum_cubic}:${rate.minimum_rate}:${rate.excess_rate_per_cubic}`;
        if (seenRateKeys.has(uniqueKey)) {
          continue;
        }
        seenRateKeys.add(uniqueKey);
        dedupedRates.push(rate);
      }

      setWaterRates(dedupedRates);

      setClassifications((classificationsResult.data || []).map((classification: any) => ({
        Classification_ID: Number(classification.Classification_ID ?? classification.classification_id),
        Classification_Name: classification.Classification_Name ?? classification.classification_name ?? 'Unnamed Classification',
      })));

      if (
        [settingsResult.source, classificationsResult.source].includes('supabase')
        && !hasShownSupabaseFallbackWarning.current
      ) {
        hasShownSupabaseFallbackWarning.current = true;
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

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadPageData();
      }
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
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
      .sort((left, right) => toDateKey(right.effective_date).localeCompare(toDateKey(left.effective_date)) || right.rate_id - left.rate_id)
      .forEach((rate) => {
        if (!latestMap.has(rate.classification_id)) {
          latestMap.set(rate.classification_id, rate);
        }
      });

    return Array.from(latestMap.values()).sort((left, right) => left.classification_name.localeCompare(right.classification_name));
  }, [waterRates]);

  const activeRateIdByClassification = useMemo(() => {
    const activeMap = new Map<number, number>();
    waterRates
      .filter((rate) => isActiveRate(rate.effective_date))
      .sort((left, right) => toDateKey(right.effective_date).localeCompare(toDateKey(left.effective_date)) || right.rate_id - left.rate_id)
      .forEach((rate) => {
        if (!activeMap.has(rate.classification_id)) {
          activeMap.set(rate.classification_id, rate.rate_id);
        }
      });
    return activeMap;
  }, [waterRates]);

  const getRateStatus = (rate: WaterRate): 'active' | 'upcoming' | 'historical' => {
    const isCurrentActive = activeRateIdByClassification.get(rate.classification_id) === rate.rate_id;
    if (isCurrentActive) {
      return 'active';
    }
    if (isFutureRate(rate.effective_date)) {
      return 'upcoming';
    }
    return 'historical';
  };

  const canEditRate = (rate: WaterRate) => {
    return getRateStatus(rate) !== 'historical';
  };

  const editRate = (rate: WaterRate) => {
    const status = getRateStatus(rate);
    if (status === 'historical') {
      showToast('Historical water rates are locked and cannot be edited.', 'warning');
      return;
    }
    setEditingRateId(rate.rate_id);
    const normalizedEffectiveDate = toDateKey(rate.effective_date);
    const editableEffectiveDate = normalizedEffectiveDate || todayDateValue();
    setRateForm({
      classificationId: String(rate.classification_id),
      minimumCubic: String(rate.minimum_cubic),
      minimumRate: String(rate.minimum_rate),
      excessRatePerCubic: String(rate.excess_rate_per_cubic),
      effectiveDate: editableEffectiveDate,
    });
  };

  const handleSaveRate = async () => {
    if (!rateForm.classificationId || !rateForm.minimumCubic || !rateForm.minimumRate || !rateForm.excessRatePerCubic || !rateForm.effectiveDate) {
      showToast('Complete the classification and rate fields before saving.', 'error');
      return;
    }
    if (rateForm.effectiveDate < todayDateValue()) {
      showToast('Past effective dates are not allowed for water rates.', 'error');
      return;
    }

    if (editingRateId) {
      const currentEditingRate = waterRates.find((rate) => rate.rate_id === editingRateId);
      if (currentEditingRate && getRateStatus(currentEditingRate) === 'historical') {
        showToast('Historical water rates are locked and cannot be edited.', 'warning');
        return;
      }
    }

    setSavingRate(true);
    try {
      const saveResult = await requestJson<any>(
        editingRateId ? `/water-rates/${editingRateId}` : '/water-rates',
        {
          method: editingRateId ? 'PUT' : 'POST',
          body: JSON.stringify({
            classification_id: Number(rateForm.classificationId),
            minimum_cubic: Number(rateForm.minimumCubic),
            minimum_rate: Number(rateForm.minimumRate),
            excess_rate_per_cubic: Number(rateForm.excessRatePerCubic),
            effective_date: rateForm.effectiveDate,
            modified_by: Number(user?.id || 1),
          }),
        },
        editingRateId ? 'Failed to update water rate.' : 'Failed to create water rate.'
      );

      if (saveResult?.queued || saveResult?.offline) {
        throw new Error('Water rate was queued offline and not yet saved to the database. Please reconnect and try again.');
      }

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

  const promptDeleteRate = (rate: WaterRate) => {
    setRateToDelete(rate);
  };

  const handleDeleteRate = async () => {
    if (!rateToDelete) {
      return;
    }

    setDeletingRateId(rateToDelete.rate_id);
    try {
      const deleteResult = await requestJson<any>(
        `/water-rates/${rateToDelete.rate_id}`,
        {
          method: 'DELETE',
          body: JSON.stringify({
            modified_by: Number(user?.id || 1),
          }),
        },
        'Failed to delete water rate.'
      );

      if (deleteResult?.queued || deleteResult?.offline) {
        throw new Error('Water rate deletion was queued offline and not yet deleted from the database. Please reconnect and try again.');
      }

      if (editingRateId === rateToDelete.rate_id) {
        resetRateForm();
      }

      showToast('Water rate deleted successfully.', 'success');
      setRateToDelete(null);
      loadPageData();
    } catch (error) {
      console.error('Error deleting water rate:', error);
      showToast(getErrorMessage(error, 'Failed to delete water rate.'), 'error');
    } finally {
      setDeletingRateId(null);
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
      getSortValue: (row: WaterRate) => toDateKey(row.effective_date),
      render: (value: string, row: WaterRate) => {
        const status = getRateStatus(row);
        const statusClass = status === 'active' ? 'active' : status === 'upcoming' ? 'upcoming' : 'inactive';
        const statusLabel = status === 'active' ? 'Active' : status === 'upcoming' ? 'Upcoming' : 'Historical';

        return (
          <div className="rate-effective-cell">
            <span>{formatDate(value)}</span>
            <span className={`rate-status-pill ${statusClass}`}>
              {statusLabel}
            </span>
          </div>
        );
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_: unknown, row: WaterRate) => {
        const canEdit = canEditRate(row);
        return (
          <div className="rate-row-actions">
            {canEdit ? (
              <button className="btn btn-sm btn-secondary" onClick={() => editRate(row)} title="Edit rate">
                <i className="fas fa-pen"></i> Edit
              </button>
            ) : (
              <span className="rate-action-placeholder" aria-hidden="true"></span>
            )}
            <button className="btn btn-sm btn-danger" onClick={() => promptDeleteRate(row)}>
              <i className="fas fa-trash"></i> Delete
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <MainLayout title="System Configuration">
      <div className="settings-page settings-rates-page">
        <section className="rate-snapshot-strip">
          {latestActiveRates.length > 0 ? latestActiveRates.map((rate) => (
            <article key={rate.rate_id} className={`rate-snapshot-card ${toClassificationTheme(rate.classification_name)}`}>
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
                  min={todayDateValue()}
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
          initialSortColumn="effective_date"
          initialSortDirection="desc"
        />
        </section>

        {rateToDelete && (
          <div className="delete-rate-card-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-rate-title">
            <article className="delete-rate-card">
              <div className="delete-rate-card-head">
                <div className="delete-rate-card-icon" aria-hidden="true">
                  <i className="fas fa-trash-alt"></i>
                </div>
                <h3 id="delete-rate-title">Delete Water Rates</h3>
              </div>
              <p>
                You are about to remove the <strong>{rateToDelete.classification_name}</strong> rate effective{' '}
                <strong>{formatDate(rateToDelete.effective_date)}</strong>. This action cannot be undone.
              </p>
              <div className="delete-rate-card-actions">
                <button className="btn btn-secondary" onClick={() => setRateToDelete(null)} disabled={deletingRateId === rateToDelete.rate_id}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={handleDeleteRate} disabled={deletingRateId === rateToDelete.rate_id}>
                  <i className={`fas ${deletingRateId === rateToDelete.rate_id ? 'fa-spinner fa-spin' : 'fa-trash'}`}></i>
                  {deletingRateId === rateToDelete.rate_id ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </article>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default Settings;
