const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseSchema = process.env.SUPABASE_DB_SCHEMA || 'public';

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      db: { schema: supabaseSchema },
    })
  : null;
const postgresConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'Miswa1211',
      database: process.env.DB_NAME || 'SLRWs',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool(postgresConfig);
console.log('Connecting to PostgreSQL host:', postgresConfig.host || postgresConfig.connectionString);
if (supabase) {
  console.log('Connecting to Supabase schema:', supabaseSchema);
}

// Set search_path for every connection to use the new schema
pool.on('connect', (client) => {
  client.query('SET search_path TO water_billing, public');
});

const syncIntervalMs = Number(process.env.SUPABASE_SYNC_INTERVAL_MS || 60000);
const defaultSystemLogAccountId = Number(process.env.SYSTEM_LOG_ACCOUNT_ID || 1);
const logDirectory = path.join(__dirname, 'sync-logs');
const logFiles = {
  postgres: path.join(logDirectory, 'postgres-sync.txt'),
  supabase: path.join(logDirectory, 'supabase-sync.txt'),
  requestErrors: path.join(logDirectory, 'request-errors.txt'),
};
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
  { tableName: 'error_logs', primaryKey: 'error_id', syncWithSupabase: false },
  { tableName: 'system_logs', primaryKey: 'log_id', syncWithSupabase: false },
  { tableName: 'backuplogs', primaryKey: 'backup_id', syncWithSupabase: false },
];

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function upsertRowsToPostgres(tableName, primaryKey, rows) {
  if (!rows.length) {
    return 0;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const row of rows) {
      const columns = Object.keys(row);
      if (!columns.length) {
        continue;
      }

      const insertColumns = columns.map(quoteIdentifier).join(', ');
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
      const updates = columns
        .filter((column) => column !== primaryKey)
        .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
        .join(', ');

      const values = columns.map((column) => row[column]);
      const conflictTarget = quoteIdentifier(primaryKey);
      const query = updates
        ? `INSERT INTO ${quoteIdentifier(tableName)} (${insertColumns}) VALUES (${placeholders}) ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updates}`
        : `INSERT INTO ${quoteIdentifier(tableName)} (${insertColumns}) VALUES (${placeholders}) ON CONFLICT (${conflictTarget}) DO NOTHING`;

      await client.query(query, values);
    }

    await client.query('COMMIT');
    return rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function safeSerialize(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch (error) {
    return JSON.stringify({ serializationError: error.message });
  }
}

function truncateLogValue(value, maxLength = 4000) {
  const text = String(value ?? '');
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function shouldFallbackToPostgres(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('permission denied') ||
    message.includes('schema cache') ||
    message.includes('invalid schema') ||
    message.includes('could not find the table') ||
    message.includes('could not find the')
  );
}

async function withSupabaseFallback(operationName, supabaseHandler, postgresHandler) {
  if (!supabase) {
    return postgresHandler();
  }

  try {
    return await supabaseHandler();
  } catch (error) {
    if (!shouldFallbackToPostgres(error)) {
      throw error;
    }

    console.warn(`[fallback:${operationName}] Switching to PostgreSQL: ${error.message}`);
    return postgresHandler();
  }
}

function ensureLogDirectory() {
  fs.mkdirSync(logDirectory, { recursive: true });
}

function appendTextLog(filePath, message) {
  ensureLogDirectory();
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(filePath, line, 'utf8');
}

async function writeSystemLog(action, options = {}) {
  const accountId = Number(options.accountId || defaultSystemLogAccountId);
  const role = options.role || 'System';

  try {
    const { rows } = await pool.query(
      'INSERT INTO system_logs (account_id, role, action) VALUES ($1, $2, $3) RETURNING *',
      [accountId, role, truncateLogValue(action)]
    );

    if (supabase && rows[0]) {
      const { error } = await supabase.from('system_logs').upsert(rows, {
        onConflict: 'log_id',
        ignoreDuplicates: false,
      });

      if (error) {
        console.error('Supabase system log mirror failed:', error.message);
      }
    }
  } catch (error) {
    console.error('Database system log write failed:', error.message);
  }
}

async function writeErrorLog(details) {
  const severity = details.severity || 'ERROR';
  const moduleName = details.module || 'server';
  const errorMessage = truncateLogValue(details.errorMessage);
  const userId = details.userId ? Number(details.userId) : null;
  const status = details.status || 'Open';

  try {
    const { rows } = await pool.query(
      'INSERT INTO error_logs (severity, module, error_message, user_id, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [severity, moduleName, errorMessage, userId, status]
    );

    if (supabase && rows[0]) {
      const { error } = await supabase.from('error_logs').upsert(rows, {
        onConflict: 'error_id',
        ignoreDuplicates: false,
      });

      if (error) {
        console.error('Supabase error log mirror failed:', error.message);
      }
    }
  } catch (error) {
    console.error('Database error log write failed:', error.message);
  }
}

function requestLogContext(req) {
  return truncateLogValue(
    [
      `${req.method} ${req.originalUrl}`,
      `params=${safeSerialize(req.params)}`,
      `query=${safeSerialize(req.query)}`,
      `body=${safeSerialize(req.body)}`,
    ].join(' | ')
  );
}

async function logSyncEvent(target, message, options = {}) {
  const filePath = target === 'postgres' ? logFiles.postgres : logFiles.supabase;
  appendTextLog(filePath, message);
  await writeSystemLog(`[${target}] ${message}`, options);
}

async function logErrorEvent(moduleName, errorMessage, options = {}) {
  appendTextLog(logFiles.requestErrors, `[${moduleName}] ${errorMessage}`);
  await writeErrorLog({
    severity: options.severity || 'ERROR',
    module: moduleName,
    userId: options.userId,
    status: options.status,
    errorMessage,
  });
}

function logRequestError(req, moduleName, error, userId) {
  return logErrorEvent(
    moduleName,
    `${error.message} | ${requestLogContext(req)}`,
    { userId }
  );
}

async function logPostgresEvent(message, options = {}) {
  await logSyncEvent('postgres', message, options);
}

async function logSupabaseEvent(message, options = {}) {
  await logSyncEvent('supabase', message, options);
}

async function logRequestInfo(moduleName, message, options = {}) {
  appendTextLog(logFiles.requestErrors, `[${moduleName}] ${message}`);
  await writeSystemLog(`[request] [${moduleName}] ${message}`, options);
}

async function logDatabaseError(moduleName, error, options = {}) {
  try {
    await logErrorEvent(
      moduleName,
      error.message || String(error),
      {
        severity: options.severity || 'ERROR',
        userId: options.userId,
        status: options.status,
      }
    );
  } catch (logErr) {
    console.warn(`Failed to log error to database (${moduleName}):`, logErr.message);
  }
}

function legacyRequestError(req, moduleName, error, userId) {
  return writeErrorLog({
    severity: 'ERROR',
    module: moduleName,
    userId,
    errorMessage: `${error.message} | ${requestLogContext(req)}`,
  });
}

async function initDb() {
  await pool.query(`
    -- Your new schema handles the table creation via water_billing_postgresql_schema.sql.
    -- This function now simply ensures the connection is healthy.
    SELECT 1;
  `);

  const seedRes = await pool.query('SELECT COUNT(*)::int AS count FROM roles');
  if (seedRes.rows[0].count === 0) {
    await pool.query('INSERT INTO roles (role_name) VALUES ($1), ($2), ($3), ($4)', [
      'Admin',
      'Meter Reader',
      'Billing Officer',
      'Consumer',
    ]);

    await pool.query(
      'INSERT INTO accounts (username, password, role_id) VALUES ($1, $2, $3)',
      ['admin', 'admin123', 1]
    );

    await pool.query('INSERT INTO zone (zone_name) VALUES ($1), ($2)', [
      'Zone 1',
      'Zone 2',
    ]);

    await pool.query('INSERT INTO classification (classification_name) VALUES ($1), ($2)', [
      'Residential',
      'Commercial',
    ]);
  }
}

async function syncTableToSupabase(tableName, primaryKey) {
  await logPostgresEvent(`Preparing sync for table ${tableName}.`);
  const { rows } = await pool.query(`SELECT * FROM ${tableName}`);

  if (rows.length === 0) {
    await logSupabaseEvent(`Table ${tableName}: no rows to sync.`);
    return { tableName, synced: 0 };
  }

  const { error } = await supabase.from(tableName).upsert(rows, {
    onConflict: primaryKey,
    ignoreDuplicates: false,
  });

  if (error) {
    await logDatabaseError(`supabase.sync.${tableName}`, error);
    throw new Error(`${tableName}: ${error.message}`);
  }

  await logSupabaseEvent(`Table ${tableName}: synced ${rows.length} row(s).`);
  return { tableName, synced: rows.length };
}

async function syncTableToPostgres(tableName, primaryKey) {
  await logSupabaseEvent(`Preparing PostgreSQL pull for table ${tableName}.`);
  const { data, error } = await supabase.from(tableName).select('*');

  if (error) {
    await logDatabaseError(`postgres.sync.${tableName}`, error);
    throw new Error(`${tableName}: ${error.message}`);
  }

  const rows = data || [];
  if (!rows.length) {
    await logPostgresEvent(`Table ${tableName}: no rows pulled from Supabase.`);
    return { tableName, synced: 0 };
  }

  const synced = await upsertRowsToPostgres(tableName, primaryKey, rows);
  await logPostgresEvent(`Table ${tableName}: pulled ${synced} row(s) from Supabase.`);
  return { tableName, synced };
}

async function syncPostgresToSupabase() {
  if (!supabase || isSupabaseSyncRunning) {
    return [];
  }

  isSupabaseSyncRunning = true;

  try {
    await logSupabaseEvent('Starting PostgreSQL to Supabase sync cycle.');
    const results = [];

    for (const { tableName, primaryKey, syncWithSupabase = true } of syncTableConfigs) {
      if (!syncWithSupabase) {
        continue;
      }

      try {
        results.push(await syncTableToSupabase(tableName, primaryKey));
      } catch (error) {
        results.push({ tableName, synced: 0, error: error.message });
      }
    }

    await logSupabaseEvent(`Sync cycle complete for ${results.length} table(s).`);
    return results;
  } finally {
    isSupabaseSyncRunning = false;
  }
}

async function syncSupabaseToPostgres() {
  if (!supabase || isSupabaseSyncRunning) {
    return [];
  }

  isSupabaseSyncRunning = true;

  try {
    await logPostgresEvent('Starting Supabase to PostgreSQL sync cycle.');
    const results = [];

    for (const { tableName, primaryKey, syncWithSupabase = true } of syncTableConfigs) {
      if (!syncWithSupabase) {
        continue;
      }

      try {
        results.push(await syncTableToPostgres(tableName, primaryKey));
      } catch (error) {
        results.push({ tableName, synced: 0, error: error.message });
      }
    }

    await logPostgresEvent(`Supabase pull cycle complete for ${results.length} table(s).`);
    return results;
  } finally {
    isSupabaseSyncRunning = false;
  }
}

function startSupabaseSyncScheduler() {
  if (!supabase) {
    logPostgresEvent('Supabase sync scheduler disabled: running in PostgreSQL-only mode.').catch(() => {});
    console.log('Supabase sync scheduler disabled: running in PostgreSQL-only mode.');
    return;
  }

  logSupabaseEvent(`Supabase sync scheduler started with interval ${syncIntervalMs}ms.`).catch(() => {});
  setInterval(() => {
    syncSupabaseToPostgres()
      .then(() => syncPostgresToSupabase())
      .catch((error) => {
        logDatabaseError('supabase.sync.scheduler', error).catch(() => {});
        console.warn('Supabase sync skipped:', error.message);
      });
  }, syncIntervalMs);
}

// Get roles
app.get('/api/roles', async (req, res) => {
  try {
    const result = await withSupabaseFallback(
      'roles.fetch',
      async () => {
        const { data, error } = await supabase.from('roles').select('*');
        if (error) throw error;
        return { success: true, data };
      },
      async () => {
      const { rows } = await pool.query('SELECT * FROM roles');
        return { success: true, data: rows };
      }
    );
    return res.json(result);
  } catch (error) {
    await logRequestError(req, 'roles.fetch', error);
    console.error('Error fetching roles:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get users by type (desktop or mobile)
// Get users by type (desktop or mobile) - DEPRECATED (use /api/users/unified instead)
app.get('/api/users/type/:type', async (req, res) => {
  const { type } = req.params;
  
  try {
    if (supabase) {
      let roleIds;
      if (type === 'desktop') {
        roleIds = [1, 3, 4]; // Admin, Billing Officer, Cashier
      } else {
        roleIds = [2, 5]; // Meter Reader, Consumer
      }
      
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
      
      const users = data.map(u => ({
        ...u,
        Role_Name: u.roles?.Role_Name
      }));
      
      return res.json({ success: true, data: users });
    } else {
      let roleIds;
      if (type === 'desktop') {
        roleIds = [1, 3, 4];
      } else {
        roleIds = [2, 5];
      }
      
      const { rows } = await pool.query(`
        SELECT a.account_id AS "AccountID", a.username AS "Username", a.password AS "Password", 
               'N/A' AS "Full_Name", a.role_id AS "Role_ID", a.account_status AS "Status", r.role_name AS "Role_Name"
        FROM accounts a
        JOIN roles r ON a.role_id = r.role_id
        WHERE a.role_id = ANY($1)
      `, [roleIds]);
      
      return res.json({ success: true, data: rows });
    }
  } catch (error) {
    await logRequestError(req, 'users.fetchByType', error);
    console.error('Error fetching users:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET Staff Users
app.get('/api/users/staff', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('accounts')
        .select(`
          account_id,
          username,
          full_name,
          role_id,
          account_status,
          roles ( role_name )
        `)
        .in('role_id', [1, 2, 3]) // Admin, Reader, Officer
        .order('account_id', { ascending: false });
      
      if (error) throw error;
      
      const staff = data.map(u => ({
        AccountID: u.account_id,
        Username: u.username,
        Full_Name: u.full_name,
        Role_ID: u.role_id,
        Status: u.account_status,
        Role_Name: u.roles?.role_name
      }));
      
      return res.json({ success: true, data: staff });
    } else {
      const { rows } = await pool.query(`
        SELECT a.account_id AS "AccountID", a.username AS "Username", 
               'N/A' AS "Full_Name", a.role_id AS "Role_ID", 
               a.account_status AS "Status", r.role_name AS "Role_Name"
        FROM accounts a
        LEFT JOIN roles r ON a.role_id = r.role_id
        WHERE a.role_id IN (1, 2, 3)
        ORDER BY a.account_id DESC
      `);
      return res.json({ success: true, data: rows });
    }
  } catch (error) {
    await logRequestError(req, 'users.fetchStaff', error);
    console.error('Error fetching staff:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET Unified Users (Staff + Consumers + IoT)
app.get('/api/users/unified', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('accounts')
        .select(`
          account_id,
          username,
          full_name,
          role_id,
          account_status,
          roles ( role_name )
        `)
        .order('account_id', { ascending: false });
      
      if (error) throw error;
      
      const users = data.map(u => ({
        AccountID: u.account_id,
        Username: u.username,
        Full_Name: u.full_name,
        Role_ID: u.role_id,
        Status: u.account_status,
        Role_Name: u.roles?.role_name
      }));
      
      return res.json({ success: true, data: users });
    } else {
      const { rows } = await pool.query(`
        SELECT a.account_id AS "AccountID", a.username AS "Username", 
               'N/A' AS "Full_Name", a.role_id AS "Role_ID", 
               a.account_status AS "Status", r.role_name AS "Role_Name"
        FROM accounts a
        LEFT JOIN roles r ON a.role_id = r.role_id
        ORDER BY a.account_id DESC
      `);
      return res.json({ success: true, data: rows });
    }
  } catch (error) {
    await logRequestError(req, 'users.fetchUnified', error);
    console.error('Error fetching unified users:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Approve Pending Account
app.post('/api/admin/approve-user', async (req, res) => {
  const { accountId } = req.body;
  try {
    if (supabase) {
      const { error: aErr } = await supabase.from('accounts').update({ account_status: 'Active' }).eq('account_id', accountId);
      if (aErr) throw aErr;
      const { error: cErr } = await supabase.from('consumer').update({ status: 'Active' }).eq('login_id', accountId);
      if (cErr) throw cErr;
      return res.json({ success: true, message: 'Account approved successfully' });
    } else {
      await pool.query('UPDATE accounts SET account_status = $1 WHERE account_id = $2', ['Active', accountId]);
      await pool.query('UPDATE consumer SET status = $1 WHERE login_id = $2', ['Active', accountId]);
      return res.json({ success: true, message: 'Account approved successfully' });
    }
  } catch (error) {
    await logRequestError(req, 'users.approve', error);
    console.error('Approval error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Reject Pending Account (Delete)
app.post('/api/admin/reject-user', async (req, res) => {
  const { accountId } = req.body;
  try {
    if (supabase) {
      // Delete consumer record
      await supabase.from('consumer').delete().eq('login_id', accountId);
      // Delete account
      const { error } = await supabase.from('accounts').delete().eq('account_id', accountId);
      if (error) throw error;
      return res.json({ success: true, message: 'Account rejected and deleted' });
    } else {
      await pool.query('DELETE FROM consumer WHERE login_id = $1', [accountId]);
      await pool.query('DELETE FROM accounts WHERE account_id = $1', [accountId]);
      return res.json({ success: true, message: 'Account rejected and deleted' });
    }
  } catch (error) {
    await logRequestError(req, 'users.reject', error);
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
    if (supabase) {
      const { data, error } = await supabase
        .from('accounts')
        .insert([{ username: username, password: password, role_id: roleId, account_status: 'Active' }])
        .select();
      
      if (error) throw error;
      return res.json({ success: true, data });
    } else {
      const { rows } = await pool.query(
        'INSERT INTO accounts (username, password, role_id, account_status) VALUES ($1, $2, $3, $4) RETURNING *',
        [username, password, roleId, 'Active']
      );
      return res.json({ success: true, data: rows[0] });
    }
  } catch (error) {
    await logRequestError(req, 'users.create', error);
    console.error('Error creating user:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Update user
app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { username, fullName, password, roleId } = req.body;
  
  try {
    if (supabase) {
      const updateData = { role_id: roleId };
      if (password) {
        updateData.password = password;
      }
      
      const { data, error } = await supabase
        .from('accounts')
        .update(updateData)
        .eq('account_id', id)
        .select();
      
      if (error) throw error;
      return res.json({ success: true, data });
    } else {
      let query = 'UPDATE accounts SET role_id = $1';
      let params = [roleId];
      
      if (password) {
        query += ', password = $2';
        params.push(password);
      }
      
      query += ` WHERE account_id = $${params.length + 1}`;
      params.push(id);
      
      await pool.query(query, params);
      return res.json({ success: true, message: 'User updated successfully' });
    }
  } catch (error) {
    await logRequestError(req, 'users.update', error);
    console.error('Error updating user:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Delete user
app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    if (supabase) {
      const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('account_id', id);
      
      if (error) throw error;
      return res.json({ success: true, message: 'User deleted successfully' });
    } else {
      await pool.query('DELETE FROM accounts WHERE account_id = $1', [id]);
      return res.json({ success: true, message: 'User deleted successfully' });
    }
  } catch (error) {
    await logRequestError(req, 'users.delete', error);
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
    const result = await withSupabaseFallback(
      'auth.login',
      async () => {
        const { data: userData, error: userError } = await supabase
          .from('accounts')
          .select(`
            account_id,
            username,
            password,
            full_name,
            role_id,
            account_status,
            roles ( role_name )
          `)
          .eq('username', username)
          .single();

        if (userError || !userData) {
          return { status: 401, body: { success: false, message: 'Invalid username' } };
        }

        if (userData.account_status === 'Pending') {
          return { status: 401, body: { success: false, message: 'Please wait until you are registered to access the dashboard.' } };
        }

        if (userData.password !== password) {
          return { status: 401, body: { success: false, message: 'Invalid password' } };
        }

        return {
          status: 200,
          body: {
            success: true,
            user: {
              id: userData.account_id,
              username: userData.username,
              fullName: userData.full_name || userData.username,
              role_id: userData.role_id,
              role_name: userData.roles.role_name,
            },
          },
        };
      },
      async () => {
        const { rows } = await pool.query(`
          SELECT a.account_id, a.username, a.password, a.full_name, a.role_id, a.account_status, r.role_name
          FROM accounts a
          JOIN roles r ON a.role_id = r.role_id
          WHERE a.username = $1
        `, [username]);

        const user = rows[0];

        if (!user) {
          return { status: 401, body: { success: false, message: 'Invalid username' } };
        }

        if (user.account_status === 'Pending') {
          return { status: 401, body: { success: false, message: 'Please wait until you are registered to access the dashboard.' } };
        }

        if (user.password !== password) {
          return { status: 401, body: { success: false, message: 'Invalid password' } };
        }

        return {
          status: 200,
          body: {
            success: true,
            user: {
              id: user.account_id,
              username: user.username,
              fullName: user.full_name || user.username,
              role_id: user.role_id,
              role_name: user.role_name,
            },
          },
        };
      }
    );

    return res.status(result.status).json(result.body);
  } catch (error) {
    await logRequestError(req, 'auth.login', error);
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Database error: ' + error.message });
  }
});

// Get zones
app.get('/api/zones', async (req, res) => {
  try {
    const result = await withSupabaseFallback(
      'zones.fetch',
      async () => {
        const { data, error } = await supabase.from('zone').select('*');
        if (error) throw error;
        return { success: true, data };
      },
      async () => {
      const { rows } = await pool.query('SELECT * FROM zone');
        return { success: true, data: rows };
      }
    );
    return res.json(result);
  } catch (error) {
    await logRequestError(req, 'zones.fetch', error);
    console.error('Error fetching zones:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get classifications
app.get('/api/classifications', async (req, res) => {
  try {
    const result = await withSupabaseFallback(
      'classifications.fetch',
      async () => {
        const { data, error } = await supabase.from('classification').select('*');
        if (error) throw error;
        return { success: true, data };
      },
      async () => {
      const { rows } = await pool.query('SELECT * FROM classification');
        return { success: true, data: rows };
      }
    );
    return res.json(result);
  } catch (error) {
    await logRequestError(req, 'classifications.fetch', error);
    console.error('Error fetching classifications:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/consumers', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('consumer')
        .select(`
          *,
          zone (zone_name),
          classification (classification_name)
        `);
      if (error) throw error;
      
      const consumers = data.map(c => ({
        ...c,
        Consumer_ID: c.consumer_id,
        First_Name: c.first_name,
        Last_Name: c.last_name,
        Zone_Name: c.zone?.zone_name,
        Classification_Name: c.classification?.classification_name
      }));
      
      return res.json(consumers);
    } else {
      const { rows } = await pool.query(`
        SELECT c.*, c.consumer_id AS "Consumer_ID", 
               c.first_name AS "First_Name", c.last_name AS "Last_Name",
               z.zone_name AS "Zone_Name", cl.classification_name AS "Classification_Name"
        FROM consumer c
        LEFT JOIN zone z ON c.zone_id = z.zone_id
        LEFT JOIN classification cl ON c.classification_id = cl.classification_id
      `);
      return res.json(rows);
    }
  } catch (error) {
    await logRequestError(req, 'consumers.fetch', error);
    console.error('Error fetching consumers:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/consumers', async (req, res) => {
  try {
    const consumer = req.body;
    if (supabase) {
      const { data, error } = await supabase.from('consumer').insert([{
        first_name: consumer.First_Name,
        last_name: consumer.Last_Name,
        address: consumer.Address,
        zone_id: consumer.Zone_ID,
        classification_id: consumer.Classification_ID,
        account_number: consumer.Account_Number,
        status: consumer.Status || 'Active',
        contact_number: consumer.Contact_Number,
        connection_date: consumer.Connection_Date,
        login_id: consumer.Login_ID
      }]).select();
      if (error) throw error;
      return res.json({ success: true, data });
    } else {
      const { rows } = await pool.query(`
        INSERT INTO consumer (first_name, last_name, address, zone_id, classification_id, account_number, status, contact_number, connection_date, login_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        consumer.First_Name,
        consumer.Last_Name,
        consumer.Address,
        consumer.Zone_ID,
        consumer.Classification_ID,
        consumer.Account_Number,
        consumer.Status || 'Active',
        consumer.Contact_Number,
        consumer.Connection_Date,
        consumer.Login_ID
      ]);
      return res.json({ success: true, data: { Consumer_ID: rows[0].consumer_id, ...consumer } });
    }
  } catch (error) {
    await logRequestError(req, 'consumers.create', error);
    console.error('Error creating consumer:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// --- CLASSIFICATIONS ---
app.get('/api/classifications', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('classifications').select('*').order('Classification_ID');
      if (error) throw error;
      return res.json({ success: true, data });
    } else {
      const { rows } = await pool.query('SELECT * FROM classifications ORDER BY Classification_ID');
      return res.json({ success: true, data: rows });
    }
  } catch (error) {
    console.error('Error fetching classifications:', error);
    return res.status(500).json({ error: error.message });
  }
});

// --- ZONES ---
app.get('/api/zones', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('zones').select('*').order('Zone_ID');
      if (error) throw error;
      return res.json({ success: true, data });
    } else {
      const { rows } = await pool.query('SELECT * FROM zones ORDER BY Zone_ID');
      return res.json({ success: true, data: rows });
    }
  } catch (error) {
    console.error('Error fetching zones:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/consumers/:id', async (req, res) => {
  const { id } = req.params;
  const consumer = req.body;
  
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('consumer')
        .update({
          first_name: consumer.First_Name,
          last_name: consumer.Last_Name,
          address: consumer.Address,
          zone_id: consumer.Zone_ID,
          classification_id: consumer.Classification_ID,
          account_number: consumer.Account_Number,
          status: consumer.Status,
          contact_number: consumer.Contact_Number,
          connection_date: consumer.Connection_Date
        })
        .eq('consumer_id', id)
        .select();
      if (error) throw error;
      return res.json({ success: true, data });
    } else {
      await pool.query(`
        UPDATE consumer SET 
          first_name = $1, last_name = $2, address = $3, zone_id = $4, 
          classification_id = $5, account_number = $6, 
          status = $7, contact_number = $8, connection_date = $9
        WHERE consumer_id = $10
      `, [
        consumer.First_Name,
        consumer.Last_Name,
        consumer.Address,
        consumer.Zone_ID,
        consumer.Classification_ID,
        consumer.Account_Number,
        consumer.Status,
        consumer.Contact_Number,
        consumer.Connection_Date,
        id
      ]);
      return res.json({ success: true, message: 'Consumer updated successfully' });
    }
  } catch (error) {
    await logRequestError(req, 'consumers.update', error);
    console.error('Error updating consumer:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/consumers/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    if (supabase) {
      const { error } = await supabase
        .from('consumer')
        .delete()
        .eq('consumer_id', id);
      if (error) throw error;
      return res.json({ success: true, message: 'Consumer deleted successfully' });
    } else {
      await pool.query('DELETE FROM consumer WHERE consumer_id = $1', [id]);
      return res.json({ success: true, message: 'Consumer deleted successfully' });
    }
  } catch (error) {
    await logRequestError(req, 'consumers.delete', error);
    console.error('Error deleting consumer:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/meter-readings', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('meterreadings').select('*');
      if (error) throw error;
      return res.json(data.map(r => ({ ...r, Reading_ID: r.reading_id, Previous_Reading: r.previous_reading, Current_Reading: r.current_reading, Reading_Date: r.reading_date })));
    } else {
      const { rows } = await pool.query('SELECT *, reading_id AS "Reading_ID", previous_reading AS "Previous_Reading", current_reading AS "Current_Reading", reading_date AS "Reading_Date" FROM meterreadings');
      return res.json(rows);
    }
  } catch (error) {
    await logRequestError(req, 'meterReadings.fetch', error);
    console.error('Error fetching meter readings:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/meter-readings', async (req, res) => {
  try {
    const reading = req.body;
    if (supabase) {
      const { data, error } = await supabase.from('meterreadings').insert([{
        consumer_id: reading.Consumer_ID,
        meter_id: reading.Meter_ID,
        previous_reading: reading.Previous_Reading,
        current_reading: reading.Current_Reading,
        consumption: reading.Consumption,
        reading_status: reading.Reading_Status || 'Recorded',
        notes: reading.Notes,
        reading_date: reading.Reading_Date,
        route_id: 1, // Default or derived
        meter_reader_id: 1 // Default or derived
      }]).select();
      if (error) throw error;
      return res.json(data);
    } else {
      const { rows } = await pool.query(`
        INSERT INTO meterreadings (consumer_id, meter_id, previous_reading, current_reading, consumption, reading_status, notes, reading_date, route_id, meter_reader_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *, reading_id AS "Reading_ID"
      `, [
        reading.Consumer_ID,
        reading.Meter_ID,
        reading.Previous_Reading,
        reading.Current_Reading,
        reading.Consumption,
        reading.Reading_Status || 'Recorded',
        reading.Notes,
        reading.Reading_Date,
        1, 1
      ]);
      return res.json(rows[0]);
    }
  } catch (error) {
    await logRequestError(req, 'meterReadings.create', error);
    console.error('Error creating meter reading:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('bills').select('*');
      if (error) throw error;
      return res.json(data.map(b => ({ ...b, Bill_ID: b.bill_id, Bill_Date: b.bill_date, Total_Amount: b.total_amount })));
    } else {
      const { rows } = await pool.query('SELECT *, bill_id AS "Bill_ID", bill_date AS "Bill_Date", total_amount AS "Total_Amount" FROM bills');
      return res.json(rows);
    }
  } catch (error) {
    await logRequestError(req, 'bills.fetch', error);
    console.error('Error fetching bills:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/bills', async (req, res) => {
  try {
    const bill = req.body;
    if (supabase) {
      const { data, error } = await supabase.from('bills').insert([{
        consumer_id: bill.Consumer_ID,
        reading_id: bill.Reading_ID,
        bill_date: bill.Bill_Date,
        due_date: bill.Due_Date,
        total_amount: bill.Total_Amount,
        status: bill.Status || 'Unpaid',
        billing_officer_id: 1, // Default or derived
        billing_month: 'April 2026', // Placeholder or derived
        date_covered_from: new Date(),
        date_covered_to: new Date()
      }]).select();
      if (error) throw error;
      return res.json(data);
    } else {
      const { rows } = await pool.query(`
        INSERT INTO bills (consumer_id, reading_id, bill_date, due_date, total_amount, status, billing_officer_id, billing_month, date_covered_from, date_covered_to)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *, bill_id AS "Bill_ID"
      `, [
        bill.Consumer_ID,
        bill.Reading_ID,
        bill.Bill_Date,
        bill.Due_Date,
        bill.Total_Amount,
        bill.Status || 'Unpaid',
        1, 'April 2026', new Date(), new Date()
      ]);
      return res.json(rows[0]);
    }
  } catch (error) {
    await logRequestError(req, 'bills.create', error);
    console.error('Error creating bill:', error);
    return res.status(500).json({ error: error.message });
  }
});

// --- CONSUMER DASHBOARD ---
app.get('/api/consumer-dashboard/:accountId', async (req, res) => {
  const { accountId } = req.params;
  try {
    if (supabase) {
      const { data: consumer, error: cErr } = await supabase
        .from('consumer')
        .select('*')
        .eq('login_id', accountId)
        .maybeSingle();
      
      if (cErr) throw cErr;
      if (!consumer) return res.status(404).json({ success: false, message: 'Consumer profile not found' });

      const consumerId = consumer.consumer_id;

      // Get bills
      const { data: bills } = await supabase
        .from('bills')
        .select('*')
        .eq('consumer_id', consumerId)
        .order('bill_date', { ascending: false });

      // Get payments
      const { data: payments } = await supabase
        .from('payment')
        .select('*, bills(bill_date)')
        .eq('consumer_id', consumerId)
        .order('payment_date', { ascending: false });

      // Get meter readings (last 6)
      const { data: readings } = await supabase
        .from('meterreadings')
        .select('reading_date, consumption')
        .eq('consumer_id', consumerId)
        .order('reading_date', { ascending: false })
        .limit(6);

      return res.json({ 
        success: true, 
        consumer: { ...consumer, Consumer_ID: consumer.consumer_id }, 
        bills: (bills || []).map(b => ({ ...b, Bill_ID: b.bill_id, Bill_Date: b.bill_date, Total_Amount: b.total_amount })), 
        payments: (payments || []).map(p => ({ ...p, Payment_ID: p.payment_id, Amount_Paid: p.amount_paid, Payment_Date: p.payment_date })), 
        readings: (readings || []).map(r => ({ Reading_Date: r.reading_date, Consumption: r.consumption })).reverse() 
      });
    } else {
      const { rows: consumers } = await pool.query('SELECT * FROM consumer WHERE login_id = $1', [accountId]);
      const consumer = consumers[0];
      if (!consumer) return res.status(404).json({ success: false, message: 'Consumer not found' });

      const consumerId = consumer.consumer_id;
      const { rows: bills } = await pool.query('SELECT *, bill_id AS "Bill_ID", bill_date AS "Bill_Date", total_amount AS "Total_Amount" FROM bills WHERE consumer_id = $1 ORDER BY bill_date DESC', [consumerId]);
      const { rows: payments } = await pool.query('SELECT p.*, p.payment_id AS "Payment_ID", p.amount_paid AS "Amount_Paid", p.payment_date AS "Payment_Date", b.bill_date AS "Bill_Date" FROM payment p LEFT JOIN bills b ON p.bill_id = b.bill_id WHERE p.consumer_id = $1 ORDER BY p.payment_date DESC', [consumerId]);
      const { rows: readings } = await pool.query('SELECT reading_date AS "Reading_Date", consumption AS "Consumption" FROM meterreadings WHERE consumer_id = $1 ORDER BY reading_date DESC LIMIT 6', [consumerId]);

      return res.json({ 
        success: true, 
        consumer: { ...consumer, Consumer_ID: consumer.consumer_id }, 
        bills, 
        payments, 
        readings: readings.reverse() 
      });
    }
  } catch (error) {
    await logRequestError(req, 'consumerDashboard.fetch', error);
    console.error('Consumer dashboard error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/payments', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('payment').select('*');
      if (error) throw error;
      return res.json(data.map(p => ({ ...p, Payment_ID: p.payment_id, Amount_Paid: p.amount_paid, Payment_Date: p.payment_date })));
    } else {
      const { rows } = await pool.query('SELECT *, payment_id AS "Payment_ID", amount_paid AS "Amount_Paid", payment_date AS "Payment_Date" FROM payment');
      return res.json(rows);
    }
  } catch (error) {
    await logRequestError(req, 'payments.fetch', error);
    console.error('Error fetching payments:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/payments', async (req, res) => {
  try {
    const payment = req.body;
    if (supabase) {
      const { data, error } = await supabase.from('payment').insert([{
        bill_id: payment.Bill_ID,
        consumer_id: payment.Consumer_ID,
        amount_paid: payment.Amount_Paid,
        payment_date: payment.Payment_Date,
        payment_method: payment.Payment_Method,
        reference_number: payment.Reference_Number
      }]).select();
      if (error) throw error;
      return res.json(data);
    } else {
      const { rows } = await pool.query(`
        INSERT INTO payment (bill_id, consumer_id, amount_paid, payment_date, payment_method, reference_number)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *, payment_id AS "Payment_ID"
      `, [
        payment.Bill_ID,
        payment.Consumer_ID,
        payment.Amount_Paid,
        payment.Payment_Date,
        payment.Payment_Method,
        payment.Reference_Number
      ]);
      return res.json(rows[0]);
    }
  } catch (error) {
    await logRequestError(req, 'payments.create', error);
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

// Placeholder for Forgot Password flow
// NOTE: These require an 'otp_verifications' table which is missing from the new schema
app.post('/api/forgot-password/request', async (req, res) => {
  const { username } = req.body;
  try {
    const user = await withSupabaseFallback(
      'forgotPassword.request',
      async () => {
        const { data, error } = await supabase.from('accounts').select('account_id, username').eq('username', username).single();
        if (error) throw error;
        return data;
      },
      async () => {
        const { rows } = await pool.query('SELECT account_id, username FROM accounts WHERE username = $1', [username]);
        return rows[0];
      }
    );

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // In a real scenario, you'd insert into otp_verifications here. 
    // Since the table is missing, we will just simulate success for now.
    return res.json({ success: true, message: 'OTP sent (Simulated). Original code assumes otp_verifications table exists.' });
  } catch (error) {
    console.error('Forgot password request error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Verify OTP
app.post('/api/forgot-password/verify-otp', async (req, res) => {
  const { username, code } = req.body;
  try {
    return res.json({ success: true, message: 'OTP verification simulated (Table missing in new schema)' });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Reset Password
app.post('/api/forgot-password/reset', async (req, res) => {
  const { username, code, newPassword } = req.body;
  try {
    await withSupabaseFallback(
      'forgotPassword.reset',
      async () => {
        const { error } = await supabase.from('accounts').update({ password: newPassword }).eq('username', username);
        if (error) throw error;
      },
      async () => {
        await pool.query('UPDATE accounts SET password = $1 WHERE username = $2', [newPassword, username]);
      }
    );
    return res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// --- CONSUMER SIGN-UP ---

app.post('/api/register', async (req, res) => {
  const { username, password, phone, firstName, middleName, lastName, address } = req.body;
  const zoneId = req.body.zoneId || 1;
  const classificationId = req.body.classificationId ? parseInt(req.body.classificationId) : 1;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }

  try {
    // 1. Create Account (Status: Pending)
    const accountId = await withSupabaseFallback(
      'auth.register.account',
      async () => {
        const { data, error } = await supabase
          .from('accounts')
          .insert([{ 
            username, 
            password, 
            role_id: 4,
            account_status: 'Pending'
          }])
          .select();
        if (error) throw error;
        return data[0].account_id;
      },
      async () => {
        const { rows } = await pool.query(
          'INSERT INTO accounts (username, password, role_id, account_status) VALUES ($1, $2, $3, $4) RETURNING account_id',
          [username, password, 4, 'Pending']
        );
        return rows[0].account_id;
      }
    );

    // 2. Create Consumer Record
    await withSupabaseFallback(
      'auth.register.consumer',
      async () => {
        const { error } = await supabase
          .from('consumer')
          .insert([{
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            address: address,
            zone_id: zoneId,
            classification_id: classificationId,
            login_id: accountId,
            status: 'Pending',
            contact_number: phone,
            account_number: `ACC-${Date.now()}`
          }]);
        if (error) throw error;
      },
      async () => {
        await pool.query(`
          INSERT INTO consumer (first_name, middle_name, last_name, address, zone_id, classification_id, login_id, status, contact_number, account_number)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [firstName, middleName, lastName, address, zoneId, classificationId, accountId, 'Pending', phone, `ACC-${Date.now()}`]);
      }
    );

    return res.json({ success: true, message: 'Registration requested successfully. Please wait for admin approval.' });
  } catch (error) {
    await logRequestError(req, 'auth.register', error);
    console.error('Registration error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/admin/sync-supabase', async (req, res) => {
  try {
    if (!supabase) {
      await logRequestInfo('admin.syncSupabase', 'Manual sync requested while running in PostgreSQL-only mode.');
      return res.status(400).json({
        success: false,
        message: 'Supabase is not configured on this server.',
      });
    }

    await logRequestInfo('admin.syncSupabase', 'Manual Supabase sync requested.');
    const results = await syncPostgresToSupabase();
    await logSupabaseEvent(`Manual sync completed for ${results.length} table(s).`);
    return res.json({ success: true, results });
  } catch (error) {
    await logRequestError(req, 'admin.syncSupabase', error);
    console.error('Manual Supabase sync failed:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/sync-postgres', async (req, res) => {
  try {
    if (!supabase) {
      await logRequestInfo('admin.syncPostgres', 'Manual PostgreSQL pull requested while running in PostgreSQL-only mode.');
      return res.status(400).json({
        success: false,
        message: 'Supabase is not configured on this server.',
      });
    }

    await logRequestInfo('admin.syncPostgres', 'Manual PostgreSQL pull from Supabase requested.');
    const results = await syncSupabaseToPostgres();
    await logPostgresEvent(`Manual Supabase to PostgreSQL sync completed for ${results.length} table(s).`);
    return res.json({ success: true, results });
  } catch (error) {
    await logRequestError(req, 'admin.syncPostgres', error);
    console.error('Manual PostgreSQL sync failed:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

async function startServer() {
  try {
    console.log(`Attempting connection to ${postgresConfig.host}:${postgresConfig.port}...`);
    await pool.query('SELECT 1');
    await logPostgresEvent(`PostgreSQL connection established for database ${process.env.DB_NAME || 'SLRWs'}.`);
    await initDb();
    await logPostgresEvent('PostgreSQL initialization check completed.');
    if (supabase) {
      try {
        const initialPullResults = await syncSupabaseToPostgres();
        await logPostgresEvent(`Initial Supabase to PostgreSQL sync complete for ${initialPullResults.length} table(s).`);
        console.log('Initial Supabase to PostgreSQL sync complete:', initialPullResults);
      } catch (error) {
        await logDatabaseError('postgres.sync.initial', error);
        console.warn('Initial Supabase to PostgreSQL sync failed:', error.message);
      }

      try {
        const initialSyncResults = await syncPostgresToSupabase();
        await logSupabaseEvent(`Initial PostgreSQL to Supabase sync complete for ${initialSyncResults.length} table(s).`);
        console.log('Initial PostgreSQL to Supabase sync complete:', initialSyncResults);
      } catch (error) {
        await logDatabaseError('supabase.sync.initial', error);
        console.warn('Initial PostgreSQL to Supabase sync failed:', error.message);
      }
      startSupabaseSyncScheduler();
    } else {
      await logPostgresEvent('Supabase sync is not configured: running in PostgreSQL-only mode.');
      console.log('Supabase sync is not configured: running in PostgreSQL-only mode.');
    }

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      if (supabase) {
        logSupabaseEvent(`Server started on port ${PORT} in Hybrid Mode.`).catch(() => {});
        console.log(`Database mode: PostgreSQL + Supabase sync (Supabase schema: ${supabaseSchema})`);
      } else {
        logPostgresEvent(`Server started on port ${PORT} in PostgreSQL-only mode.`).catch(() => {});
        console.log(`Database mode: running in PostgreSQL-only mode`);
      }
    });
  } catch (error) {
    await logDatabaseError('server.start', error, { severity: 'WARNING' });
    console.error('Initial PostgreSQL connection failed. Falling back to API mode:', error.message);
    
    // Start the server anyway to allow Supabase-only access
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT} (FALLBACK MODE)`);
      console.log('Using Supabase JS client for all operations.');
    });
  }
}

startServer();

