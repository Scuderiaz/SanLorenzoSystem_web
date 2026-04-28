const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'billing_officer', 'MeterReading.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace 1: Import
content = content.replace(
  "import { getErrorMessage, loadZonesWithFallback } from '../../services/userManagementApi';",
  "import { getErrorMessage, loadZonesWithFallback, requestJson } from '../../services/userManagementApi';"
);

// Replace 2: loadSchedules
content = content.replace(
  /const loadSchedules = useCallback\(async \(\) => \{\s*try \{\s*const mockSchedules: Schedule\[\] = \[\s*\{\s*Schedule_ID: 1,\s*Schedule_Date: '2026-03-20',\s*Zone_ID: 1,\s*Meter_Reader_ID: 1,\s*Meter_Reader_Name: 'John Doe',\s*Status: 'Scheduled',\s*\},\s*\];\s*setSchedules\(mockSchedules\);\s*\} catch \(error\) \{\s*console\.error\('Error loading schedules:', error\);\s*\}\s*\}, \[\]\);/g,
  `const loadSchedules = useCallback(async () => {
    try {
      const response = await requestJson('/reading-schedules');
      setSchedules(response || []);
    } catch (error) {
      console.error('Error loading schedules:', error);
      showToast(getErrorMessage(error, 'Failed to load schedules.'), 'error');
    }
  }, [showToast]);`
);

// Replace 3: loadMeterReaders
content = content.replace(
  /const loadMeterReaders = useCallback\(async \(\) => \{\s*try \{\s*const mockReaders = \[\s*\{ AccountID: 1, Full_Name: 'John Doe', Username: 'john' \},\s*\{ AccountID: 2, Full_Name: 'Jane Smith', Username: 'jane' \},\s*\];\s*setMeterReaders\(mockReaders\);\s*\} catch \(error\) \{\s*console\.error\('Error loading meter readers:', error\);\s*\}\s*\}, \[\]\);/g,
  `const loadMeterReaders = useCallback(async () => {
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
  }, [showToast]);`
);

// Replace 4: handleSaveSchedule
content = content.replace(
  /const handleSaveSchedule = async \(\) => \{\s*if \(\!selectedZone\) \{\s*showToast\('Please select a zone', 'error'\);\s*return;\s*\}\s*try \{\s*showToast\('Schedule saved successfully', 'success'\);\s*loadSchedules\(\);\s*setShowPanel\(false\);\s*\} catch \(error\) \{\s*console\.error\('Error saving schedule:', error\);\s*showToast\('Failed to save schedule', 'error'\);\s*\}\s*\};/g,
  `const handleSaveSchedule = async () => {
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
  };`
);

// Replace 5: handleDeleteSchedule & handleCancelSchedule
content = content.replace(
  /const handleDeleteSchedule = async \(\) => \{\s*if \(\!window\.confirm\('Delete this schedule\?'\)\) return;\s*try \{\s*showToast\('Schedule deleted successfully', 'success'\);\s*loadSchedules\(\);\s*setShowPanel\(false\);\s*\} catch \(error\) \{\s*console\.error\('Error deleting schedule:', error\);\s*showToast\('Failed to delete schedule', 'error'\);\s*\}\s*\};/g,
  `const handleDeleteSchedule = async () => {
    if (!currentSchedule?.Schedule_ID) return;
    if (!window.confirm('Are you sure you want to permanently delete this schedule?')) return;

    try {
      await requestJson(\`/reading-schedules/\${currentSchedule.Schedule_ID}\`, { method: 'DELETE' });
      showToast('Schedule deleted successfully', 'success');
      loadSchedules();
      setShowPanel(false);
    } catch (error) {
      console.error('Error deleting schedule:', error);
      showToast(getErrorMessage(error, 'Failed to delete schedule'), 'error');
    }
  };

  const handleCancelSchedule = async () => {
    if (!currentSchedule?.Schedule_ID) return;
    if (!window.confirm('Are you sure you want to cancel this schedule?')) return;

    try {
      await requestJson(\`/reading-schedules/\${currentSchedule.Schedule_ID}/status\`, {
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

// Replace 6: Buttons JSX
content = content.replace(
  /<\/div>\s*<button className="btn btn-danger btn-block" onClick=\{handleDeleteSchedule\}>\s*<i className="fas fa-trash"><\/i> Delete Schedule\s*<\/button>\s*<\/div>/g,
  `</div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                      {currentSchedule.Status !== 'Cancelled' && (
                        <button className="btn btn-warning btn-block" style={{ flex: 1, marginTop: 0 }} onClick={handleCancelSchedule}>
                          <i className="fas fa-times-circle"></i> Cancel
                        </button>
                      )}
                      <button className="btn btn-danger btn-block" style={{ flex: 1, marginTop: 0 }} onClick={handleDeleteSchedule}>
                        <i className="fas fa-trash"></i> Delete
                      </button>
                    </div>
                  </div>`
);

// Add currentSchedule missing declaration handling inside render scope
content = content.replace(
  /const currentSchedule = selectedDate \? getScheduleForDate\(selectedDate\) : null;/g,
  `const currentSchedule = selectedDate ? getScheduleForDate(selectedDate) : null;` // just identity replace to find position if needed
);

fs.writeFileSync(filePath, content);
console.log('MeterReading patched.');
