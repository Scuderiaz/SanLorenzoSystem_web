const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'billing_officer', 'MeterReading.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace 1: Change selectedZone state to selectedZones (array)
content = content.replace(
  "const [selectedZone, setSelectedZone] = useState('');",
  "const [selectedZones, setSelectedZones] = useState<string[]>([]);"
);

// Replace 2: Change getScheduleForDate to getSchedulesForDate
content = content.replace(
  "const getScheduleForDate = (dateKey: string) => {",
  "const getSchedulesForDate = (dateKey: string) => {"
);
content = content.replace(
  "return schedules.find((s) => s.Schedule_Date === dateKey);",
  "return schedules.filter((s) => s.Schedule_Date === dateKey);"
);

// Replace 3: handleSelectDate
content = content.replace(
  `  const handleSelectDate = (dateKey: string) => {
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
  };`,
  `  const handleSelectDate = (dateKey: string) => {
    setSelectedDate(dateKey);
    setShowPanel(true);
    setSelectedZones([]);
    setSelectedReader('');
  };

  const toggleZoneSelection = (zoneId: string) => {
    setSelectedZones((prev) => 
      prev.includes(zoneId) ? prev.filter(id => id !== zoneId) : [...prev, zoneId]
    );
  };`
);

// Replace 4: handleSaveSchedule
content = content.replace(
  `  const handleSaveSchedule = async () => {
    if (!selectedZone) {
      showToast('Please select a zone', 'error');
      return;
    }

    try {
      await requestJson('/reading-schedules', {
        method: 'POST',
        body: JSON.stringify({
          schedule_date: selectedDate,
          zone_id: parseInt(selectedZone, 10),
          meter_reader_id: selectedReader ? parseInt(selectedReader, 10) : null,
          status: 'Scheduled',
        }),
      });
      showToast('Schedule saved successfully', 'success');
      loadSchedules();
      setShowPanel(false);
    } catch (error) {
      console.error('Error saving schedule:', error);
      showToast(getErrorMessage(error, 'Failed to save schedule'), 'error');
    }
  };`,
  `  const handleSaveSchedule = async () => {
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
  };`
);

// Replace 5: handleDeleteSchedule and handleCancelSchedule
content = content.replace(
  `  const handleDeleteSchedule = async () => {
    if (!selectedDate) return;
    const schedule = getScheduleForDate(selectedDate);
    if (!schedule?.Schedule_ID) return;
    if (!window.confirm('Are you sure you want to permanently delete this schedule?')) return;

    try {
      await requestJson(\`/reading-schedules/\${schedule.Schedule_ID}\`, { method: 'DELETE' });
      showToast('Schedule deleted successfully', 'success');
      loadSchedules();
      setShowPanel(false);
    } catch (error) {
      console.error('Error deleting schedule:', error);
      showToast(getErrorMessage(error, 'Failed to delete schedule'), 'error');
    }
  };

  const handleCancelSchedule = async () => {
    if (!selectedDate) return;
    const schedule = getScheduleForDate(selectedDate);
    if (!schedule?.Schedule_ID) return;
    if (!window.confirm('Are you sure you want to cancel this schedule?')) return;

    try {
      await requestJson(\`/reading-schedules/\${schedule.Schedule_ID}/status\`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'Cancelled' }),
      });
      showToast('Schedule cancelled successfully', 'success');
      loadSchedules();
    } catch (error) {
      console.error('Error cancelling schedule:', error);
      showToast(getErrorMessage(error, 'Failed to cancel schedule'), 'error');
    }
  };`,
  `  const handleDeleteSchedule = async (scheduleId: number) => {
    if (!window.confirm('Are you sure you want to permanently delete this schedule?')) return;

    try {
      await requestJson(\`/reading-schedules/\${scheduleId}\`, { method: 'DELETE' });
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
      await requestJson(\`/reading-schedules/\${scheduleId}/status\`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'Cancelled' }),
      });
      showToast('Schedule cancelled successfully', 'success');
      loadSchedules();
    } catch (error) {
      console.error('Error cancelling schedule:', error);
      showToast(getErrorMessage(error, 'Failed to cancel schedule'), 'error');
    }
  };`
);

// Replace 6: Calendar dots
content = content.replace(
  `        const schedule = getScheduleForDate(dateKey);
        const isScheduled = !!schedule;
        const isSelected = selectedDate === dateKey;

        days.push(
          <div
            key={dateKey}
            className={\`day \${isSelected ? 'selected' : ''}\`}
            onClick={() => handleSelectDate(dateKey)}
          >
            <div className="day-number">{i}</div>
            <div className="day-indicators">
              {isScheduled && <div className="indicator scheduled" title="Zone Scheduled"></div>}
            </div>
          </div>
        );`,
  `        const daySchedules = getSchedulesForDate(dateKey);
        const isScheduled = daySchedules.length > 0;
        const isSelected = selectedDate === dateKey;

        days.push(
          <div
            key={dateKey}
            className={\`day \${isSelected ? 'selected' : ''}\`}
            onClick={() => handleSelectDate(dateKey)}
          >
            <div className="day-number">{i}</div>
            <div className="day-indicators">
              {isScheduled && <div className="indicator scheduled" title={\`\${daySchedules.length} Zone(s) Scheduled\`}></div>}
            </div>
          </div>
        );`
);

// Replace 7: Side Panel Content
// Need to find \`const currentSchedule = selectedDate ? getScheduleForDate(selectedDate) : null;\`
// and replace everything below it up to \`</div>\n            )}\n          </div>\`
const oldPanelRegex = /const currentSchedule = [^]*?(?=\s*<\/div>\s*\)\}\s*<\/div>\s*<\/div>\s*<\/div>)/;
content = content.replace(oldPanelRegex, `const currentSchedules = selectedDate ? getSchedulesForDate(selectedDate) : [];
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

                {currentSchedules.length > 0 && (
                  <div className="existing-schedules-list">
                    <h4 style={{ marginBottom: '15px', color: '#1B1B63', fontSize: '14px', fontWeight: 'bold' }}>Existing Assignments</h4>
                    {currentSchedules.map((schedule) => (
                      <div key={schedule.Schedule_ID} className="existing-schedule" style={{ marginBottom: '15px' }}>
                        <div className="schedule-info">
                          <div className="info-row">
                            <span className="label">Zone:</span>
                            <span className="value">{formatZoneLabel(schedule.Zone_Name, schedule.Zone_ID)}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Meter Reader:</span>
                            <span className="value">
                              {schedule.Meter_Reader_Name || 'Unassigned'}
                            </span>
                          </div>
                          <div className="info-row">
                            <span className="label">Status:</span>
                            <span className={\`status-\${schedule.Status?.toLowerCase()}\`}>
                              {schedule.Status || 'Scheduled'}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                          {schedule.Status !== 'Cancelled' && (
                            <button className="btn btn-warning btn-block" style={{ flex: 1, marginTop: 0 }} onClick={() => handleCancelSchedule(schedule.Schedule_ID!)}>
                              <i className="fas fa-times-circle"></i> Cancel
                            </button>
                          )}
                          <button className="btn btn-danger btn-block" style={{ flex: 1, marginTop: 0 }} onClick={() => handleDeleteSchedule(schedule.Schedule_ID!)}>
                            <i className="fas fa-trash"></i> Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="new-schedule-form" style={{ marginTop: currentSchedules.length > 0 ? '30px' : '0' }}>
                  <h4 style={{ marginBottom: '15px', color: '#1B1B63', fontSize: '14px', fontWeight: 'bold' }}>Assign Zones</h4>
                  
                  <div className="zone-selection-grid">
                    {zoneOptions.map(z => (
                      <div 
                        key={z.value} 
                        className={\`zone-pill \${selectedZones.includes(z.value.toString()) ? 'active' : ''}\`}
                        onClick={() => toggleZoneSelection(z.value.toString())}
                      >
                        {z.label}
                      </div>
                    ))}
                  </div>

                  <FormSelect
                    label="Meter Reader (Optional)"
                    value={selectedReader}
                    onChange={setSelectedReader}
                    options={readerOptions}
                    placeholder="Select Meter Reader"
                  />
                  <button className="btn btn-primary btn-block" onClick={handleSaveSchedule} style={{ marginTop: '20px' }}>
                    <i className="fas fa-save"></i> Save Assignments
                  </button>
                </div>`);

fs.writeFileSync(filePath, content);
console.log('MeterReading multi-zone patched.');
