import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import Modal from '../../components/Common/Modal';
import FormInput from '../../components/Common/FormInput';
import FormSelect from '../../components/Common/FormSelect';
import TableToolbar from '../../components/Common/TableToolbar';
import { useToast } from '../../components/Common/ToastContainer';
import {
  getErrorMessage,
  loadAdminSettingsWithFallback,
  loadBillsWithFallback,
  loadLedgerConsumersWithFallback,
  loadMeterReadingsWithFallback,
  loadWaterRatesWithFallback,
  loadZonesWithFallback,
  requestJson,
} from '../../services/userManagementApi';
import './GenerateBills.css';

interface BillRow {
  Bill_ID: number;
  Consumer_ID: number;
  Reading_ID?: number | null;
  Account_Number: string;
  Consumer_Name: string;
  Address?: string;
  Classification?: string;
  Total_Amount: number;
  Amount_Due?: number;
  Connection_Fee?: number;
  Previous_Balance?: number;
  Previous_Penalty?: number;
  Penalty?: number;
  Total_After_Due_Date?: number;
  Due_Date?: string;
  Bill_Date?: string;
  Billing_Month?: string;
  Date_Covered_From?: string;
  Date_Covered_To?: string;
  Environmental_Fee?: number;
  Water_Charge?: number;
  Basic_Charge?: number;
  Status: string;
}

interface ConsumerRow {
  Consumer_ID: number;
  Meter_ID?: number | null;
  First_Name?: string;
  Middle_Name?: string;
  Last_Name?: string;
  Address?: string;
  Account_Number?: string;
  Zone_ID: number;
  Zone_Name?: string;
  Classification_ID?: number | null;
  Classification_Name?: string;
}

interface ZoneRow {
  Zone_ID: number;
  Zone_Name?: string;
}

interface WaterRateRow {
  rate_id?: number;
  classification_id: number;
  classification_name?: string | null;
  minimum_cubic: number;
  minimum_rate: number;
  excess_rate_per_cubic: number;
  effective_date?: string;
}

interface AdminSettingsRow {
  lateFee?: string | number;
  dueDateDays?: string | number;
}

interface MeterReadingRow {
  Reading_ID: number;
  Consumer_ID: number;
  Meter_ID?: number | null;
  Previous_Reading?: number;
  Current_Reading?: number;
  Consumption?: number;
  Reading_Date?: string;
  Reading_Status?: string;
}

const formatZoneLabel = (zoneName?: string, zoneId?: number | string | null) =>
  zoneName || (zoneId ? `Zone ${zoneId}` : 'Not Assigned');

const formatCurrency = (value: number) =>
  `P${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value?: string) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH');
};

const formatBillingMonth = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const toAmount = (value: string | number | undefined) => Number(value || 0);

const addDays = (dateValue: string, days: number) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
};

const isPastDueDate = (dateValue?: string) => {
  if (!dateValue) return false;
  const dueDate = new Date(dateValue);
  if (Number.isNaN(dueDate.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate < today;
};

const computeChargeFromRate = (consumption: number, rate?: WaterRateRow | null) => {
  if (!rate) {
    return 0;
  }

  const minimumCubic = Number(rate.minimum_cubic || 0);
  const minimumRate = Number(rate.minimum_rate || 0);
  const excessRate = Number(rate.excess_rate_per_cubic || 0);

  if (consumption < 0) {
    return 0;
  }

  if (consumption <= minimumCubic) {
    return minimumRate;
  }

  return minimumRate + ((consumption - minimumCubic) * excessRate);
};

const GenerateBills: React.FC = () => {
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [bills, setBills] = useState<BillRow[]>([]);
  const [consumers, setConsumers] = useState<ConsumerRow[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [meterReadings, setMeterReadings] = useState<MeterReadingRow[]>([]);
  const [waterRates, setWaterRates] = useState<WaterRateRow[]>([]);
  const [adminSettings, setAdminSettings] = useState<AdminSettingsRow>({ lateFee: 10, dueDateDays: 15 });
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [billingMonthFilter, setBillingMonthFilter] = useState('');
  const [selectedBill, setSelectedBill] = useState<BillRow | null>(null);
  const [editingBill, setEditingBill] = useState<BillRow | null>(null);
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [savingManualBill, setSavingManualBill] = useState(false);
  const [manualForm, setManualForm] = useState({
    consumerId: '',
    readingDate: new Date().toISOString().split('T')[0],
    dateCovered: new Date().toISOString().split('T')[0],
    dueDate: '',
    disconnectionDate: '',
    billingMonth: formatBillingMonth(new Date().toISOString()),
    previousReading: '',
    currentReading: '',
    currentChargeOverride: '',
    meterFee: '0',
    connectionFee: '0',
    previousBalance: '0',
    previousPenalty: '0',
    penalty: '',
    status: 'Unpaid',
  });

  const loadBills = useCallback(async () => {
    setLoading(true);
    try {
      const [billsResult, consumersResult, zonesResult, settingsResult, readingsResult, waterRatesResult] = await Promise.all([
        loadBillsWithFallback(),
        loadLedgerConsumersWithFallback(),
        loadZonesWithFallback(),
        loadAdminSettingsWithFallback(),
        loadMeterReadingsWithFallback(),
        loadWaterRatesWithFallback({ latestOnly: true, activeOnly: true }),
      ]);

      setBills(billsResult.data || []);
      setConsumers(consumersResult.data || []);
      setZones(zonesResult.data || []);
      setAdminSettings(settingsResult.data?.systemSettings || { lateFee: 10, dueDateDays: 15 });
      setMeterReadings(readingsResult.data || []);
      setWaterRates(waterRatesResult.data || []);

      const sources = [
        billsResult.source,
        consumersResult.source,
        zonesResult.source,
        settingsResult.source,
        readingsResult.source,
        waterRatesResult.source,
      ];
      if (sources.includes('supabase')) {
        showToast('Bills loaded using Supabase fallback for part of the data.', 'warning');
      }
    } catch (error) {
      console.error('Error loading bills:', error);
      showToast(getErrorMessage(error, 'Failed to load billing records.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  const consumerMap = useMemo(() => new Map(consumers.map((Consumer) => [Consumer.Consumer_ID, Consumer])), [consumers]);
  const waterRateMap = useMemo(
    () => new Map(waterRates.map((rate) => [Number(rate.classification_id), rate])),
    [waterRates]
  );
  const selectedManualConsumer = useMemo(
    () => consumers.find((Consumer) => String(Consumer.Consumer_ID) === manualForm.consumerId) || null,
    [consumers, manualForm.consumerId]
  );
  const selectedManualRate = useMemo(() => {
    const classificationId = Number(selectedManualConsumer?.Classification_ID || 0);
    return classificationId ? waterRateMap.get(classificationId) || null : null;
  }, [selectedManualConsumer?.Classification_ID, waterRateMap]);
  const selectedConsumerReading = useMemo(() => {
    if (!manualForm.consumerId) return null;
    return meterReadings
      .filter((reading) => String(reading.Consumer_ID) === manualForm.consumerId)
      .sort((a, b) => new Date(b.Reading_Date || 0).getTime() - new Date(a.Reading_Date || 0).getTime())[0] || null;
  }, [manualForm.consumerId, meterReadings]);
  const selectedConsumerOutstanding = useMemo(() => {
    if (!manualForm.consumerId) {
      return { previousBalance: 0, previousPenalty: 0 };
    }

    return bills.reduce((totals, bill) => {
      if (String(bill.Consumer_ID) !== manualForm.consumerId) {
        return totals;
      }

      const normalizedStatus = String(bill.Status || '').toLowerCase();
      if (normalizedStatus === 'paid' || normalizedStatus === 'validated') {
        return totals;
      }

      const outstandingBase = Number(bill.Amount_Due ?? bill.Total_Amount ?? 0);
      const outstandingPenalty = Number(bill.Penalty ?? 0);

      return {
        previousBalance: totals.previousBalance + outstandingBase,
        previousPenalty: totals.previousPenalty + outstandingPenalty,
      };
    }, { previousBalance: 0, previousPenalty: 0 });
  }, [bills, manualForm.consumerId]);
  const readingValues = useMemo(() => {
    const previousReading = Number(manualForm.previousReading);
    const currentReading = Number(manualForm.currentReading);
    const hasPrevious = manualForm.previousReading !== '' && !Number.isNaN(previousReading);
    const hasCurrent = manualForm.currentReading !== '' && !Number.isNaN(currentReading);
    const readingError = hasPrevious && hasCurrent && currentReading < previousReading
      ? 'Current reading is lower than previous reading. Use charge override for a problem case.'
      : '';
    const consumption = hasPrevious && hasCurrent && !readingError
      ? Math.max(0, currentReading - previousReading)
      : 0;

    return {
      previousReading,
      currentReading,
      hasPrevious,
      hasCurrent,
      readingError,
      consumption,
    };
  }, [manualForm.currentReading, manualForm.previousReading]);
  const manualBillSummary = useMemo(() => {
    const hasValidReadingPair = readingValues.hasPrevious && readingValues.hasCurrent && !readingValues.readingError;
    const computedCurrentCharge = hasValidReadingPair
      ? computeChargeFromRate(readingValues.consumption, selectedManualRate)
      : 0;
    const currentCharge = manualForm.currentChargeOverride !== ''
      ? toAmount(manualForm.currentChargeOverride)
      : computedCurrentCharge;
    const meterFee = toAmount(manualForm.meterFee);
    const connectionFee = toAmount(manualForm.connectionFee);
    const previousBalance = toAmount(manualForm.previousBalance);
    const previousPenalty = toAmount(manualForm.previousPenalty);
    const subtotalBeforePenalty = currentCharge + meterFee + connectionFee + previousBalance + previousPenalty;
    const lateFeePercent = Number(adminSettings?.lateFee || 0);
    const computedPenalty = subtotalBeforePenalty > 0 ? subtotalBeforePenalty * (lateFeePercent / 100) : 0;
    const dueDatePassed = isPastDueDate(manualForm.dueDate);
    const penalty = manualForm.penalty !== ''
      ? toAmount(manualForm.penalty)
      : (dueDatePassed ? computedPenalty : 0);
    const totalAmount = subtotalBeforePenalty;
    const totalAfterDueDate = totalAmount + computedPenalty;

    return {
      computedCurrentCharge,
      currentCharge,
      subtotalBeforePenalty,
      lateFeePercent,
      computedPenalty,
      dueDatePassed,
      penalty,
      totalAmount,
      totalAfterDueDate,
    };
  }, [
    adminSettings?.lateFee,
    manualForm.connectionFee,
    manualForm.currentChargeOverride,
    manualForm.dueDate,
    manualForm.meterFee,
    manualForm.penalty,
    manualForm.previousBalance,
    manualForm.previousPenalty,
    readingValues.consumption,
    readingValues.hasCurrent,
    readingValues.hasPrevious,
    readingValues.readingError,
    selectedManualRate,
  ]);

  const filteredBills = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return bills.filter((bill) => {
      const Consumer = consumerMap.get(bill.Consumer_ID);
      const matchesSearch = !query || [bill.Account_Number, bill.Consumer_Name, bill.Address]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      const matchesZone = !zoneFilter || String(Consumer?.Zone_ID || '') === zoneFilter;
      const matchesStatus = !statusFilter || bill.Status === statusFilter;
      const matchesBillingMonth = !billingMonthFilter || bill.Billing_Month === billingMonthFilter;
      return matchesSearch && matchesZone && matchesStatus && matchesBillingMonth;
    });
  }, [bills, billingMonthFilter, consumerMap, searchTerm, statusFilter, zoneFilter]);

  useEffect(() => {
    const focusBillId = Number(searchParams.get('focusBillId') || 0);
    const focusConsumerId = Number(searchParams.get('focusConsumerId') || 0);
    const focusAccount = String(searchParams.get('focusAccount') || '').trim().toLowerCase();
    if (!focusBillId && !focusConsumerId && !focusAccount) {
      return;
    }

    const target = bills.find((bill) => {
      if (focusBillId && Number(bill.Bill_ID) === focusBillId) {
        return true;
      }
      if (focusConsumerId && Number(bill.Consumer_ID) === focusConsumerId) {
        return true;
      }
      return Boolean(focusAccount) && String(bill.Account_Number || '').trim().toLowerCase() === focusAccount;
    });

    if (!target) {
      return;
    }

    setSearchTerm(target.Account_Number || target.Consumer_Name || '');
    setSelectedBill(target);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('focusBillId');
    nextParams.delete('focusConsumerId');
    nextParams.delete('focusAccount');
    setSearchParams(nextParams, { replace: true });
  }, [bills, searchParams, setSearchParams]);

  const totalBills = filteredBills.length;
  const totalBilled = filteredBills.reduce((sum, bill) => sum + Number(bill.Total_Amount || 0), 0);
  const unpaidBills = filteredBills.filter((bill) => String(bill.Status || '').toLowerCase() !== 'paid').length;
  const overdueBills = filteredBills.filter((bill) => String(bill.Status || '').toLowerCase() === 'overdue').length;

  const openEditBill = (bill: BillRow) => {
    const status = String(bill.Status || '').toLowerCase();
    if (status === 'paid') {
      showToast('Paid bills can no longer be edited.', 'warning');
      return;
    }

    const reading = meterReadings.find((row) => row.Reading_ID === bill.Reading_ID) || null;
    setEditingBill(bill);
    setManualForm({
      consumerId: String(bill.Consumer_ID),
      readingDate: bill.Bill_Date ? String(bill.Bill_Date).split('T')[0] : new Date().toISOString().split('T')[0],
      dateCovered: bill.Date_Covered_From ? String(bill.Date_Covered_From).split('T')[0] : (bill.Bill_Date ? String(bill.Bill_Date).split('T')[0] : new Date().toISOString().split('T')[0]),
      dueDate: bill.Due_Date ? String(bill.Due_Date).split('T')[0] : '',
      disconnectionDate: bill.Date_Covered_To ? String(bill.Date_Covered_To).split('T')[0] : '',
      billingMonth: bill.Billing_Month || '',
      previousReading: reading?.Previous_Reading !== undefined && reading?.Previous_Reading !== null ? String(reading.Previous_Reading) : '0',
      currentReading: reading?.Current_Reading !== undefined && reading?.Current_Reading !== null ? String(reading.Current_Reading) : '',
      currentChargeOverride: bill.Water_Charge !== undefined && bill.Water_Charge !== null ? String(bill.Water_Charge) : '',
      meterFee: String(bill.Environmental_Fee ?? 0),
      connectionFee: String(bill.Connection_Fee ?? 0),
      previousBalance: String(bill.Previous_Balance ?? 0),
      previousPenalty: String(bill.Previous_Penalty ?? 0),
      penalty: String(bill.Penalty ?? ''),
      status: bill.Status || 'Unpaid',
    });
    setIsManualEntryOpen(true);
  };

  const columns = [
    { key: 'Account_Number', label: 'Account No.', sortable: true },
    { key: 'Consumer_Name', label: 'Concessionaire Name', sortable: true },
    { key: 'Billing_Month', label: 'Billing Month', sortable: true },
    { key: 'Bill_Date', label: 'Bill Date', sortable: true, render: (value: string) => formatDate(value) },
    { key: 'Due_Date', label: 'Due Date', sortable: true, render: (value: string) => formatDate(value) },
    { key: 'Total_Amount', label: 'Amount Due', sortable: true, render: (value: number) => formatCurrency(value) },
    {
      key: 'Status',
      label: 'Bill Status',
      sortable: true,
      render: (value: string) => <span className={`status-badge status-${String(value || 'unknown').toLowerCase().replace(/\s+/g, '-')}`}>{value}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_: unknown, bill: BillRow) => (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-sm btn-info" onClick={() => setSelectedBill(bill)}>
            <i className="fas fa-eye"></i> View
          </button>
          {String(bill.Status || '').toLowerCase() !== 'paid' && (
            <button className="btn btn-sm btn-secondary" onClick={() => openEditBill(bill)}>
              <i className="fas fa-pen"></i> Edit
            </button>
          )}
        </div>
      ),
    },
  ];

  const zoneOptions = zones.map((zone) => ({ value: zone.Zone_ID, label: formatZoneLabel(zone.Zone_Name, zone.Zone_ID) }));
  const billingMonthOptions = useMemo(() => {
    const uniqueMonths = Array.from(
      new Set(
        bills
          .map((bill) => bill.Billing_Month)
          .filter((value): value is string => Boolean(value))
      )
    );

    return uniqueMonths
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())
      .map((value) => ({
        value,
        label: formatBillingMonth(value) || value,
      }));
  }, [bills]);
  const consumerOptions = consumers
    .slice()
    .sort((a, b) => String(a.Account_Number || '').localeCompare(String(b.Account_Number || '')))
    .map((Consumer) => ({
      value: Consumer.Consumer_ID,
      label: `${Consumer.Account_Number || 'NO-ACCOUNT'} - ${[Consumer.First_Name, Consumer.Middle_Name, Consumer.Last_Name].filter(Boolean).join(' ')}`,
    }));

  const resetManualForm = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    setEditingBill(null);
    setManualForm({
      consumerId: '',
      readingDate: today,
      dateCovered: today,
      dueDate: '',
      disconnectionDate: '',
      billingMonth: formatBillingMonth(today),
      previousReading: '',
      currentReading: '',
      currentChargeOverride: '',
      meterFee: '0',
      connectionFee: '0',
      previousBalance: '0',
      previousPenalty: '0',
      penalty: '',
      status: 'Unpaid',
    });
  }, []);

  const openManualEntry = () => {
    resetManualForm();
    setIsManualEntryOpen(true);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setZoneFilter('');
    setStatusFilter('');
    setBillingMonthFilter('');
  };

  const hasActiveFilters = Boolean(searchTerm.trim() || zoneFilter || statusFilter || billingMonthFilter);

  const handleManualConsumerChange = (value: string) => {
    setManualForm((current) => ({
      ...current,
      consumerId: value,
      previousReading: '',
      currentReading: '',
      currentChargeOverride: '',
      previousBalance: '0',
      previousPenalty: '0',
      penalty: '',
    }));
  };

  useEffect(() => {
    if (!isManualEntryOpen || !manualForm.consumerId) {
      return;
    }

    const dueOffsetDays = Number(adminSettings?.dueDateDays || 15);
    const nextDueDate = addDays(manualForm.readingDate, dueOffsetDays);

    setManualForm((current) => ({
      ...current,
      billingMonth: current.billingMonth || formatBillingMonth(current.readingDate),
      dateCovered: current.dateCovered || current.readingDate,
      dueDate: current.dueDate || nextDueDate,
      previousReading:
        current.previousReading !== ''
          ? current.previousReading
          : selectedConsumerReading?.Current_Reading !== undefined && selectedConsumerReading?.Current_Reading !== null
            ? String(selectedConsumerReading.Current_Reading)
            : '0',
      previousBalance:
        current.previousBalance !== '0' && current.previousBalance !== ''
          ? current.previousBalance
          : String(selectedConsumerOutstanding.previousBalance || 0),
      previousPenalty:
        current.previousPenalty !== '0' && current.previousPenalty !== ''
          ? current.previousPenalty
          : String(selectedConsumerOutstanding.previousPenalty || 0),
    }));
  }, [
    adminSettings?.dueDateDays,
    isManualEntryOpen,
    manualForm.consumerId,
    manualForm.readingDate,
    selectedConsumerOutstanding.previousBalance,
    selectedConsumerOutstanding.previousPenalty,
    selectedConsumerReading?.Current_Reading,
  ]);

  const handleSaveManualBill = async () => {
    const hasReadingPair = readingValues.hasPrevious && readingValues.hasCurrent && !readingValues.readingError;
    const hasChargeOverride = manualForm.currentChargeOverride !== '';

    if (!manualForm.consumerId || !manualForm.readingDate || !manualForm.dateCovered || !manualForm.dueDate || !manualForm.billingMonth) {
      showToast('Please complete the required bill fields.', 'error');
      return;
    }

    if (!hasReadingPair && !hasChargeOverride) {
      showToast('Enter the current meter reading to compute the bill. For new consumers, previous reading starts at 0. Use current charge override only for manual/problem cases.', 'error');
      return;
    }

    if (readingValues.readingError && !hasChargeOverride) {
      showToast(readingValues.readingError, 'error');
      return;
    }

    if (!hasChargeOverride && !selectedManualRate) {
      showToast('No active water rate is configured for the selected Concessionaire classification.', 'error');
      return;
    }

    if (!editingBill && !selectedConsumerReading?.Reading_ID && !selectedManualConsumer?.Meter_ID) {
      showToast('The selected Concessionaire has no meter assigned yet. Add or sync the meter before saving a manual bill.', 'error');
      return;
    }

    try {
      setSavingManualBill(true);
      const billPayload: Record<string, unknown> = {
        Consumer_ID: Number(manualForm.consumerId),
        Meter_ID: selectedManualConsumer?.Meter_ID ?? selectedConsumerReading?.Meter_ID ?? null,
        Reading_ID: editingBill?.Reading_ID || selectedConsumerReading?.Reading_ID || null,
        Reading_Date: manualForm.readingDate,
        Previous_Reading: Number(manualForm.previousReading || 0),
        Current_Reading: Number(manualForm.currentReading || manualForm.previousReading || 0),
        Consumption: readingValues.consumption,
        Bill_Date: manualForm.readingDate,
        Due_Date: manualForm.dueDate,
        Billing_Month: manualForm.billingMonth,
        Date_Covered_From: manualForm.dateCovered || manualForm.readingDate,
        Date_Covered_To: manualForm.dateCovered || manualForm.readingDate,
        Environmental_Fee: Number(manualForm.meterFee || 0),
        Meter_Fee: Number(manualForm.meterFee || 0),
        Connection_Fee: Number(manualForm.connectionFee || 0),
        Previous_Balance: Number(manualForm.previousBalance || 0),
        Previous_Penalty: Number(manualForm.previousPenalty || 0),
        Penalty: manualBillSummary.penalty,
        Amount_Due: manualBillSummary.totalAmount,
        Total_Amount: manualBillSummary.totalAmount,
        Total_After_Due_Date: manualBillSummary.totalAfterDueDate,
        Status: manualForm.status,
      };

      if (manualForm.currentChargeOverride !== '') {
        billPayload.Current_Charge_Override = manualBillSummary.currentCharge;
      }

      await requestJson(
        editingBill ? `/bills/${editingBill.Bill_ID}` : '/bills',
        {
          method: editingBill ? 'PUT' : 'POST',
          body: JSON.stringify(billPayload),
        },
        'Failed to save manual bill.'
      );

      showToast(editingBill ? 'Bill updated successfully.' : 'Manual bill created successfully.', 'success');
      setIsManualEntryOpen(false);
      resetManualForm();
      loadBills();
    } catch (error) {
      console.error('Error saving manual bill:', error);
      showToast(getErrorMessage(error, 'Failed to save manual bill.'), 'error');
    } finally {
      setSavingManualBill(false);
    }
  };

  return (
    <MainLayout title="Bills Registry">
      <div className="generate-bills-page">
        <div className="page-intro" style={{ marginBottom: '10px' }}>
          <h3 style={{ color: '#1B1B63', fontSize: '18px', fontWeight: '800' }}>Generated Billing Records</h3>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>Review bills already generated by the system and monitor unpaid or overdue accounts.</p>
        </div>

        <div className="dashboard-cards" style={{ marginBottom: '20px' }}>
          <div className="card card-highlight-blue">
            <div className="card-header">
              <h2 className="card-title">Bills in View</h2>
              <i className="fas fa-file-invoice-dollar"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{totalBills}</div>
              <div className="card-label">Records matching the current filters</div>
            </div>
          </div>
          <div className="card card-highlight-green">
            <div className="card-header">
              <h2 className="card-title">Total Amount</h2>
              <i className="fas fa-wallet"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{formatCurrency(totalBilled)}</div>
              <div className="card-label">Combined billed amount</div>
            </div>
          </div>
          <div className="card card-highlight-gold">
            <div className="card-header">
              <h2 className="card-title">Unpaid Bills</h2>
              <i className="fas fa-hourglass-half"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{unpaidBills}</div>
              <div className="card-label">Still awaiting settlement</div>
            </div>
          </div>
          <div className="card card-highlight-red">
            <div className="card-header">
              <h2 className="card-title">Overdue Bills</h2>
              <i className="fas fa-exclamation-circle"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{overdueBills}</div>
              <div className="card-label">Require collection follow-up</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Bills Registry</h2>
          </div>
          <div className="card-body">
            <TableToolbar
              searchValue={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Search by account number or concessionaire name..."
              quickFilters={
                <>
                  <FormSelect label="" value={zoneFilter} onChange={setZoneFilter} options={zoneOptions} placeholder="All Map Zones" icon="fa-map-marker-alt" />
                  <FormSelect
                    label=""
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { value: 'Unpaid', label: 'Unpaid' },
                      { value: 'Partially Paid', label: 'Partially Paid' },
                      { value: 'Paid', label: 'Paid' },
                      { value: 'Overdue', label: 'Overdue' },
                    ]}
                    placeholder="All Bill Statuses"
                    icon="fa-filter"
                  />
                  <FormSelect
                    label=""
                    value={billingMonthFilter}
                    onChange={setBillingMonthFilter}
                    options={billingMonthOptions}
                    placeholder="All Billing Months"
                    icon="fa-calendar-alt"
                  />
                </>
              }
              actions={
                <>
                  <button className="btn btn-secondary" onClick={loadBills} title="Refresh Records">
                    <i className="fas fa-sync-alt"></i>
                  </button>
                  <button className="btn btn-primary" onClick={openManualEntry} title="Manual Bill Entry">
                    <i className="fas fa-plus-circle"></i> Manual Bill Entry
                  </button>
                </>
              }
              loading={loading}
              hasActiveFilters={hasActiveFilters}
              onClear={clearFilters}
            />
            <DataTable columns={columns} data={filteredBills} loading={loading} emptyMessage="No billing records found." />
          </div>
        </div>

        {selectedBill && (
          <Modal isOpen={Boolean(selectedBill)} title="Bill Details" onClose={() => setSelectedBill(null)} size="large" closeOnOverlayClick={true}>
            <div className="bill-preview">
              <div className="bill-info">
                <div className="bill-customer">
                  <p><strong>Account No.:</strong> {selectedBill.Account_Number}</p>
                  <p><strong>Name:</strong> {selectedBill.Consumer_Name}</p>
                  <p><strong>Address:</strong> {selectedBill.Address || 'N/A'}</p>
                  <p><strong>Classification:</strong> {selectedBill.Classification || 'N/A'}</p>
                </div>
                <div className="bill-details">
                  <p><strong>Bill No.:</strong> {selectedBill.Bill_ID}</p>
                  <p><strong>Billing Month:</strong> {selectedBill.Billing_Month || 'N/A'}</p>
                  <p><strong>Bill Date:</strong> {formatDate(selectedBill.Bill_Date)}</p>
                  <p><strong>Due Date:</strong> {formatDate(selectedBill.Due_Date)}</p>
                  <p><strong>Status:</strong> {selectedBill.Status}</p>
                </div>
              </div>
              <div className="bill-amount">
                <h3>Total Amount Due</h3>
                <h2>{formatCurrency(selectedBill.Total_Amount)}</h2>
              </div>
            </div>
          </Modal>
        )}

        <Modal
          isOpen={isManualEntryOpen}
          title={editingBill ? 'Edit Bill' : 'Manual Bill Entry'}
          onClose={() => {
            setIsManualEntryOpen(false);
            resetManualForm();
          }}
          size="large"
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => {
                setIsManualEntryOpen(false);
                resetManualForm();
              }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveManualBill} disabled={savingManualBill}>
                <i className="fas fa-save"></i> {savingManualBill ? 'Saving...' : editingBill ? 'Save Bill Changes' : 'Save Manual Bill'}
              </button>
            </>
          }
        >
          <div className="manual-bill-grid">
            <FormSelect
              label="Consumer"
              value={manualForm.consumerId}
              onChange={handleManualConsumerChange}
              options={consumerOptions}
              placeholder="Select Concessionaire account"
              required
              disabled={Boolean(editingBill)}
            />
            <FormInput
              label="Billing Month"
              value={manualForm.billingMonth}
              onChange={(value) => setManualForm({ ...manualForm, billingMonth: value })}
              placeholder="April 2026"
              required
            />
            <FormInput
              label="Reading Date"
              type="date"
              value={manualForm.readingDate}
              onChange={(value) => setManualForm({ ...manualForm, readingDate: value })}
              required
            />
            <FormInput
              label="Date Covered"
              type="date"
              value={manualForm.dateCovered}
              onChange={(value) => setManualForm({ ...manualForm, dateCovered: value })}
              required
            />
            <FormInput
              label="Due Date"
              type="date"
              value={manualForm.dueDate}
              onChange={(value) => setManualForm({ ...manualForm, dueDate: value })}
              required
            />
            <FormInput
              label="Disconnection Date"
              type="date"
              value={manualForm.disconnectionDate}
              onChange={(value) => setManualForm({ ...manualForm, disconnectionDate: value })}
            />
            <FormInput
              label="Previous Reading"
              type="number"
              value={manualForm.previousReading}
              onChange={(value) => setManualForm({ ...manualForm, previousReading: value, currentChargeOverride: '' })}
              placeholder="0"
            />
            <FormInput
              label="Current Reading"
              type="number"
              value={manualForm.currentReading}
              onChange={(value) => setManualForm({ ...manualForm, currentReading: value, currentChargeOverride: '' })}
              placeholder="0"
            />
            <FormInput
              label="Total Consumption"
              value={readingValues.hasPrevious && readingValues.hasCurrent && !readingValues.readingError ? String(readingValues.consumption) : ''}
              onChange={() => {}}
              placeholder="Auto-computed"
              disabled
            />
            <FormInput
              label="Excess"
              value={selectedManualRate && readingValues.hasPrevious && readingValues.hasCurrent && !readingValues.readingError ? String(Math.max(0, readingValues.consumption - Number(selectedManualRate.minimum_cubic || 0))) : ''}
              onChange={() => {}}
              placeholder="Auto-computed"
              disabled
            />
            <FormInput
              label="Class Cost"
              value={selectedManualConsumer?.Classification_Name || 'N/A'}
              onChange={() => {}}
              disabled
            />
            <FormInput
              label="Meter / Maintenance Fee"
              type="number"
              value={manualForm.meterFee}
              onChange={(value) => setManualForm({ ...manualForm, meterFee: value })}
              placeholder="0.00"
            />
            <FormInput
              label="Connection / Service Fee"
              type="number"
              value={manualForm.connectionFee}
              onChange={(value) => setManualForm({ ...manualForm, connectionFee: value })}
              placeholder="0.00"
            />
            <FormInput
              label="Previous Balance"
              type="number"
              value={manualForm.previousBalance}
              onChange={(value) => setManualForm({ ...manualForm, previousBalance: value })}
              placeholder="0.00"
            />
            <FormInput
              label="Previous Penalty"
              type="number"
              value={manualForm.previousPenalty}
              onChange={(value) => setManualForm({ ...manualForm, previousPenalty: value })}
              placeholder="0.00"
            />
            <FormInput
              label={`Late Penalty (${manualBillSummary.lateFeePercent}% auto if blank)`}
              type="number"
              value={manualForm.penalty}
              onChange={(value) => setManualForm({ ...manualForm, penalty: value })}
              placeholder="Optional manual override"
            />
            <FormInput
              label="Current Charge Override"
              type="number"
              value={manualForm.currentChargeOverride}
              onChange={(value) => setManualForm({ ...manualForm, currentChargeOverride: value })}
              placeholder="Use only for problem cases"
            />
            <FormSelect
              label="Bill Status"
              value={manualForm.status}
              onChange={(value) => setManualForm({ ...manualForm, status: value })}
              options={[
                { value: 'Unpaid', label: 'Unpaid' },
                { value: 'Partially Paid', label: 'Partially Paid' },
                { value: 'Paid', label: 'Paid' },
                { value: 'Overdue', label: 'Overdue' },
              ]}
            />
          </div>

          <div className="manual-bill-preview">
            <div>
              <h4>Selected Concessionaire</h4>
              <p><strong>Account:</strong> {selectedManualConsumer?.Account_Number || 'None selected'}</p>
              <p><strong>Name:</strong> {[selectedManualConsumer?.First_Name, selectedManualConsumer?.Middle_Name, selectedManualConsumer?.Last_Name].filter(Boolean).join(' ') || 'N/A'}</p>
              <p><strong>Address:</strong> {selectedManualConsumer?.Address || 'N/A'}</p>
              <p><strong>Classification:</strong> {selectedManualConsumer?.Classification_Name || 'N/A'}</p>
              <p><strong>Date Covered:</strong> {formatDate(manualForm.dateCovered)}</p>
              <p><strong>Latest Reading From DB:</strong> {selectedConsumerReading ? `${selectedConsumerReading.Previous_Reading ?? 0} -> ${selectedConsumerReading.Current_Reading ?? 0} (${formatDate(selectedConsumerReading.Reading_Date)})` : 'New Concessionaire: starts at 0'}</p>
              <p><strong>Outstanding Balance From DB:</strong> {formatCurrency(selectedConsumerOutstanding.previousBalance)}</p>
              <p><strong>Outstanding Penalty From DB:</strong> {formatCurrency(selectedConsumerOutstanding.previousPenalty)}</p>
            </div>
            <div>
              <h4>Bill Summary</h4>
              <p><strong>Consumption:</strong> {readingValues.hasPrevious && readingValues.hasCurrent && !readingValues.readingError ? `${readingValues.consumption} m3` : 'N/A'}</p>
              <p><strong>Excess:</strong> {selectedManualRate && readingValues.hasPrevious && readingValues.hasCurrent && !readingValues.readingError ? `${Math.max(0, readingValues.consumption - Number(selectedManualRate.minimum_cubic || 0))} m3` : 'N/A'}</p>
              <p><strong>Computed Charge:</strong> {formatCurrency(manualBillSummary.computedCurrentCharge)}</p>
              <p><strong>Applied Current Charge:</strong> {formatCurrency(manualBillSummary.currentCharge)}</p>
              {selectedManualRate && (
                <p><strong>Rate Basis:</strong> {selectedManualConsumer?.Classification_Name || selectedManualRate.classification_name || 'Selected classification'}: {Number(selectedManualRate.minimum_cubic || 0)} m3 minimum / {formatCurrency(Number(selectedManualRate.minimum_rate || 0))} + {formatCurrency(Number(selectedManualRate.excess_rate_per_cubic || 0))} per excess m3</p>
              )}
              <p><strong>Subtotal Before Penalty:</strong> {formatCurrency(manualBillSummary.subtotalBeforePenalty)}</p>
              <p><strong>Computed Late Penalty:</strong> {formatCurrency(manualBillSummary.computedPenalty)} ({manualBillSummary.lateFeePercent}%)</p>
              <p><strong>Penalty Status:</strong> {manualBillSummary.dueDatePassed ? 'Due date passed' : 'Not yet due'}</p>
              <p><strong>Applied Penalty:</strong> {formatCurrency(manualBillSummary.penalty)}</p>
              {readingValues.readingError && (
                <p className="manual-bill-warning">{readingValues.readingError}</p>
              )}
              <p><strong>Amount Due:</strong> {formatCurrency(manualBillSummary.totalAmount)}</p>
              <p><strong>Total After Due Date:</strong> {formatCurrency(manualBillSummary.totalAfterDueDate)}</p>
            </div>
          </div>
        </Modal>
      </div>
    </MainLayout>
  );
};

export default GenerateBills;



