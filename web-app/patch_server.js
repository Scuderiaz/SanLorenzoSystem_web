const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'backend', 'server.js');
let content = fs.readFileSync(filePath, 'utf8');

if (content.includes("'/api/reading-schedules'")) {
  console.log("Endpoints already exist.");
  process.exit(0);
}

const endpoints = \`
// ==========================================
// METER READING SCHEDULES ENDPOINTS
// ==========================================

app.get('/api/reading-schedules', async (req, res) => {
  try {
    const query = \\\`
      SELECT rs.schedule_id, rs.schedule_date, rs.zone_id, z.zone_name, 
             rs.meter_reader_id, u.full_name as meter_reader_name, rs.status
      FROM reading_schedule rs
      LEFT JOIN zones z ON rs.zone_id = z.zone_id
      LEFT JOIN users u ON rs.meter_reader_id = u.account_id
    \\\`;
    const result = await withPostgresPrimary(query, [], 'Failed to fetch schedules');
    
    // Map to PascalCase for the frontend
    const mapped = (result || []).map(row => ({
      Schedule_ID: row.schedule_id,
      Schedule_Date: row.schedule_date,
      Zone_ID: row.zone_id,
      Zone_Name: row.zone_name,
      Meter_Reader_ID: row.meter_reader_id,
      Meter_Reader_Name: row.meter_reader_name,
      Status: row.status
    }));
    
    res.json(mapped);
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/api/reading-schedules', async (req, res) => {
  try {
    const { schedule_date, zone_id, meter_reader_id, status } = req.body;
    const query = \\\`
      INSERT INTO reading_schedule (schedule_date, zone_id, meter_reader_id, status)
      VALUES ($1, $2, $3, $4)
      RETURNING schedule_id
    \\\`;
    const result = await withPostgresPrimary(
      query, 
      [schedule_date, zone_id, meter_reader_id, status || 'Scheduled'], 
      'Failed to create schedule'
    );
    res.json({ success: true, data: result[0] });
  } catch (error) {
    console.error('Error creating schedule:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.delete('/api/reading-schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'DELETE FROM reading_schedule WHERE schedule_id = $1 RETURNING schedule_id';
    const result = await withPostgresPrimary(query, [id], 'Failed to delete schedule');
    res.json({ success: true, data: result[0] });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.put('/api/reading-schedules/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const query = 'UPDATE reading_schedule SET status = $1 WHERE schedule_id = $2 RETURNING schedule_id';
    const result = await withPostgresPrimary(query, [status, id], 'Failed to update schedule status');
    res.json({ success: true, data: result[0] });
  } catch (error) {
    console.error('Error updating schedule status:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

\`;

const target = 'async function startServer() {';
content = content.replace(target, endpoints + target);

fs.writeFileSync(filePath, content);
console.log('Successfully added API endpoints');
