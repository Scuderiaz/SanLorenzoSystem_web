import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import FormSelect from '../../components/Common/FormSelect';
import { useToast } from '../../components/Common/ToastContainer';
import { getErrorMessage, loadZonesWithFallback } from '../../services/userManagementApi';
import './MeterReading.css';

interface Schedule {
  Schedule_ID?: number;
  Schedule_Date: string;
  Zone_ID: number;
  Zone_Name?: string;
  Meter_Reader_ID?: number;
  Meter_Reader_Name?: string;
  Status?: string;
}

const formatZoneLabel = (zoneName?: string, zoneId?: number | string | null) =>
  zoneName || (zoneId ? `Zone ${zoneId}` : 'Not Assigned');

const MeterReading: React.FC = () => {
  const { showToast } = useToast();
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [meterReaders, setMeterReaders] = useState<any[]>([]);
  const [selectedZone, setSelectedZone] = useState('');
  const [selectedReader, setSelectedReader] = useState('');
  const [showPanel, setShowPanel] = useState(false);

  const loadSchedules = useCallback(async () => {
    try {
      const mockSchedules: Schedule[] = [
        {
          Schedule_ID: 1,
          Schedule_Date: '2026-03-20',
          Zone_ID: 1,
          Meter_Reader_ID: 1,
          Meter_Reader_Name: 'John Doe',
          Status: 'Scheduled',
        },
      ];
      setSchedules(mockSchedules);
    } catch (error) {
      console.error('Error loading schedules:', error);
    }
  }, []);

  const loadZones = useCallback(async () => {
    try {
      const result = await loadZonesWithFallback();
      setZones(result.data || []);
      if (result.source === 'supabase') {
        showToast('Zones loaded using Supabase fallback.', 'warning');
      }
    } catch (error) {
      console.error('Error loading zones:', error);
      showToast(getErrorMessage(error, 'Failed to load zones.'), 'error');
    }
  }, [showToast]);

  const loadMeterReaders = useCallback(async () => {
    try {
      const mockReaders = [
        { AccountID: 1, Full_Name: 'John Doe', Username: 'john' },
        { AccountID: 2, Full_Name: 'Jane Smith', Username: 'jane' },
      ];
      setMeterReaders(mockReaders);
    } catch (error) {
      console.error('Error loading meter readers:', error);
    }
  }, []);

  useEffect(() => {
    loadSchedules();
    loadZones();
    loadMeterReaders();
  }, [loadMeterReaders, loadSchedules, loadZones]);

  const formatDateKey = (year: number, month: number, day: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const formatDateDisplay = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const getScheduleForDate = (dateKey: string) => {
    return schedules.find((s) => s.Schedule_Date === dateKey);
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleSelectDate = (dateKey: string) => {
    setSelectedDate(dateKey);
    setShowPanel(true);
    const schedule = getScheduleForDate(dateKey);
    if (schedule) {
      setSelectedZone(schedule.Zone_ID.toString());
      setSelectedReader(schedule.Meter_Reader_ID?.toString() || '');
    } else {
      setSelectedZone('');
      setSelectedReader('');
    }
  };

  const handleSaveSchedule = async () => {
    if (!selectedZone) {
      showToast('Please select a zone', 'error');
      return;
    }

    try {
      showToast('Schedule saved successfully', 'success');
      loadSchedules();
      setShowPanel(false);
    } catch (error) {
      console.error('Error saving schedule:', error);
      showToast('Failed to save schedule', 'error');
    }
  };

  const handleDeleteSchedule = async () => {
    if (!window.confirm('Delete this schedule?')) return;

    try {
      showToast('Schedule deleted successfully', 'success');
      loadSchedules();
      setShowPanel(false);
    } catch (error) {
      console.error('Error deleting schedule:', error);
      showToast('Failed to delete schedule', 'error');
    }
  };

  const renderCalendar = () => {
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const today = formatDateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="day empty"></div>);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = formatDateKey(currentYear, currentMonth, day);
      const schedule = getScheduleForDate(dateKey);
      const isScheduled = !!schedule;
      const isSelected = selectedDate === dateKey;
      const isToday = dateKey === today;

      let classes = 'day';
      if (isScheduled) classes += ' scheduled';
      if (isSelected) classes += ' selected';
      if (isToday) classes += ' today';

      days.push(
        <div key={dateKey} className={classes} onClick={() => handleSelectDate(dateKey)}>
          <span className="day-number">{day}</span>
          {isScheduled && (
            <div className="day-info">
              <span className="day-zone">{formatZoneLabel(schedule.Zone_Name, schedule.Zone_ID)}</span>
              <span className="day-reader">
                {schedule.Meter_Reader_Name?.split(' ')[0] || 'Unassigned'}
              </span>
            </div>
          )}
        </div>
      );
    }

    return (
      <>
        <div className="calendar-header">
          <button className="nav-btn" onClick={handlePrevMonth}>
            <i className="fas fa-chevron-left"></i>
          </button>
          <h2>
            {monthNames[currentMonth]} {currentYear}
          </h2>
          <button className="nav-btn" onClick={handleNextMonth}>
            <i className="fas fa-chevron-right"></i>
          </button>
        </div>
        <div className="calendar-grid">
          <div className="weekday">Sun</div>
          <div className="weekday">Mon</div>
          <div className="weekday">Tue</div>
          <div className="weekday">Wed</div>
          <div className="weekday">Thu</div>
          <div className="weekday">Fri</div>
          <div className="weekday">Sat</div>
          {days}
        </div>
        <div className="calendar-legend">
          <span>
            <i className="fas fa-circle" style={{ color: '#4caf50' }}></i> Scheduled
          </span>
          <span>
            <i className="fas fa-circle" style={{ color: '#2196f3' }}></i> Selected
          </span>
        </div>
      </>
    );
  };

  const currentSchedule = selectedDate ? getScheduleForDate(selectedDate) : null;
  const zoneOptions = zones.map((z) => ({ value: z.Zone_ID, label: z.Zone_Name }));
  const readerOptions = meterReaders.map((r) => ({
    value: r.AccountID,
    label: r.Full_Name || r.Username,
  }));

  return (
    <MainLayout title="Meter Reading Management Control">
      <div className="meter-reading-page">
        <div className="scheduler-container">
          {/* Main Visual Calendar */}
          <div className="calendar-section">
            <div className="section-intro" style={{ marginBottom: '25px' }}>
                <h3 style={{ color: '#1B1B63', fontSize: '18px', fontWeight: '800' }}>Active Operations Calendar</h3>
                <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>Select an operational date to assign reading zones and field personnel.</p>
            </div>
            {renderCalendar()}
          </div>

          {/* Contextual Action Side Panel */}
          <div className="side-panel">
            {!showPanel ? (
              <div className="panel-placeholder">
                <i className="fas fa-calendar-alt"></i>
                <p>Select a business date to view or modify field schedules.</p>
              </div>
            ) : (
              <div className="panel-content">
                <div className="panel-header">
                  <h3>{selectedDate && formatDateDisplay(selectedDate)}</h3>
                  <button className="close-panel-btn" onClick={() => setShowPanel(false)}>
                    <i className="fas fa-times"></i>
                  </button>
                </div>

                {currentSchedule ? (
                  <div className="existing-schedule">
                    <div className="schedule-info">
                      <div className="info-row">
                        <span className="label">Zone:</span>
                        <span className="value">{formatZoneLabel(currentSchedule.Zone_Name, currentSchedule.Zone_ID)}</span>
                      </div>
                      <div className="info-row">
                        <span className="label">Meter Reader:</span>
                        <span className="value">
                          {currentSchedule.Meter_Reader_Name || 'Unassigned'}
                        </span>
                      </div>
                      <div className="info-row">
                        <span className="label">Status:</span>
                        <span className={`status-${currentSchedule.Status?.toLowerCase()}`}>
                          {currentSchedule.Status || 'Scheduled'}
                        </span>
                      </div>
                    </div>
                    <button className="btn btn-danger btn-block" onClick={handleDeleteSchedule}>
                      <i className="fas fa-trash"></i> Delete Schedule
                    </button>
                  </div>
                ) : (
                  <div className="new-schedule-form">
                    <FormSelect
                      label="Zone *"
                      value={selectedZone}
                      onChange={setSelectedZone}
                      options={zoneOptions}
                      placeholder="Select Zone"
                    />
                    <FormSelect
                      label="Meter Reader (Optional)"
                      value={selectedReader}
                      onChange={setSelectedReader}
                      options={readerOptions}
                      placeholder="Select Meter Reader"
                    />
                    <button className="btn btn-primary btn-block" onClick={handleSaveSchedule}>
                      <i className="fas fa-save"></i> Save Schedule
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default MeterReading;
