const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const syncLogDir = path.join(__dirname, 'sync-logs');
const postgresSyncLogFile = path.join(syncLogDir, 'postgres-sync.txt');
const supabaseSyncLogFile = path.join(syncLogDir, 'supabase-sync.txt');
const requestErrorLogFile = path.join(syncLogDir, 'request-errors.txt');

app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const supabaseWaterBilling = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { db: { schema: 'water_billing' } })
  : null;
const requireSupabaseSync = process.env.REQUIRE_SUPABASE_SYNC !== 'false';
const postgresConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'SLRWs',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool(postgresConfig);
const syncIntervalMs = Number(process.env.SUPABASE_SYNC_INTERVAL_MS || 60000);
let isSupabaseSyncRunning = false;

const syncTableConfigs = [
  { tableName: 'roles', primaryKey: 'role_id' },
  { tableName: 'zone', primaryKey: 'zone_id' },
  { tableName: 'classification', primaryKey: 'classification_id' },
  { tableName: 'accounts', primaryKey: 'account_id' },
  { tableName: 'consumer', primaryKey: 'consumer_id' },
  { tableName: 'meter', primaryKey: 'meter_id' },
  { tableName: 'route', primaryKey: 'route_id' },
  { tableName: 'meterreadings', primaryKey: 'reading_id' },
  { tableName: 'bills', primaryKey: 'bill_id' },
  { tableName: 'payment', primaryKey: 'payment_id' },
  { tableName: 'ledger_entry', primaryKey: 'ledger_id' },
  { tableName: 'waterrates', primaryKey: 'rate_id' },
  { tableName: 'connection_ticket', primaryKey: 'ticket_id' },
  { tableName: 'password_reset', primaryKey: 'reset_id' },
  { tableName: 'account_approval', primaryKey: 'approval_id' },
  { tableName: 'backuplogs', primaryKey: 'backup_id' },
  { tableName: 'error_logs', primaryKey: 'error_id' },
  { tableName: 'system_logs', primaryKey: 'log_id' },
  { tableName: 'otp_verifications', primaryKey: 'ID' },
  { tableName: 'registration_tickets', primaryKey: 'ID' },
];

function ensureSyncLogDir() {
  if (!fs.existsSync(syncLogDir)) {
    fs.mkdirSync(syncLogDir, { recursive: true });
  }
}

function appendSyncLog(filePath, message) {
  ensureSyncLogDir();
  fs.appendFileSync(filePath, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
}

function logPostgresSync(message) {
  appendSyncLog(postgresSyncLogFile, message);
}

function logSupabaseSync(message) {
  appendSyncLog(supabaseSyncLogFile, message);
}

function serializeRequestDetails(req) {
  return JSON.stringify({
    method: req.method,
    path: req.originalUrl,
    params: req.params,
    query: req.query,
    body: req.body,
  });
}

function logRequestError(req, context, error) {
  const message = `${context} | ${serializeRequestDetails(req)} | ${error.message}`;
  appendSyncLog(requestErrorLogFile, message);
}

async function initDb() {
  const schemaCheck = await pool.query(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'water_billing' AND table_name = 'roles'
    ) AS exists`
  );

  if (!schemaCheck.rows[0].exists) {
    throw new Error('Expected schema water_billing.roles was not found. Database schema must be pre-applied.');
  }
}

async function syncTableToSupabase(tableName, primaryKey) {
  logPostgresSync(`Preparing table ${tableName} for Supabase sync using key ${primaryKey}.`);
  const { rows } = await pool.query(`SELECT * FROM water_billing.${tableName}`);

  if (rows.length === 0) {
    logPostgresSync(`Table ${tableName} has no rows to sync.`);
    logSupabaseSync(`Table ${tableName} received no rows from PostgreSQL sync.`);
    return { tableName, synced: 0 };
  }

  const { error } = await supabaseWaterBilling.from(tableName).upsert(rows, {
    onConflict: primaryKey,
    ignoreDuplicates: false,
  });

  if (error) {
    logSupabaseSync(`ERROR syncing table ${tableName}: ${error.message}`);
    throw new Error(`${tableName}: ${error.message}`);
  }

  logPostgresSync(`Table ${tableName} exported ${rows.length} row(s) for sync.`);
  logSupabaseSync(`Table ${tableName} upserted ${rows.length} row(s) successfully.`);
  return { tableName, synced: rows.length };
}

async function syncPostgresToSupabase() {
  if (!supabaseWaterBilling) {
    throw new Error('Supabase sync is required but not configured.');
  }

  if (isSupabaseSyncRunning) {
    return [];
  }

  isSupabaseSyncRunning = true;
  logPostgresSync('Starting PostgreSQL to Supabase sync cycle.');
  logSupabaseSync('Starting PostgreSQL to Supabase sync cycle.');

  try {
    const results = [];

    for (const { tableName, primaryKey } of syncTableConfigs) {
      results.push(await syncTableToSupabase(tableName, primaryKey));
    }

    const summary = results.map(result => `${result.tableName}:${result.synced}`).join(', ');
    logPostgresSync(`Sync cycle completed successfully. Summary: ${summary}`);
    logSupabaseSync(`Sync cycle completed successfully. Summary: ${summary}`);
    return results;
  } catch (error) {
    logPostgresSync(`ERROR during sync cycle: ${error.message}`);
    logSupabaseSync(`ERROR during sync cycle: ${error.message}`);
    throw error;
  } finally {
    isSupabaseSyncRunning = false;
  }
}

function startSupabaseSyncScheduler() {
  if (!supabaseWaterBilling) {
    logSupabaseSync('Background sync scheduler not started because Supabase is not configured.');
    return;
  }

  setInterval(() => {
    syncPostgresToSupabase().catch((error) => {
      logSupabaseSync(`Background sync scheduler error: ${error.message}`);
      console.warn('Supabase sync skipped:', error.message);
    });
  }, syncIntervalMs);

  logSupabaseSync(`Background sync scheduler started with interval ${syncIntervalMs}ms.`);
}

async function syncSupabaseMirror() {
  if (!supabaseWaterBilling) {
    const error = new Error('Supabase sync is required but not configured.');
    logSupabaseSync(error.message);
    throw error;
  }

  try {
    await syncPostgresToSupabase();
  } catch (error) {
    logSupabaseSync(`Mirror sync failed: ${error.message}`);
    console.warn('Supabase mirror sync failed:', error.message);
  }
}

async function readWithFallback(context, supabaseOperation, postgresOperation) {
  if (!supabase) {
    return postgresOperation();
  }

  try {
    return await supabaseOperation();
  } catch (error) {
    console.warn(`Supabase read failed for ${context}, using PostgreSQL fallback:`, error.message);
    return postgresOperation();
  }
}

// Get roles
app.get('/api/roles', async (req, res) => {
  try {
    const data = await readWithFallback(
      'roles',
      async () => {
        const { data, error } = await supabase.from('roles').select('*');
        if (error) throw error;
        return data;
      },
      async () => {
        const { rows } = await pool.query('SELECT * FROM roles ORDER BY "Role_ID"');
        return rows;
      }
    );
    return res.json({ success: true, data });
  } catch (error) {
    logRequestError(req, 'GET /api/roles', error);
    console.error('Error fetching roles:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get users by type (desktop or mobile)
// Get users by type (desktop or mobile) - DEPRECATED (use /api/users/unified instead)
app.get('/api/users/type/:type', async (req, res) => {
  const { type } = req.params;
  
  try {
    const roleIds = type === 'desktop' ? [1, 3, 4] : [2, 5];
    const data = await readWithFallback(
      `users/type/${type}`,
      async () => {
        const { data, error } = await supabase
          .from('accounts')
          .select(`
            AccountID,
            Username,
            Password,
            Full_Name,
            Role_ID,
            Status,
            roles ( Role_Name )
          `)
          .in('Role_ID', roleIds);
        if (error) throw error;
        return data.map(u => ({
          ...u,
          Role_Name: u.roles?.Role_Name,
        }));
      },
      async () => {
        const { rows } = await pool.query(
          `SELECT a."AccountID", a."Username", a."Password", a."Full_Name", a."Role_ID", a."Status", r."Role_Name"
           FROM accounts a
           JOIN roles r ON a."Role_ID" = r."Role_ID"
           WHERE a."Role_ID" = ANY($1::int[])`,
          [roleIds]
        );
        return rows;
      }
    );
    return res.json({ success: true, data });
  } catch (error) {
    logRequestError(req, 'GET /api/users/type/:type', error);
    console.error('Error fetching users:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET Unified Users (Staff + Consumers + IoT)
app.get('/api/users/unified', async (req, res) => {
  try {
    const data = await readWithFallback(
      'users/unified',
      async () => {
        const { data, error } = await supabase
          .from('accounts')
          .select(`
            AccountID,
            Username,
            Full_Name,
            Role_ID,
            Status,
            Phone_Number,
            roles ( Role_Name )
          `)
          .order('AccountID', { ascending: false });
        if (error) throw error;
        return data.map(u => ({
          ...u,
          Role_Name: u.roles?.Role_Name,
        }));
      },
      async () => {
        const { rows } = await pool.query(
          `SELECT a."AccountID", a."Username", a."Full_Name", a."Role_ID", a."Status", a."Phone_Number", r."Role_Name"
           FROM accounts a
           LEFT JOIN roles r ON a."Role_ID" = r."Role_ID"
           ORDER BY a."AccountID" DESC`
        );
        return rows;
      }
    );
    return res.json({ success: true, data });
  } catch (error) {
    logRequestError(req, 'GET /api/users/unified', error);
    console.error('Error fetching unified users:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Approve Pending Account
app.post('/api/admin/approve-user', async (req, res) => {
  const { accountId } = req.body;
  try {
    await pool.query('UPDATE accounts SET "Status" = $1 WHERE "AccountID" = $2', ['Active', accountId]);
    await pool.query('UPDATE consumer SET "Status" = $1 WHERE "Login_ID" = $2', ['Active', accountId]);
    await syncSupabaseMirror();
    return res.json({ success: true, message: 'Account approved successfully' });
  } catch (error) {
    logRequestError(req, 'POST /api/admin/approve-user', error);
    console.error('Approval error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Reject Pending Account (Delete)
app.post('/api/admin/reject-user', async (req, res) => {
  const { accountId } = req.body;
  try {
    await pool.query('DELETE FROM registration_tickets WHERE "AccountID" = $1', [accountId]);
    await pool.query('DELETE FROM consumer WHERE "Login_ID" = $1', [accountId]);
    await pool.query('DELETE FROM accounts WHERE "AccountID" = $1', [accountId]);
    await syncSupabaseMirror();
    return res.json({ success: true, message: 'Account rejected and deleted' });
  } catch (error) {
    logRequestError(req, 'POST /api/admin/reject-user', error);
    console.error('Rejection error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Create user
app.post('/api/users', async (req, res) => {
  const { username, fullName, password, roleId } = req.body;
  
  if (!username || !password || !roleId) {
    return res.status(400).json({ success: false, message: 'Username, password, and role are required' });
  }
  
  try {
    const { rows } = await pool.query(
      'INSERT INTO accounts ("Username", "Full_Name", "Password", "Role_ID") VALUES ($1, $2, $3, $4) RETURNING *',
      [username, fullName, password, roleId]
    );
    await syncSupabaseMirror();
    return res.json({ success: true, data: rows });
  } catch (error) {
    logRequestError(req, 'POST /api/users', error);
    console.error('Error creating user:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Update user
app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { fullName, password, roleId } = req.body;
  
  try {
    const values = [fullName, roleId];
    let query = 'UPDATE accounts SET "Full_Name" = $1, "Role_ID" = $2';

    if (password) {
      values.push(password);
      query += `, "Password" = $${values.length}`;
    }

    values.push(id);
    query += ` WHERE "AccountID" = $${values.length} RETURNING *`;

    const { rows } = await pool.query(query, values);
    await syncSupabaseMirror();
    return res.json({ success: true, data: rows });
  } catch (error) {
    logRequestError(req, 'PUT /api/users/:id', error);
    console.error('Error updating user:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Delete user
app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    await pool.query('DELETE FROM accounts WHERE "AccountID" = $1', [id]);
    await syncSupabaseMirror();
    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    logRequestError(req, 'DELETE /api/users/:id', error);
    console.error('Error deleting user:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  try {
    const user = await readWithFallback(
      `login/${username}`,
      async () => {
        const { data, error } = await supabase
          .from('accounts')
          .select(`
            AccountID,
            Username,
            Password,
            Full_Name,
            Role_ID,
            Status,
            roles ( Role_Name )
          `)
          .eq('Username', username)
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        return {
          AccountID: data.AccountID,
          Username: data.Username,
          Password: data.Password,
          Full_Name: data.Full_Name,
          Role_ID: data.Role_ID,
          Status: data.Status,
          Role_Name: data.roles?.Role_Name,
        };
      },
      async () => {
        const { rows } = await pool.query(
          `SELECT a."AccountID", a."Username", a."Password", a."Full_Name", a."Role_ID", a."Status", r."Role_Name"
           FROM accounts a
           JOIN roles r ON a."Role_ID" = r."Role_ID"
           WHERE a."Username" = $1
           LIMIT 1`,
          [username]
        );
        return rows[0] || null;
      }
    );

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username' });
    }

    if (user.Status === 'Pending') {
      return res.status(401).json({ success: false, message: 'Please wait until you are registered to access the dashboard.' });
    }

    if (user.Password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    return res.json({
      success: true,
      user: {
        id: user.AccountID,
        username: user.Username,
        fullName: user.Full_Name || user.Username,
        role_id: user.Role_ID,
        role_name: user.Role_Name,
      },
    });
  } catch (error) {
    logRequestError(req, 'POST /api/login', error);
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Database error: ' + error.message });
  }
});

// Get zones
app.get('/api/zones', async (req, res) => {
  try {
    const data = await readWithFallback(
      'zones',
      async () => {
        const { data, error } = await supabase.from('zones').select('*');
        if (error) throw error;
        return data;
      },
      async () => {
        const { rows } = await pool.query('SELECT * FROM zones ORDER BY "Zone_ID"');
        return rows;
      }
    );
    return res.json({ success: true, data });
  } catch (error) {
    logRequestError(req, 'GET /api/zones', error);
    console.error('Error fetching zones:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get classifications
app.get('/api/classifications', async (req, res) => {
  try {
    const data = await readWithFallback(
      'classifications',
      async () => {
        const { data, error } = await supabase.from('classifications').select('*');
        if (error) throw error;
        return data;
      },
      async () => {
        const { rows } = await pool.query('SELECT * FROM classifications ORDER BY "Classification_ID"');
        return rows;
      }
    );
    return res.json({ success: true, data });
  } catch (error) {
    logRequestError(req, 'GET /api/classifications', error);
    console.error('Error fetching classifications:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/consumers', async (req, res) => {
  try {
    const data = await readWithFallback(
      'consumers',
      async () => {
        const { data, error } = await supabase
          .from('consumer')
          .select(`
            *,
            zones (Zone_Name),
            classifications (Classification_Name)
          `);
        if (error) throw error;
        return data.map(c => ({
          ...c,
          Zone_Name: c.zones?.Zone_Name,
          Classification_Name: c.classifications?.Classification_Name,
        }));
      },
      async () => {
        const { rows } = await pool.query(
          `SELECT c.*, z."Zone_Name", cl."Classification_Name"
           FROM consumer c
           LEFT JOIN zones z ON c."Zone_ID" = z."Zone_ID"
           LEFT JOIN classifications cl ON c."Classification_ID" = cl."Classification_ID"`
        );
        return rows;
      }
    );
    return res.json(data);
  } catch (error) {
    logRequestError(req, 'GET /api/consumers', error);
    console.error('Error fetching consumers:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/consumers', async (req, res) => {
  try {
    const consumer = req.body;
    const { rows } = await pool.query(
      `INSERT INTO consumer ("First_Name", "Last_Name", "Address", "Zone_ID", "Classification_ID", "Account_Number", "Meter_Number", "Status", "Contact_Number", "Connection_Date")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        consumer.First_Name,
        consumer.Last_Name,
        consumer.Address,
        consumer.Zone_ID,
        consumer.Classification_ID,
        consumer.Account_Number,
        consumer.Meter_Number,
        consumer.Status || 'Active',
        consumer.Contact_Number,
        consumer.Connection_Date,
      ]
    );
    await syncSupabaseMirror();
    return res.json({ success: true, data: rows });
  } catch (error) {
    logRequestError(req, 'POST /api/consumers', error);
    console.error('Error creating consumer:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// --- CLASSIFICATIONS ---
app.get('/api/classifications', async (req, res) => {
  try {
    const data = await readWithFallback(
      'classifications/ordered',
      async () => {
        const { data, error } = await supabase.from('classifications').select('*').order('Classification_ID');
        if (error) throw error;
        return data;
      },
      async () => {
        const { rows } = await pool.query('SELECT * FROM classifications ORDER BY "Classification_ID"');
        return rows;
      }
    );
    return res.json({ success: true, data });
  } catch (error) {
    logRequestError(req, 'GET /api/classifications (ordered)', error);
    console.error('Error fetching classifications:', error);
    return res.status(500).json({ error: error.message });
  }
});

// --- ZONES ---
app.get('/api/zones', async (req, res) => {
  try {
    const data = await readWithFallback(
      'zones/ordered',
      async () => {
        const { data, error } = await supabase.from('zones').select('*').order('Zone_ID');
        if (error) throw error;
        return data;
      },
      async () => {
        const { rows } = await pool.query('SELECT * FROM zones ORDER BY "Zone_ID"');
        return rows;
      }
    );
    return res.json({ success: true, data });
  } catch (error) {
    logRequestError(req, 'GET /api/zones (ordered)', error);
    console.error('Error fetching zones:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/consumers/:id', async (req, res) => {
  const { id } = req.params;
  const consumer = req.body;
  
  try {
    const { rows } = await pool.query(
      `UPDATE consumer SET
        "First_Name" = $1,
        "Last_Name" = $2,
        "Address" = $3,
        "Zone_ID" = $4,
        "Classification_ID" = $5,
        "Account_Number" = $6,
        "Meter_Number" = $7,
        "Status" = $8,
        "Contact_Number" = $9,
        "Connection_Date" = $10
       WHERE "Consumer_ID" = $11
       RETURNING *`,
      [
        consumer.First_Name,
        consumer.Last_Name,
        consumer.Address,
        consumer.Zone_ID,
        consumer.Classification_ID,
        consumer.Account_Number,
        consumer.Meter_Number,
        consumer.Status,
        consumer.Contact_Number,
        consumer.Connection_Date,
        id,
      ]
    );
    await syncSupabaseMirror();
    return res.json({ success: true, data: rows });
  } catch (error) {
    logRequestError(req, 'PUT /api/consumers/:id', error);
    console.error('Error updating consumer:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/consumers/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    await pool.query('DELETE FROM consumer WHERE "Consumer_ID" = $1', [id]);
    await syncSupabaseMirror();
    return res.json({ success: true, message: 'Consumer deleted successfully' });
  } catch (error) {
    logRequestError(req, 'DELETE /api/consumers/:id', error);
    console.error('Error deleting consumer:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/meter-readings', async (req, res) => {
  try {
    const data = await readWithFallback(
      'meter-readings',
      async () => {
        const { data, error } = await supabase.from('meterreadings').select('*');
        if (error) throw error;
        return data;
      },
      async () => {
        const { rows } = await pool.query('SELECT * FROM meterreadings ORDER BY "Reading_ID" DESC');
        return rows;
      }
    );
    return res.json(data);
  } catch (error) {
    logRequestError(req, 'GET /api/meter-readings', error);
    console.error('Error fetching meter readings:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/meter-readings', async (req, res) => {
  try {
    const reading = req.body;
    const { rows } = await pool.query(
      `INSERT INTO meterreadings ("Consumer_ID", "Meter_ID", "Previous_Reading", "Current_Reading", "Consumption", "Reading_Status", "Notes", "Reading_Date")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        reading.Consumer_ID,
        reading.Meter_ID,
        reading.Previous_Reading,
        reading.Current_Reading,
        reading.Consumption,
        reading.Reading_Status || 'Normal',
        reading.Notes,
        reading.Reading_Date,
      ]
    );
    await syncSupabaseMirror();
    return res.json(rows);
  } catch (error) {
    logRequestError(req, 'POST /api/meter-readings', error);
    console.error('Error creating meter reading:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills', async (req, res) => {
  try {
    const data = await readWithFallback(
      'bills',
      async () => {
        const { data, error } = await supabase.from('bills').select('*');
        if (error) throw error;
        return data;
      },
      async () => {
        const { rows } = await pool.query('SELECT * FROM bills ORDER BY "Bill_ID" DESC');
        return rows;
      }
    );
    return res.json(data);
  } catch (error) {
    logRequestError(req, 'GET /api/bills', error);
    console.error('Error fetching bills:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/bills', async (req, res) => {
  try {
    const bill = req.body;
    const { rows } = await pool.query(
      `INSERT INTO bills ("Consumer_ID", "Reading_ID", "Bill_Date", "Due_Date", "Total_Amount", "Status")
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        bill.Consumer_ID,
        bill.Reading_ID,
        bill.Bill_Date,
        bill.Due_Date,
        bill.Total_Amount,
        bill.Status || 'Unpaid',
      ]
    );
    await syncSupabaseMirror();
    return res.json(rows);
  } catch (error) {
    logRequestError(req, 'POST /api/bills', error);
    console.error('Error creating bill:', error);
    return res.status(500).json({ error: error.message });
  }
});

// --- CONSUMER DASHBOARD ---
app.get('/api/consumer-dashboard/:accountId', async (req, res) => {
  const { accountId } = req.params;
  try {
    const dashboard = await readWithFallback(
      `consumer-dashboard/${accountId}`,
      async () => {
        const { data: consumer, error: consumerError } = await supabase
          .from('consumer')
          .select('*')
          .eq('Login_ID', accountId)
          .maybeSingle();
        if (consumerError) throw consumerError;
        if (!consumer) {
          return null;
        }

        const consumerId = consumer.Consumer_ID;
        const { data: bills, error: billsError } = await supabase
          .from('bills')
          .select('*')
          .eq('Consumer_ID', consumerId)
          .order('Bill_Date', { ascending: false });
        if (billsError) throw billsError;

        const { data: payments, error: paymentsError } = await supabase
          .from('payments')
          .select('*, bills(Bill_Date)')
          .eq('Consumer_ID', consumerId)
          .order('Payment_Date', { ascending: false });
        if (paymentsError) throw paymentsError;

        const { data: readings, error: readingsError } = await supabase
          .from('meterreadings')
          .select('Reading_Date, Consumption')
          .eq('Consumer_ID', consumerId)
          .order('Reading_Date', { ascending: false })
          .limit(6);
        if (readingsError) throw readingsError;

        return {
          consumer,
          bills: bills || [],
          payments: payments || [],
          readings: (readings || []).reverse(),
        };
      },
      async () => {
        const consumerResult = await pool.query('SELECT * FROM consumer WHERE "Login_ID" = $1 LIMIT 1', [accountId]);
        const consumer = consumerResult.rows[0];
        if (!consumer) {
          return null;
        }

        const billsResult = await pool.query(
          'SELECT * FROM bills WHERE "Consumer_ID" = $1 ORDER BY "Bill_Date" DESC',
          [consumer.Consumer_ID]
        );
        const paymentsResult = await pool.query(
          `SELECT p.*, b."Bill_Date"
           FROM payments p
           LEFT JOIN bills b ON p."Bill_ID" = b."Bill_ID"
           WHERE p."Consumer_ID" = $1
           ORDER BY p."Payment_Date" DESC`,
          [consumer.Consumer_ID]
        );
        const readingsResult = await pool.query(
          `SELECT "Reading_Date", "Consumption"
           FROM meterreadings
           WHERE "Consumer_ID" = $1
           ORDER BY "Reading_Date" DESC
           LIMIT 6`,
          [consumer.Consumer_ID]
        );

        return {
          consumer,
          bills: billsResult.rows,
          payments: paymentsResult.rows,
          readings: readingsResult.rows.reverse(),
        };
      }
    );

    if (!dashboard) {
      return res.status(404).json({ success: false, message: 'Consumer profile not found' });
    }

    return res.json({ success: true, ...dashboard });
  } catch (error) {
    logRequestError(req, 'GET /api/consumer-dashboard/:accountId', error);
    console.error('Consumer dashboard error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/payments', async (req, res) => {
  try {
    const data = await readWithFallback(
      'payments',
      async () => {
        const { data, error } = await supabase.from('payments').select('*');
        if (error) throw error;
        return data;
      },
      async () => {
        const { rows } = await pool.query('SELECT * FROM payments ORDER BY "Payment_ID" DESC');
        return rows;
      }
    );
    return res.json(data);
  } catch (error) {
    logRequestError(req, 'GET /api/payments', error);
    console.error('Error fetching payments:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/payments', async (req, res) => {
  try {
    const payment = req.body;
    const { rows } = await pool.query(
      `INSERT INTO payments ("Bill_ID", "Consumer_ID", "Amount_Paid", "Payment_Date", "Payment_Method", "Reference_Number")
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        payment.Bill_ID,
        payment.Consumer_ID,
        payment.Amount_Paid,
        payment.Payment_Date,
        payment.Payment_Method,
        payment.Reference_Number,
      ]
    );
    await syncSupabaseMirror();
    return res.json(rows);
  } catch (error) {
    logRequestError(req, 'POST /api/payments', error);
    console.error('Error creating payment:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Helper to send SMS (Mock for now)
const sendSMS = async (phone, message) => {
  console.log(`\n--- MOCK SMS SENT ---`);
  console.log(`To: ${phone}`);
  console.log(`Message: ${message}`);
  console.log(`----------------------\n`);
  return { success: true };
};

// --- FORGOT PASSWORD ENDPOINTS ---

// Request OTP
app.post('/api/forgot-password/request', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ success: false, message: 'Username is required' });

  try {
    const user = await readWithFallback(
      `forgot-password/request/${username}`,
      async () => {
        const { data, error } = await supabase.from('accounts').select('*').eq('Username', username).maybeSingle();
        if (error) throw error;
        return data;
      },
      async () => {
        const { rows } = await pool.query('SELECT * FROM accounts WHERE "Username" = $1 LIMIT 1', [username]);
        return rows[0] || null;
      }
    );

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (!user.Phone_Number) {
      return res.status(400).json({ success: false, message: 'No phone number linked to this account. Please contact admin.' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString(); // 10 minutes from now

    await pool.query(
      'INSERT INTO otp_verifications ("AccountID", "Code", "ExpiresAt") VALUES ($1, $2, $3)',
      [user.AccountID, otpCode, expiresAt]
    );
    await syncSupabaseMirror();

    await sendSMS(user.Phone_Number, `Your San Lorenzo Water System reset code is: ${otpCode}. Valid for 10 mins.`);

    return res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    logRequestError(req, 'POST /api/forgot-password/request', error);
    console.error('Forgot password request error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Verify OTP
app.post('/api/forgot-password/verify', async (req, res) => {
  const { username, code } = req.body;
  if (!username || !code) return res.status(400).json({ success: false, message: 'Username and code are required' });

  try {
    const user = await readWithFallback(
      `forgot-password/verify-user/${username}`,
      async () => {
        const { data, error } = await supabase.from('accounts').select('*').eq('Username', username).maybeSingle();
        if (error) throw error;
        return data;
      },
      async () => {
        const { rows } = await pool.query('SELECT * FROM accounts WHERE "Username" = $1 LIMIT 1', [username]);
        return rows[0] || null;
      }
    );

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const latestOtp = await readWithFallback(
      `forgot-password/verify-otp/${user.AccountID}`,
      async () => {
        const { data, error } = await supabase
          .from('otp_verifications')
          .select('*')
          .eq('AccountID', user.AccountID)
          .eq('IsUsed', false)
          .order('ExpiresAt', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      async () => {
        const { rows } = await pool.query(
          `SELECT * FROM otp_verifications
           WHERE "AccountID" = $1 AND "IsUsed" = false
           ORDER BY "ExpiresAt" DESC
           LIMIT 1`,
          [user.AccountID]
        );
        return rows[0] || null;
      }
    );

    if (!latestOtp) return res.status(400).json({ success: false, message: 'No active OTP found' });
    if (new Date() > new Date(latestOtp.ExpiresAt)) return res.status(400).json({ success: false, message: 'OTP has expired' });
    if (latestOtp.Code !== code) {
      // Increment attempts
      await pool.query('UPDATE otp_verifications SET "Attempts" = COALESCE("Attempts", 0) + 1 WHERE "ID" = $1', [latestOtp.ID]);
      await syncSupabaseMirror();
      return res.status(400).json({ success: false, message: 'Invalid code' });
    }

    // Success - mark as used during reset, or here if we use a token
    // For simplicity, we'll verify it again during reset or return a success flag
    return res.json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    logRequestError(req, 'POST /api/forgot-password/verify', error);
    console.error('OTP verification error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Reset Password
app.post('/api/forgot-password/reset', async (req, res) => {
  const { username, code, newPassword } = req.body;
  if (!username || !code || !newPassword) return res.status(400).json({ success: false, message: 'Missing required fields' });

  try {
    const user = await readWithFallback(
      `forgot-password/reset-user/${username}`,
      async () => {
        const { data, error } = await supabase.from('accounts').select('*').eq('Username', username).maybeSingle();
        if (error) throw error;
        return data;
      },
      async () => {
        const { rows } = await pool.query('SELECT * FROM accounts WHERE "Username" = $1 LIMIT 1', [username]);
        return rows[0] || null;
      }
    );

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Final verification of OTP
    const latestOtp = await readWithFallback(
      `forgot-password/reset-otp/${user.AccountID}`,
      async () => {
        const { data, error } = await supabase
          .from('otp_verifications')
          .select('*')
          .eq('AccountID', user.AccountID)
          .eq('Code', code)
          .eq('IsUsed', false)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      async () => {
        const { rows } = await pool.query(
          'SELECT * FROM otp_verifications WHERE "AccountID" = $1 AND "Code" = $2 AND "IsUsed" = false LIMIT 1',
          [user.AccountID, code]
        );
        return rows[0] || null;
      }
    );

    if (!latestOtp || new Date() > new Date(latestOtp.ExpiresAt)) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    // Update password
    await pool.query('UPDATE accounts SET "Password" = $1 WHERE "AccountID" = $2', [newPassword, user.AccountID]);
    await pool.query('UPDATE otp_verifications SET "IsUsed" = true WHERE "ID" = $1', [latestOtp.ID]);
    await syncSupabaseMirror();

    return res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    logRequestError(req, 'POST /api/forgot-password/reset', error);
    console.error('Password reset error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// --- CONSUMER SIGN-UP ---

app.post('/api/register', async (req, res) => {
  const { username, password, phone, firstName, middleName, lastName, address } = req.body;
  // Convert empty strings to null for integer columns
  const zoneId = req.body.zoneId || null;
  const classificationId = req.body.classificationId ? parseInt(req.body.classificationId) : null;

  if (!username || !password || !phone) {
    return res.status(400).json({ success: false, message: 'Username, password, and phone number are required.' });
  }

  try {
    // 1. Create Account (Status: Pending)
    let accountId;
    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
    const accountInsert = await pool.query(
      `INSERT INTO accounts ("Username", "Password", "Full_Name", "Role_ID", "Phone_Number", "Status")
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING "AccountID"`,
      [username, password, fullName, 5, phone, 'Pending']
    );
    accountId = accountInsert.rows[0].AccountID;

    // 2. Create Consumer Record
    await pool.query(
      `INSERT INTO consumer ("First_Name", "Middle_Name", "Last_Name", "Address", "Zone_ID", "Classification_ID", "Login_ID", "Status")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [firstName, middleName, lastName, address, zoneId, classificationId, accountId, 'Pending']
    );

    // 3. Generate Ticket
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.floor(1000 + Math.random() * 9000).toString();
    const ticketNumber = `REG-${dateStr}-${randomStr}`;

    await pool.query(
      'INSERT INTO registration_tickets ("TicketNumber", "AccountID") VALUES ($1, $2)',
      [ticketNumber, accountId]
    );
    await syncSupabaseMirror();

    return res.json({ success: true, ticketNumber });
  } catch (error) {
    logRequestError(req, 'POST /api/register', error);
    console.error('Registration error:', error);
    // Friendly message for duplicate username
    if (error.message && error.message.includes('accounts_Username_key')) {
      return res.status(400).json({ success: false, message: 'Username is already taken. Please choose a different one.' });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/admin/sync-supabase', async (req, res) => {
  try {
    if (!supabaseWaterBilling) {
      logSupabaseSync('Manual sync request rejected because Supabase is not configured.');
      return res.status(400).json({
        success: false,
        message: 'Supabase is not configured on this server.',
      });
    }

    logSupabaseSync('Manual sync request received.');
    const results = await syncPostgresToSupabase();
    return res.json({ success: true, results });
  } catch (error) {
    logRequestError(req, 'POST /api/admin/sync-supabase', error);
    logSupabaseSync(`Manual sync request failed: ${error.message}`);
    console.error('Manual Supabase sync failed:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

async function startServer() {
  try {
    ensureSyncLogDir();
    logPostgresSync('Server startup initiated.');
    logSupabaseSync('Server startup initiated.');
    await pool.query('SELECT 1');
    logPostgresSync('PostgreSQL connection check succeeded.');
    await initDb();
    logPostgresSync('PostgreSQL schema initialization completed.');
    if (requireSupabaseSync && !supabaseWaterBilling) {
      throw new Error('Supabase sync configuration is required. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }

    if (supabaseWaterBilling) {
      try {
        const initialSyncResults = await syncPostgresToSupabase();
        logSupabaseSync(`Initial startup sync succeeded with ${initialSyncResults.length} table result(s).`);
        console.log('Initial PostgreSQL to Supabase sync complete:', initialSyncResults);
      } catch (error) {
        logSupabaseSync(`Initial startup sync failed: ${error.message}`);
        console.warn('Initial PostgreSQL to Supabase sync failed:', error.message);
      }
      startSupabaseSyncScheduler();
    } else if (!requireSupabaseSync) {
      logSupabaseSync('Startup continued without Supabase configuration.');
    }

    app.listen(PORT, () => {
      logPostgresSync(`Server listening on port ${PORT}.`);
      logSupabaseSync(`Server listening on port ${PORT}.`);
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(
        `Database: PostgreSQL (${process.env.DB_NAME || 'SLRWs'})${supabase ? ' with Supabase enabled' : ''}`
      );
    });
  } catch (error) {
    logPostgresSync(`Server startup failed: ${error.message}`);
    logSupabaseSync(`Server startup failed: ${error.message}`);
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

const legacyStartupLog = () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📊 Database: ${supabase ? 'Supabase (Online)' : 'SQLite (Offline)'}`);
};
