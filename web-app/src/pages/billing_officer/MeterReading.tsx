import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import FormInput from '../../components/Common/FormInput';
import Modal from '../../components/Common/Modal';
import { useToast } from '../../components/Common/ToastContainer';
import { useAuth } from '../../context/AuthContext';
import {
  getErrorMessage,
  loadLedgerConsumersWithFallback,
  loadStaffUsersWithFallback,
  loadZonesWithFallback,
  requestJson,
} from '../../services/userManagementApi';
import './MeterReading.css';

interface Schedule {
  Schedule_ID?: number;
  Schedule_Date: string;
  Zone_ID: number;
  Zone_Name?: string;
  Meter_Reader_ID?: number | null;
  Meter_Reader_Name?: string | null;
  Meter_Reader_Contact?: string | null;
  Status?: string;
}

interface ZoneRow {
  Zone_ID: number;
  Zone_Name?: string;
}

interface ConsumerRow {
  Consumer_ID?: number;
  Consumer_Name?: string;
  Zone_ID: number;
  Zone_Name?: string;
  Barangay?: string | null;
  Status?: string;
}

interface MeterReader {
  AccountID: number;
  Username: string;
  Full_Name: string;
  Contact_Number?: string | null;
  Role_ID: number;
  Status?: string;
}

interface ZoneCoverage {
  zoneId: number;
  zoneName: string;
  consumerCount: number;
  barangays: string[];
  splitBarangays: string[];
}

interface ZoneCoverageConfigRow {
  Config_ID: number;
  Zone_ID: number;
  Zone_Name?: string | null;
  Barangay: string;
  Purok_Count: number;
  Is_Split: boolean;
}

interface BarangayStructureRow {
  barangay: string;
  zoneIds: number[];
  zoneLabels: string[];
  configuredCount: number;
  hasSplit: boolean;
}

interface CoverageStructureListRow {
  key: string;
  barangay: string;
  zoneIds: number[];
  zoneLabels: string[];
  configuredCount: number;
  hasSplit: boolean;
  rules: ZoneCoverageConfigRow[];
}

const DEFAULT_BARANGAY_ZONE_STRUCTURE: Array<{ barangay: string; zoneIds: number[] }> = [
  { barangay: 'Daculang Bolo', zoneIds: [1, 2] },
  { barangay: 'Dagotdotan', zoneIds: [2, 3, 4] },
  { barangay: 'Laniton', zoneIds: [3] },
  { barangay: 'Langga', zoneIds: [4] },
  { barangay: 'Maisog', zoneIds: [5] },
  { barangay: 'Mampurog', zoneIds: [4, 5, 6, 7] },
  { barangay: 'Matacong', zoneIds: [8, 9, 10] },
  { barangay: 'San Isidro', zoneIds: [11] },
  { barangay: 'San Ramon', zoneIds: [12] },
];

const PHONE_PATTERN = /^(09\d{9}|639\d{9}|\+639\d{9})$/;

const formatZoneLabel = (zoneName?: string, zoneId?: number | string | null) =>
  zoneName || (zoneId ? `Zone ${zoneId}` : 'Not Assigned');

const normalizeStatus = (value?: string | null) => String(value || '').trim().toLowerCase();
const normalizeBarangayName = (value?: string | null) => String(value || '').trim().replace(/\s+/g, ' ');

const normalizePhoneInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const hasLeadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasLeadingPlus ? `+${digits}` : digits;
};

const formatDateDisplay = (dateStr: string) => {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const isScheduledStatus = (status?: string | null) => normalizeStatus(status) !== 'cancelled';
const HOLIDAYS_MM_DD = new Set([
  '01-01', // New Year
  '04-09', // Araw ng Kagitingan
  '05-01', // Labor Day
  '06-12', // Independence Day
  '08-21', // Ninoy Aquino Day
  '08-26', // National Heroes Day (observed placeholder)
  '11-01', // All Saints' Day
  '11-30', // Bonifacio Day
  '12-08', // Immaculate Conception
  '12-25', // Christmas Day
  '12-30', // Rizal Day
  '12-31', // New Year's Eve
]);

const scheduleStatusClassName = (status?: string) => {
  const normalizedStatus = normalizeStatus(status || 'Scheduled');
  if (normalizedStatus === 'cancelled') {
    return 'status-cancelled';
  }
  return 'status-scheduled';
};
const getInitials = (name?: string | null) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'MR';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
};

const MeterReading: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canManageZoneCoverage = user?.role_id === 1;
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [consumers, setConsumers] = useState<ConsumerRow[]>([]);
  const [meterReaders, setMeterReaders] = useState<MeterReader[]>([]);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>([]);
  const [newAssignmentReaderId, setNewAssignmentReaderId] = useState('');
  const [selectedReaderId, setSelectedReaderId] = useState('');
  const [draftAssignments, setDraftAssignments] = useState<Record<number, string>>({});
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [isAddReaderModalOpen, setIsAddReaderModalOpen] = useState(false);
  const [addReaderSaving, setAddReaderSaving] = useState(false);
  const [coverageConfig, setCoverageConfig] = useState<ZoneCoverageConfigRow[]>([]);
  const [isCoverageConfigModalOpen, setIsCoverageConfigModalOpen] = useState(false);
  const [coverageConfigSaving, setCoverageConfigSaving] = useState(false);
  const [selectedCoverageStructureKey, setSelectedCoverageStructureKey] = useState('');
  const [coverageConfigForm, setCoverageConfigForm] = useState({
    zoneId: '',
    barangay: '',
    purokCount: '0',
    isSplit: false,
  });
  const [readerFormData, setReaderFormData] = useState({
    username: '',
    fullName: '',
    contactNumber: '',
    password: '',
  });

  const toggleReaderSelection = (readerId: string) => {
    setSelectedReaderId((current) => {
      const next = current === readerId ? '' : readerId;
      setNewAssignmentReaderId(next);
      return next;
    });
  };

  const loadSchedules = useCallback(async () => {
    try {
      const response = await requestJson<Schedule[] | { data?: Schedule[] }>('/reading-schedules');
      const rows = Array.isArray(response) ? response : response?.data || [];
      setSchedules(rows);
      return rows;
    } catch (error) {
      console.error('Error loading schedules:', error);
      showToast(getErrorMessage(error, 'Failed to load schedules.'), 'error');
      return [];
    }
  }, [showToast]);

  const loadZones = useCallback(async () => {
    try {
      const result = await loadZonesWithFallback();
      const mappedZones = (result.data || []).map((zone: any) => ({
        Zone_ID: zone.Zone_ID ?? zone.zone_id,
        Zone_Name: zone.Zone_Name ?? zone.zone_name,
      }));
      setZones(mappedZones);
      if (result.source === 'supabase') {
        showToast('Zones loaded using Supabase fallback.', 'warning');
      }
    } catch (error) {
      console.error('Error loading zones:', error);
      showToast(getErrorMessage(error, 'Failed to load zones.'), 'error');
    }
  }, [showToast]);

  const loadConsumers = useCallback(async () => {
    try {
      const result = await loadLedgerConsumersWithFallback();
      const mappedConsumers = (result.data || []).map((Consumer: any) => ({
        Consumer_ID: Consumer.Consumer_ID ?? Consumer.consumer_id,
        Consumer_Name: Consumer.Consumer_Name ?? Consumer.consumer_name ?? null,
        Zone_ID: Number(Consumer.Zone_ID ?? Consumer.zone_id ?? 0),
        Zone_Name: Consumer.Zone_Name ?? Consumer.zone_name ?? null,
        Barangay: Consumer.Barangay ?? Consumer.barangay ?? null,
        Status: Consumer.Status ?? Consumer.status ?? null,
      }));
      setConsumers(mappedConsumers.filter((Consumer: ConsumerRow) => Consumer.Zone_ID > 0));
      if (result.source === 'supabase') {
        showToast('Consumers loaded using Supabase fallback.', 'warning');
      }
    } catch (error) {
      console.error('Error loading consumers:', error);
      showToast(getErrorMessage(error, 'Failed to load Consumer coverage.'), 'error');
    }
  }, [showToast]);

  const loadMeterReaders = useCallback(async () => {
    try {
      const result = await loadStaffUsersWithFallback();
      const readers = (result.data || [])
        .map((reader: any) => ({
          AccountID: Number(reader.AccountID ?? reader.account_id ?? 0),
          Username: reader.Username ?? reader.username ?? '',
          Full_Name: reader.Full_Name ?? reader.full_name ?? reader.Username ?? reader.username ?? 'Unnamed Reader',
          Contact_Number: reader.Contact_Number ?? reader.contact_number ?? null,
          Role_ID: Number(reader.Role_ID ?? reader.role_id ?? 0),
          Status: reader.Status ?? reader.status ?? 'Active',
        }))
        .filter((reader: MeterReader) => reader.Role_ID === 3);
      setMeterReaders(readers);
      if (result.source === 'supabase') {
        showToast('Meter readers loaded using Supabase fallback.', 'warning');
      }
    } catch (error) {
      console.error('Error loading meter readers:', error);
      showToast(getErrorMessage(error, 'Failed to load meter readers.'), 'error');
    }
  }, [showToast]);

  const loadCoverageConfig = useCallback(async () => {
    try {
      const response = await requestJson<{ success?: boolean; data?: any[] }>('/zone-coverage-config');
      const rows = (response?.data || []).map((row: any) => ({
        Config_ID: Number(row.Config_ID ?? row.config_id ?? 0),
        Zone_ID: Number(row.Zone_ID ?? row.zone_id ?? 0),
        Zone_Name: row.Zone_Name ?? row.zone_name ?? null,
        Barangay: String(row.Barangay ?? row.barangay ?? '').trim(),
        Purok_Count: Number(row.Purok_Count ?? row.purok_count ?? 0),
        Is_Split: Boolean(row.Is_Split ?? row.is_split),
      })).filter((row: ZoneCoverageConfigRow) => row.Config_ID > 0 && row.Zone_ID > 0 && row.Barangay);
      setCoverageConfig(rows);
    } catch (error) {
      console.error('Error loading zone coverage config:', error);
      showToast(getErrorMessage(error, 'Failed to load zone coverage configuration.'), 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadSchedules();
    loadZones();
    loadConsumers();
    loadMeterReaders();
    loadCoverageConfig();
  }, [loadConsumers, loadCoverageConfig, loadMeterReaders, loadSchedules, loadZones]);

  const zoneLookup = useMemo(
    () => new Map(zones.map((zone) => [zone.Zone_ID, formatZoneLabel(zone.Zone_Name, zone.Zone_ID)])),
    [zones]
  );

  const zoneCoverageData = useMemo(() => {
    const zoneBarangayMap = new Map<number, Map<string, { display: string; isSplit: boolean }>>();
    const zoneConsumerCountMap = new Map<number, number>();
    const barangayZoneMap = new Map<string, Set<number>>();
    const splitOverrideSet = new Set<string>();

    zones.forEach((zone) => {
      zoneBarangayMap.set(zone.Zone_ID, new Map<string, { display: string; isSplit: boolean }>());
      zoneConsumerCountMap.set(zone.Zone_ID, 0);
    });

    consumers.forEach((Consumer) => {
      const zoneId = Number(Consumer.Zone_ID || 0);
      if (!zoneId) return;
      zoneConsumerCountMap.set(zoneId, (zoneConsumerCountMap.get(zoneId) || 0) + 1);
    });

    coverageConfig.forEach((entry) => {
      const zoneId = Number(entry.Zone_ID || 0);
      const barangay = normalizeBarangayName(entry.Barangay);
      if (!zoneId || !barangay) return;
      if (!zoneBarangayMap.has(zoneId)) {
        zoneBarangayMap.set(zoneId, new Map<string, { display: string; isSplit: boolean }>());
      }
      const formattedBarangay = entry.Purok_Count > 0 ? `${barangay} (${entry.Purok_Count} puroks)` : barangay;
      const zoneBarangays = zoneBarangayMap.get(zoneId)!;
      const existing = zoneBarangays.get(barangay);
      zoneBarangays.set(barangay, {
        display: formattedBarangay,
        isSplit: Boolean(entry.Is_Split) || Boolean(existing?.isSplit),
      });
      if (!barangayZoneMap.has(barangay)) {
        barangayZoneMap.set(barangay, new Set<number>());
      }
      barangayZoneMap.get(barangay)?.add(zoneId);
      if (entry.Is_Split) {
        splitOverrideSet.add(barangay);
      }
    });

    const sharedBarangayMap = new Map<string, number[]>();
    const allBarangays = new Set<string>([
      ...Array.from(barangayZoneMap.keys()),
      ...Array.from(splitOverrideSet.values()),
    ]);
    allBarangays.forEach((barangay) => {
      const zoneIds = Array.from(barangayZoneMap.get(barangay) || []).sort((left, right) => left - right);
      if (zoneIds.length > 1 || splitOverrideSet.has(barangay)) {
        sharedBarangayMap.set(barangay, zoneIds);
      }
    });

    const coverageByZone = new Map<number, ZoneCoverage>();
    zones.forEach((zone) => {
      const zoneId = zone.Zone_ID;
      const rawBarangays = Array.from(zoneBarangayMap.get(zoneId)?.entries() || []).sort(([left], [right]) => left.localeCompare(right));
      const barangays = rawBarangays.map(([, entry]) => entry.display);
      const splitBarangays = rawBarangays
        .filter(([barangay, entry]) => entry.isSplit || (sharedBarangayMap.get(barangay) || []).length > 1)
        .map(([, entry]) => entry.display);
      coverageByZone.set(zoneId, {
        zoneId,
        zoneName: formatZoneLabel(zone.Zone_Name, zone.Zone_ID),
        consumerCount: zoneConsumerCountMap.get(zoneId) || 0,
        barangays,
        splitBarangays,
      });
    });

    return { coverageByZone, sharedBarangayMap };
  }, [consumers, coverageConfig, zones]);

  const barangayStructureMap = useMemo(() => {
    const map = new Map<string, Set<number>>();
    const displayMap = new Map<string, string>();
    const addPair = (barangayRaw?: string | null, zoneIdRaw?: number | string | null) => {
      const barangay = normalizeBarangayName(barangayRaw);
      const zoneId = Number(zoneIdRaw || 0);
      if (!barangay || !zoneId) return;
      const key = barangay.toLowerCase();
      if (!displayMap.has(key)) {
        displayMap.set(key, barangay);
      }
      if (!map.has(key)) {
        map.set(key, new Set<number>());
      }
      map.get(key)!.add(zoneId);
    };

    DEFAULT_BARANGAY_ZONE_STRUCTURE.forEach((entry) => {
      entry.zoneIds.forEach((zoneId) => addPair(entry.barangay, zoneId));
    });

    coverageConfig.forEach((entry) => addPair(entry.Barangay, entry.Zone_ID));
    consumers.forEach((Consumer) => addPair(Consumer.Barangay, Consumer.Zone_ID));

    return { zoneMap: map, displayMap };
  }, [consumers, coverageConfig]);

  const coverageAssignmentsByBarangay = useMemo(() => {
    const assignmentMap = new Map<string, { zones: Set<number>; hasSplit: boolean; configuredCount: number }>();
    coverageConfig.forEach((entry) => {
      const barangay = normalizeBarangayName(entry.Barangay).toLowerCase();
      const zoneId = Number(entry.Zone_ID || 0);
      if (!barangay || !zoneId) return;
      if (!assignmentMap.has(barangay)) {
        assignmentMap.set(barangay, { zones: new Set<number>(), hasSplit: false, configuredCount: 0 });
      }
      const record = assignmentMap.get(barangay)!;
      record.zones.add(zoneId);
      record.hasSplit = record.hasSplit || Boolean(entry.Is_Split);
      record.configuredCount += 1;
    });
    return assignmentMap;
  }, [coverageConfig]);

  const coverageBarangaysByZone = useMemo(() => {
    const map = new Map<number, string[]>();
    barangayStructureMap.zoneMap.forEach((zoneSet, barangayKey) => {
      const barangayName = barangayStructureMap.displayMap.get(barangayKey) || barangayKey;
      zoneSet.forEach((zoneId) => {
        if (!map.has(zoneId)) {
          map.set(zoneId, []);
        }
        const list = map.get(zoneId)!;
        if (!list.some((value) => value.toLowerCase() === barangayName.toLowerCase())) {
          list.push(barangayName);
        }
      });
    });

    map.forEach((rows, zoneId) => {
      map.set(zoneId, rows.sort((left, right) => left.localeCompare(right)));
    });
    return map;
  }, [barangayStructureMap]);

  const barangayStructureRows = useMemo<BarangayStructureRow[]>(() => {
    const rows: BarangayStructureRow[] = [];
    barangayStructureMap.zoneMap.forEach((zoneSet, barangayKey) => {
      const normalizedName = barangayStructureMap.displayMap.get(barangayKey) || barangayKey;
      const assignment = coverageAssignmentsByBarangay.get(barangayKey);
      const zoneIds = Array.from(zoneSet).sort((left, right) => left - right);
      rows.push({
        barangay: normalizedName,
        zoneIds,
        zoneLabels: zoneIds.map((zoneId) => formatZoneLabel(zoneLookup.get(zoneId), zoneId)),
        configuredCount: assignment?.configuredCount || 0,
        hasSplit: Boolean(assignment?.hasSplit) || zoneIds.length > 1,
      });
    });

    return rows.sort((left, right) => left.barangay.localeCompare(right.barangay));
  }, [barangayStructureMap, coverageAssignmentsByBarangay, zoneLookup]);

  const coverageStructureRows = useMemo<CoverageStructureListRow[]>(() => {
    const rows = barangayStructureRows.map((row) => {
      const key = normalizeBarangayName(row.barangay).toLowerCase();
      const rules = coverageConfig
        .filter((entry) => normalizeBarangayName(entry.Barangay).toLowerCase() === key)
        .sort((left, right) => Number(left.Zone_ID || 0) - Number(right.Zone_ID || 0));
      return {
        key,
        barangay: row.barangay,
        zoneIds: row.zoneIds,
        zoneLabels: row.zoneLabels,
        configuredCount: row.configuredCount,
        hasSplit: row.hasSplit,
        rules,
      };
    });
    return rows;
  }, [barangayStructureRows, coverageConfig]);

  useEffect(() => {
    if (!coverageStructureRows.length) {
      setSelectedCoverageStructureKey('');
      return;
    }
    if (!selectedCoverageStructureKey || !coverageStructureRows.some((row) => row.key === selectedCoverageStructureKey)) {
      setSelectedCoverageStructureKey(coverageStructureRows[0].key);
    }
  }, [coverageStructureRows, selectedCoverageStructureKey]);

  const selectedCoverageStructure = useMemo(
    () => coverageStructureRows.find((row) => row.key === selectedCoverageStructureKey) || null,
    [coverageStructureRows, selectedCoverageStructureKey]
  );

  const selectedCoverageZoneId = Number(coverageConfigForm.zoneId || 0);

  const coverageBarangayOptions = useMemo(() => {
    const zoneBarangays = coverageBarangaysByZone.get(selectedCoverageZoneId) || [];

    return zoneBarangays.map((barangay) => {
      const key = normalizeBarangayName(barangay).toLowerCase();
      const assignment = coverageAssignmentsByBarangay.get(key);
      const assignedZoneIds = Array.from(assignment?.zones || []).sort((left, right) => left - right);
      const hasSplit = Boolean(assignment?.hasSplit);
      const assignedInCurrentZone = assignedZoneIds.includes(selectedCoverageZoneId);
      const sharedCount = assignedZoneIds.length;
      let hint = '';
      if (assignedInCurrentZone && sharedCount > 1) {
        hint = `Shared in ${sharedCount} zones`;
      } else if (assignedInCurrentZone) {
        hint = hasSplit ? 'Split-enabled' : 'Configured';
      } else if (sharedCount > 0) {
        hint = `Also in ${assignedZoneIds.map((zoneId) => formatZoneLabel(zoneLookup.get(zoneId), zoneId)).join(', ')}`;
      }

      return {
        value: barangay,
        assignedZoneIds,
        hasSplit,
        assignedInCurrentZone,
        zoneCount: sharedCount,
        label: hint ? `${barangay} (${hint})` : barangay,
      };
    });
  }, [coverageAssignmentsByBarangay, coverageBarangaysByZone, selectedCoverageZoneId, zoneLookup]);

  useEffect(() => {
    if (!coverageConfigForm.barangay) {
      return;
    }
    const selectedOption = coverageBarangayOptions.find(
      (option) => normalizeBarangayName(option.value).toLowerCase() === normalizeBarangayName(coverageConfigForm.barangay).toLowerCase()
    );
    if (!selectedOption) {
      setCoverageConfigForm((current) => ({ ...current, barangay: '' }));
    }
  }, [coverageBarangayOptions, coverageConfigForm.barangay]);

  const handleSaveCoverageConfig = async () => {
    const zoneId = Number(coverageConfigForm.zoneId || 0);
    const barangay = normalizeBarangayName(coverageConfigForm.barangay);
    const purokCount = Number(coverageConfigForm.purokCount || 0);
    if (!zoneId) {
      showToast('Select a zone first.', 'error');
      return;
    }
    if (!barangay) {
      showToast('Select a barangay.', 'error');
      return;
    }
    if (!Number.isInteger(purokCount) || purokCount < 0) {
      showToast('Purok count must be a non-negative whole number.', 'error');
      return;
    }
    const selectedOption = coverageBarangayOptions.find(
      (option) => normalizeBarangayName(option.value).toLowerCase() === barangay.toLowerCase()
    );
    if (!selectedOption) {
      showToast('Select a valid barangay from the selected zone.', 'error');
      return;
    }
    const existingZoneIdsForBarangay = new Set(
      coverageConfig
        .filter((entry) => normalizeBarangayName(entry.Barangay).toLowerCase() === barangay.toLowerCase())
        .map((entry) => Number(entry.Zone_ID || 0))
        .filter((value) => value > 0)
    );
    existingZoneIdsForBarangay.add(zoneId);
    const shouldMarkSplit = coverageConfigForm.isSplit || existingZoneIdsForBarangay.size > 1;
    setCoverageConfigSaving(true);
    try {
      await requestJson('/zone-coverage-config', {
        method: 'POST',
        body: JSON.stringify({
          zone_id: zoneId,
          barangay,
          purok_count: purokCount,
          is_split: shouldMarkSplit,
        }),
      });
      setCoverageConfigForm({ zoneId: '', barangay: '', purokCount: '0', isSplit: false });
      await loadCoverageConfig();
      showToast('Coverage rule saved.', 'success');
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to save coverage rule.'), 'error');
    } finally {
      setCoverageConfigSaving(false);
    }
  };

  const handleDeleteCoverageConfig = async (configId: number) => {
    if (!window.confirm('Delete this coverage rule?')) return;
    try {
      await requestJson(`/zone-coverage-config/${configId}`, { method: 'DELETE' });
      await loadCoverageConfig();
      showToast('Coverage rule deleted.', 'success');
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to delete coverage rule.'), 'error');
    }
  };

  const handleEditCoverageConfig = (entry: ZoneCoverageConfigRow) => {
    setCoverageConfigForm({
      zoneId: String(entry.Zone_ID || ''),
      barangay: String(entry.Barangay || ''),
      purokCount: String(entry.Purok_Count || 0),
      isSplit: Boolean(entry.Is_Split),
    });
  };

  const activeMeterReaders = useMemo(
    () => meterReaders.filter((reader) => normalizeStatus(reader.Status) === 'active'),
    [meterReaders]
  );

  const getSchedulesForDate = useCallback((dateKey: string, rows: Schedule[] = schedules) => (
    rows.filter((schedule) => schedule.Schedule_Date === dateKey)
  ), [schedules]);

  const isMonthFullyAssigned = useCallback((dateKey: string, rows: Schedule[] = schedules) => {
    const targetDate = new Date(`${dateKey}T00:00:00`);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();

    const assignedZoneIds = new Set<number>();
    rows.forEach((schedule) => {
      if (!isScheduledStatus(schedule.Status)) return;
      const scheduleDate = new Date(`${schedule.Schedule_Date}T00:00:00`);
      if (scheduleDate.getFullYear() === year && scheduleDate.getMonth() === month) {
        assignedZoneIds.add(schedule.Zone_ID);
      }
    });

    const zoneIds = zones.map((zone) => zone.Zone_ID).filter((zoneId) => zoneId > 0);
    if (zoneIds.length === 0) return false;
    return zoneIds.every((zoneId) => assignedZoneIds.has(zoneId));
  }, [schedules, zones]);

  const syncModalStateForDate = useCallback((dateKey: string, rows: Schedule[]) => {
    const dateSchedules = rows.filter((schedule) => schedule.Schedule_Date === dateKey);
    const activeDateSchedules = dateSchedules.filter((schedule) => isScheduledStatus(schedule.Status));
    const zoneIds = Array.from(new Set(activeDateSchedules.map((schedule) => String(schedule.Zone_ID))));
    const nextDraftAssignments = activeDateSchedules.reduce<Record<number, string>>((accumulator, schedule) => {
      accumulator[schedule.Zone_ID] = schedule.Meter_Reader_ID ? String(schedule.Meter_Reader_ID) : '';
      return accumulator;
    }, {});

    setSelectedDate(dateKey);
    setSelectedZoneIds(zoneIds);
    setDraftAssignments(nextDraftAssignments);
  }, []);

  const openDateModal = useCallback((dateKey: string) => {
    const hasSchedulesForDate = getSchedulesForDate(dateKey).length > 0;
    if (!hasSchedulesForDate && isMonthFullyAssigned(dateKey)) {
      showToast('All zones are already assigned for reading this month.', 'warning');
      return;
    }
    syncModalStateForDate(dateKey, schedules);
    setIsScheduleModalOpen(true);
  }, [getSchedulesForDate, isMonthFullyAssigned, schedules, showToast, syncModalStateForDate]);

  const closeScheduleModal = () => {
    if (assignmentSaving) {
      return;
    }
    setIsScheduleModalOpen(false);
    setSelectedDate(null);
    setSelectedZoneIds([]);
    setNewAssignmentReaderId('');
    setSelectedReaderId('');
    setDraftAssignments({});
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((value) => value - 1);
      return;
    }
    setCurrentMonth((value) => value - 1);
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((value) => value + 1);
      return;
    }
    setCurrentMonth((value) => value + 1);
  };

  const currentSchedules = useMemo(
    () => (selectedDate ? getSchedulesForDate(selectedDate) : []),
    [getSchedulesForDate, selectedDate]
  );

  const activeCurrentSchedules = useMemo(
    () => currentSchedules.filter((schedule) => isScheduledStatus(schedule.Status)),
    [currentSchedules]
  );

  const validationState = useMemo(() => {
    const selectedZoneSet = new Set(selectedZoneIds.map((zoneId) => Number(zoneId)));
    const effectiveAssignments = new Map<number, string>();

    activeCurrentSchedules.forEach((schedule) => {
      if (!selectedZoneSet.has(schedule.Zone_ID)) {
        effectiveAssignments.set(schedule.Zone_ID, schedule.Meter_Reader_ID ? String(schedule.Meter_Reader_ID) : '');
      }
    });

    selectedZoneIds.forEach((zoneId) => {
      effectiveAssignments.set(Number(zoneId), draftAssignments[Number(zoneId)] || '');
    });

    const conflicts: string[] = [];

    zoneCoverageData.sharedBarangayMap.forEach((zoneIds, barangay) => {
      const relevantZoneIds = zoneIds.filter((zoneId) => effectiveAssignments.has(zoneId));
      if (relevantZoneIds.length < 2) {
        return;
      }

      const assignedReaderIds = Array.from(
        new Set(
          relevantZoneIds
            .map((zoneId) => effectiveAssignments.get(zoneId) || '')
            .filter(Boolean)
        )
      );

      if (assignedReaderIds.length > 1) {
        const readerLabels = assignedReaderIds.map((readerId) => {
          const reader = activeMeterReaders.find((entry) => String(entry.AccountID) === readerId);
          return reader?.Full_Name || `Reader #${readerId}`;
        });
        conflicts.push(
          `${barangay} spans ${relevantZoneIds.map((zoneId) => formatZoneLabel(zoneLookup.get(zoneId), zoneId)).join(', ')} and is currently split across ${readerLabels.join(', ')}.`
        );
      }
    });

    return { conflicts };
  }, [activeCurrentSchedules, activeMeterReaders, draftAssignments, selectedZoneIds, zoneCoverageData.sharedBarangayMap, zoneLookup]);

  const handleSaveAssignments = async () => {
    if (!selectedDate) {
      showToast('Select a schedule date first.', 'error');
      return;
    }
    if (selectedZoneIds.length === 0) {
      showToast('Select at least one zone to schedule.', 'error');
      return;
    }
    if (validationState.conflicts.length > 0) {
      showToast('Resolve the split-barangay conflicts before saving assignments.', 'error');
      return;
    }

    const assignments = selectedZoneIds.map((zoneId) => ({
      zone_id: Number(zoneId),
      meter_reader_id: draftAssignments[Number(zoneId)] ? Number(draftAssignments[Number(zoneId)]) : null,
      status: 'Scheduled',
    }));

    if (assignments.some((assignment) => !assignment.meter_reader_id)) {
      showToast('Assign a meter reader to every selected zone before saving.', 'error');
      return;
    }

    setAssignmentSaving(true);
    try {
      await requestJson('/reading-schedules/bulk-upsert', {
        method: 'POST',
        body: JSON.stringify({
          schedule_date: selectedDate,
          assignments,
        }),
      });
      showToast('Assignments saved successfully.', 'success');
      const refreshedSchedules = await loadSchedules();
      syncModalStateForDate(selectedDate, refreshedSchedules);
    } catch (error) {
      console.error('Error saving assignments:', error);
      showToast(getErrorMessage(error, 'Failed to save assignments.'), 'error');
    } finally {
      setAssignmentSaving(false);
    }
  };

  const handleEditSchedule = (schedule: Schedule) => {
    const zoneId = String(schedule.Zone_ID);
    const readerId = String(schedule.Meter_Reader_ID || '');
    setSelectedZoneIds((current) => (current.includes(zoneId) ? current : [...current, zoneId]));
    if (readerId) {
      setDraftAssignments((current) => ({
        ...current,
        [Number(zoneId)]: readerId,
      }));
    }
  };

  const handleDeleteSchedule = async (scheduleId: number) => {
    if (!window.confirm('Delete this assignment permanently?')) {
      return;
    }

    const targetSchedule = currentSchedules.find((schedule) => schedule.Schedule_ID === scheduleId);
    const targetZoneLabel = targetSchedule
      ? formatZoneLabel(targetSchedule.Zone_Name, targetSchedule.Zone_ID)
      : 'the selected zone';

    setAssignmentSaving(true);
    try {
      await requestJson(`/reading-schedules/${scheduleId}`, { method: 'DELETE' });
      showToast(`Assignment removed for ${targetZoneLabel}.`, 'success');
      const refreshedSchedules = await loadSchedules();
      if (selectedDate) {
        syncModalStateForDate(selectedDate, refreshedSchedules);
      }
    } catch (error) {
      console.error('Error deleting schedule:', error);
      showToast(getErrorMessage(error, `Failed to remove assignment for ${targetZoneLabel}.`), 'error');
    } finally {
      setAssignmentSaving(false);
    }
  };

  const handleCancelSchedule = async (scheduleId: number) => {
    if (!window.confirm('Cancel this assignment?')) {
      return;
    }

    const targetSchedule = currentSchedules.find((schedule) => schedule.Schedule_ID === scheduleId);
    const targetZoneLabel = targetSchedule
      ? formatZoneLabel(targetSchedule.Zone_Name, targetSchedule.Zone_ID)
      : 'the selected zone';

    setAssignmentSaving(true);
    try {
      await requestJson(`/reading-schedules/${scheduleId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'Cancelled' }),
      });
      showToast(`Assignment cancelled for ${targetZoneLabel}.`, 'success');
      const refreshedSchedules = await loadSchedules();
      if (selectedDate) {
        syncModalStateForDate(selectedDate, refreshedSchedules);
      }
    } catch (error) {
      console.error('Error cancelling schedule:', error);
      showToast(getErrorMessage(error, `Failed to cancel assignment for ${targetZoneLabel}.`), 'error');
    } finally {
      setAssignmentSaving(false);
    }
  };

  const handleCancelAllSchedules = async () => {
    const activeSchedules = activeCurrentSchedules.filter((schedule) => schedule.Schedule_ID);
    if (activeSchedules.length === 0) {
      showToast('There are no active assignments to cancel for this date.', 'warning');
      return;
    }
    if (!window.confirm('Cancel all active assignments for this date?')) {
      return;
    }

    setAssignmentSaving(true);
    try {
      await Promise.all(activeSchedules.map((schedule) =>
        requestJson(`/reading-schedules/${schedule.Schedule_ID}/status`, {
          method: 'PUT',
          body: JSON.stringify({ status: 'Cancelled' }),
        })
      ));
      showToast(`${activeSchedules.length} assignment${activeSchedules.length === 1 ? '' : 's'} cancelled for this date.`, 'success');
      const refreshedSchedules = await loadSchedules();
      if (selectedDate) {
        syncModalStateForDate(selectedDate, refreshedSchedules);
      }
    } catch (error) {
      console.error('Error cancelling all schedules:', error);
      showToast(getErrorMessage(error, 'Failed to cancel one or more assignments.'), 'error');
    } finally {
      setAssignmentSaving(false);
    }
  };

  const handleCreateMeterReader = async () => {
    const normalizedPhone = normalizePhoneInput(readerFormData.contactNumber);
    if (!readerFormData.username.trim() || !readerFormData.fullName.trim() || !readerFormData.password.trim()) {
      showToast('Username, full name, and password are required.', 'error');
      return;
    }
    if (normalizedPhone && !PHONE_PATTERN.test(normalizedPhone)) {
      showToast('Contact number must be a valid Philippine mobile number.', 'error');
      return;
    }

    setAddReaderSaving(true);
    try {
      const result = await requestJson<{ success: boolean; data?: { account_id?: number; accountId?: number } }>('/users', {
        method: 'POST',
        body: JSON.stringify({
          username: readerFormData.username.trim(),
          fullName: readerFormData.fullName.trim(),
          contactNumber: normalizedPhone,
          password: readerFormData.password,
          roleId: 3,
        }),
      });

      showToast(result?.success ? 'Meter reader added successfully.' : 'Meter reader saved.', 'success');
      setReaderFormData({
        username: '',
        fullName: '',
        contactNumber: '',
        password: '',
      });
      setIsAddReaderModalOpen(false);
      await loadMeterReaders();
    } catch (error) {
      console.error('Error adding meter reader:', error);
      showToast(getErrorMessage(error, 'Failed to add meter reader.'), 'error');
    } finally {
      setAddReaderSaving(false);
    }
  };

  const formatDateKey = (year: number, month: number, day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const renderCalendar = () => {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
    const today = formatDateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const dayCells: React.ReactNode[] = [];
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const buildDayCell = (year: number, month: number, day: number, isOutsideMonth: boolean) => {
      const weekday = new Date(year, month, day).getDay();
      const isSaturday = weekday === 6;
      const isSunday = weekday === 0;
      const dateKey = formatDateKey(year, month, day);
      const mmdd = `${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isHoliday = HOLIDAYS_MM_DD.has(mmdd);
      const daySchedules = getSchedulesForDate(dateKey);
      const activeDaySchedules = daySchedules.filter((schedule) => isScheduledStatus(schedule.Status));
      const scheduledReaderCount = new Set(
        activeDaySchedules
          .map((schedule) => String(schedule.Meter_Reader_ID || ''))
          .filter(Boolean)
      ).size;
      const isSelected = selectedDate === dateKey && isScheduleModalOpen;
      const isToday = dateKey === today;
      const hasScheduledAssignments = activeDaySchedules.length > 0;
      const hasCancelledAssignments = !hasScheduledAssignments && daySchedules.length > 0;

      const classes = [
        'day',
        hasScheduledAssignments ? 'scheduled' : '',
        hasCancelledAssignments ? 'cancelled' : '',
        isSelected ? 'selected' : '',
        isToday ? 'today' : '',
        isSaturday ? 'weekend-sat' : '',
        isSunday ? 'weekend-sun' : '',
        isHoliday ? 'holiday' : '',
        isOutsideMonth ? 'outside-month' : '',
      ].filter(Boolean).join(' ');

      return (
        <button
          key={`${dateKey}-${isOutsideMonth ? 'outside' : 'current'}`}
          type="button"
          className={classes}
          onClick={() => openDateModal(dateKey)}
          aria-pressed={isSelected}
          aria-label={`${formatDateDisplay(dateKey)} (${weekDays[weekday]})${isHoliday ? ', Holiday' : ''}${daySchedules.length ? `, ${daySchedules.length} total assignment${daySchedules.length > 1 ? 's' : ''}` : ''}`}
        >
          <span className="day-number">{day}</span>
          {daySchedules.length > 0 && (
            <div className="day-info">
              <span className="day-zone">{daySchedules.length} assignment{daySchedules.length > 1 ? 's' : ''}</span>
              <span className="day-reader">
                {hasScheduledAssignments
                  ? `${scheduledReaderCount || 0} reader${scheduledReaderCount === 1 ? '' : 's'}`
                  : 'Cancelled'}
              </span>
            </div>
          )}
        </button>
      );
    };

    const firstDayWeekday = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sun
    for (let index = 0; index < firstDayWeekday; index += 1) {
      const prevDay = daysInPrevMonth - firstDayWeekday + index + 1;
      const prevMonthDate = new Date(currentYear, currentMonth - 1, prevDay);
      dayCells.push(buildDayCell(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), prevMonthDate.getDate(), true));
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      dayCells.push(buildDayCell(currentYear, currentMonth, day, false));
    }

    let trailingDay = 1;
    while (dayCells.length % 7 !== 0) {
      const nextMonthDate = new Date(currentYear, currentMonth + 1, trailingDay);
      dayCells.push(buildDayCell(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), nextMonthDate.getDate(), true));
      trailingDay += 1;
    }

    return (
      <>
        <div className="calendar-header">
          <button type="button" className="nav-btn" onClick={handlePrevMonth} aria-label="Go to previous month">
            <i className="fas fa-chevron-left"></i>
          </button>
          <h2>{monthNames[currentMonth]} {currentYear}</h2>
          <button type="button" className="nav-btn" onClick={handleNextMonth} aria-label="Go to next month">
            <i className="fas fa-chevron-right"></i>
          </button>
        </div>
        <div className="calendar-grid">
          {weekDays.map((weekday) => (
            <div key={weekday} className="weekday">{weekday}</div>
          ))}
          {dayCells}
        </div>
        <div className="calendar-legend">
          <span><i className="fas fa-circle legend-scheduled"></i> Scheduled</span>
          <span><i className="fas fa-circle legend-cancelled"></i> Cancelled</span>
          <span><i className="fas fa-circle legend-selected"></i> Selected</span>
        </div>
      </>
    );
  };

  const modalZoneCards = useMemo(
    () => zones
      .map((zone) => zoneCoverageData.coverageByZone.get(zone.Zone_ID) || {
        zoneId: zone.Zone_ID,
        zoneName: formatZoneLabel(zone.Zone_Name, zone.Zone_ID),
        consumerCount: 0,
        barangays: [],
        splitBarangays: [],
      })
      .sort((left, right) => left.zoneId - right.zoneId),
    [zoneCoverageData.coverageByZone, zones]
  );

  const monthAssignedZoneMap = useMemo(() => {
    const map = new Map<number, { readerId: string; scheduleDate: string }>();
    const baseDate = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date(currentYear, currentMonth, 1);
    const targetYear = baseDate.getFullYear();
    const targetMonth = baseDate.getMonth();

    schedules.forEach((schedule) => {
      if (!isScheduledStatus(schedule.Status)) return;
      const scheduleDate = new Date(`${schedule.Schedule_Date}T00:00:00`);
      if (
        scheduleDate.getFullYear() === targetYear &&
        scheduleDate.getMonth() === targetMonth &&
        schedule.Meter_Reader_ID
      ) {
        map.set(schedule.Zone_ID, {
          readerId: String(schedule.Meter_Reader_ID),
          scheduleDate: schedule.Schedule_Date,
        });
      }
    });
    return map;
  }, [currentMonth, currentYear, schedules, selectedDate]);

  const splitBarangaySummary = useMemo(
    () => Array.from(zoneCoverageData.sharedBarangayMap.entries()).sort((left, right) => left[0].localeCompare(right[0])),
    [zoneCoverageData.sharedBarangayMap]
  );

  const areAllZonesAssignedForSelectedDate = useMemo(() => {
    if (!selectedDate || modalZoneCards.length === 0) return false;
    return modalZoneCards.every((zone) => {
      const monthAssignment = monthAssignedZoneMap.get(zone.zoneId);
      const assignedScheduleDate = monthAssignment?.scheduleDate || '';
      return Boolean(assignedScheduleDate && assignedScheduleDate !== selectedDate);
    });
  }, [modalZoneCards, monthAssignedZoneMap, selectedDate]);

  return (
    <MainLayout title="Meter Reading Management Control">
      <div className="meter-reading-page">
        <section className="scheduler-shell">
          <div className="scheduler-hero">
            <div>
              <p className="scheduler-eyebrow">Field Scheduling Desk</p>
              <h1 className="scheduler-title">Meter Reader Scheduling</h1>
              <p className="scheduler-copy">
                Select a date, assign zones, and save reader coverage.
              </p>
            </div>
            <div className="scheduler-hero-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setIsAddReaderModalOpen(true)}>
                <i className="fas fa-user-plus"></i> Add Meter Reader
              </button>
              {canManageZoneCoverage ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    loadCoverageConfig();
                    setIsCoverageConfigModalOpen(true);
                  }}
                >
                  <i className="fas fa-map-marked-alt"></i> Configure Zone Coverage
                </button>
              ) : null}
              <button type="button" className="btn btn-primary" onClick={() => openDateModal(formatDateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()))}>
                <i className="fas fa-calendar-plus"></i> Schedule Today
              </button>
            </div>
          </div>

          <div className="scheduler-summary-grid">
            <article className="scheduler-summary-card">
              <span className="scheduler-summary-label">Active Meter Readers</span>
              <strong className="scheduler-summary-value">{activeMeterReaders.length}</strong>
              <span className="scheduler-summary-meta">Readers available for assignment.</span>
            </article>
            <article className="scheduler-summary-card">
              <span className="scheduler-summary-label">Tracked Zones</span>
              <strong className="scheduler-summary-value">{zones.length}</strong>
              <span className="scheduler-summary-meta">Zones included in scheduling.</span>
            </article>
            <article className="scheduler-summary-card">
              <span className="scheduler-summary-label">Scheduled Dates</span>
              <strong className="scheduler-summary-value">{new Set(schedules.map((schedule) => schedule.Schedule_Date)).size}</strong>
              <span className="scheduler-summary-meta">Dates with saved assignments.</span>
            </article>
            <article className="scheduler-summary-card">
              <span className="scheduler-summary-label">Split Barangays</span>
              <strong className="scheduler-summary-value">{zoneCoverageData.sharedBarangayMap.size}</strong>
              <span className="scheduler-summary-meta">Barangays shared by multiple zones.</span>
            </article>
          </div>

          <div className="scheduler-container">
            <div className="calendar-section">
              <div className="section-intro">
                <h3 className="section-intro-title">Operations Calendar</h3>
                <p className="section-intro-copy">Scheduled dates are highlighted. Click a date to assign readers, inspect zone coverage, or cancel assignments.</p>
              </div>
              {renderCalendar()}
            </div>

            <aside className="schedule-side-panel">
              <div className="schedule-side-card">
                <h3 className="schedule-side-title">Coverage Snapshot</h3>
                <p className="schedule-side-copy">Barangays that appear in multiple zones are surfaced here so ambiguous assignments can be resolved before saving.</p>
                <div className="coverage-list">
                  {Array.from(zoneCoverageData.sharedBarangayMap.entries()).length > 0 ? (
                    Array.from(zoneCoverageData.sharedBarangayMap.entries())
                      .sort((left, right) => left[0].localeCompare(right[0]))
                      .map(([barangay, zoneIds]) => (
                        <div key={barangay} className="coverage-item">
                          <strong>{barangay}</strong>
                          <span>{zoneIds.map((zoneId) => formatZoneLabel(zoneLookup.get(zoneId), zoneId)).join(', ')}</span>
                        </div>
                      ))
                  ) : (
                    <div className="coverage-empty">No shared barangay boundaries were detected from the current Consumer records.</div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </section>

        <Modal
          isOpen={isScheduleModalOpen}
          onClose={closeScheduleModal}
          title="Meter Reader Scheduling"
          size="xlarge"
          closeOnOverlayClick={!assignmentSaving}
        >
          <div className="scheduler-modal modern-modal">
            <header className="schedule-modal-header">
              <div>
                <h2>{selectedDate ? formatDateDisplay(selectedDate) : 'Schedule Date'}</h2>
                <p>Manage assignments and save coverage for the selected date.</p>
              </div>
            </header>

            <div className="modern-modal-body">
              <section className="modern-panel modern-panel-builder">
                <div className="modern-panel-head">
                  <h3>Add Assignment</h3>
                </div>
                {areAllZonesAssignedForSelectedDate ? (
                  <div className="summary-empty">
                    All zones have been assigned for reading for this month.
                  </div>
                ) : null}

                <div className="modern-form-grid">
                  <div className="assignment-select-row">
                    <label>Meter Readers</label>
                    <div className="selected-readers-container">
                      {activeMeterReaders.map((reader) => {
                          const readerId = String(reader.AccountID);
                          const assignedZones = selectedZoneIds
                            .map((zoneId) => Number(zoneId))
                            .filter((zoneId) => String(draftAssignments[zoneId] || '') === readerId)
                            .map((zoneId) => zoneCoverageData.coverageByZone.get(zoneId))
                            .filter(Boolean);
                          return (
                            <article
                              key={`selected-reader-${readerId}`}
                              className={`selected-reader-box ${selectedReaderId === readerId ? 'selected' : ''} ${newAssignmentReaderId === readerId ? 'active' : ''}`}
                              role="button"
                              tabIndex={0}
                          onClick={() => toggleReaderSelection(readerId)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              toggleReaderSelection(readerId);
                            }
                          }}
                            >
                              <div className="selected-reader-head">
                                <strong>{reader.Full_Name}</strong>
                                <span>{assignedZones.length} zone{assignedZones.length === 1 ? '' : 's'}</span>
                              </div>
                              <div className="selected-reader-zones">
                                {assignedZones.length > 0 ? assignedZones.map((zone) => (
                                  <span key={`selected-reader-${readerId}-zone-${zone!.zoneId}`} className="selected-reader-zone-chip">
                                    {zone!.zoneName}
                                  </span>
                                )) : (
                                  <span className="selected-reader-empty">No zones assigned yet.</span>
                                )}
                              </div>
                            </article>
                          );
                        })}
                    </div>
                  </div>
                  {newAssignmentReaderId ? (
                    <div className="assignment-select-row">
                      <label>Zones For {activeMeterReaders.find((reader) => String(reader.AccountID) === newAssignmentReaderId)?.Full_Name || 'Selected Reader'}</label>
                      {(() => {
                        const availableZones = modalZoneCards.filter((zone) => {
                          const zoneKey = String(zone.zoneId);
                          const monthAssignment = monthAssignedZoneMap.get(zone.zoneId);
                          const assignedReaderId = monthAssignment?.readerId || '';
                          const assignedScheduleDate = monthAssignment?.scheduleDate || '';
                          const draftAssignedReaderId = String(draftAssignments[zone.zoneId] || '');
                          const lockedByMonthSchedule = Boolean(
                            assignedReaderId &&
                            assignedScheduleDate &&
                            assignedScheduleDate !== selectedDate
                          );
                          const lockedByDraftSelection = Boolean(
                            draftAssignedReaderId &&
                            draftAssignedReaderId !== String(newAssignmentReaderId)
                          );
                          const lockedToOtherReader = Boolean(
                            (assignedReaderId &&
                              assignedReaderId !== String(newAssignmentReaderId) &&
                              !selectedZoneIds.includes(zoneKey)) ||
                            lockedByMonthSchedule ||
                            lockedByDraftSelection
                          );
                          return !lockedToOtherReader;
                        });

                        if (availableZones.length === 0) {
                          return <div className="summary-empty">All zones have been assigned for reading.</div>;
                        }

                        return (
                          <div className="zone-bubble-list compact">
                            {modalZoneCards.map((zone) => {
                          const zoneKey = String(zone.zoneId);
                          const selected = String(draftAssignments[zone.zoneId] || '') === String(newAssignmentReaderId);
                          const monthAssignment = monthAssignedZoneMap.get(zone.zoneId);
                          const assignedReaderId = monthAssignment?.readerId || '';
                          const assignedScheduleDate = monthAssignment?.scheduleDate || '';
                          const draftAssignedReaderId = String(draftAssignments[zone.zoneId] || '');
                          const lockedByMonthSchedule = Boolean(
                            assignedReaderId &&
                            assignedScheduleDate &&
                            assignedScheduleDate !== selectedDate
                          );
                          const lockedByDraftSelection = Boolean(
                            draftAssignedReaderId &&
                            draftAssignedReaderId !== String(newAssignmentReaderId)
                          );
                          const lockedToOtherReader = Boolean(
                            (assignedReaderId &&
                              assignedReaderId !== String(newAssignmentReaderId) &&
                              !selectedZoneIds.includes(zoneKey)) ||
                            lockedByMonthSchedule ||
                            lockedByDraftSelection
                          );

                          return (
                            <div key={`batch-zone-${zone.zoneId}`} className="zone-bubble-wrap">
                              <button
                                type="button"
                                className={`zone-pill-btn ${selected ? 'selected' : ''} ${lockedToOtherReader ? 'disabled' : ''}`}
                                disabled={lockedToOtherReader}
                                onClick={() => {
                                  setSelectedZoneIds((current) => {
                                    const next = new Set(current);
                                    if (selected) {
                                      next.delete(zoneKey);
                                    } else {
                                      next.add(zoneKey);
                                    }
                                    return Array.from(next);
                                  });
                                  setDraftAssignments((current) => {
                                    const next = { ...current };
                                    if (selected) {
                                      delete next[Number(zoneKey)];
                                    } else {
                                      next[Number(zoneKey)] = String(newAssignmentReaderId);
                                    }
                                    return next;
                                  });
                                }}
                              >
                                <strong>{zone.zoneName}</strong>
                                <span>{zone.consumerCount} consumers</span>
                              </button>
                              <div className="zone-detail-panel">
                                {zone.barangays.length > 0 ? zone.barangays.map((barangay) => (
                                  <span
                                    key={`zone-detail-${zone.zoneId}-${barangay}`}
                                    className={`barangay-chip ${zone.splitBarangays.includes(barangay) ? 'shared' : ''}`}
                                  >
                                    {barangay}
                                  </span>
                                )) : (
                                  <span className="barangay-empty">No configured barangays yet.</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="assignment-select-row">
                      <label>Zones</label>
                      <div className="summary-empty">Select a meter reader first to load available zones for assignment.</div>
                    </div>
                  )}
                </div>
                <div className="assignment-footer">
                  <button type="button" className="btn btn-primary" onClick={handleSaveAssignments} disabled={assignmentSaving}>
                    <i className="fas fa-save"></i> {assignmentSaving ? 'Saving...' : 'Save Assignments'}
                  </button>
                </div>
              </section>

              <section className="modern-panel modern-panel-assignments">
                <div className="modern-panel-head">
                  <h3>Assignments For This Date</h3>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCancelAllSchedules}
                    disabled={assignmentSaving || activeCurrentSchedules.length === 0}
                  >
                    <i className="fas fa-ban"></i> Cancel All
                  </button>
                </div>
                <div className="assignment-card-list-modern">
                  {currentSchedules.length > 0 ? currentSchedules.map((schedule) => {
                    const coverage = zoneCoverageData.coverageByZone.get(schedule.Zone_ID);
                    const readerName = schedule.Meter_Reader_Name || 'Unassigned';
                    return (
                      <article key={schedule.Schedule_ID || `${schedule.Schedule_Date}-${schedule.Zone_ID}`} className="assignment-card-modern">
                        <div className="assignment-card-modern-top">
                          <div>
                            <h4>{formatZoneLabel(schedule.Zone_Name, schedule.Zone_ID)}</h4>
                            <p className="assignment-card-modern-sub">
                              {(coverage?.barangays || []).slice(0, 4).join(', ') || 'No configured barangays'}
                            </p>
                            {coverage?.splitBarangays.length ? (
                              <p className="split-note">
                                <i className="fas fa-link"></i> Split: {coverage.splitBarangays.join(', ')}
                              </p>
                            ) : null}
                          </div>
                          <span className={scheduleStatusClassName(schedule.Status)}>{schedule.Status || 'Scheduled'}</span>
                        </div>
                        <div className="assignment-card-modern-reader">
                          <span className="reader-avatar">{getInitials(readerName)}</span>
                          <div>
                            <strong>{readerName}</strong>
                            <p>{schedule.Meter_Reader_Contact || 'No contact'} - Any time</p>
                          </div>
                        </div>
                        <div className="assignment-card-modern-actions">
                          <button type="button" className="btn btn-secondary" onClick={() => handleEditSchedule(schedule)}>
                            <i className="fas fa-pen"></i> Edit
                          </button>
                          {schedule.Status !== 'Cancelled' && schedule.Schedule_ID ? (
                            <button type="button" className="btn btn-secondary" onClick={() => handleCancelSchedule(schedule.Schedule_ID!)}>
                              <i className="fas fa-times-circle"></i> Cancel
                            </button>
                          ) : null}
                          {schedule.Schedule_ID ? (
                            <button type="button" className="btn btn-danger" onClick={() => handleDeleteSchedule(schedule.Schedule_ID!)}>
                              <i className="fas fa-trash"></i> Remove
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  }) : (
                    <div className="summary-empty">No assignments for this date yet.</div>
                  )}
                </div>
                <div className="split-summary-panel">
                  <h4>Split Barangays (Coverage Rule)</h4>
                  {splitBarangaySummary.length > 0 ? (
                    <div className="split-summary-list">
                      {splitBarangaySummary.map(([barangay, zoneIds]) => (
                        <div key={`split-summary-${barangay}`} className="split-summary-item">
                          <strong>{barangay}</strong>
                          <span>{zoneIds.map((zoneId) => formatZoneLabel(zoneLookup.get(zoneId), zoneId)).join(', ')}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="coverage-empty">No split barangays configured.</p>
                  )}
                </div>
              </section>
            </div>

          </div>
        </Modal>

        {canManageZoneCoverage ? (
          <Modal
            isOpen={isCoverageConfigModalOpen}
            onClose={() => {
              if (coverageConfigSaving) return;
              setIsCoverageConfigModalOpen(false);
              setCoverageConfigForm({ zoneId: '', barangay: '', purokCount: '0', isSplit: false });
            }}
            title="Zone Coverage Configuration"
            size="large"
            closeOnOverlayClick={!coverageConfigSaving}
          >
            <div className="coverage-config-modal">
              <div className="coverage-config-hero">
                <p className="scheduler-panel-copy">
                  Configure coverage based on the current zoning structure. Shared barangays can belong to multiple zones.
                </p>
                <div className="coverage-config-badges">
                  <span className="status-scheduled">Single Zone</span>
                  <span className="status-cancelled">Shared / Split</span>
                </div>
              </div>
              <div className="coverage-config-grid">
                <section className="scheduler-panel">
                <div className="assignment-select-row">
                  <label htmlFor="coverage-zone">Zone</label>
                  <select
                    id="coverage-zone"
                    className="assignment-select"
                    value={coverageConfigForm.zoneId}
                    onChange={(event) => {
                      const nextZoneId = event.target.value;
                      setCoverageConfigForm((current) => ({
                        ...current,
                        zoneId: nextZoneId,
                        barangay: '',
                      }));
                    }}
                  >
                    <option value="">Select zone</option>
                    {zones.map((zone) => (
                      <option key={`coverage-zone-${zone.Zone_ID}`} value={zone.Zone_ID}>
                        {formatZoneLabel(zone.Zone_Name, zone.Zone_ID)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="assignment-select-row">
                  <label htmlFor="coverage-barangay">Barangay</label>
                  <select
                    id="coverage-barangay"
                    className="assignment-select"
                    value={coverageConfigForm.barangay}
                    disabled={!coverageConfigForm.zoneId}
                    onChange={(event) => {
                      setCoverageConfigForm((current) => ({ ...current, barangay: event.target.value }));
                    }}
                  >
                    <option value="">{coverageConfigForm.zoneId ? 'Select barangay' : 'Select a zone first'}</option>
                    {coverageBarangayOptions.map((option) => (
                      <option
                        key={`coverage-barangay-option-${option.value}`}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <FormInput
                  label="Purok Count"
                  value={coverageConfigForm.purokCount}
                  onChange={(value) => setCoverageConfigForm((current) => ({ ...current, purokCount: value.replace(/[^\d]/g, '') }))}
                />
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={coverageConfigForm.isSplit}
                    onChange={(event) => setCoverageConfigForm((current) => ({ ...current, isSplit: event.target.checked }))}
                  />
                  <span>Mark as split barangay</span>
                </label>
                <div className="assignment-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setIsCoverageConfigModalOpen(false);
                    setCoverageConfigForm({ zoneId: '', barangay: '', purokCount: '0', isSplit: false });
                  }}
                  disabled={coverageConfigSaving}
                >
                  Close
                </button>
                <button type="button" className="btn btn-primary" onClick={handleSaveCoverageConfig} disabled={coverageConfigSaving}>
                  {coverageConfigSaving ? 'Saving...' : 'Save Rule'}
                </button>
                </div>
                </section>
              </div>
              <div className="coverage-structure-bottom">
                <h4 className="schedule-card-reader">Current Zoning Structure and Saved Rules</h4>
                <div className="coverage-structure-layout">
                  <div className="coverage-structure-list">
                    {coverageStructureRows.length > 0 ? coverageStructureRows.map((row) => (
                      <button
                        key={`coverage-structure-item-${row.key}`}
                        type="button"
                        className={`coverage-structure-item ${selectedCoverageStructureKey === row.key ? 'active' : ''}`}
                        onClick={() => setSelectedCoverageStructureKey(row.key)}
                      >
                        <strong>{row.barangay}</strong>
                        <span>{row.zoneLabels.join(', ')}</span>
                        <span>{row.configuredCount} saved rule(s){row.hasSplit ? ' - split/shared' : ''}</span>
                      </button>
                    )) : (
                      <div className="summary-empty">No zoning structure found yet.</div>
                    )}
                  </div>
                  <div className="coverage-structure-detail">
                    {selectedCoverageStructure ? (
                      <div className="coverage-structure-detail-card">
                        <div className="coverage-structure-detail-head">
                          <h5>{selectedCoverageStructure.barangay}</h5>
                          <span className={selectedCoverageStructure.hasSplit ? 'status-cancelled' : 'status-scheduled'}>
                            {selectedCoverageStructure.hasSplit ? 'Shared / Split' : 'Single Zone'}
                          </span>
                        </div>
                        <p className="schedule-card-contact"><strong>Zones:</strong> {selectedCoverageStructure.zoneLabels.join(', ')}</p>
                        {selectedCoverageStructure.rules.length > 0 ? (
                          <div className="coverage-structure-rule-list">
                            {selectedCoverageStructure.rules.map((entry) => (
                              <article key={`coverage-config-${entry.Config_ID}`} className="coverage-structure-rule-item">
                                <div>
                                  <p className="schedule-card-zone">{formatZoneLabel(entry.Zone_Name || undefined, entry.Zone_ID)}</p>
                                  <p className="schedule-card-contact">{entry.Purok_Count} purok(s)</p>
                                </div>
                                <div className="schedule-actions">
                                  <button type="button" className="btn btn-secondary" onClick={() => handleEditCoverageConfig(entry)}>
                                    <i className="fas fa-pen"></i> Edit
                                  </button>
                                  <button type="button" className="btn btn-danger" onClick={() => handleDeleteCoverageConfig(entry.Config_ID)}>
                                    <i className="fas fa-trash"></i> Delete
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <div className="summary-empty">No saved rules yet for this barangay.</div>
                        )}
                      </div>
                    ) : (
                      <div className="summary-empty">Select a barangay from the list to view details.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Modal>
        ) : null}

        <Modal
          isOpen={isAddReaderModalOpen}
          onClose={() => {
            if (addReaderSaving) return;
            setIsAddReaderModalOpen(false);
          }}
          title="Add Meter Reader"
          size="medium"
          closeOnOverlayClick={!addReaderSaving}
        >
          <div className="meter-reader-form">
            <div className="meter-reader-form-intro">
              <h3>Register a new field reader</h3>
              <p>New readers are saved as active staff accounts under the Meter Reader role and can be assigned immediately after creation.</p>
            </div>
            <div className="meter-reader-form-grid">
              <FormInput
                label="Username"
                value={readerFormData.username}
                onChange={(value) => setReaderFormData((current) => ({ ...current, username: value }))}
                required
              />
              <FormInput
                label="Full Name"
                value={readerFormData.fullName}
                onChange={(value) => setReaderFormData((current) => ({ ...current, fullName: value }))}
                required
              />
              <FormInput
                label="Contact Number"
                value={readerFormData.contactNumber}
                onChange={(value) => setReaderFormData((current) => ({ ...current, contactNumber: normalizePhoneInput(value) }))}
                placeholder="09XXXXXXXXX"
              />
              <FormInput
                label="Temporary Password"
                type="password"
                value={readerFormData.password}
                onChange={(value) => setReaderFormData((current) => ({ ...current, password: value }))}
                required
              />
            </div>
            <div className="assignment-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsAddReaderModalOpen(false)} disabled={addReaderSaving}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleCreateMeterReader} disabled={addReaderSaving}>
                <i className="fas fa-user-plus"></i> {addReaderSaving ? 'Saving...' : 'Create Meter Reader'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </MainLayout>
  );
};

export default MeterReading;


