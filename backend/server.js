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
const supabaseKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY;
const supabaseSchema = process.env.SUPABASE_DB_SCHEMA || 'water_billing';

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      db: { schema: supabaseSchema },
    })
  : null;
const postgresConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      options: `-c search_path=${supabaseSchema},public`,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'Miswa1211',
      database: process.env.DB_NAME || 'SLRWs',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      options: `-c search_path=${supabaseSchema},public`,
    };

const pool = new Pool(postgresConfig);
console.log('Connecting to PostgreSQL host:', postgresConfig.host || postgresConfig.connectionString);
if (supabase) {
  console.log('Connecting to Supabase schema:', supabaseSchema);
}

const syncIntervalMs = Number(process.env.SUPABASE_SYNC_INTERVAL_MS || 60000);
const immediateSyncDelayMs = Number(process.env.IMMEDIATE_SYNC_DELAY_MS || 1000);
const defaultSystemLogAccountId = Number(process.env.SYSTEM_LOG_ACCOUNT_ID || 1);
const logDirectory = path.join(__dirname, 'sync-logs');
const logFiles = {
  postgres: path.join(logDirectory, 'postgres-sync.txt'),
  supabase: path.join(logDirectory, 'supabase-sync.txt'),
  requestErrors: path.join(logDirectory, 'request-errors.txt'),
};
let isSupabaseSyncRunning = false;
let immediateSyncTimer = null;
let isPostgresAvailable = false;
const syncState = {
  enabled: false,
  intervalMs: syncIntervalMs,
  running: false,
  lastStartedAt: null,
  lastCompletedAt: null,
  lastError: null,
  lastResults: {
    supabaseToPostgres: [],
    postgresToSupabase: [],
  },
};

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
  { tableName: 'connection_ticket', primaryKey: 'ticket_id' },
  { tableName: 'password_reset', primaryKey: 'reset_id' },
  { tableName: 'account_approval', primaryKey: 'approval_id' },
  { tableName: 'error_logs', primaryKey: 'error_id' },
  { tableName: 'system_logs', primaryKey: 'log_id' },
  { tableName: 'backuplogs', primaryKey: 'backup_id' },
  { tableName: 'waterrates', primaryKey: 'rate_id' },
];

const syncTableColumns = {
  roles: ['role_id', 'role_name'],
  zone: ['zone_id', 'zone_name'],
  classification: ['classification_id', 'classification_name'],
  accounts: ['account_id', 'username', 'password', 'role_id', 'account_status', 'created_at'],
  consumer: [
    'consumer_id',
    'first_name',
    'middle_name',
    'last_name',
    'address',
    'zone_id',
    'classification_id',
    'login_id',
    'account_number',
    'status',
    'contact_number',
    'connection_date',
  ],
  meter: ['meter_id', 'consumer_id', 'meter_serial_number', 'meter_size', 'meter_status', 'installed_date'],
  route: ['route_id', 'meter_reader_id', 'zone_id'],
  meterreadings: [
    'reading_id',
    'route_id',
    'consumer_id',
    'meter_id',
    'meter_reader_id',
    'created_date',
    'reading_status',
    'previous_reading',
    'current_reading',
    'consumption',
    'excess_consumption',
    'notes',
    'status',
    'reading_date',
  ],
  bills: [
    'bill_id',
    'consumer_id',
    'reading_id',
    'billing_officer_id',
    'billing_month',
    'date_covered_from',
    'date_covered_to',
    'bill_date',
    'due_date',
    'disconnection_date',
    'class_cost',
    'water_charge',
    'meter_maintenance_fee',
    'connection_fee',
    'amount_due',
    'previous_balance',
    'previous_penalty',
    'penalty',
    'total_amount',
    'total_after_due_date',
    'status',
  ],
  payment: [
    'payment_id',
    'consumer_id',
    'bill_id',
    'payment_date',
    'amount_paid',
    'or_number',
    'payment_method',
    'reference_number',
    'status',
    'validated_by',
    'validated_date',
  ],
  ledger_entry: [
    'ledger_id',
    'consumer_id',
    'transaction_type',
    'reference_id',
    'amount',
    'balance',
    'transaction_date',
    'notes',
  ],
  connection_ticket: [
    'ticket_id',
    'consumer_id',
    'account_id',
    'ticket_number',
    'application_date',
    'connection_type',
    'requirements_submitted',
    'status',
    'inspection_date',
    'approved_by',
    'approved_date',
    'remarks',
    'created_at',
  ],
  password_reset: [
    'reset_id',
    'account_id',
    'reset_token',
    'expiration_time',
    'status',
    'created_at',
  ],
  account_approval: [
    'approval_id',
    'account_id',
    'approved_by',
    'approval_status',
    'approval_date',
    'remarks',
  ],
  waterrates: [
    'rate_id',
    'minimum_cubic',
    'minimum_rate',
    'excess_rate_per_cubic',
    'effective_date',
    'modified_by',
    'modified_date',
  ],
  backuplogs: ['backup_id', 'backup_name', 'backup_time', 'backup_size', 'backup_type', 'created_by'],
  error_logs: ['error_id', 'error_time', 'severity', 'module', 'error_message', 'user_id', 'status'],
  system_logs: ['log_id', 'account_id', 'role', 'action', 'timestamp'],
};

function normalizeSyncRows(tableName, rows) {
  const allowedColumns = syncTableColumns[tableName];
  if (!allowedColumns) {
    return rows;
  }

  return rows
    .map((row) => {
      const normalizedRow = {};
      for (const column of allowedColumns) {
        if (Object.prototype.hasOwnProperty.call(row, column)) {
          normalizedRow[column] = row[column];
        }
      }
      return normalizedRow;
    })
    .filter((row) => Object.keys(row).length > 0);
}

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function upsertRowsToPostgres(tableName, primaryKey, rows) {
  const normalizedRows = normalizeSyncRows(tableName, rows);

  if (!normalizedRows.length) {
    return 0;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const row of normalizedRows) {
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
    return normalizedRows.length;
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
    await withPostgresPrimary(
      'logs.system.write',
      async () => {
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
      },
      async () => {
        if (!supabase) {
          return;
        }

        const { error } = await supabase.from('system_logs').insert([{
          account_id: accountId,
          role,
          action: truncateLogValue(action),
        }]);

        if (error) {
          throw error;
        }
      }
    );
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
    await withPostgresPrimary(
      'logs.error.write',
      async () => {
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
      },
      async () => {
        if (!supabase) {
          return;
        }

        const { error } = await supabase.from('error_logs').insert([{
          severity,
          module: moduleName,
          error_message: errorMessage,
          user_id: userId,
          status,
        }]);

        if (error) {
          throw error;
        }
      }
    );
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
  const normalizedRows = normalizeSyncRows(tableName, rows);

  if (normalizedRows.length === 0) {
    await logSupabaseEvent(`Table ${tableName}: no rows to sync.`);
    return { tableName, synced: 0 };
  }

  const { error } = await supabase.from(tableName).upsert(normalizedRows, {
    onConflict: primaryKey,
    ignoreDuplicates: false,
  });

  if (error) {
    await logDatabaseError(`supabase.sync.${tableName}`, error);
    throw new Error(`${tableName}: ${error.message}`);
  }

  await logSupabaseEvent(`Table ${tableName}: synced ${normalizedRows.length} row(s).`);
  return { tableName, synced: normalizedRows.length };
}

async function syncTableToPostgres(tableName, primaryKey) {
  await logSupabaseEvent(`Preparing PostgreSQL pull for table ${tableName}.`);
  const { data, error } = await supabase.from(tableName).select('*');

  if (error) {
    await logDatabaseError(`postgres.sync.${tableName}`, error);
    throw new Error(`${tableName}: ${error.message}`);
  }

  const rows = normalizeSyncRows(tableName, data || []);
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
  syncState.running = true;
  syncState.lastStartedAt = new Date().toISOString();
  syncState.lastError = null;

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
    syncState.lastResults.postgresToSupabase = results;
    return results;
  } catch (error) {
    syncState.lastError = error.message;
    throw error;
  } finally {
    isSupabaseSyncRunning = false;
    syncState.running = false;
    syncState.lastCompletedAt = new Date().toISOString();
  }
}

async function withPostgresPrimary(operationName, postgresHandler, supabaseHandler) {
  if (!isPostgresAvailable) {
    if (!supabase || !supabaseHandler) {
      throw new Error('PostgreSQL is unavailable and no Supabase fallback is configured.');
    }
    return supabaseHandler();
  }

  try {
    return await postgresHandler();
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    const shouldFallback =
      message.includes('connect') ||
      message.includes('connection') ||
      message.includes('econnrefused') ||
      message.includes('terminating connection') ||
      message.includes('the database system is starting up');

    if (!shouldFallback || !supabase || !supabaseHandler) {
      throw error;
    }

    console.warn(`[fallback:${operationName}] Switching to Supabase: ${error.message}`);
    isPostgresAvailable = false;
    return supabaseHandler();
  }
}

async function syncSupabaseToPostgres() {
  if (!supabase || isSupabaseSyncRunning) {
    return [];
  }

  isSupabaseSyncRunning = true;
  syncState.running = true;
  syncState.lastStartedAt = new Date().toISOString();
  syncState.lastError = null;

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
    syncState.lastResults.supabaseToPostgres = results;
    return results;
  } catch (error) {
    syncState.lastError = error.message;
    throw error;
  } finally {
    isSupabaseSyncRunning = false;
    syncState.running = false;
    syncState.lastCompletedAt = new Date().toISOString();
  }
}

async function runHybridSyncCycle(trigger = 'manual') {
  if (!supabase) {
    return {
      success: false,
      message: 'Supabase is not configured on this server.',
      trigger,
      results: {
        supabaseToPostgres: [],
        postgresToSupabase: [],
      },
    };
  }

  if (isSupabaseSyncRunning) {
    return {
      success: false,
      message: 'A sync cycle is already running.',
      trigger,
      results: syncState.lastResults,
    };
  }

  await logRequestInfo('sync.cycle', `Hybrid sync cycle started via ${trigger}.`);

  const supabaseToPostgres = await syncSupabaseToPostgres();
  const postgresToSupabase = await syncPostgresToSupabase();

  return {
    success: true,
    trigger,
    startedAt: syncState.lastStartedAt,
    completedAt: syncState.lastCompletedAt,
    results: {
      supabaseToPostgres,
      postgresToSupabase,
    },
  };
}

function scheduleImmediateSync(trigger = 'write', delayMs = immediateSyncDelayMs) {
  if (!supabase) {
    return;
  }

  if (immediateSyncTimer) {
    clearTimeout(immediateSyncTimer);
  }

  immediateSyncTimer = setTimeout(() => {
    immediateSyncTimer = null;
    runHybridSyncCycle(`immediate:${trigger}`).catch((error) => {
      syncState.lastError = error.message;
      logDatabaseError('sync.immediate', error).catch(() => {});
      console.warn('Immediate sync failed:', error.message);
    });
  }, delayMs);
}

async function mirrorDeleteToSupabase(tableName, primaryKey, idValue) {
  if (!supabase) {
    return;
  }

  try {
    const { error } = await supabase.from(tableName).delete().eq(primaryKey, idValue);
    if (error) {
      throw error;
    }
  } catch (error) {
    await logDatabaseError(`supabase.delete.${tableName}`, error);
    throw error;
  }
}

function startSupabaseSyncScheduler() {
  if (!supabase) {
    syncState.enabled = false;
    logPostgresEvent('Supabase sync scheduler disabled: running in PostgreSQL-only mode.').catch(() => {});
    console.log('Supabase sync scheduler disabled: running in PostgreSQL-only mode.');
    return;
  }

  syncState.enabled = true;
  logSupabaseEvent(`Supabase sync scheduler started with interval ${syncIntervalMs}ms.`).catch(() => {});
  setInterval(() => {
    runHybridSyncCycle('scheduler')
      .catch((error) => {
        syncState.lastError = error.message;
        logDatabaseError('supabase.sync.scheduler', error).catch(() => {});
        console.warn('Supabase sync skipped:', error.message);
      });
  }, syncIntervalMs);
}

function mapConsumerRecord(consumer, zoneMap = new Map(), classificationMap = new Map(), meterMap = new Map()) {
  return {
    Consumer_ID: consumer.consumer_id,
    First_Name: consumer.first_name,
    Middle_Name: consumer.middle_name,
    Last_Name: consumer.last_name,
    Address: consumer.address,
    Zone_ID: consumer.zone_id,
    Classification_ID: consumer.classification_id,
    Account_Number: consumer.account_number,
    Status: consumer.status,
    Contact_Number: consumer.contact_number,
    Connection_Date: consumer.connection_date,
    Meter_ID: meterMap.get(consumer.consumer_id)?.meter_id || null,
    Meter_Number: meterMap.get(consumer.consumer_id)?.meter_serial_number || null,
    Zone_Name: zoneMap.get(consumer.zone_id) || null,
    Classification_Name: classificationMap.get(consumer.classification_id) || null,
  };
}

function mapBillRecord(bill, consumerMap = new Map(), classificationMap = new Map()) {
  const consumer = consumerMap.get(bill.consumer_id);
  return {
    Bill_ID: bill.bill_id,
    Consumer_ID: bill.consumer_id,
    Reading_ID: bill.reading_id,
    Bill_Date: bill.bill_date,
    Due_Date: bill.due_date,
    Total_Amount: bill.total_amount,
    Status: bill.status,
    Billing_Month: bill.billing_month,
    Consumer_Name: consumer ? `${consumer.first_name || ''} ${consumer.last_name || ''}`.trim() : null,
    Address: consumer?.address || null,
    Account_Number: consumer?.account_number || null,
    Classification: consumer ? classificationMap.get(consumer.classification_id) || null : null,
  };
}

function mapPaymentRecord(payment, consumerMap = new Map(), billMap = new Map()) {
  const consumer = consumerMap.get(payment.consumer_id);
  const bill = billMap.get(payment.bill_id);
  return {
    Payment_ID: payment.payment_id,
    Bill_ID: payment.bill_id,
    Consumer_ID: payment.consumer_id,
    Amount_Paid: payment.amount_paid,
    Payment_Date: payment.payment_date,
    Payment_Method: payment.payment_method,
    Reference_No: payment.reference_number,
    Reference_Number: payment.reference_number,
    OR_Number: payment.or_number,
    Status: payment.status,
    Consumer_Name: consumer ? `${consumer.first_name || ''} ${consumer.last_name || ''}`.trim() : null,
    Bill_Amount: bill?.total_amount || null,
  };
}

function mapMeterReadingRecord(reading, consumerMap = new Map()) {
  const consumer = consumerMap.get(reading.consumer_id);
  return {
    Reading_ID: reading.reading_id,
    Consumer_ID: reading.consumer_id,
    Meter_ID: reading.meter_id,
    Previous_Reading: reading.previous_reading,
    Current_Reading: reading.current_reading,
    Consumption: reading.consumption,
    Reading_Status: reading.reading_status,
    Notes: reading.notes,
    Reading_Date: reading.reading_date,
    Consumer_Name: consumer ? `${consumer.first_name || ''} ${consumer.last_name || ''}`.trim() : null,
  };
}

// Get roles
app.get('/api/roles', async (req, res) => {
  try {
    const result = await withPostgresPrimary(
      'roles.fetch',
      async () => {
        const { rows } = await pool.query('SELECT * FROM roles');
        return { success: true, data: rows };
      },
      async () => {
        const { data, error } = await supabase.from('roles').select('*');
        if (error) throw error;
        return { success: true, data };
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
    let roleIds;
    if (type === 'desktop') {
      roleIds = [1, 3, 4];
    } else {
      roleIds = [2, 5];
    }
    
    const result = await withPostgresPrimary(
      'users.fetchByType',
      async () => {
        const { rows } = await pool.query(`
          SELECT a.account_id AS "AccountID", a.username AS "Username", a.password AS "Password", 
                 a.username AS "Full_Name", a.role_id AS "Role_ID", a.account_status AS "Status", r.role_name AS "Role_Name"
          FROM accounts a
          JOIN roles r ON a.role_id = r.role_id
          WHERE a.role_id = ANY($1)
        `, [roleIds]);
        return { success: true, data: rows };
      },
      async () => {
        const { data, error } = await supabase
          .from('accounts')
          .select(`
            account_id,
            username,
            password,
            role_id,
            account_status,
            roles ( role_name )
          `)
          .in('role_id', roleIds);
        if (error) throw error;
        return {
          success: true,
          data: (data || []).map((u) => ({
            AccountID: u.account_id,
            Username: u.username,
            Password: u.password,
            Full_Name: u.username || 'N/A',
            Role_ID: u.role_id,
            Status: u.account_status,
            Role_Name: u.roles?.role_name,
          })),
        };
      }
    );
    
    return res.json(result);
  } catch (error) {
    await logRequestError(req, 'users.fetchByType', error);
    console.error('Error fetching users:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET Staff Users
app.get('/api/users/staff', async (req, res) => {
  try {
    const result = await withPostgresPrimary(
      'users.fetchStaff',
      async () => {
        const { rows } = await pool.query(`
          SELECT a.account_id AS "AccountID", a.username AS "Username", 
                 a.username AS "Full_Name", a.role_id AS "Role_ID", 
                 a.account_status AS "Status", r.role_name AS "Role_Name"
          FROM accounts a
          LEFT JOIN roles r ON a.role_id = r.role_id
          WHERE a.role_id IN (1, 2, 3)
          ORDER BY a.account_id DESC
        `);
        return { success: true, data: rows };
      },
      async () => {
        const { data, error } = await supabase
          .from('accounts')
          .select(`
            account_id,
            username,
            role_id,
            account_status,
            roles ( role_name )
          `)
          .in('role_id', [1, 2, 3])
          .order('account_id', { ascending: false });
        if (error) throw error;
        return {
          success: true,
          data: (data || []).map((u) => ({
            AccountID: u.account_id,
            Username: u.username,
            Full_Name: u.username || 'N/A',
            Role_ID: u.role_id,
            Status: u.account_status,
            Role_Name: u.roles?.role_name,
          })),
        };
      }
    );
    return res.json(result);
  } catch (error) {
    await logRequestError(req, 'users.fetchStaff', error);
    console.error('Error fetching staff:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET Unified Users (Staff + Consumers + IoT)
app.get('/api/users/unified', async (req, res) => {
  try {
    const result = await withPostgresPrimary(
      'users.fetchUnified',
      async () => {
        const { rows } = await pool.query(`
          SELECT a.account_id AS "AccountID", a.username AS "Username", 
                 a.username AS "Full_Name", a.role_id AS "Role_ID", 
                 a.account_status AS "Status", r.role_name AS "Role_Name"
          FROM accounts a
          LEFT JOIN roles r ON a.role_id = r.role_id
          ORDER BY a.account_id DESC
        `);
        return { success: true, data: rows };
      },
      async () => {
        const { data, error } = await supabase
          .from('accounts')
          .select(`
            account_id,
            username,
            role_id,
            account_status,
            roles ( role_name )
          `)
          .order('account_id', { ascending: false });
        if (error) throw error;
        return {
          success: true,
          data: (data || []).map((u) => ({
            AccountID: u.account_id,
            Username: u.username,
            Full_Name: u.username || 'N/A',
            Role_ID: u.role_id,
            Status: u.account_status,
            Role_Name: u.roles?.role_name,
          })),
        };
      }
    );
    return res.json(result);
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
    await withPostgresPrimary(
      'users.approve',
      async () => {
        await pool.query('UPDATE accounts SET account_status = $1 WHERE account_id = $2', ['Active', accountId]);
        await pool.query('UPDATE consumer SET status = $1 WHERE login_id = $2', ['Active', accountId]);
      },
      async () => {
        const { error: accountError } = await supabase.from('accounts').update({ account_status: 'Active' }).eq('account_id', accountId);
        if (accountError) throw accountError;
        const { error: consumerError } = await supabase.from('consumer').update({ status: 'Active' }).eq('login_id', accountId);
        if (consumerError) throw consumerError;
      }
    );
    scheduleImmediateSync('admin-approve-user');
    return res.json({ success: true, message: 'Account approved successfully' });
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
    await withPostgresPrimary(
      'users.reject',
      async () => {
        const { rows: consumers } = await pool.query('SELECT consumer_id FROM consumer WHERE login_id = $1', [accountId]);
        await pool.query('DELETE FROM consumer WHERE login_id = $1', [accountId]);
        await pool.query('DELETE FROM accounts WHERE account_id = $1', [accountId]);
        if (supabase) {
          for (const consumer of consumers) {
            await mirrorDeleteToSupabase('consumer', 'consumer_id', consumer.consumer_id);
          }
          await mirrorDeleteToSupabase('accounts', 'account_id', accountId);
        }
      },
      async () => {
        const { error: consumerError } = await supabase.from('consumer').delete().eq('login_id', accountId);
        if (consumerError) throw consumerError;
        const { error: accountError } = await supabase.from('accounts').delete().eq('account_id', accountId);
        if (accountError) throw accountError;
      }
    );
    return res.json({ success: true, message: 'Account rejected and deleted' });
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
    const user = await withPostgresPrimary(
      'users.create',
      async () => {
        const { rows } = await pool.query(
          'INSERT INTO accounts (username, password, role_id, account_status) VALUES ($1, $2, $3, $4) RETURNING *',
          [username, password, roleId, 'Active']
        );
        return rows[0];
      },
      async () => {
        const { data, error } = await supabase
          .from('accounts')
          .insert([{ username, password, role_id: roleId, account_status: 'Active' }])
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    );
    scheduleImmediateSync('users-create');
    return res.json({ success: true, data: user });
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
    await withPostgresPrimary(
      'users.update',
      async () => {
        let query = 'UPDATE accounts SET role_id = $1';
        let params = [roleId];
        
        if (password) {
          query += ', password = $2';
          params.push(password);
        }
        
        query += ` WHERE account_id = $${params.length + 1}`;
        params.push(id);
        
        await pool.query(query, params);
      },
      async () => {
        const payload = { role_id: roleId };
        if (password) {
          payload.password = password;
        }
        const { error } = await supabase.from('accounts').update(payload).eq('account_id', id);
        if (error) throw error;
      }
    );
    scheduleImmediateSync('users-update');
    return res.json({ success: true, message: 'User updated successfully' });
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
    await withPostgresPrimary(
      'users.delete',
      async () => {
        await pool.query('DELETE FROM accounts WHERE account_id = $1', [id]);
        if (supabase) {
          await mirrorDeleteToSupabase('accounts', 'account_id', id);
        }
      },
      async () => {
        const { error } = await supabase.from('accounts').delete().eq('account_id', id);
        if (error) throw error;
      }
    );
    return res.json({ success: true, message: 'User deleted successfully' });
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
    let user = null;

    if (supabase) {
      const { data, error } = await supabase
        .from('accounts')
        .select(`
          account_id,
          username,
          password,
          role_id,
          account_status,
          roles ( role_name )
        `)
        .eq('username', username)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data?.role_id === 5) {
        user = {
          account_id: data.account_id,
          username: data.username,
          password: data.password,
          full_name: data.username,
          role_id: data.role_id,
          account_status: data.account_status,
          role_name: data.roles?.role_name,
        };
      }
    }

    if (!user) {
      user = await withPostgresPrimary(
        'auth.login',
        async () => {
          const { rows } = await pool.query(`
            SELECT a.account_id, a.username, a.password, a.username AS full_name, a.role_id, a.account_status, r.role_name
            FROM accounts a
            JOIN roles r ON a.role_id = r.role_id
            WHERE a.username = $1
          `, [username]);
          return rows[0];
        },
        async () => {
          const { data, error } = await supabase
            .from('accounts')
            .select(`
              account_id,
              username,
              password,
              role_id,
              account_status,
              roles ( role_name )
            `)
            .eq('username', username)
            .single();
          if (error) throw error;
          return data
            ? {
                account_id: data.account_id,
                username: data.username,
                password: data.password,
                full_name: data.username,
                role_id: data.role_id,
                account_status: data.account_status,
                role_name: data.roles?.role_name,
              }
            : null;
        }
      );
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username' });
    }
    if (user.account_status === 'Pending') {
      return res.status(401).json({ success: false, message: 'Please wait until you are registered to access the dashboard.' });
    }
    if (user.password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user.account_id,
        username: user.username,
        fullName: user.full_name || user.username,
        role_id: user.role_id,
        role_name: user.role_name,
      },
    });
  } catch (error) {
    await logRequestError(req, 'auth.login', error);
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Database error: ' + error.message });
  }
});

// Get zones
app.get('/api/zones', async (req, res) => {
  try {
    const rows = await withPostgresPrimary(
      'zones.fetch',
      async () => {
        const { rows } = await pool.query('SELECT * FROM zone');
        return rows;
      },
      async () => {
        const { data, error } = await supabase.from('zone').select('*').order('zone_id');
        if (error) throw error;
        return data || [];
      }
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    await logRequestError(req, 'zones.fetch', error);
    console.error('Error fetching zones:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get classifications
app.get('/api/classifications', async (req, res) => {
  try {
    const rows = await withPostgresPrimary(
      'classifications.fetch',
      async () => {
        const { rows } = await pool.query('SELECT * FROM classification');
        return rows;
      },
      async () => {
        const { data, error } = await supabase.from('classification').select('*').order('classification_id');
        if (error) throw error;
        return data || [];
      }
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    await logRequestError(req, 'classifications.fetch', error);
    console.error('Error fetching classifications:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// --- WATER RATES ---
// Get latest water rates
app.get('/api/water-rates/latest', async (req, res) => {
  try {
    const row = await withPostgresPrimary(
      'waterRates.fetchLatest',
      async () => {
        const { rows } = await pool.query(
          'SELECT * FROM waterrates ORDER BY effective_date DESC LIMIT 1'
        );
        return rows[0] || null;
      },
      async () => {
        const { data, error } = await supabase
          .from('waterrates')
          .select('*')
          .order('effective_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data || null;
      }
    );
    return res.json({ success: true, data: row });
  } catch (error) {
    await logRequestError(req, 'waterRates.fetchLatest', error);
    console.error('Error fetching latest water rates:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Create new water rate entry
app.post('/api/water-rates', async (req, res) => {
  const { minimum_cubic, minimum_rate, excess_rate_per_cubic, modified_by } = req.body;
  const effective_date = new Date().toISOString();

  try {
    const payload = {
      minimum_cubic: parseInt(minimum_cubic),
      minimum_rate: parseFloat(minimum_rate),
      excess_rate_per_cubic: parseFloat(excess_rate_per_cubic),
      effective_date,
      modified_by: modified_by ? parseInt(modified_by) : null,
      modified_date: effective_date,
    };

    const row = await withPostgresPrimary(
      'waterRates.create',
      async () => {
        const { rows } = await pool.query(
          `INSERT INTO waterrates (minimum_cubic, minimum_rate, excess_rate_per_cubic, effective_date, modified_by, modified_date)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [
            payload.minimum_cubic,
            payload.minimum_rate,
            payload.excess_rate_per_cubic,
            payload.effective_date,
            payload.modified_by,
            payload.modified_date
          ]
        );
        return rows[0];
      },
      async () => {
        const { data, error } = await supabase.from('waterrates').insert([payload]).select().single();
        if (error) throw error;
        return data;
      }
    );
    scheduleImmediateSync('water-rates-create');
    return res.json({ success: true, data: row });
  } catch (error) {
    await logRequestError(req, 'waterRates.create', error);
    console.error('Error creating water rate:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/consumers', async (req, res) => {
  try {
    const rows = await withPostgresPrimary(
      'consumers.fetch',
      async () => {
        const { rows } = await pool.query(`
          SELECT 
            c.consumer_id AS "Consumer_ID",
            c.first_name AS "First_Name",
            c.middle_name AS "Middle_Name",
            c.last_name AS "Last_Name",
            c.address AS "Address",
            c.zone_id AS "Zone_ID",
            c.classification_id AS "Classification_ID",
            c.account_number AS "Account_Number",
            c.status AS "Status",
            c.contact_number AS "Contact_Number",
            c.connection_date AS "Connection_Date",
            m.meter_id AS "Meter_ID",
            m.meter_serial_number AS "Meter_Number",
            z.zone_name AS "Zone_Name", 
            cl.classification_name AS "Classification_Name"
          FROM consumer c
          LEFT JOIN LATERAL (
            SELECT meter_id, meter_serial_number
            FROM meter
            WHERE consumer_id = c.consumer_id
            ORDER BY meter_id DESC
            LIMIT 1
          ) m ON true
          LEFT JOIN zone z ON c.zone_id = z.zone_id
          LEFT JOIN classification cl ON c.classification_id = cl.classification_id
          ORDER BY c.consumer_id DESC
        `);
        return rows;
      },
      async () => {
        const [{ data: consumers, error: consumerError }, { data: zones, error: zoneError }, { data: classifications, error: classificationError }, { data: meters, error: meterError }] = await Promise.all([
          supabase.from('consumer').select('*').order('consumer_id', { ascending: false }),
          supabase.from('zone').select('*'),
          supabase.from('classification').select('*'),
          supabase.from('meter').select('meter_id, consumer_id, meter_serial_number').order('meter_id', { ascending: false }),
        ]);

        if (consumerError) throw consumerError;
        if (zoneError) throw zoneError;
        if (classificationError) throw classificationError;
        if (meterError) throw meterError;

        const zoneMap = new Map((zones || []).map((zone) => [zone.zone_id, zone.zone_name]));
        const classificationMap = new Map((classifications || []).map((classification) => [classification.classification_id, classification.classification_name]));
        const meterMap = new Map();
        for (const meter of meters || []) {
          if (!meterMap.has(meter.consumer_id)) {
            meterMap.set(meter.consumer_id, meter);
          }
        }

        return (consumers || []).map((consumer) => mapConsumerRecord(consumer, zoneMap, classificationMap, meterMap));
      }
    );
    return res.json(rows);
  } catch (error) {
    await logRequestError(req, 'consumers.fetch', error);
    console.error('Error fetching consumers:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/consumers', async (req, res) => {
  try {
    const consumer = req.body;
    const loginId = Number(consumer.Login_ID || consumer.login_id);
    const meterNumber = String(consumer.Meter_Number || consumer.meter_number || '').trim();

    if (!loginId) {
      return res.status(400).json({
        success: false,
        message: 'Login_ID is required to create a consumer because consumer.login_id is required by the schema.',
      });
    }

    const createdConsumer = await withPostgresPrimary(
      'consumers.create',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const { rows } = await client.query(`
            INSERT INTO consumer (first_name, middle_name, last_name, address, zone_id, classification_id, account_number, status, contact_number, connection_date, login_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
          `, [
            consumer.First_Name,
            consumer.Middle_Name,
            consumer.Last_Name,
            consumer.Address,
            consumer.Zone_ID,
            consumer.Classification_ID,
            consumer.Account_Number,
            consumer.Status || 'Active',
            consumer.Contact_Number,
            consumer.Connection_Date,
            loginId
          ]);

          if (meterNumber) {
            await client.query(`
              INSERT INTO meter (consumer_id, meter_serial_number)
              VALUES ($1, $2)
            `, [rows[0].consumer_id, meterNumber]);
          }

          await client.query('COMMIT');
          return rows[0];
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      async () => {
        const { data, error } = await supabase
          .from('consumer')
          .insert([{
            first_name: consumer.First_Name,
            middle_name: consumer.Middle_Name,
            last_name: consumer.Last_Name,
            address: consumer.Address,
            zone_id: consumer.Zone_ID,
            classification_id: consumer.Classification_ID,
            account_number: consumer.Account_Number,
            status: consumer.Status || 'Active',
            contact_number: consumer.Contact_Number,
            connection_date: consumer.Connection_Date,
            login_id: loginId,
          }])
          .select()
          .single();
        if (error) throw error;

        if (meterNumber) {
          const { error: meterError } = await supabase
            .from('meter')
            .insert([{ consumer_id: data.consumer_id, meter_serial_number: meterNumber }]);
          if (meterError) throw meterError;
        }

        return data;
      }
    );
    scheduleImmediateSync('consumers-create');
    return res.json({
      success: true,
      data: {
        Consumer_ID: createdConsumer.consumer_id,
        Login_ID: createdConsumer.login_id,
        ...consumer,
        Meter_Number: meterNumber || null,
      },
    });
  } catch (error) {
    await logRequestError(req, 'consumers.create', error);
    console.error('Error creating consumer:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/consumers/:id', async (req, res) => {
  const { id } = req.params;
  const consumer = req.body;
  const meterNumber = String(consumer.Meter_Number || consumer.meter_number || '').trim();
  
  try {
    await withPostgresPrimary(
      'consumers.update',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          await client.query(`
            UPDATE consumer SET 
              first_name = $1, middle_name = $2, last_name = $3, address = $4, zone_id = $5, 
              classification_id = $6, account_number = $7, 
              status = $8, contact_number = $9, connection_date = $10
            WHERE consumer_id = $11
          `, [
            consumer.First_Name,
            consumer.Middle_Name,
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

          if (meterNumber) {
            const { rows: existingMeters } = await client.query(`
              SELECT meter_id
              FROM meter
              WHERE consumer_id = $1
              ORDER BY meter_id DESC
              LIMIT 1
            `, [id]);

            if (existingMeters.length > 0) {
              await client.query(`
                UPDATE meter
                SET meter_serial_number = $1
                WHERE meter_id = $2
              `, [meterNumber, existingMeters[0].meter_id]);
            } else {
              await client.query(`
                INSERT INTO meter (consumer_id, meter_serial_number)
                VALUES ($1, $2)
              `, [id, meterNumber]);
            }
          }

          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      async () => {
        const { error: consumerError } = await supabase
          .from('consumer')
          .update({
            first_name: consumer.First_Name,
            middle_name: consumer.Middle_Name,
            last_name: consumer.Last_Name,
            address: consumer.Address,
            zone_id: consumer.Zone_ID,
            classification_id: consumer.Classification_ID,
            account_number: consumer.Account_Number,
            status: consumer.Status,
            contact_number: consumer.Contact_Number,
            connection_date: consumer.Connection_Date,
          })
          .eq('consumer_id', id);
        if (consumerError) throw consumerError;

        if (meterNumber) {
          const { data: existingMeters, error: meterLookupError } = await supabase
            .from('meter')
            .select('meter_id')
            .eq('consumer_id', id)
            .order('meter_id', { ascending: false })
            .limit(1);
          if (meterLookupError) throw meterLookupError;

          if (existingMeters?.length) {
            const { error: meterUpdateError } = await supabase
              .from('meter')
              .update({ meter_serial_number: meterNumber })
              .eq('meter_id', existingMeters[0].meter_id);
            if (meterUpdateError) throw meterUpdateError;
          } else {
            const { error: meterInsertError } = await supabase
              .from('meter')
              .insert([{ consumer_id: Number(id), meter_serial_number: meterNumber }]);
            if (meterInsertError) throw meterInsertError;
          }
        }
      }
    );

    scheduleImmediateSync('consumers-update');
    return res.json({ success: true, message: 'Consumer updated successfully' });
  } catch (error) {
    await logRequestError(req, 'consumers.update', error);
    console.error('Error updating consumer:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/consumers/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    await withPostgresPrimary(
      'consumers.delete',
      async () => {
        await pool.query('DELETE FROM consumer WHERE consumer_id = $1', [id]);
        if (supabase) {
          await mirrorDeleteToSupabase('consumer', 'consumer_id', id);
        }
      },
      async () => {
        const { error } = await supabase.from('consumer').delete().eq('consumer_id', id);
        if (error) throw error;
      }
    );
    return res.json({ success: true, message: 'Consumer deleted successfully' });
  } catch (error) {
    await logRequestError(req, 'consumers.delete', error);
    console.error('Error deleting consumer:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/meter-readings', async (req, res) => {
  try {
    const rows = await withPostgresPrimary(
      'meterReadings.fetch',
      async () => {
        const { rows } = await pool.query(`
          SELECT 
            m.reading_id AS "Reading_ID", m.consumer_id AS "Consumer_ID", m.meter_id AS "Meter_ID",
            m.previous_reading AS "Previous_Reading", m.current_reading AS "Current_Reading", 
            m.consumption AS "Consumption", m.reading_status AS "Reading_Status", 
            m.notes AS "Notes", m.reading_date AS "Reading_Date",
            CONCAT(c.first_name, ' ', c.last_name) AS "Consumer_Name"
          FROM meterreadings m
          LEFT JOIN consumer c ON m.consumer_id = c.consumer_id
        `);
        return rows;
      },
      async () => {
        const [{ data: readings, error: readingsError }, { data: consumers, error: consumersError }] = await Promise.all([
          supabase.from('meterreadings').select('*').order('reading_id', { ascending: false }),
          supabase.from('consumer').select('consumer_id, first_name, last_name'),
        ]);
        if (readingsError) throw readingsError;
        if (consumersError) throw consumersError;

        const consumerMap = new Map((consumers || []).map((consumer) => [consumer.consumer_id, consumer]));
        return (readings || []).map((reading) => mapMeterReadingRecord(reading, consumerMap));
      }
    );
    return res.json(rows);
  } catch (error) {
    await logRequestError(req, 'meterReadings.fetch', error);
    console.error('Error fetching meter readings:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/meter-readings', async (req, res) => {
  try {
    const reading = req.body;
    const payload = {
      consumer_id: reading.Consumer_ID,
      meter_id: reading.Meter_ID,
      previous_reading: reading.Previous_Reading,
      current_reading: reading.Current_Reading,
      consumption: reading.Consumption,
      reading_status: reading.Reading_Status || 'Recorded',
      notes: reading.Notes,
      reading_date: reading.Reading_Date,
      route_id: 1,
      meter_reader_id: 1,
    };
    const row = await withPostgresPrimary(
      'meterReadings.create',
      async () => {
        const { rows } = await pool.query(`
          INSERT INTO meterreadings (consumer_id, meter_id, previous_reading, current_reading, consumption, reading_status, notes, reading_date, route_id, meter_reader_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *, reading_id AS "Reading_ID"
        `, [
          payload.consumer_id,
          payload.meter_id,
          payload.previous_reading,
          payload.current_reading,
          payload.consumption,
          payload.reading_status,
          payload.notes,
          payload.reading_date,
          payload.route_id,
          payload.meter_reader_id
        ]);
        return rows[0];
      },
      async () => {
        const { data, error } = await supabase.from('meterreadings').insert([payload]).select().single();
        if (error) throw error;
        return { ...data, Reading_ID: data.reading_id };
      }
    );
    scheduleImmediateSync('meter-readings-create');
    return res.json(row);
  } catch (error) {
    await logRequestError(req, 'meterReadings.create', error);
    console.error('Error creating meter reading:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills', async (req, res) => {
  const { Account_Number, status } = req.query;
  try {
    const rows = await withPostgresPrimary(
      'bills.fetch',
      async () => {
        let queryStr = `
          SELECT 
            b.bill_id AS "Bill_ID", b.consumer_id AS "Consumer_ID", b.reading_id AS "Reading_ID",
            b.bill_date AS "Bill_Date", b.due_date AS "Due_Date", b.total_amount AS "Total_Amount",
            b.status AS "Status", b.billing_month AS "Billing_Month",
            CONCAT(c.first_name, ' ', c.last_name) AS "Consumer_Name",
            c.address AS "Address", c.account_number AS "Account_Number",
            cl.classification_name AS "Classification"
          FROM bills b
          LEFT JOIN consumer c ON b.consumer_id = c.consumer_id
          LEFT JOIN classification cl ON c.classification_id = cl.classification_id
          WHERE 1=1
        `;
        const params = [];
        if (Account_Number) {
          params.push(Account_Number);
          queryStr += ` AND c.account_number = $${params.length}`;
        }
        if (status) {
          params.push(status);
          queryStr += ` AND b.status = $${params.length}`;
        }
        queryStr += ` ORDER BY b.bill_date DESC`;
        
        const { rows } = await pool.query(queryStr, params);
        return rows;
      },
      async () => {
        const [{ data: bills, error: billsError }, { data: consumers, error: consumersError }, { data: classifications, error: classificationsError }] = await Promise.all([
          supabase.from('bills').select('*').order('bill_date', { ascending: false }),
          supabase.from('consumer').select('consumer_id, first_name, last_name, address, account_number, classification_id'),
          supabase.from('classification').select('classification_id, classification_name'),
        ]);
        if (billsError) throw billsError;
        if (consumersError) throw consumersError;
        if (classificationsError) throw classificationsError;

        const consumerMap = new Map((consumers || []).map((consumer) => [consumer.consumer_id, consumer]));
        const classificationMap = new Map((classifications || []).map((classification) => [classification.classification_id, classification.classification_name]));

        return (bills || [])
          .map((bill) => mapBillRecord(bill, consumerMap, classificationMap))
          .filter((bill) => (!Account_Number || bill.Account_Number === Account_Number) && (!status || bill.Status === status));
      }
    );
    return res.json(rows);
  } catch (error) {
    await logRequestError(req, 'bills.fetch', error);
    console.error('Error fetching bills:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/bills', async (req, res) => {
  try {
    const bill = req.body;
    const payload = {
      consumer_id: bill.Consumer_ID,
      reading_id: bill.Reading_ID,
      bill_date: bill.Bill_Date,
      due_date: bill.Due_Date,
      total_amount: bill.Total_Amount,
      status: bill.Status || 'Unpaid',
      billing_officer_id: 1,
      billing_month: 'April 2026',
      date_covered_from: new Date(),
      date_covered_to: new Date(),
    };
    const row = await withPostgresPrimary(
      'bills.create',
      async () => {
        const { rows } = await pool.query(`
          INSERT INTO bills (consumer_id, reading_id, bill_date, due_date, total_amount, status, billing_officer_id, billing_month, date_covered_from, date_covered_to)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING *, bill_id AS "Bill_ID"
        `, [
          payload.consumer_id,
          payload.reading_id,
          payload.bill_date,
          payload.due_date,
          payload.total_amount,
          payload.status,
          payload.billing_officer_id,
          payload.billing_month,
          payload.date_covered_from,
          payload.date_covered_to
        ]);
        return rows[0];
      },
      async () => {
        const { data, error } = await supabase.from('bills').insert([payload]).select().single();
        if (error) throw error;
        return { ...data, Bill_ID: data.bill_id };
      }
    );
    scheduleImmediateSync('bills-create');
    return res.json(row);
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
    if (!supabase) {
      return res.status(503).json({
        success: false,
        message: 'Consumer app data is only available through Supabase in online mode.',
      });
    }

    const { data: consumer, error: cErr } = await supabase
      .from('consumer')
      .select('*')
      .eq('login_id', accountId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!consumer) return res.status(404).json({ success: false, message: 'Consumer not found' });

    const consumerId = consumer.consumer_id;
    const { data: bills } = await supabase
      .from('bills')
      .select('*')
      .eq('consumer_id', consumerId)
      .order('bill_date', { ascending: false });
    const { data: payments } = await supabase
      .from('payment')
      .select('*, bills(bill_date)')
      .eq('consumer_id', consumerId)
      .order('payment_date', { ascending: false });
    const { data: readings } = await supabase
      .from('meterreadings')
      .select('reading_date, consumption')
      .eq('consumer_id', consumerId)
      .order('reading_date', { ascending: false })
      .limit(6);

    return res.json({
      success: true,
      consumer: { ...consumer, Consumer_ID: consumer.consumer_id },
      bills: (bills || []).map((b) => ({ ...b, Bill_ID: b.bill_id, Bill_Date: b.bill_date, Total_Amount: b.total_amount })),
      payments: (payments || []).map((p) => ({
        ...p,
        Payment_ID: p.payment_id,
        Amount_Paid: p.amount_paid,
        Payment_Date: p.payment_date,
        Reference_Number: p.reference_number,
      })),
      readings: (readings || []).map((r) => ({ Reading_Date: r.reading_date, Consumption: r.consumption })).reverse(),
    });
  } catch (error) {
    await logRequestError(req, 'consumerDashboard.fetch', error);
    console.error('Consumer dashboard error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/payments', async (req, res) => {
  try {
    const rows = await withPostgresPrimary(
      'payments.fetch',
      async () => {
        const { rows } = await pool.query(`
          SELECT 
            p.payment_id AS "Payment_ID", p.bill_id AS "Bill_ID", p.consumer_id AS "Consumer_ID",
            p.amount_paid AS "Amount_Paid", p.payment_date AS "Payment_Date", 
            p.payment_method AS "Payment_Method", p.reference_number AS "Reference_No",
            p.reference_number AS "Reference_Number", p.or_number AS "OR_Number",
            p.status AS "Status",
            CONCAT(c.first_name, ' ', c.last_name) AS "Consumer_Name",
            b.total_amount AS "Bill_Amount"
          FROM payment p
          LEFT JOIN consumer c ON p.consumer_id = c.consumer_id
          LEFT JOIN bills b ON p.bill_id = b.bill_id
        `);
        return rows;
      },
      async () => {
        const [{ data: payments, error: paymentsError }, { data: consumers, error: consumersError }, { data: bills, error: billsError }] = await Promise.all([
          supabase.from('payment').select('*').order('payment_date', { ascending: false }),
          supabase.from('consumer').select('consumer_id, first_name, last_name'),
          supabase.from('bills').select('bill_id, total_amount'),
        ]);
        if (paymentsError) throw paymentsError;
        if (consumersError) throw consumersError;
        if (billsError) throw billsError;

        const consumerMap = new Map((consumers || []).map((consumer) => [consumer.consumer_id, consumer]));
        const billMap = new Map((bills || []).map((bill) => [bill.bill_id, bill]));
        return (payments || []).map((payment) => mapPaymentRecord(payment, consumerMap, billMap));
      }
    );
    return res.json(rows);
  } catch (error) {
    await logRequestError(req, 'payments.fetch', error);
    console.error('Error fetching payments:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/payments', async (req, res) => {
  try {
    const payment = req.body;
    const payload = {
      bill_id: payment.Bill_ID,
      consumer_id: payment.Consumer_ID,
      amount_paid: payment.Amount_Paid,
      payment_date: payment.Payment_Date,
      payment_method: payment.Payment_Method,
      reference_number: payment.Reference_No || payment.Reference_Number || null,
      or_number: payment.OR_Number || null,
      status: payment.Status || 'Pending',
    };
    const row = await withPostgresPrimary(
      'payments.create',
      async () => {
        const { rows } = await pool.query(`
          INSERT INTO payment (bill_id, consumer_id, amount_paid, payment_date, payment_method, reference_number, or_number, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *, payment_id AS "Payment_ID"
        `, [
          payload.bill_id,
          payload.consumer_id,
          payload.amount_paid,
          payload.payment_date,
          payload.payment_method,
          payload.reference_number,
          payload.or_number,
          payload.status
        ]);
        
        await pool.query('UPDATE bills SET status = $1 WHERE bill_id = $2', ['Paid', payment.Bill_ID]);
        return rows[0];
      },
      async () => {
        const { data, error } = await supabase.from('payment').insert([payload]).select().single();
        if (error) throw error;
        const { error: billError } = await supabase.from('bills').update({ status: 'Paid' }).eq('bill_id', payment.Bill_ID);
        if (billError) throw billError;
        return { ...data, Payment_ID: data.payment_id };
      }
    );
    scheduleImmediateSync('payments-create');
    return res.json(row);
  } catch (error) {
    await logRequestError(req, 'payments.create', error);
    console.error('Error creating payment:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Helper to send SMS (Mock for now)
const sendSMS = async (phone, message) => {
  try {
    console.log(`\n--- MOCK SMS SENT ---`);
    console.log(`To: ${phone}`);
    console.log(`Message: ${message}`);
    console.log(`----------------------\n`);
    return { success: true };
  } catch (error) {
    await logDatabaseError('sms.mock.send', error, { severity: 'WARNING' });
    return { success: false, message: error.message };
  }
};

// --- FORGOT PASSWORD ENDPOINTS ---

// Placeholder for Forgot Password flow
// NOTE: These require an 'otp_verifications' table which is missing from the new schema
app.post('/api/forgot-password/request', async (req, res) => {
  const { username } = req.body;
  try {
    const user = await withPostgresPrimary(
      'forgotPassword.request',
      async () => {
        const { rows } = await pool.query('SELECT account_id, username FROM accounts WHERE username = $1', [username]);
        return rows[0];
      },
      async () => {
        const { data, error } = await supabase.from('accounts').select('account_id, username').eq('username', username).single();
        if (error) throw error;
        return data;
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
    await withPostgresPrimary(
      'forgotPassword.reset',
      async () => {
        await pool.query('UPDATE accounts SET password = $1 WHERE username = $2', [newPassword, username]);
        scheduleImmediateSync('forgot-password-reset');
      },
      async () => {
        const { error } = await supabase.from('accounts').update({ password: newPassword }).eq('username', username);
        if (error) throw error;
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
    await withPostgresPrimary(
      'register',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const { rows } = await client.query(
            'INSERT INTO accounts (username, password, role_id, account_status) VALUES ($1, $2, $3, $4) RETURNING account_id',
            [username, password, 4, 'Pending']
          );
          const accountId = rows[0].account_id;

          await client.query(`
            INSERT INTO consumer (first_name, middle_name, last_name, address, zone_id, classification_id, login_id, status, contact_number, account_number)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [firstName, middleName, lastName, address, zoneId, classificationId, accountId, 'Pending', phone, `ACC-${Date.now()}`]);

          await client.query('COMMIT');
          scheduleImmediateSync('register');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      async () => {
        const { data: accountRows, error: accountError } = await supabase
          .from('accounts')
          .insert([{
            username,
            password,
            role_id: 4,
            account_status: 'Pending'
          }])
          .select();
        if (accountError) throw accountError;
        const accountId = accountRows[0].account_id;

        const { error: consumerError } = await supabase
          .from('consumer')
          .insert([{
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            address,
            zone_id: zoneId,
            classification_id: classificationId,
            login_id: accountId,
            status: 'Pending',
            contact_number: phone,
            account_number: `ACC-${Date.now()}`
          }]);
        if (consumerError) throw consumerError;
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

app.post('/api/admin/sync/run', async (req, res) => {
  try {
    const result = await runHybridSyncCycle('api');
    const status = result.success ? 200 : 409;
    return res.status(status).json(result);
  } catch (error) {
    await logRequestError(req, 'admin.sync.run', error);
    console.error('Hybrid sync cycle failed:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/sync/status', async (req, res) => {
  try {
    return res.json({
      success: true,
      sync: {
        ...syncState,
        configured: Boolean(supabase),
        schema: supabaseSchema,
      },
    });
  } catch (error) {
    await logRequestError(req, 'admin.sync.status', error);
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

