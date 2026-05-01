import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import FormInput from '../../components/Common/FormInput';
import Modal from '../../components/Common/Modal';
import { useToast } from '../../components/Common/ToastContainer';
import {
  getErrorMessage,
  loadConsumersWithFallback,
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

type ScheduleModalMode = 'overview' | 'assign';

interface ZoneCoverageConfigRow {
  Config_ID: number;
  Zone_ID: number;
  Zone_Name?: string | null;
  Barangay: string;
  Purok_Count: number;
  Is_Split: boolean;
}

const PHONE_PATTERN = /^(09\d{9}|639\d{9}|\+639\d{9})$/;

const formatZoneLabel = (zoneName?: string, zoneId?: number | string | null) =>
  zoneName || (zoneId ? `Zone ${zoneId}` : 'Not Assigned');

const normalizeStatus = (value?: string | null) => String(value || '').trim().toLowerCase();

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
const BARANGAY_PREVIEW_LIMIT = 3;

const scheduleStatusClassName = (status?: string) => {
  const normalizedStatus = normalizeStatus(status || 'Scheduled');
  if (normalizedStatus === 'cancelled') {
    return 'status-cancelled';
  }
  return 'status-scheduled';
};

const MeterReading: React.FC = () => {
  const { showToast } = useToast();
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [consumers, setConsumers] = useState<ConsumerRow[]>([]);
  const [meterReaders, setMeterReaders] = useState<MeterReader[]>([]);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ScheduleModalMode>('overview');
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>([]);
  const [selectedReaderIds, setSelectedReaderIds] = useState<string[]>([]);
  const [draftAssignments, setDraftAssignments] = useState<Record<number, string>>({});
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [isAddReaderModalOpen, setIsAddReaderModalOpen] = useState(false);
  const [addReaderSaving, setAddReaderSaving] = useState(false);
  const [coverageConfig, setCoverageConfig] = useState<ZoneCoverageConfigRow[]>([]);
  const [isCoverageConfigModalOpen, setIsCoverageConfigModalOpen] = useState(false);
  const [coverageConfigSaving, setCoverageConfigSaving] = useState(false);
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
      const result = await loadConsumersWithFallback();
      const mappedConsumers = (result.data || []).map((consumer: any) => ({
        Consumer_ID: consumer.Consumer_ID ?? consumer.consumer_id,
        Consumer_Name: consumer.Consumer_Name ?? consumer.consumer_name ?? null,
        Zone_ID: Number(consumer.Zone_ID ?? consumer.zone_id ?? 0),
        Zone_Name: consumer.Zone_Name ?? consumer.zone_name ?? null,
        Barangay: consumer.Barangay ?? consumer.barangay ?? null,
        Status: consumer.Status ?? consumer.status ?? null,
      }));
      setConsumers(mappedConsumers.filter((consumer: ConsumerRow) => consumer.Zone_ID > 0));
      if (result.source === 'supabase') {
        showToast('Consumers loaded using Supabase fallback.', 'warning');
      }
    } catch (error) {
      console.error('Error loading consumers:', error);
      showToast(getErrorMessage(error, 'Failed to load consumer coverage.'), 'error');
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
    const zoneBarangayMap = new Map<number, Set<string>>();
    const zoneConsumerCountMap = new Map<number, number>();
    const barangayZoneMap = new Map<string, Set<number>>();

    zones.forEach((zone) => {
      zoneBarangayMap.set(zone.Zone_ID, new Set<string>());
      zoneConsumerCountMap.set(zone.Zone_ID, 0);
    });

    consumers.forEach((consumer) => {
      const zoneId = Number(consumer.Zone_ID || 0);
      if (!zoneId) return;
      zoneConsumerCountMap.set(zoneId, (zoneConsumerCountMap.get(zoneId) || 0) + 1);
    });

    coverageConfig.forEach((entry) => {
      const zoneId = Number(entry.Zone_ID || 0);
      const barangay = String(entry.Barangay || '').trim();
      if (!zoneId || !barangay) return;
      if (!zoneBarangayMap.has(zoneId)) {
        zoneBarangayMap.set(zoneId, new Set<string>());
      }
      const formattedBarangay = entry.Purok_Count > 0 ? `${barangay} (${entry.Purok_Count} puroks)` : barangay;
      zoneBarangayMap.get(zoneId)?.add(formattedBarangay);
      if (!barangayZoneMap.has(barangay)) {
        barangayZoneMap.set(barangay, new Set<number>());
      }
      barangayZoneMap.get(barangay)?.add(zoneId);
      if (entry.Is_Split && !barangayZoneMap.has(`${barangay}__split`)) {
        barangayZoneMap.set(`${barangay}__split`, new Set<number>());
      }
    });

    const sharedBarangayMap = new Map<string, number[]>();
    barangayZoneMap.forEach((zoneIds, barangayKey) => {
      const barangay = barangayKey.replace(/__split$/, '');
      const shouldForceSplit = barangayKey.endsWith('__split');
      if (zoneIds.size > 1 || shouldForceSplit) {
        sharedBarangayMap.set(barangay, Array.from(zoneIds).sort((left, right) => left - right));
      }
    });

    const coverageByZone = new Map<number, ZoneCoverage>();
    zones.forEach((zone) => {
      const zoneId = zone.Zone_ID;
      const barangays = Array.from(zoneBarangayMap.get(zoneId) || []).sort((left, right) => left.localeCompare(right));
      const splitBarangays = barangays.filter((barangay) => (sharedBarangayMap.get(barangay) || []).length > 1);
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

  const handleSaveCoverageConfig = async () => {
    const zoneId = Number(coverageConfigForm.zoneId || 0);
    const barangay = coverageConfigForm.barangay.trim();
    const purokCount = Number(coverageConfigForm.purokCount || 0);
    if (!zoneId) {
      showToast('Select a zone first.', 'error');
      return;
    }
    if (!barangay) {
      showToast('Barangay is required.', 'error');
      return;
    }
    if (!Number.isInteger(purokCount) || purokCount < 0) {
      showToast('Purok count must be a non-negative whole number.', 'error');
      return;
    }
    setCoverageConfigSaving(true);
    try {
      await requestJson('/zone-coverage-config', {
        method: 'POST',
        body: JSON.stringify({
          zone_id: zoneId,
          barangay,
          purok_count: purokCount,
          is_split: coverageConfigForm.isSplit,
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

  const activeMeterReaders = useMemo(
    () => meterReaders.filter((reader) => normalizeStatus(reader.Status) === 'active'),
    [meterReaders]
  );

  const getSchedulesForDate = useCallback((dateKey: string, rows: Schedule[] = schedules) => (
    rows.filter((schedule) => schedule.Schedule_Date === dateKey)
  ), [schedules]);

  const syncModalStateForDate = useCallback((dateKey: string, rows: Schedule[]) => {
    const dateSchedules = rows.filter((schedule) => schedule.Schedule_Date === dateKey);
    const activeDateSchedules = dateSchedules.filter((schedule) => isScheduledStatus(schedule.Status));
    const zoneIds = Array.from(new Set(activeDateSchedules.map((schedule) => String(schedule.Zone_ID))));
    const readerIds = Array.from(
      new Set(
        activeDateSchedules
          .map((schedule) => String(schedule.Meter_Reader_ID || ''))
          .filter(Boolean)
      )
    );

    const nextDraftAssignments = activeDateSchedules.reduce<Record<number, string>>((accumulator, schedule) => {
      accumulator[schedule.Zone_ID] = schedule.Meter_Reader_ID ? String(schedule.Meter_Reader_ID) : '';
      return accumulator;
    }, {});

    setSelectedDate(dateKey);
    setSelectedZoneIds(zoneIds);
    setSelectedReaderIds(readerIds);
    setDraftAssignments(nextDraftAssignments);
    setModalMode(dateSchedules.length > 0 ? 'overview' : 'assign');
  }, []);

  const openDateModal = useCallback((dateKey: string) => {
    syncModalStateForDate(dateKey, schedules);
    setIsScheduleModalOpen(true);
  }, [schedules, syncModalStateForDate]);

  const closeScheduleModal = () => {
    if (assignmentSaving) {
      return;
    }
    setIsScheduleModalOpen(false);
    setSelectedDate(null);
    setSelectedZoneIds([]);
    setSelectedReaderIds([]);
    setDraftAssignments({});
    setModalMode('overview');
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

  const toggleZoneSelection = (zoneId: string) => {
    setSelectedZoneIds((current) => {
      const exists = current.includes(zoneId);
      const next = exists
        ? current.filter((entry) => entry !== zoneId)
        : [...current, zoneId];

      if (exists) {
        setDraftAssignments((draft) => {
          const updated = { ...draft };
          delete updated[Number(zoneId)];
          return updated;
        });
      } else {
        setDraftAssignments((draft) => ({
          ...draft,
          [Number(zoneId)]: draft[Number(zoneId)] || '',
        }));
      }

      return next;
    });
  };

  const toggleReaderSelection = (readerId: string) => {
    setSelectedReaderIds((current) =>
      current.includes(readerId)
        ? current.filter((entry) => entry !== readerId)
        : [...current, readerId]
    );
  };

  const buildZoneGroups = useCallback((zoneIds: number[]) => {
    const selectedSet = new Set(zoneIds);
    const adjacency = new Map<number, Set<number>>();
    zoneIds.forEach((zoneId) => adjacency.set(zoneId, new Set<number>()));

    for (const [, sharedZoneIds] of zoneCoverageData.sharedBarangayMap.entries()) {
      const participatingZones = sharedZoneIds.filter((zoneId) => selectedSet.has(zoneId));
      if (participatingZones.length < 2) {
        continue;
      }
      participatingZones.forEach((zoneId) => {
        const adjacencySet = adjacency.get(zoneId);
        participatingZones.forEach((peerZoneId) => {
          if (peerZoneId !== zoneId) {
            adjacencySet?.add(peerZoneId);
          }
        });
      });
    }

    const visited = new Set<number>();
    const groups: number[][] = [];

    zoneIds.forEach((zoneId) => {
      if (visited.has(zoneId)) {
        return;
      }

      const queue = [zoneId];
      const group: number[] = [];
      visited.add(zoneId);

      while (queue.length > 0) {
        const current = queue.shift()!;
        group.push(current);
        (adjacency.get(current) || new Set<number>()).forEach((neighbor) => {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        });
      }

      groups.push(group.sort((left, right) => left - right));
    });

    return groups;
  }, [zoneCoverageData.sharedBarangayMap]);

  const autoAssignReaders = () => {
    if (selectedZoneIds.length === 0) {
      showToast('Select at least one zone before distributing assignments.', 'error');
      return;
    }
    if (selectedReaderIds.length === 0) {
      showToast('Select at least one available meter reader for auto-distribution.', 'error');
      return;
    }

    const numericZoneIds = selectedZoneIds.map((zoneId) => Number(zoneId));
    const zoneGroups = buildZoneGroups(numericZoneIds)
      .map((group) => ({
        zoneIds: group,
        weight: group.reduce((total, zoneId) => total + (zoneCoverageData.coverageByZone.get(zoneId)?.consumerCount || 1), 0),
      }))
      .sort((left, right) => right.weight - left.weight);

    const readerLoads = selectedReaderIds.map((readerId) => ({
      readerId,
      load: 0,
      zoneCount: 0,
    }));

    const nextAssignments: Record<number, string> = {};

    zoneGroups.forEach((group) => {
      readerLoads.sort((left, right) => {
        if (left.load === right.load) {
          return left.zoneCount - right.zoneCount;
        }
        return left.load - right.load;
      });
      const targetReader = readerLoads[0];
      group.zoneIds.forEach((zoneId) => {
        nextAssignments[zoneId] = targetReader.readerId;
      });
      targetReader.load += group.weight;
      targetReader.zoneCount += group.zoneIds.length;
    });

    setDraftAssignments((current) => ({
      ...current,
      ...nextAssignments,
    }));
    showToast('Assignments distributed fairly across the selected meter readers.', 'success');
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

    const warnings: string[] = [];
    const conflicts: string[] = [];

    selectedZoneIds.forEach((zoneId) => {
      if (!draftAssignments[Number(zoneId)]) {
        warnings.push(`${formatZoneLabel(zoneLookup.get(Number(zoneId)), zoneId)} still needs a meter reader assignment.`);
      }
    });

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

    return { warnings, conflicts };
  }, [activeCurrentSchedules, activeMeterReaders, draftAssignments, selectedZoneIds, zoneCoverageData.sharedBarangayMap, zoneLookup]);

  const assignmentSummary = useMemo(() => {
    const grouped = new Map<string, { label: string; contact: string | null; zones: ZoneCoverage[] }>();

    selectedZoneIds.forEach((zoneId) => {
      const numericZoneId = Number(zoneId);
      const readerId = draftAssignments[numericZoneId] || '';
      const reader = activeMeterReaders.find((entry) => String(entry.AccountID) === readerId);
      const summaryKey = readerId || 'unassigned';
      const summaryLabel = reader?.Full_Name || 'Unassigned';
      const summaryContact = reader?.Contact_Number || null;
      if (!grouped.has(summaryKey)) {
        grouped.set(summaryKey, {
          label: summaryLabel,
          contact: summaryContact,
          zones: [],
        });
      }
      grouped.get(summaryKey)?.zones.push(zoneCoverageData.coverageByZone.get(numericZoneId) || {
        zoneId: numericZoneId,
        zoneName: formatZoneLabel(zoneLookup.get(numericZoneId), numericZoneId),
        consumerCount: 0,
        barangays: [],
        splitBarangays: [],
      });
    });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        zones: group.zones.sort((left, right) => left.zoneId - right.zoneId),
      }))
      .sort((left, right) => {
        if (left.label === 'Unassigned') return 1;
        if (right.label === 'Unassigned') return -1;
        return left.label.localeCompare(right.label);
      });
  }, [activeMeterReaders, draftAssignments, selectedZoneIds, zoneCoverageData.coverageByZone, zoneLookup]);

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
      setModalMode('overview');
    } catch (error) {
      console.error('Error saving assignments:', error);
      showToast(getErrorMessage(error, 'Failed to save assignments.'), 'error');
    } finally {
      setAssignmentSaving(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: number) => {
    if (!window.confirm('Delete this assignment permanently?')) {
      return;
    }

    setAssignmentSaving(true);
    try {
      await requestJson(`/reading-schedules/${scheduleId}`, { method: 'DELETE' });
      showToast('Assignment deleted successfully.', 'success');
      const refreshedSchedules = await loadSchedules();
      if (selectedDate) {
        syncModalStateForDate(selectedDate, refreshedSchedules);
      }
    } catch (error) {
      console.error('Error deleting schedule:', error);
      showToast(getErrorMessage(error, 'Failed to delete assignment.'), 'error');
    } finally {
      setAssignmentSaving(false);
    }
  };

  const handleCancelSchedule = async (scheduleId: number) => {
    if (!window.confirm('Cancel this assignment?')) {
      return;
    }

    setAssignmentSaving(true);
    try {
      await requestJson(`/reading-schedules/${scheduleId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'Cancelled' }),
      });
      showToast('Assignment cancelled successfully.', 'success');
      const refreshedSchedules = await loadSchedules();
      if (selectedDate) {
        syncModalStateForDate(selectedDate, refreshedSchedules);
      }
    } catch (error) {
      console.error('Error cancelling schedule:', error);
      showToast(getErrorMessage(error, 'Failed to cancel assignment.'), 'error');
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
      showToast('All active assignments were cancelled.', 'success');
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

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const today = formatDateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    const dayCells: React.ReactNode[] = [];

    for (let index = 0; index < firstDay; index += 1) {
      dayCells.push(<div key={`empty-${index}`} className="day empty"></div>);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = formatDateKey(currentYear, currentMonth, day);
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
      ].filter(Boolean).join(' ');

      dayCells.push(
        <button
          key={dateKey}
          type="button"
          className={classes}
          onClick={() => openDateModal(dateKey)}
          aria-pressed={isSelected}
          aria-label={`${formatDateDisplay(dateKey)}${daySchedules.length ? `, ${daySchedules.length} total assignment${daySchedules.length > 1 ? 's' : ''}` : ''}`}
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
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((weekday) => (
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

  return (
    <MainLayout title="Meter Reading Management Control">
      <div className="meter-reading-page">
        <section className="scheduler-shell">
          <div className="scheduler-hero">
            <div>
              <p className="scheduler-eyebrow">Field Scheduling Desk</p>
              <h1 className="scheduler-title">Plan meter-reader coverage by date, zone, and barangay.</h1>
              <p className="scheduler-copy">
                Click any date on the calendar to assign readers, review zone coverage, and keep split-barangay schedules coordinated.
              </p>
            </div>
            <div className="scheduler-hero-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setIsAddReaderModalOpen(true)}>
                <i className="fas fa-user-plus"></i> Add Meter Reader
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setIsCoverageConfigModalOpen(true)}>
                <i className="fas fa-map-marked-alt"></i> Configure Zone Coverage
              </button>
              <button type="button" className="btn btn-primary" onClick={() => openDateModal(formatDateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()))}>
                <i className="fas fa-calendar-plus"></i> Schedule Today
              </button>
            </div>
          </div>

          <div className="scheduler-summary-grid">
            <article className="scheduler-summary-card">
              <span className="scheduler-summary-label">Active Meter Readers</span>
              <strong className="scheduler-summary-value">{activeMeterReaders.length}</strong>
              <span className="scheduler-summary-meta">Only active readers can be assigned to zones.</span>
            </article>
            <article className="scheduler-summary-card">
              <span className="scheduler-summary-label">Tracked Zones</span>
              <strong className="scheduler-summary-value">{zones.length}</strong>
              <span className="scheduler-summary-meta">Each zone shows barangays and shared-boundary warnings.</span>
            </article>
            <article className="scheduler-summary-card">
              <span className="scheduler-summary-label">Scheduled Dates</span>
              <strong className="scheduler-summary-value">{new Set(schedules.map((schedule) => schedule.Schedule_Date)).size}</strong>
              <span className="scheduler-summary-meta">Dates with saved assignments stay highlighted on the calendar.</span>
            </article>
            <article className="scheduler-summary-card">
              <span className="scheduler-summary-label">Split Barangays</span>
              <strong className="scheduler-summary-value">{zoneCoverageData.sharedBarangayMap.size}</strong>
              <span className="scheduler-summary-meta">From admin-configured coverage rules.</span>
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
                    <div className="coverage-empty">No shared barangay boundaries were detected from the current consumer records.</div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </section>

        <Modal
          isOpen={isScheduleModalOpen}
          onClose={closeScheduleModal}
          title={selectedDate ? `Meter Reader Scheduling - ${formatDateDisplay(selectedDate)}` : 'Meter Reader Scheduling'}
          size="xlarge"
          closeOnOverlayClick={!assignmentSaving}
        >
          <div className="scheduler-modal">
            <div className="scheduler-modal-actions">
              <button
                type="button"
                className={`scheduler-action-card ${modalMode === 'assign' ? 'active' : ''}`}
                onClick={() => setModalMode('assign')}
              >
                <span className="scheduler-action-icon"><i className="fas fa-user-check"></i></span>
                <span className="scheduler-action-copy">
                  <strong>Assign Meter Reader</strong>
                  <small>Choose zones, distribute readers fairly, and review split barangays.</small>
                </span>
              </button>
              <button
                type="button"
                className={`scheduler-action-card ${modalMode === 'overview' ? 'active' : ''}`}
                onClick={() => setModalMode('overview')}
              >
                <span className="scheduler-action-icon"><i className="fas fa-list-check"></i></span>
                <span className="scheduler-action-copy">
                  <strong>View Assignments</strong>
                  <small>Inspect saved assignments, statuses, and reader coverage for this date.</small>
                </span>
              </button>
              <button
                type="button"
                className="scheduler-action-card danger"
                onClick={handleCancelAllSchedules}
                disabled={assignmentSaving || activeCurrentSchedules.length === 0}
              >
                <span className="scheduler-action-icon"><i className="fas fa-ban"></i></span>
                <span className="scheduler-action-copy">
                  <strong>Cancel Schedule</strong>
                  <small>Cancel all active assignments for this business date without deleting history.</small>
                </span>
              </button>
            </div>

            {modalMode === 'overview' ? (
              <div className="scheduler-modal-grid">
                <section className="scheduler-panel">
                  <div className="scheduler-panel-head">
                    <div>
                      <h3 className="scheduler-panel-title">Assignments For The Date</h3>
                      <p className="scheduler-panel-copy">Each saved zone assignment shows the assigned reader, included barangays, and cancellation controls.</p>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={() => setModalMode('assign')}>
                      <i className="fas fa-edit"></i> Edit Assignments
                    </button>
                  </div>

                  {currentSchedules.length > 0 ? (
                    <div className="schedule-card-list">
                      {currentSchedules.map((schedule) => {
                        const coverage = zoneCoverageData.coverageByZone.get(schedule.Zone_ID);
                        return (
                          <article key={schedule.Schedule_ID || `${schedule.Schedule_Date}-${schedule.Zone_ID}`} className="schedule-card">
                            <div className="schedule-card-top">
                              <div>
                                <p className="schedule-card-zone">{formatZoneLabel(schedule.Zone_Name, schedule.Zone_ID)}</p>
                                <h4 className="schedule-card-reader">{schedule.Meter_Reader_Name || 'Unassigned Meter Reader'}</h4>
                                {schedule.Meter_Reader_Contact && (
                                  <p className="schedule-card-contact"><i className="fas fa-phone-alt"></i> {schedule.Meter_Reader_Contact}</p>
                                )}
                              </div>
                              <span className={scheduleStatusClassName(schedule.Status)}>{schedule.Status || 'Scheduled'}</span>
                            </div>

                            <div className="schedule-card-meta">
                              <span><strong>Consumers:</strong> {coverage?.consumerCount || 0}</span>
                              <span><strong>Barangays:</strong> {coverage?.barangays.length || 0}</span>
                            </div>

                            <div className="barangay-chip-list">
                              {(coverage?.barangays || []).length > 0 ? (
                                coverage?.barangays.map((barangay) => (
                                  <span
                                    key={`${schedule.Schedule_ID}-${barangay}`}
                                    className={`barangay-chip ${coverage.splitBarangays.includes(barangay) ? 'shared' : ''}`}
                                  >
                                    {barangay}
                                  </span>
                                ))
                              ) : (
                                <span className="barangay-empty">No barangay coverage found for this zone yet.</span>
                              )}
                            </div>

                            {coverage?.splitBarangays.length ? (
                              <p className="schedule-warning">
                                <i className="fas fa-exclamation-triangle"></i>
                                Shared barangay coverage: {coverage.splitBarangays.join(', ')}
                              </p>
                            ) : null}

                            <div className="schedule-actions">
                              {schedule.Status !== 'Cancelled' && schedule.Schedule_ID ? (
                                <button type="button" className="btn btn-secondary" onClick={() => handleCancelSchedule(schedule.Schedule_ID!)}>
                                  <i className="fas fa-times-circle"></i> Cancel Assignment
                                </button>
                              ) : null}
                              {schedule.Schedule_ID ? (
                                <button type="button" className="btn btn-danger" onClick={() => handleDeleteSchedule(schedule.Schedule_ID!)}>
                                  <i className="fas fa-trash"></i> Delete
                                </button>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="schedule-empty-state">
                      <i className="fas fa-calendar-check"></i>
                      <h4>No assignments saved yet</h4>
                      <p>Select zones and assign meter readers to build the first schedule for this date.</p>
                      <button type="button" className="btn btn-primary" onClick={() => setModalMode('assign')}>
                        <i className="fas fa-user-check"></i> Start Assigning
                      </button>
                    </div>
                  )}
                </section>

                <section className="scheduler-panel compact">
                  <div className="scheduler-panel-head">
                    <div>
                      <h3 className="scheduler-panel-title">Reader Coverage Summary</h3>
                      <p className="scheduler-panel-copy">A quick view of who covers which zones on the selected date.</p>
                    </div>
                  </div>
                  <div className="summary-stack">
                    {assignmentSummary.length > 0 ? (
                      assignmentSummary.map((group) => (
                        <article key={`${group.label}-${group.contact || 'none'}`} className="summary-card">
                          <div className="summary-card-top">
                            <div>
                              <h4>{group.label}</h4>
                              {group.contact ? <p>{group.contact}</p> : null}
                            </div>
                            <span>{group.zones.length} zone{group.zones.length === 1 ? '' : 's'}</span>
                          </div>
                          <div className="summary-zone-list">
                            {group.zones.map((zone) => (
                              <span key={`${group.label}-${zone.zoneId}`} className="summary-zone-chip">{zone.zoneName}</span>
                            ))}
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="summary-empty">No zone assignments are selected yet for this date.</div>
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <div className="scheduler-modal-grid">
                <section className="scheduler-panel">
                  <div className="scheduler-panel-head">
                    <div>
                      <h3 className="scheduler-panel-title">Zone & Reader Assignment Builder</h3>
                      <p className="scheduler-panel-copy">Select zones, review barangays in each zone, then distribute one or more active meter readers fairly.</p>
                    </div>
                    <div className="scheduler-panel-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => setIsAddReaderModalOpen(true)}>
                        <i className="fas fa-user-plus"></i> Add Meter Reader
                      </button>
                      <button type="button" className="btn btn-primary" onClick={autoAssignReaders}>
                        <i className="fas fa-random"></i> Auto Distribute
                      </button>
                    </div>
                  </div>

                  <div className="assignment-builder-grid">
                    <div className="assignment-column">
                      {coverageConfig.length === 0 ? (
                        <div className="coverage-config-warning">
                          Barangay coverage is not configured yet. Use <strong>Configure Zone Coverage</strong> first so assignments follow your exact zone plan.
                        </div>
                      ) : null}
                      <div className="assignment-section-head">
                        <h4>Select Zones</h4>
                        <span>{selectedZoneIds.length} selected</span>
                      </div>
                      <div className="zone-selection-list" role="group" aria-label="Select zones">
                        {modalZoneCards.map((zone) => {
                          const isSelected = selectedZoneIds.includes(String(zone.zoneId));
                          return (
                            <label key={zone.zoneId} className={`zone-selection-item ${isSelected ? 'selected' : ''}`}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleZoneSelection(String(zone.zoneId))}
                              />
                              <div className="zone-selection-main">
                                <strong>{zone.zoneName}</strong>
                                <span>{zone.consumerCount} consumers</span>
                              </div>
                              <div className="zone-selection-meta">
                                <span>{zone.barangays.length} barangays</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      {selectedZoneIds.length > 0 ? (
                        <div className="selected-zone-preview">
                          {selectedZoneIds
                            .map((zoneId) => zoneCoverageData.coverageByZone.get(Number(zoneId)))
                            .filter(Boolean)
                            .sort((left, right) => (left?.zoneId || 0) - (right?.zoneId || 0))
                            .map((zone) => (
                              <article key={`zone-preview-${zone!.zoneId}`} className="selected-zone-preview-card">
                                <div className="selected-zone-preview-head">
                                  <h5>{zone!.zoneName}</h5>
                                  <span>{zone!.consumerCount} consumers</span>
                                </div>
                                <p className="selected-zone-preview-count">{zone!.barangays.length} barangays</p>
                                <div className="barangay-chip-list compact">
                                  {zone!.barangays.length > 0 ? zone!.barangays.map((barangay) => (
                                    <span key={`zone-preview-${zone!.zoneId}-${barangay}`} className={`barangay-chip ${zone!.splitBarangays.includes(barangay) ? 'shared' : ''}`}>
                                      {barangay}
                                    </span>
                                  )) : (
                                    <span className="barangay-empty">No configured barangays yet.</span>
                                  )}
                                </div>
                              </article>
                            ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="assignment-column">
                      <div className="assignment-section-head">
                        <h4>Select Available Meter Readers</h4>
                        <span>{selectedReaderIds.length} chosen for auto-distribution</span>
                      </div>
                      <div className="reader-card-grid">
                        {activeMeterReaders.length > 0 ? activeMeterReaders.map((reader) => {
                          const isSelected = selectedReaderIds.includes(String(reader.AccountID));
                          return (
                            <button
                              key={reader.AccountID}
                              type="button"
                              className={`reader-card ${isSelected ? 'selected' : ''}`}
                              onClick={() => toggleReaderSelection(String(reader.AccountID))}
                              aria-pressed={isSelected}
                            >
                              <div className="reader-card-top">
                                <strong>{reader.Full_Name}</strong>
                                <span>{reader.Username}</span>
                              </div>
                              <div className="reader-card-bottom">
                                <span>{reader.Contact_Number || 'No contact saved'}</span>
                                <span className="reader-card-status">Active</span>
                              </div>
                            </button>
                          );
                        }) : (
                          <div className="summary-empty">No active meter readers are available yet. Add one to continue scheduling.</div>
                        )}
                      </div>

                      <div className="assignment-section-head">
                        <h4>Zone-Level Assignment</h4>
                        <span>Manual overrides are allowed after auto-distribution.</span>
                      </div>
                      <div className="assignment-list">
                        {selectedZoneIds.length > 0 ? selectedZoneIds
                          .map((zoneId) => zoneCoverageData.coverageByZone.get(Number(zoneId)))
                          .filter(Boolean)
                          .sort((left, right) => (left?.zoneId || 0) - (right?.zoneId || 0))
                          .map((zone) => (
                            <article key={`assignment-${zone!.zoneId}`} className="assignment-card">
                              <div className="assignment-card-head">
                                <div>
                                  <h4>{zone!.zoneName}</h4>
                                  <p>{zone!.consumerCount} consumers and {zone!.barangays.length} barangays</p>
                                </div>
                                {zone!.splitBarangays.length > 0 ? (
                                  <span className="assignment-badge shared">Split Barangay</span>
                                ) : (
                                  <span className="assignment-badge">Single Coverage</span>
                                )}
                              </div>
                              <div className="barangay-chip-list compact">
                                {zone!.barangays.length > 0 ? zone!.barangays.slice(0, BARANGAY_PREVIEW_LIMIT).map((barangay) => (
                                  <span key={`assignment-${zone!.zoneId}-${barangay}`} className={`barangay-chip ${zone!.splitBarangays.includes(barangay) ? 'shared' : ''}`}>
                                    {barangay}
                                  </span>
                                )) : (
                                  <span className="barangay-empty">No configured barangays yet.</span>
                                )}
                                {zone!.barangays.length > BARANGAY_PREVIEW_LIMIT ? (
                                  <span className="barangay-chip more">+{zone!.barangays.length - BARANGAY_PREVIEW_LIMIT} more</span>
                                ) : null}
                              </div>
                              <div className="assignment-select-row">
                                <label htmlFor={`reader-assignment-${zone!.zoneId}`}>Assigned Meter Reader</label>
                                <select
                                  id={`reader-assignment-${zone!.zoneId}`}
                                  value={draftAssignments[zone!.zoneId] || ''}
                                  onChange={(event) => setDraftAssignments((current) => ({
                                    ...current,
                                    [zone!.zoneId]: event.target.value,
                                  }))}
                                  className="assignment-select"
                                >
                                  <option value="">Select a meter reader</option>
                                  {activeMeterReaders.map((reader) => (
                                    <option key={`reader-option-${reader.AccountID}`} value={reader.AccountID}>
                                      {reader.Full_Name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </article>
                          )) : (
                            <div className="summary-empty">Select one or more zones to start building assignments.</div>
                          )}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="scheduler-panel compact">
                  <div className="scheduler-panel-head">
                    <div>
                      <h3 className="scheduler-panel-title">Assignment Summary</h3>
                      <p className="scheduler-panel-copy">Review the final split before saving to avoid confusing boundary coverage.</p>
                    </div>
                  </div>

                  <div className="summary-stack">
                    {assignmentSummary.length > 0 ? assignmentSummary.map((group) => (
                      <article key={`draft-${group.label}-${group.contact || 'none'}`} className="summary-card">
                        <div className="summary-card-top">
                          <div>
                            <h4>{group.label}</h4>
                            {group.contact ? <p>{group.contact}</p> : null}
                          </div>
                          <span>{group.zones.length} zone{group.zones.length === 1 ? '' : 's'}</span>
                        </div>
                        <div className="summary-zone-list">
                          {group.zones.map((zone) => (
                            <span key={`summary-${group.label}-${zone.zoneId}`} className="summary-zone-chip">
                              {zone.zoneName}
                            </span>
                          ))}
                        </div>
                      </article>
                    )) : (
                      <div className="summary-empty">Assignments will appear here as soon as zones and readers are selected.</div>
                    )}
                  </div>

                  <div className="validation-panel">
                    <div className="validation-panel-head">
                      <h4>Validation & Warnings</h4>
                      <span>{validationState.conflicts.length} blocking conflict{validationState.conflicts.length === 1 ? '' : 's'}</span>
                    </div>
                    {validationState.conflicts.length > 0 ? (
                      <div className="validation-list error">
                        {validationState.conflicts.map((message) => (
                          <div key={message} className="validation-item">
                            <i className="fas fa-exclamation-circle"></i>
                            <span>{message}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="validation-empty success">
                        <i className="fas fa-check-circle"></i>
                        <span>No split-barangay conflicts were detected in the current draft.</span>
                      </div>
                    )}

                    {validationState.warnings.length > 0 ? (
                      <div className="validation-list warning">
                        {validationState.warnings.map((message) => (
                          <div key={message} className="validation-item">
                            <i className="fas fa-info-circle"></i>
                            <span>{message}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="assignment-footer">
                    <button type="button" className="btn btn-secondary" onClick={() => setModalMode('overview')} disabled={assignmentSaving}>
                      <i className="fas fa-list"></i> Back To Overview
                    </button>
                    <button type="button" className="btn btn-primary" onClick={handleSaveAssignments} disabled={assignmentSaving}>
                      <i className="fas fa-save"></i> {assignmentSaving ? 'Saving...' : 'Save Assignments'}
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>
        </Modal>

        <Modal
          isOpen={isCoverageConfigModalOpen}
          onClose={() => {
            if (coverageConfigSaving) return;
            setIsCoverageConfigModalOpen(false);
          }}
          title="Zone Coverage Configuration"
          size="large"
          closeOnOverlayClick={!coverageConfigSaving}
        >
          <div className="scheduler-panel">
            <div className="meter-reader-form-grid">
              <div className="assignment-select-row">
                <label htmlFor="coverage-zone">Zone</label>
                <select
                  id="coverage-zone"
                  className="assignment-select"
                  value={coverageConfigForm.zoneId}
                  onChange={(event) => setCoverageConfigForm((current) => ({ ...current, zoneId: event.target.value }))}
                >
                  <option value="">Select zone</option>
                  {zones.map((zone) => (
                    <option key={`coverage-zone-${zone.Zone_ID}`} value={zone.Zone_ID}>
                      {formatZoneLabel(zone.Zone_Name, zone.Zone_ID)}
                    </option>
                  ))}
                </select>
              </div>
              <FormInput
                label="Barangay"
                value={coverageConfigForm.barangay}
                onChange={(value) => setCoverageConfigForm((current) => ({ ...current, barangay: value }))}
              />
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
            </div>
            <div className="assignment-footer">
              <button type="button" className="btn btn-primary" onClick={handleSaveCoverageConfig} disabled={coverageConfigSaving}>
                {coverageConfigSaving ? 'Saving...' : 'Save Rule'}
              </button>
            </div>
            <div className="schedule-card-list">
              {coverageConfig.length > 0 ? coverageConfig.map((entry) => (
                <article key={`coverage-config-${entry.Config_ID}`} className="schedule-card">
                  <div className="schedule-card-top">
                    <div>
                      <p className="schedule-card-zone">{formatZoneLabel(entry.Zone_Name || undefined, entry.Zone_ID)}</p>
                      <h4 className="schedule-card-reader">{entry.Barangay}</h4>
                      <p className="schedule-card-contact">{entry.Purok_Count} purok(s)</p>
                    </div>
                    <span className={entry.Is_Split ? 'status-cancelled' : 'status-scheduled'}>
                      {entry.Is_Split ? 'Split' : 'Single Zone'}
                    </span>
                  </div>
                  <div className="schedule-actions">
                    <button type="button" className="btn btn-danger" onClick={() => handleDeleteCoverageConfig(entry.Config_ID)}>
                      <i className="fas fa-trash"></i> Delete
                    </button>
                  </div>
                </article>
              )) : (
                <div className="summary-empty">No coverage rules yet. Add zone-barangay rules here to control scheduling clearly.</div>
              )}
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={isAddReaderModalOpen}
          onClose={() => {
            if (addReaderSaving) return;
            setIsAddReaderModalOpen(false);
          }}
          title="Add Meter Reader"
          size="medium"
          closeOnOverlayClick={!addReaderSaving}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setIsAddReaderModalOpen(false)} disabled={addReaderSaving}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleCreateMeterReader} disabled={addReaderSaving}>
                <i className="fas fa-user-plus"></i> {addReaderSaving ? 'Saving...' : 'Create Meter Reader'}
              </button>
            </>
          }
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
          </div>
        </Modal>
      </div>
    </MainLayout>
  );
};

export default MeterReading;
