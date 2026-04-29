import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import FormSelect from '../../components/Common/FormSelect';
import { useToast } from '../../components/Common/ToastContainer';
import { getErrorMessage, loadZonesWithFallback, requestJson } from '../../services/userManagementApi';
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

const scheduleStatusClassName = (status?: string) => {
  const normalizedStatus = String(status || 'Scheduled').trim().toLowerCase();
  if (normalizedStatus === 'scheduled') {
    return 'status-scheduled';
  }
  if (normalizedStatus === 'cancelled') {
    return 'status-cancelled';
  }
  return 'status-default';
};

const MeterReading: React.FC = () => {
  const { showToast } = useToast();
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [meterReaders, setMeterReaders] = useState<any[]>([]);
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [selectedReader, setSelectedReader] = useState('');
  const [showPanel, setShowPanel] = useState(false);

  const loadSchedules = useCallback(async () => {
    try {
      const response = await requestJson('/reading-schedules');
      setSchedules(response || []);
    } catch (error) {
      console.error('Error loading schedules:', error);
      showToast(getErrorMessage(error, 'Failed to load schedules.'), 'error');
    }
  }, [showToast]);

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
      const response = await requestJson('/users/staff');
      if (response.success && Array.isArray(response.data)) {
        const readers = response.data.filter((u: any) => u.Role_ID === 3);
        setMeterReaders(readers);
      }
    } catch (error) {
      console.error('Error loading meter readers:', error);
      showToast(getErrorMessage(error, 'Failed to load meter readers.'), 'error');
    }
  }, [showToast]);

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

  const getSchedulesForDate = (dateKey: string) => {
    return schedules.filter((s) => s.Schedule_Date === dateKey);
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
    setSelectedZones([]);
    setSelectedReader('');
  };

  const toggleZoneSelection = (zoneId: string) => {
    setSelectedZones((prev) => 
      prev.includes(zoneId) ? prev.filter(id => id !== zoneId) : [...prev, zoneId]
    );
  };

  const handleSaveSchedule = async () => {
    if (selectedZones.length === 0) {
      showToast('Please select at least one zone', 'error');
      return;
    }

    try {
      await Promise.all(selectedZones.map(zoneId => 
        requestJson('/reading-schedules', {
          method: 'POST',
          body: JSON.stringify({
            schedule_date: selectedDate,
            zone_id: parseInt(zoneId, 10),
            meter_reader_id: selectedReader ? parseInt(selectedReader, 10) : null,
            status: 'Scheduled',
          }),
        })
      ));
      showToast('Schedules saved successfully', 'success');
      loadSchedules();
      setSelectedZones([]);
      // Don't close panel so user can see the created schedules
    } catch (error) {
      console.error('Error saving schedules:', error);
      showToast(getErrorMessage(error, 'Failed to save one or more schedules'), 'error');
    }
  };

  const handleDeleteSchedule = async (scheduleId: number) => {
    if (!window.confirm('Are you sure you want to permanently delete this schedule?')) return;

    try {
      await requestJson(`/reading-schedules/${scheduleId}`, { method: 'DELETE' });
      showToast('Schedule deleted successfully', 'success');
      loadSchedules();
    } catch (error) {
      console.error('Error deleting schedule:', error);
      showToast(getErrorMessage(error, 'Failed to delete schedule'), 'error');
    }
  };

  const handleCancelSchedule = async (scheduleId: number) => {
    if (!window.confirm('Are you sure you want to cancel this schedule?')) return;

    try {
      await requestJson(`/reading-schedules/${scheduleId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'Cancelled' }),
      });
      showToast('Schedule cancelled successfully', 'success');
      loadSchedules();
    } catch (error) {
      console.error('Error cancelling schedule:', error);
      showToast(getErrorMessage(error, 'Failed to cancel schedule'), 'error');
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
      const daySchedules = getSchedulesForDate(dateKey);
      const isScheduled = daySchedules.length > 0;
      const isSelected = selectedDate === dateKey;
      const isToday = dateKey === today;

      let classes = 'day';
      if (isScheduled) classes += ' scheduled';
      if (isSelected) classes += ' selected';
      if (isToday) classes += ' today';

      days.push(
        <button
          key={dateKey}
          type="button"
          className={classes}
          onClick={() => handleSelectDate(dateKey)}
          aria-pressed={isSelected}
          aria-label={`${formatDateDisplay(dateKey)}${isScheduled ? `, ${daySchedules.length} scheduled zone${daySchedules.length > 1 ? 's' : ''}` : ''}`}
        >
          <span className="day-number">{day}</span>
          {isScheduled && (
            <div className="day-info">
              <span className="day-zone">{daySchedules.length} Zone{daySchedules.length > 1 ? 's' : ''}</span>
              <span className="day-reader">Scheduled</span>
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
          <h2>
            {monthNames[currentMonth]} {currentYear}
          </h2>
          <button type="button" className="nav-btn" onClick={handleNextMonth} aria-label="Go to next month">
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

  const currentSchedules = selectedDate ? getSchedulesForDate(selectedDate) : [];
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
            <div className="section-intro">
                <h3 className="section-intro-title">Active Operations Calendar</h3>
                <p className="section-intro-copy">Select an operational date to assign reading zones and field personnel.</p>
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
                  <button type="button" className="close-panel-btn" onClick={() => setShowPanel(false)}>
                    <i className="fas fa-times"></i>
                  </button>
                </div>

                {currentSchedules.length > 0 && (
                  <div className="existing-schedules-list">
                    <h4 className="panel-section-title">Existing Assignments</h4>
                    {currentSchedules.map((schedule) => (
                      <div key={schedule.Schedule_ID} className="existing-schedule">
                        <div className="schedule-info">
                          <div className="info-row">
                            <span className="schedule-label">Zone:</span>
                            <span className="schedule-value">{formatZoneLabel(schedule.Zone_Name, schedule.Zone_ID)}</span>
                          </div>
                          <div className="info-row">
                            <span className="schedule-label">Meter Reader:</span>
                            <span className="schedule-value">
                              {schedule.Meter_Reader_Name || 'Unassigned'}
                            </span>
                          </div>
                          <div className="info-row">
                            <span className="schedule-label">Status:</span>
                            <span className={scheduleStatusClassName(schedule.Status)}>
                              {schedule.Status || 'Scheduled'}
                            </span>
                          </div>
                        </div>
                        <div className="schedule-actions">
                          {schedule.Status !== 'Cancelled' && (
                            <button type="button" className="btn btn-warning btn-block" style={{ flex: 1, marginTop: 0 }} onClick={() => handleCancelSchedule(schedule.Schedule_ID!)}>
                              <i className="fas fa-times-circle"></i> Cancel
                            </button>
                          )}
                          <button type="button" className="btn btn-danger btn-block" style={{ flex: 1, marginTop: 0 }} onClick={() => handleDeleteSchedule(schedule.Schedule_ID!)}>
                            <i className="fas fa-trash"></i> Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className={`new-schedule-form ${currentSchedules.length > 0 ? 'new-schedule-form-spaced' : ''}`}>
                  <h4 className="panel-section-title">Assign Zones</h4>
                  
                  <div className="zone-selection-grid">
                    {zoneOptions.map(z => (
                      <button
                        key={z.value} 
                        type="button"
                        className={`zone-pill ${selectedZones.includes(z.value.toString()) ? 'active' : ''}`}
                        onClick={() => toggleZoneSelection(z.value.toString())}
                        aria-pressed={selectedZones.includes(z.value.toString())}
                      >
                        {z.label}
                      </button>
                    ))}
                  </div>

                  <FormSelect
                    label="Meter Reader (Optional)"
                    value={selectedReader}
                    onChange={setSelectedReader}
                    options={readerOptions}
                    placeholder="Select Meter Reader"
                  />
                  <button type="button" className="btn btn-primary btn-block" onClick={handleSaveSchedule} style={{ marginTop: '20px' }}>
                    <i className="fas fa-save"></i> Save Assignments
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default MeterReading;
