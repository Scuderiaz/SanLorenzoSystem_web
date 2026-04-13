const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
  failureReport: path.join(logDirectory, 'failure-report.txt'),
  connectivity: path.join(logDirectory, 'connectivity-errors.txt'),
  syncConflicts: path.join(logDirectory, 'sync-conflicts.txt'),
};
const adminSettingsFile = path.join(__dirname, 'data', 'admin-settings.json');
const defaultSourceSiteId = process.env.SYNC_SOURCE_SITE_ID || process.env.REACT_APP_SOURCE_SITE_ID || 'postgres-local';
const defaultAdminSettings = {
  systemName: 'San Lorenzo Ruiz Water Billing System',
  currency: 'PHP',
  dueDateDays: '15',
  lateFee: '10.0',
};
let isSupabaseSyncRunning = false;
let immediateSyncTimer = null;
let isPostgresAvailable = false;
const loggedSyncConflictKeys = new Set();
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
  { tableName: 'error_logs', primaryKey: 'error_id', syncWithSupabase: false },
  { tableName: 'system_logs', primaryKey: 'log_id', syncWithSupabase: false },
  { tableName: 'backuplogs', primaryKey: 'backup_id' },
  { tableName: 'waterrates', primaryKey: 'rate_id' },
];

const syncTableColumns = {
  roles: ['role_id', 'role_name'],
  zone: ['zone_id', 'zone_name'],
  classification: ['classification_id', 'classification_name'],
  accounts: ['account_id', 'username', 'password', 'role_id', 'account_status', 'created_at', 'auth_user_id'],
  consumer: [
    'consumer_id',
    'first_name',
    'middle_name',
    'last_name',
    'address',
    'purok',
    'barangay',
    'municipality',
    'zip_code',
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

const syncConflictPolicies = {
  roles: { mode: 'auto-merge' },
  zone: { mode: 'auto-merge' },
  classification: { mode: 'auto-merge' },
  waterrates: { mode: 'auto-merge' },
  consumer: {
    mode: 'strict',
    compareColumns: [
      'first_name',
      'middle_name',
      'last_name',
      'address',
      'purok',
      'barangay',
      'municipality',
      'zip_code',
      'zone_id',
      'classification_id',
      'login_id',
      'account_number',
      'status',
      'contact_number',
      'connection_date',
    ],
    businessKeys: [
      ['login_id'],
      ['account_number'],
    ],
  },
  meterreadings: {
    mode: 'strict',
    compareColumns: [
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
    businessKeys: [
      ['consumer_id', 'reading_date'],
      ['meter_id', 'reading_date'],
    ],
  },
  bills: {
    mode: 'strict',
    compareColumns: [
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
    businessKeys: [
      ['reading_id'],
      ['consumer_id', 'billing_month'],
    ],
  },
  payment: {
    mode: 'strict',
    compareColumns: [
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
    businessKeys: [
      ['or_number'],
      ['reference_number'],
    ],
  },
  ledger_entry: {
    mode: 'strict',
    compareColumns: [
      'consumer_id',
      'transaction_type',
      'reference_id',
      'amount',
      'balance',
      'transaction_date',
      'notes',
    ],
    businessKeys: [
      ['consumer_id', 'transaction_type', 'reference_id'],
    ],
  },
};

const durableSyncTables = [
  'accounts',
  'consumer',
  'meter',
  'meterreadings',
  'bills',
  'payment',
  'ledger_entry',
  'connection_ticket',
];

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

async function ensureTableColumn(tableName, columnName, definition) {
  await pool.query(
    `ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN IF NOT EXISTS ${quoteIdentifier(columnName)} ${definition}`
  );
}

async function ensureUniqueConstraint(tableName, constraintName, columnName) {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = '${constraintName}'
      ) THEN
        ALTER TABLE ${quoteIdentifier(tableName)}
          ADD CONSTRAINT ${quoteIdentifier(constraintName)} UNIQUE (${quoteIdentifier(columnName)});
      END IF;
    END
    $$;
  `);
}

function getSyncConflictPolicy(tableName) {
  return syncConflictPolicies[tableName] || { mode: 'default' };
}

function isStrictSyncConflictTable(tableName) {
  return getSyncConflictPolicy(tableName).mode === 'strict';
}

function isDateLikeColumn(columnName) {
  return /(^|_)(date|time)$/.test(columnName) || columnName.endsWith('_at');
}

function normalizeComparableValue(columnName, value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const numericPattern = /^-?\d+(?:\.\d+)?$/;
    const numericValue = Number(trimmed);
    if (!isDateLikeColumn(columnName) && numericPattern.test(trimmed) && !Number.isNaN(numericValue)) {
      return numericValue;
    }

    if (isDateLikeColumn(columnName)) {
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }

    return trimmed;
  }

  return safeSerialize(value);
}

function areRowsEquivalent(tableName, leftRow, rightRow, primaryKey) {
  const policy = getSyncConflictPolicy(tableName);
  const compareColumns = (policy.compareColumns || syncTableColumns[tableName] || [])
    .filter((column) => column !== primaryKey);

  return compareColumns.every((column) => (
    normalizeComparableValue(column, leftRow?.[column]) === normalizeComparableValue(column, rightRow?.[column])
  ));
}

function buildBusinessKeyValue(row, keyColumns = []) {
  const normalizedParts = keyColumns.map((column) => normalizeComparableValue(column, row?.[column]));
  if (normalizedParts.some((value) => value === null)) {
    return null;
  }

  return normalizedParts.map((value) => String(value)).join('|');
}

function findSyncConflict(tableName, primaryKey, sourceRow, destinationRows = []) {
  const policy = getSyncConflictPolicy(tableName);
  if (policy.mode !== 'strict') {
    return null;
  }

  const sourcePrimaryKey = normalizeComparableValue(primaryKey, sourceRow?.[primaryKey]);
  const primaryKeyMatch = destinationRows.find((row) => (
    normalizeComparableValue(primaryKey, row?.[primaryKey]) === sourcePrimaryKey
  ));

  if (primaryKeyMatch && !areRowsEquivalent(tableName, sourceRow, primaryKeyMatch, primaryKey)) {
    return {
      conflictType: 'primary-key-mismatch',
      reason: `Existing ${tableName} row with ${primaryKey}=${sourcePrimaryKey} has different protected values.`,
      businessKey: null,
      existingRow: primaryKeyMatch,
    };
  }

  for (const keyColumns of policy.businessKeys || []) {
    const businessKeyValue = buildBusinessKeyValue(sourceRow, keyColumns);
    if (!businessKeyValue) {
      continue;
    }

    const businessKeyMatch = destinationRows.find((row) => {
      const rowPrimaryKey = normalizeComparableValue(primaryKey, row?.[primaryKey]);
      return rowPrimaryKey !== sourcePrimaryKey && buildBusinessKeyValue(row, keyColumns) === businessKeyValue;
    });

    if (!businessKeyMatch) {
      continue;
    }

    const conflictType = areRowsEquivalent(tableName, sourceRow, businessKeyMatch, primaryKey)
      ? 'duplicate-business-key'
      : 'business-key-collision';

    return {
      conflictType,
      reason: `Detected conflicting ${tableName} row for business key ${keyColumns.join('+')}=${businessKeyValue}.`,
      businessKey: `${keyColumns.join('+')}=${businessKeyValue}`,
      existingRow: businessKeyMatch,
    };
  }

  return null;
}

async function recordSyncConflict(tableName, direction, primaryKey, sourceRow, conflict) {
  const dedupeKey = JSON.stringify({
    tableName,
    direction,
    conflictType: conflict.conflictType,
    primaryKey,
    primaryKeyValue: sourceRow?.[primaryKey] ?? null,
    businessKey: conflict.businessKey || null,
  });

  if (loggedSyncConflictKeys.has(dedupeKey)) {
    return;
  }

  loggedSyncConflictKeys.add(dedupeKey);

  const payload = {
    tableName,
    direction,
    conflictType: conflict.conflictType,
    primaryKey,
    primaryKeyValue: sourceRow?.[primaryKey] ?? null,
    businessKey: conflict.businessKey || null,
    reason: conflict.reason,
    sourceRecord: sourceRow,
    existingRecord: conflict.existingRow || null,
  };

  appendTextLog(logFiles.syncConflicts, JSON.stringify(payload));
  appendFailureReport('SYNC_CONFLICT', `${direction}.${tableName}`, conflict.reason, {
    tableName,
    direction,
    conflictType: conflict.conflictType,
    primaryKey,
    primaryKeyValue: sourceRow?.[primaryKey] ?? null,
    businessKey: conflict.businessKey || null,
  });

  try {
    await pool.query(
      `INSERT INTO sync_conflicts (
         table_name, direction, conflict_type, primary_key_name, primary_key_value,
         business_key, reason, source_record, existing_record
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
      [
        tableName,
        direction,
        conflict.conflictType,
        primaryKey,
        sourceRow?.[primaryKey] != null ? String(sourceRow[primaryKey]) : null,
        conflict.businessKey || null,
        conflict.reason,
        safeSerialize(sourceRow),
        safeSerialize(conflict.existingRow || null),
      ]
    );
  } catch (error) {
    console.warn(`Failed to persist sync conflict for ${tableName}: ${error.message}`);
  }
}

async function filterRowsForSync(tableName, primaryKey, sourceRows, destinationRows, direction) {
  if (!isStrictSyncConflictTable(tableName) || !sourceRows.length) {
    return { rows: sourceRows, conflicts: 0 };
  }

  const workingDestinationRows = Array.isArray(destinationRows) ? [...destinationRows] : [];
  const acceptedRows = [];
  let conflicts = 0;

  for (const row of sourceRows) {
    const conflict = findSyncConflict(tableName, primaryKey, row, workingDestinationRows);
    if (conflict) {
      conflicts += 1;
      await recordSyncConflict(tableName, direction, primaryKey, row, conflict);
      continue;
    }

    acceptedRows.push(row);
    const rowPrimaryKey = normalizeComparableValue(primaryKey, row?.[primaryKey]);
    const existingIndex = workingDestinationRows.findIndex((candidate) => (
      normalizeComparableValue(primaryKey, candidate?.[primaryKey]) === rowPrimaryKey
    ));

    if (existingIndex >= 0) {
      workingDestinationRows[existingIndex] = {
        ...workingDestinationRows[existingIndex],
        ...row,
      };
    } else {
      workingDestinationRows.push(row);
    }
  }

  return { rows: acceptedRows, conflicts };
}

function dedupeRowsByPrimaryKey(rows, primaryKey) {
  const dedupedRows = new Map();
  for (const row of rows) {
    const key = row?.[primaryKey];
    if (key === undefined || key === null) {
      dedupedRows.set(Symbol('missing-primary-key'), row);
      continue;
    }
    dedupedRows.set(String(key), row);
  }
  return Array.from(dedupedRows.values());
}

function dedupeConsumerRowsByLoginId(rows) {
  const dedupedRows = new Map();
  const rowsWithoutLoginId = [];

  for (const row of rows) {
    const loginId = Number(row?.login_id);
    if (!Number.isInteger(loginId) || loginId <= 0) {
      rowsWithoutLoginId.push(row);
      continue;
    }

    const existingRow = dedupedRows.get(loginId);
    if (!existingRow) {
      dedupedRows.set(loginId, row);
      continue;
    }

    const existingConsumerId = Number(existingRow?.consumer_id);
    const nextConsumerId = Number(row?.consumer_id);
    if (!Number.isInteger(existingConsumerId) || nextConsumerId > existingConsumerId) {
      dedupedRows.set(loginId, row);
    }
  }

  return [...dedupedRows.values(), ...rowsWithoutLoginId];
}

async function alignConsumerRowsForPostgres(rows) {
  rows = dedupeConsumerRowsByLoginId(rows);

  const loginIds = rows
    .map((row) => Number(row?.login_id))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (!loginIds.length) {
    return rows;
  }

  const { rows: existingRows } = await pool.query(
    'SELECT consumer_id, login_id FROM consumer WHERE login_id = ANY($1::int[])',
    [Array.from(new Set(loginIds))]
  );

  if (!existingRows.length) {
    return rows;
  }

  const consumerIdByLoginId = new Map(
    existingRows.map((row) => [Number(row.login_id), Number(row.consumer_id)])
  );

  return dedupeRowsByPrimaryKey(
    rows.map((row) => {
      const loginId = Number(row?.login_id);
      const existingConsumerId = consumerIdByLoginId.get(loginId);

      if (!existingConsumerId || Number(row?.consumer_id) === existingConsumerId) {
        return row;
      }

      return {
        ...row,
        consumer_id: existingConsumerId,
      };
    }),
    'consumer_id'
  );
}

async function alignConsumerRowsForSupabase(rows) {
  if (!supabase) {
    return rows;
  }

  rows = dedupeConsumerRowsByLoginId(rows);

  const loginIds = rows
    .map((row) => Number(row?.login_id))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (!loginIds.length) {
    return rows;
  }

  const { data, error } = await supabase
    .from('consumer')
    .select('consumer_id, login_id')
    .in('login_id', Array.from(new Set(loginIds)));

  if (error) {
    throw error;
  }

  if (!(data || []).length) {
    return rows;
  }

  const consumerIdByLoginId = new Map(
    (data || []).map((row) => [Number(row.login_id), Number(row.consumer_id)])
  );

  return dedupeRowsByPrimaryKey(
    rows.map((row) => {
      const loginId = Number(row?.login_id);
      const existingConsumerId = consumerIdByLoginId.get(loginId);

      if (!existingConsumerId || Number(row?.consumer_id) === existingConsumerId) {
        return row;
      }

      return {
        ...row,
        consumer_id: existingConsumerId,
      };
    }),
    'consumer_id'
  );
}

async function upsertRowsToPostgres(tableName, primaryKey, rows) {
  let normalizedRows = normalizeSyncRows(tableName, rows);

  if (tableName === 'consumer') {
    normalizedRows = await alignConsumerRowsForPostgres(normalizedRows);
  }

  if (!normalizedRows.length) {
    return { synced: 0, conflicts: 0 };
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

    await synchronizePostgresSequence(client, tableName, primaryKey);

    await client.query('COMMIT');
    return { synced: normalizedRows.length, conflicts: 0 };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function synchronizePostgresSequence(client, tableName, primaryKey) {
  const qualifiedTableName = `${supabaseSchema}.${tableName}`;
  const { rows } = await client.query(
    'SELECT pg_get_serial_sequence($1, $2) AS sequence_name',
    [qualifiedTableName, primaryKey]
  );
  const sequenceName = rows[0]?.sequence_name;

  if (!sequenceName) {
    return;
  }

  const maxResult = await client.query(
    `SELECT MAX(${quoteIdentifier(primaryKey)}) AS max_id FROM ${quoteIdentifier(tableName)}`
  );
  const maxId = Number(maxResult.rows[0]?.max_id || 0);

  if (maxId > 0) {
    await client.query('SELECT setval($1, $2, true)', [sequenceName, maxId]);
    return;
  }

  await client.query('SELECT setval($1, $2, false)', [sequenceName, 1]);
}

async function synchronizePostgresSequences(client, sequenceTargets = []) {
  for (const target of sequenceTargets) {
    await synchronizePostgresSequence(client, target.tableName, target.primaryKey);
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

function isConnectivityFailureMessage(message) {
  const loweredMessage = String(message || '').toLowerCase();
  return (
    loweredMessage.includes('fetch failed') ||
    loweredMessage.includes('network') ||
    loweredMessage.includes('timed out') ||
    loweredMessage.includes('timeout') ||
    loweredMessage.includes('econn') ||
    loweredMessage.includes('enotfound') ||
    loweredMessage.includes('ehostunreach') ||
    loweredMessage.includes('eai_again') ||
    loweredMessage.includes('connection') ||
    loweredMessage.includes('schema cache') ||
    loweredMessage.includes('invalid schema')
  );
}

function shouldFallbackToPostgres(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === 'etimedout' ||
    code === 'econnreset' ||
    code === 'enotfound' ||
    code === 'eai_again' ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('connection terminated unexpectedly') ||
    message.includes('permission denied') ||
    message.includes('schema cache') ||
    message.includes('invalid schema') ||
    message.includes('could not find the table') ||
    message.includes('could not find the')
  );
}

function shouldFallbackToSupabase(error) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '57p01' ||
    code === '57p02' ||
    code === '57p03' ||
    code === '08000' ||
    code === '08001' ||
    code === '08003' ||
    code === '08004' ||
    code === '08006' ||
    code === '08p01' ||
    code === 'etimedout' ||
    code === 'econnrefused' ||
    code === 'econnreset' ||
    code === 'enotfound' ||
    code === 'ehostunreach' ||
    code === 'eai_again' ||
    message.includes('connect') ||
    message.includes('connection') ||
    message.includes('econnrefused') ||
    message.includes('econnreset') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('terminating connection') ||
    message.includes('the database system is starting up') ||
    message.includes('client has encountered a connection error') ||
    message.includes('connection terminated unexpectedly')
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
    appendFailureReport('FALLBACK', operationName, error.message || String(error), {
      from: 'supabase',
      to: 'postgres',
    });
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

function appendFailureReport(kind, moduleName, message, context = {}) {
  const payload = {
    kind,
    module: moduleName,
    message: truncateLogValue(message),
    context,
  };

  appendTextLog(logFiles.failureReport, JSON.stringify(payload));

  if (kind === 'FALLBACK' || isConnectivityFailureMessage(message)) {
    appendTextLog(logFiles.connectivity, JSON.stringify(payload));
  }
}

async function writeSystemLog(action, options = {}) {
  const accountId = Number(options.accountId || defaultSystemLogAccountId);
  const role = options.role || 'System';

  try {
    await withPostgresPrimary(
      'logs.system.write',
      async () => {
        await insertWithSequenceRetry(
          'system_logs',
          'log_id',
          'INSERT INTO system_logs (account_id, role, action) VALUES ($1, $2, $3) RETURNING *',
          [accountId, role, truncateLogValue(action)]
        );
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
        await insertWithSequenceRetry(
          'error_logs',
          'error_id',
          'INSERT INTO error_logs (severity, module, error_message, user_id, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [severity, moduleName, errorMessage, userId, status]
        );
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

function isPrimaryKeyViolation(error, tableName) {
  return (
    error?.code === '23505' &&
    (error?.constraint === `${tableName}_pkey` ||
      String(error?.message || '').includes(`"${tableName}_pkey"`))
  );
}

async function insertWithSequenceRetry(tableName, primaryKey, query, values) {
  try {
    return await pool.query(query, values);
  } catch (error) {
    if (!isPrimaryKeyViolation(error, tableName)) {
      throw error;
    }

    const client = await pool.connect();
    try {
      await synchronizePostgresSequence(client, tableName, primaryKey);
    } finally {
      client.release();
    }

    return pool.query(query, values);
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
  appendFailureReport('ERROR', moduleName, errorMessage, {
    severity: options.severity || 'ERROR',
    userId: options.userId || null,
    status: options.status || 'Open',
  });
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

function getRegisterErrorMessage(error) {
  const constraint = String(error?.constraint || '');
  const details = String(error?.details || '');
  const message = String(error?.message || '');
  const loweredMessage = message.toLowerCase();

  if (constraint === 'accounts_username_key' || loweredMessage.includes('accounts_username_key')) {
    return 'Username is already taken.';
  }

  if (constraint === 'consumer_account_number_key' || loweredMessage.includes('consumer_account_number_key')) {
    return 'Generated account number already exists. Please try again.';
  }

  if (constraint === 'fk_consumer_zone' || loweredMessage.includes('fk_consumer_zone')) {
    return 'Selected zone is invalid.';
  }

  if (constraint === 'fk_consumer_classification' || loweredMessage.includes('fk_consumer_classification')) {
    return 'Selected classification is invalid.';
  }

  if (constraint === 'consumer_status_check' || loweredMessage.includes('consumer_status_check')) {
    return 'Consumer status is invalid.';
  }

  if (constraint === 'accounts_account_status_check' || loweredMessage.includes('accounts_account_status_check')) {
    return 'Account status is invalid.';
  }

  if (error?.code === '23505' && details.includes('(username)=')) {
    return 'Username is already taken.';
  }

  if (
    constraint === 'accounts_pkey' ||
    constraint === 'consumer_pkey' ||
    constraint === 'connection_ticket_pkey' ||
    loweredMessage.includes('accounts_pkey') ||
    loweredMessage.includes('consumer_pkey') ||
    loweredMessage.includes('connection_ticket_pkey')
  ) {
    return 'Registration temporarily hit an ID sync conflict. Please try again.';
  }

  if (error?.code === '23503') {
    return 'One of the selected registration values is invalid.';
  }

  if (error?.code === '23514') {
    return 'Registration data failed validation.';
  }

  return message || 'Registration failed.';
}

function isPrimaryKeyCollisionError(error, primaryKeys = []) {
  const constraint = String(error?.constraint || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const normalizedKeys = primaryKeys.map((key) => String(key || '').toLowerCase());

  if (String(error?.code || '') !== '23505') {
    return false;
  }

  if (constraint.endsWith('_pkey')) {
    return normalizedKeys.length === 0 || normalizedKeys.includes(constraint);
  }

  return normalizedKeys.some((key) => message.includes(key) || details.includes(key));
}

async function getSupabaseNextPrimaryKeyValue(tableName, primaryKey) {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data, error } = await supabase
    .from(tableName)
    .select(primaryKey)
    .order(primaryKey, { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const currentMax = Number(data?.[0]?.[primaryKey] || 0);
  return currentMax + 1;
}

async function insertSupabaseRowWithPrimaryKeyRetry(tableName, primaryKey, row, selectClause = '*') {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const runInsert = async (payload) => {
    const query = supabase.from(tableName).insert([payload]).select(selectClause);
    return selectClause.includes(',') || selectClause !== '*'
      ? query.single()
      : query.single();
  };

  const { data, error } = await runInsert(row);
  if (!error) {
    return data;
  }

  const primaryKeyConstraint = `${tableName}_pkey`;
  if (!isPrimaryKeyCollisionError(error, [primaryKeyConstraint])) {
    throw error;
  }

  const nextPrimaryKey = await getSupabaseNextPrimaryKeyValue(tableName, primaryKey);
  const retryPayload = {
    ...row,
    [primaryKey]: nextPrimaryKey,
  };

  const { data: retryData, error: retryError } = await runInsert(retryPayload);
  if (retryError) {
    throw retryError;
  }

  return retryData;
}

function getConsumerSaveErrorMessage(error) {
  const constraint = String(error?.constraint || '');
  const details = String(error?.details || '');
  const message = String(error?.message || '');
  const loweredMessage = message.toLowerCase();

  if (constraint === 'accounts_username_key' || loweredMessage.includes('accounts_username_key') || details.includes('(username)=')) {
    return 'Username is already taken.';
  }

  if (constraint === 'consumer_account_number_key' || loweredMessage.includes('consumer_account_number_key') || details.includes('(account_number)=')) {
    return 'Account number already exists.';
  }

  if (constraint === 'consumer_login_id_key' || loweredMessage.includes('consumer_login_id_key') || details.includes('(login_id)=')) {
    return 'This account is already linked to another consumer.';
  }

  if (loweredMessage.includes('zone_id') && loweredMessage.includes('not-null')) {
    return 'Zone is required for every consumer.';
  }

  if (loweredMessage.includes('classification_id') && loweredMessage.includes('not-null')) {
    return 'Classification is required for every consumer.';
  }

  if (error?.code === '23505') {
    return 'A record with the same unique value already exists.';
  }

  if (error?.code === '23503') {
    return 'One of the selected consumer values is invalid.';
  }

  if (error?.code === '23514') {
    return 'Consumer data failed validation.';
  }

  return message || 'Failed to save consumer.';
}

function getRequestFailureStatusCode(error) {
  if (Number.isInteger(Number(error?.statusCode)) && Number(error.statusCode) > 0) {
    return Number(error.statusCode);
  }

  if (['23505', '23503', '23514'].includes(String(error?.code || ''))) {
    return 400;
  }

  return 500;
}

function getUserManagementErrorMessage(error) {
  const constraint = String(error?.constraint || '');
  const details = String(error?.details || '');
  const message = String(error?.message || '');
  const loweredMessage = message.toLowerCase();

  if (constraint === 'accounts_username_key' || loweredMessage.includes('accounts_username_key') || details.includes('(username)=')) {
    return 'Username is already taken.';
  }

  if (constraint === 'fk_accounts_role' || loweredMessage.includes('fk_accounts_role') || loweredMessage.includes('role_id')) {
    return 'Selected role is invalid.';
  }

  if (loweredMessage.includes('active consumer accounts cannot be deleted from user management')) {
    return 'Active consumer accounts cannot be deleted from user management. Remove or deactivate the consumer record first.';
  }

  if (loweredMessage.includes('approver information is required')) {
    return 'Approver information is required.';
  }

  if (error?.code === '23505') {
    return 'A user with the same unique value already exists.';
  }

  if (error?.code === '23503') {
    return 'One of the selected user values is invalid.';
  }

  if (error?.code === '23514') {
    return 'User data failed validation.';
  }

  return message || 'Failed to save user.';
}

function generateRegistrationTicketNumber() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return `REG-${timestamp}-${suffix}`;
}

function getStaffAddedTicketLabel() {
  return 'Added by Staff';
}

function generatePendingAccountNumber(zoneId) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(2, 14);
  const normalizedZoneId = String(Number(zoneId) || 0).padStart(2, '0');
  const suffix = Math.floor(Math.random() * 900) + 100;
  return `PENDING-${normalizedZoneId}-${timestamp}-${suffix}`;
}

function splitConsumerName(fullName, username) {
  const normalizedFullName = String(fullName || '').trim();
  const fallbackName = String(username || '').trim() || 'Consumer';
  const parts = normalizedFullName ? normalizedFullName.split(/\s+/).filter(Boolean) : [];
  const firstName = parts[0] || fallbackName;
  const lastName = parts.slice(1).join(' ') || fallbackName;

  return {
    firstName,
    lastName,
  };
}

function readAdminSettings() {
  try {
    if (!fs.existsSync(adminSettingsFile)) {
      return { ...defaultAdminSettings };
    }

    const raw = fs.readFileSync(adminSettingsFile, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...defaultAdminSettings, ...(parsed || {}) };
  } catch (error) {
    console.warn(`Failed to read admin settings file: ${error.message}`);
    return { ...defaultAdminSettings };
  }
}

function writeAdminSettings(settings) {
  const nextSettings = { ...defaultAdminSettings, ...(settings || {}) };
  fs.mkdirSync(path.dirname(adminSettingsFile), { recursive: true });
  fs.writeFileSync(adminSettingsFile, JSON.stringify(nextSettings, null, 2), 'utf8');
  return nextSettings;
}

function normalizeDateInput(value, fallbackDate = new Date()) {
  if (!value) {
    return new Date(fallbackDate).toISOString().slice(0, 10);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(fallbackDate).toISOString().slice(0, 10);
  }

  return parsed.toISOString().slice(0, 10);
}

function addOneDay(dateString) {
  const baseDate = new Date(`${dateString}T00:00:00.000Z`);
  baseDate.setUTCDate(baseDate.getUTCDate() + 1);
  return baseDate.toISOString().slice(0, 10);
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function isBillPastDue(dueDate, referenceDate = new Date()) {
  if (!dueDate) return false;
  const parsedDueDate = new Date(dueDate);
  if (Number.isNaN(parsedDueDate.getTime())) return false;

  const due = new Date(parsedDueDate);
  due.setHours(0, 0, 0, 0);

  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);

  return due < ref;
}

function applyBillPenaltySnapshot(bill, settings = readAdminSettings(), referenceDate = new Date()) {
  if (!bill) return null;

  const amountDue = roundCurrency(Number(bill.Amount_Due ?? bill.amount_due ?? bill.Total_Amount ?? bill.total_amount ?? 0));
  const storedPenalty = roundCurrency(Number(bill.Penalty ?? bill.Penalties ?? bill.penalty ?? 0));
  const lateFeePercent = Number(settings?.lateFee || defaultAdminSettings.lateFee || 0);
  const dueDate = bill.Due_Date || bill.due_date || null;
  const overdue = String(bill.Status || bill.status || '').toLowerCase() !== 'paid' && isBillPastDue(dueDate, referenceDate);
  const computedPenalty = overdue ? roundCurrency(amountDue * (lateFeePercent / 100)) : 0;
  const appliedPenalty = overdue ? Math.max(storedPenalty, computedPenalty) : storedPenalty;
  const totalDueWithPenalty = roundCurrency(amountDue + appliedPenalty);

  return {
    ...bill,
    Penalty: appliedPenalty,
    Penalties: appliedPenalty,
    Total_After_Due_Date: totalDueWithPenalty,
    Overdue_Penalty: computedPenalty,
    Late_Fee_Percentage: lateFeePercent,
    Is_Overdue: overdue,
    Status: overdue && String(bill.Status || bill.status || '').toLowerCase() !== 'paid'
      ? 'Overdue'
      : (bill.Status || bill.status),
  };
}

async function generateOfficialReceiptNumber(executor = null, paymentDate = new Date()) {
  const parsedDate = new Date(paymentDate);
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getDate()).padStart(2, '0');
  const datePrefix = `${year}${month}${day}`;
  const likePattern = `OR-${datePrefix}-%`;

  const fetchCount = async () => {
    if (executor) {
      const countResult = await executor.query(
        'SELECT COUNT(*)::int AS count FROM payment WHERE or_number LIKE $1',
        [likePattern]
      );
      return Number(countResult.rows[0]?.count || 0);
    }

    const { count, error } = await supabase
      .from('payment')
      .select('payment_id', { count: 'exact', head: true })
      .like('or_number', likePattern);
    if (error) throw error;
    return Number(count || 0);
  };

  const sequence = String((await fetchCount()) + 1).padStart(4, '0');
  return `OR-${datePrefix}-${sequence}`;
}

function formatCurrencyAmount(value) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatZoneDisplay(zoneName, zoneId) {
  return zoneName || (zoneId ? `Zone ${zoneId}` : 'Not Assigned');
}

function isValidConsumerAccountNumber(accountNumber) {
  return /^(\d{2}-\d{2}-\d{3}|\d{2}-\d{2}-\d{3}-\d{1})$/.test(String(accountNumber || '').trim());
}

function normalizePhilippinePhoneNumber(phoneNumber) {
  const trimmed = String(phoneNumber || '').trim();
  if (!trimmed) {
    return null;
  }

  const sanitized = trimmed.replace(/[\s()-]/g, '');
  if (/^09\d{9}$/.test(sanitized)) {
    return sanitized;
  }

  if (/^639\d{9}$/.test(sanitized)) {
    return `0${sanitized.slice(2)}`;
  }

  if (/^\+639\d{9}$/.test(sanitized)) {
    return `0${sanitized.slice(3)}`;
  }

  return null;
}

function normalizeRequiredForeignKeyId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function createHttpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getLatestPostgresMeterIdForConsumer(queryable, consumerId) {
  const normalizedConsumerId = normalizeRequiredForeignKeyId(consumerId);
  if (!normalizedConsumerId) {
    return null;
  }

  const { rows } = await queryable.query(`
    SELECT meter_id
    FROM meter
    WHERE consumer_id = $1
    ORDER BY meter_id DESC
    LIMIT 1
  `, [normalizedConsumerId]);

  return normalizeRequiredForeignKeyId(rows[0]?.meter_id);
}

async function getLatestSupabaseMeterIdForConsumer(consumerId) {
  const normalizedConsumerId = normalizeRequiredForeignKeyId(consumerId);
  if (!normalizedConsumerId) {
    return null;
  }

  const { data, error } = await supabase
    .from('meter')
    .select('meter_id')
    .eq('consumer_id', normalizedConsumerId)
    .order('meter_id', { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  return normalizeRequiredForeignKeyId(data?.[0]?.meter_id);
}

async function resolvePostgresMeterIdForConsumer(queryable, consumerId, explicitMeterId) {
  const normalizedMeterId = normalizeRequiredForeignKeyId(explicitMeterId);
  if (normalizedMeterId) {
    return normalizedMeterId;
  }

  return getLatestPostgresMeterIdForConsumer(queryable, consumerId);
}

async function resolveSupabaseMeterIdForConsumer(consumerId, explicitMeterId) {
  const normalizedMeterId = normalizeRequiredForeignKeyId(explicitMeterId);
  if (normalizedMeterId) {
    return normalizedMeterId;
  }

  return getLatestSupabaseMeterIdForConsumer(consumerId);
}

async function alignMeterReadingRowsForSupabase(rows) {
  const consumerIds = Array.from(new Set(
    rows
      .filter((row) => !normalizeRequiredForeignKeyId(row?.meter_id))
      .map((row) => normalizeRequiredForeignKeyId(row?.consumer_id))
      .filter(Boolean)
  ));

  if (!consumerIds.length) {
    return rows;
  }

  const { rows: meterRows } = await pool.query(`
    SELECT DISTINCT ON (consumer_id) consumer_id, meter_id
    FROM meter
    WHERE consumer_id = ANY($1::int[])
    ORDER BY consumer_id, meter_id DESC
  `, [consumerIds]);

  const meterIdByConsumerId = new Map(
    meterRows.map((row) => [
      normalizeRequiredForeignKeyId(row.consumer_id),
      normalizeRequiredForeignKeyId(row.meter_id),
    ])
  );

  return rows.map((row) => {
    const currentMeterId = normalizeRequiredForeignKeyId(row?.meter_id);
    if (currentMeterId) {
      return row;
    }

    const consumerId = normalizeRequiredForeignKeyId(row?.consumer_id);
    const resolvedMeterId = consumerId ? meterIdByConsumerId.get(consumerId) : null;
    if (!resolvedMeterId) {
      return row;
    }

    return {
      ...row,
      meter_id: resolvedMeterId,
    };
  });
}

function formatMonthPeriod(value, fallbackDate) {
  if (value) {
    return String(value);
  }

  const parsed = fallbackDate ? new Date(fallbackDate) : new Date();
  return parsed.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function getActiveAccountStatus(consumer, accountStatus) {
  const normalized = String(accountStatus || consumer?.status || 'Active').trim();
  return normalized || 'Active';
}

function mapAdminLogRow(row) {
  return {
    id: row.log_id ?? row.id,
    timestamp: row.timestamp,
    category: row.role || 'System',
    operator: row.username || row.operator || `Account #${row.account_id ?? 'System'}`,
    description: row.action,
    severity: String(row.action || '').toLowerCase().includes('error') ? 'ERROR' : 'INFO',
  };
}

function mapBackupRow(row) {
  return {
    id: row.backup_id,
    name: row.backup_name,
    timestamp: row.backup_time,
    size: row.backup_size || 'Generated on demand',
    type: row.backup_type || 'Manual',
    createdBy: row.created_by,
  };
}

function buildSupabaseAuthEmail(username) {
  const normalized = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '');

  const localPart = normalized || `user.${crypto.randomUUID().slice(0, 8)}`;
  return `${localPart}@slrws.local`;
}

function mapSupabaseAccountRow(row) {
  if (!row) {
    return null;
  }

  return {
    account_id: row.account_id,
    username: row.username,
    password: row.password,
    auth_user_id: row.auth_user_id,
    full_name: row.username,
    role_id: row.role_id,
    account_status: row.account_status,
    role_name: row.roles?.role_name || null,
  };
}

async function findSupabaseAccountByUsername(username) {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('accounts')
    .select(`
      account_id,
      username,
      password,
      auth_user_id,
      role_id,
      account_status,
      roles ( role_name )
    `)
    .eq('username', username)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return mapSupabaseAccountRow(data);
}

async function findPostgresAccountByUsername(username) {
  const { rows } = await pool.query(`
    SELECT a.account_id, a.username, a.password, a.auth_user_id, a.username AS full_name, a.role_id, a.account_status, r.role_name
    FROM accounts a
    JOIN roles r ON a.role_id = r.role_id
    WHERE a.username = $1
  `, [username]);

  return rows[0] || null;
}

async function findSupabaseAuthUserByEmail(email) {
  if (!supabase?.auth?.admin) {
    return null;
  }

  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const users = data?.users || [];
    const matchedUser = users.find((user) => String(user.email || '').toLowerCase() === email.toLowerCase());
    if (matchedUser) {
      return matchedUser;
    }

    if (users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

async function persistAccountAuthUserId(accountId, authUserId) {
  if (!accountId || !authUserId) {
    return;
  }

  const updates = [];

  if (isPostgresAvailable) {
    updates.push(
      pool.query(
        'UPDATE accounts SET auth_user_id = $1::uuid WHERE account_id = $2 AND (auth_user_id IS NULL OR auth_user_id <> $1::uuid)',
        [authUserId, accountId]
      ).catch((error) => {
        console.warn(`Failed to persist auth_user_id in PostgreSQL for account ${accountId}: ${error.message}`);
      })
    );
  }

  if (supabase) {
    updates.push(
      supabase
        .from('accounts')
        .update({ auth_user_id: authUserId })
        .eq('account_id', accountId)
        .then(({ error }) => {
          if (error) {
            throw error;
          }
        })
        .catch((error) => {
          console.warn(`Failed to persist auth_user_id in Supabase for account ${accountId}: ${error.message}`);
        })
    );
  }

  await Promise.all(updates);
}

async function ensureAccountAuthUser({ accountId, username, password, authUserId }) {
  if (!supabase?.auth?.admin || !accountId || !username || !password) {
    return authUserId || null;
  }

  if (authUserId) {
    return authUserId;
  }

  const email = buildSupabaseAuthEmail(username);
  let authId = null;

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        account_id: accountId,
        username,
      },
    });

    if (error) {
      const existingUser = await findSupabaseAuthUserByEmail(email);
      if (!existingUser) {
        throw error;
      }
      authId = existingUser.id;
    } else {
      authId = data?.user?.id || null;
    }

    if (authId) {
      await persistAccountAuthUserId(accountId, authId);
      return authId;
    }
  } catch (error) {
    console.warn(`Supabase auth user link failed for account ${accountId}: ${error.message}`);
  }

  return null;
}

async function isUsernameTaken(username) {
  const normalizedUsername = String(username || '').trim();
  if (!normalizedUsername) {
    return false;
  }

  return withPostgresPrimary(
    'register.usernameCheck',
    async () => {
      const { rows } = await pool.query(
        'SELECT 1 FROM accounts WHERE LOWER(TRIM(username)) = LOWER(TRIM($1)) LIMIT 1',
        [normalizedUsername]
      );
      return rows.length > 0;
    },
    async () => {
      if (!supabase) {
        return false;
      }

      const { data, error } = await supabase
        .from('accounts')
        .select('account_id')
        .ilike('username', normalizedUsername)
        .limit(1);
      if (error) throw error;
      return (data || []).some((row) => String(row.username || normalizedUsername).trim().toLowerCase() === normalizedUsername.toLowerCase()) || (data || []).length > 0;
    }
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
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      conflict_id SERIAL PRIMARY KEY,
      table_name VARCHAR(100) NOT NULL,
      direction VARCHAR(50) NOT NULL,
      conflict_type VARCHAR(50) NOT NULL,
      primary_key_name VARCHAR(100),
      primary_key_value TEXT,
      business_key TEXT,
      reason TEXT NOT NULL,
      source_record JSONB,
      existing_record JSONB,
      status VARCHAR(20) NOT NULL DEFAULT 'Open',
      detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION set_sync_row_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`
    ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS auth_user_id UUID;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'accounts_auth_user_id_key'
      ) THEN
        ALTER TABLE accounts
          ADD CONSTRAINT accounts_auth_user_id_key UNIQUE (auth_user_id);
      END IF;
    END
    $$;
  `);

  for (const tableName of durableSyncTables) {
    await ensureTableColumn(tableName, 'sync_id', 'UUID DEFAULT gen_random_uuid()');
    await ensureUniqueConstraint(tableName, `${tableName}_sync_id_key`, 'sync_id');
    await ensureTableColumn(tableName, 'created_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
    await ensureTableColumn(tableName, 'updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
    await ensureTableColumn(tableName, 'source_site_id', 'VARCHAR(120)');
    await ensureTableColumn(tableName, 'sync_status', `VARCHAR(20) NOT NULL DEFAULT 'synced'`);

    const createdAtExpression = tableName === 'meterreadings'
      ? 'COALESCE(created_at, created_date, reading_date, CURRENT_TIMESTAMP)'
      : 'COALESCE(created_at, CURRENT_TIMESTAMP)';

    await pool.query(`
      UPDATE ${quoteIdentifier(tableName)}
      SET sync_id = COALESCE(sync_id, gen_random_uuid()),
          created_at = ${createdAtExpression},
          updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP),
          source_site_id = COALESCE(NULLIF(TRIM(source_site_id), ''), $1),
          sync_status = COALESCE(NULLIF(TRIM(sync_status), ''), 'synced')
      WHERE sync_id IS NULL
         OR created_at IS NULL
         OR updated_at IS NULL
         OR source_site_id IS NULL
         OR TRIM(COALESCE(source_site_id, '')) = ''
         OR sync_status IS NULL
         OR TRIM(COALESCE(sync_status, '')) = '';
    `, [defaultSourceSiteId]);

    await pool.query(`
      DROP TRIGGER IF EXISTS ${quoteIdentifier(`${tableName}_set_updated_at`)} ON ${quoteIdentifier(tableName)};
      CREATE TRIGGER ${quoteIdentifier(`${tableName}_set_updated_at`)}
      BEFORE UPDATE ON ${quoteIdentifier(tableName)}
      FOR EACH ROW
      EXECUTE FUNCTION set_sync_row_updated_at();
    `);
  }

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
  let normalizedRows = normalizeSyncRows(tableName, rows);
  let conflictCount = 0;

  if (tableName === 'consumer') {
    normalizedRows = await alignConsumerRowsForSupabase(normalizedRows);
  }

  if (tableName === 'meterreadings') {
    normalizedRows = await alignMeterReadingRowsForSupabase(normalizedRows);
  }

  if (normalizedRows.length === 0) {
    await logSupabaseEvent(`Table ${tableName}: no rows to sync.`);
    return { tableName, synced: 0, conflicts: 0 };
  }

  if (isStrictSyncConflictTable(tableName)) {
    const { data: existingSupabaseRows, error: existingRowsError } = await supabase.from(tableName).select('*');
    if (existingRowsError) {
      await logDatabaseError(`supabase.conflicts.${tableName}`, existingRowsError);
      throw new Error(`${tableName}: ${existingRowsError.message}`);
    }

    const filtered = await filterRowsForSync(
      tableName,
      primaryKey,
      normalizedRows,
      normalizeSyncRows(tableName, existingSupabaseRows || []),
      'postgres-to-supabase'
    );
    normalizedRows = filtered.rows;
    conflictCount = filtered.conflicts;
  }

  if (normalizedRows.length === 0) {
    await logSupabaseEvent(`Table ${tableName}: sync skipped because ${conflictCount} conflict(s) need review.`);
    return { tableName, synced: 0, conflicts: conflictCount };
  }

  const { error } = await supabase.from(tableName).upsert(normalizedRows, {
    onConflict: primaryKey,
    ignoreDuplicates: false,
  });

  if (error) {
    await logDatabaseError(`supabase.sync.${tableName}`, error);
    throw new Error(`${tableName}: ${error.message}`);
  }

  await logSupabaseEvent(`Table ${tableName}: synced ${normalizedRows.length} row(s) with ${conflictCount} conflict(s) held for review.`);
  return { tableName, synced: normalizedRows.length, conflicts: conflictCount };
}

async function syncTableToPostgres(tableName, primaryKey) {
  await logSupabaseEvent(`Preparing PostgreSQL pull for table ${tableName}.`);
  const { data, error } = await supabase.from(tableName).select('*');

  if (error) {
    await logDatabaseError(`postgres.sync.${tableName}`, error);
    throw new Error(`${tableName}: ${error.message}`);
  }

  let rows = normalizeSyncRows(tableName, data || []);
  let conflictCount = 0;
  if (!rows.length) {
    await logPostgresEvent(`Table ${tableName}: no rows pulled from Supabase.`);
    return { tableName, synced: 0, conflicts: 0 };
  }

  if (isStrictSyncConflictTable(tableName)) {
    const { rows: existingPostgresRows } = await pool.query(`SELECT * FROM ${quoteIdentifier(tableName)}`);
    const filtered = await filterRowsForSync(
      tableName,
      primaryKey,
      rows,
      normalizeSyncRows(tableName, existingPostgresRows),
      'supabase-to-postgres'
    );
    rows = filtered.rows;
    conflictCount = filtered.conflicts;
  }

  if (!rows.length) {
    await logPostgresEvent(`Table ${tableName}: pull skipped because ${conflictCount} conflict(s) need review.`);
    return { tableName, synced: 0, conflicts: conflictCount };
  }

  const result = await upsertRowsToPostgres(tableName, primaryKey, rows);
  const totalConflicts = Number(result?.conflicts || 0) + conflictCount;
  await logPostgresEvent(`Table ${tableName}: pulled ${result.synced} row(s) from Supabase with ${totalConflicts} conflict(s) held for review.`);
  return { tableName, synced: result.synced, conflicts: totalConflicts };
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
        appendFailureReport('SYNC_TABLE', `postgresToSupabase.${tableName}`, error.message || String(error), {
          tableName,
          direction: 'postgres-to-supabase',
        });
        results.push({ tableName, synced: 0, error: error.message });
      }
    }

    await logSupabaseEvent(`Sync cycle complete for ${results.length} table(s).`);
    syncState.lastResults.postgresToSupabase = results;
    return results;
  } catch (error) {
    syncState.lastError = error.message;
    appendFailureReport('SYNC', 'postgresToSupabase', error.message || String(error), {
      direction: 'postgres-to-supabase',
    });
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
    appendFailureReport('FALLBACK', operationName, 'PostgreSQL unavailable before request; using Supabase handler directly.', {
      from: 'postgres',
      to: 'supabase',
      reason: 'postgres-unavailable',
    });
    return supabaseHandler();
  }

  try {
    const result = await postgresHandler();
    isPostgresAvailable = true;
    return result;
  } catch (error) {
    if (!shouldFallbackToSupabase(error) || !supabase || !supabaseHandler) {
      throw error;
    }

    console.warn(`[fallback:${operationName}] Switching to Supabase: ${error.message}`);
    appendFailureReport('FALLBACK', operationName, error.message || String(error), {
      from: 'postgres',
      to: 'supabase',
    });
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
        appendFailureReport('SYNC_TABLE', `supabaseToPostgres.${tableName}`, error.message || String(error), {
          tableName,
          direction: 'supabase-to-postgres',
        });
        results.push({ tableName, synced: 0, error: error.message });
      }
    }

    await logPostgresEvent(`Supabase pull cycle complete for ${results.length} table(s).`);
    syncState.lastResults.supabaseToPostgres = results;
    return results;
  } catch (error) {
    syncState.lastError = error.message;
    appendFailureReport('SYNC', 'supabaseToPostgres', error.message || String(error), {
      direction: 'supabase-to-postgres',
    });
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
    Purok: consumer.purok || null,
    Barangay: consumer.barangay || null,
    Municipality: consumer.municipality || null,
    Zip_Code: consumer.zip_code || null,
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
    Date_Covered_From: bill.date_covered_from ?? null,
    Date_Covered_To: bill.date_covered_to ?? null,
    Total_Amount: bill.total_amount,
    Amount_Due: bill.amount_due ?? bill.total_amount ?? 0,
    Water_Charge: bill.water_charge ?? bill.class_cost ?? bill.total_amount ?? 0,
    Basic_Charge: bill.class_cost ?? bill.water_charge ?? bill.total_amount ?? 0,
    Environmental_Fee: bill.meter_maintenance_fee ?? 0,
    Meter_Fee: bill.meter_maintenance_fee ?? 0,
    Previous_Balance: bill.previous_balance ?? 0,
    Previous_Penalty: bill.previous_penalty ?? 0,
    Penalties: bill.penalty ?? 0,
    Penalty: bill.penalty ?? 0,
    Total_After_Due_Date: bill.total_after_due_date ?? bill.total_amount ?? 0,
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
    Account_Number: consumer?.account_number || null,
    Bill_Amount: bill?.total_amount || null,
    Billing_Month: bill?.billing_month || null,
  };
}

function shouldExposeApplicationAccountNumber(applicationStatus, accountStatus) {
  const normalizedApplicationStatus = String(applicationStatus || '').toLowerCase();
  const normalizedAccountStatus = String(accountStatus || '').toLowerCase();
  return normalizedApplicationStatus === 'approved' || normalizedAccountStatus === 'active';
}

function sanitizeApplicationRecord(row) {
  if (!row) {
    return row;
  }

  const isStaffAdded = String(row.Connection_Type || '').toLowerCase() === 'added by staff'
    || (
      String(row.Application_Status || '').toLowerCase() === 'pending'
      && !String(row.Requirements_Submitted || '').trim()
    );
  const displayTicketNumber = isStaffAdded
    ? 'Added by Staff'
    : row.Ticket_Number;

  return {
    ...row,
    Ticket_Number: displayTicketNumber,
    Account_Number: shouldExposeApplicationAccountNumber(row.Application_Status, row.Account_Status)
      ? row.Account_Number
      : null,
  };
}

function buildPendingApplicationRow({ ticketId = null, ticketNumber, applicationDate, connectionType = 'Added by Staff', requirementsSubmitted = null, account, consumer, zoneName = null, classificationName = null }) {
  return sanitizeApplicationRecord({
    Ticket_ID: ticketId,
    Ticket_Number: ticketNumber || consumer?.account_number || `PENDING-${account?.account_id ?? consumer?.consumer_id ?? Date.now()}`,
    Application_Status: 'Pending',
    Application_Date: applicationDate || consumer?.connection_date || account?.created_at || null,
    Connection_Type: connectionType,
    Requirements_Submitted: requirementsSubmitted,
    Account_ID: account?.account_id ?? consumer?.login_id ?? null,
    Username: account?.username ?? null,
    Account_Status: account?.account_status ?? consumer?.status ?? 'Pending',
    Consumer_ID: consumer?.consumer_id ?? null,
    Consumer_Name: consumer ? [consumer.first_name, consumer.middle_name, consumer.last_name].filter(Boolean).join(' ') : null,
    Contact_Number: consumer?.contact_number ?? null,
    Address: consumer?.address ?? null,
    Purok: consumer?.purok ?? null,
    Barangay: consumer?.barangay ?? null,
    Municipality: consumer?.municipality ?? null,
    Zip_Code: consumer?.zip_code ?? null,
    Account_Number: consumer?.account_number ?? null,
    Consumer_Status: consumer?.status ?? null,
    Zone_ID: consumer?.zone_id ?? null,
    Zone_Name: zoneName,
    Classification_ID: consumer?.classification_id ?? null,
    Classification_Name: classificationName,
  });
}

function mapTreasurerRecentPayment(payment) {
  return {
    Payment_ID: payment.Payment_ID,
    Receipt_No: payment.OR_Number || payment.Reference_No || `PAY-${payment.Payment_ID}`,
    Account_Number: payment.Account_Number || 'N/A',
    Consumer_Name: payment.Consumer_Name || 'Unknown Consumer',
    Amount: Number(payment.Amount_Paid || 0),
    Payment_Method: payment.Payment_Method || 'Cash',
    Date_Time: payment.Payment_Date,
    Validation_Status: payment.Status || 'Pending',
  };
}

function monthYearLabel(value) {
  if (!value) {
    return 'N/A';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();
}

function buildLedgerRecords(bills = [], payments = []) {
  const paymentByBillId = new Map();
  for (const payment of payments) {
    if (!paymentByBillId.has(payment.Bill_ID)) {
      paymentByBillId.set(payment.Bill_ID, []);
    }
    paymentByBillId.get(payment.Bill_ID).push(payment);
  }

  return bills.map((bill) => {
    const billPayments = paymentByBillId.get(bill.Bill_ID) || [];
    const paidAmount = billPayments.reduce((sum, payment) => sum + Number(payment.Amount_Paid || 0), 0);
    const latestPayment = billPayments
      .slice()
      .sort((a, b) => new Date(b.Payment_Date || 0).getTime() - new Date(a.Payment_Date || 0).getTime())[0];

    const totalDue = Number(bill.Total_Amount || 0);
    return {
      Month_Year: bill.Billing_Month || monthYearLabel(bill.Bill_Date),
      Reading: Number(bill.Current_Reading || 0),
      Consumption: Number(bill.Consumption || 0),
      Water_Bill: Number(bill.Water_Charge || bill.Basic_Charge || bill.Total_Amount || 0),
      Penalty: Number(bill.Penalty || bill.Penalties || 0),
      Meter_Fee: Number(bill.Meter_Fee || bill.Environmental_Fee || 0),
      Amount_Paid: paidAmount,
      Date_Paid: latestPayment?.Payment_Date || 'N/A',
      OR_No: latestPayment?.OR_Number || latestPayment?.Reference_No || '-',
      Balance: Math.max(0, totalDue - paidAmount),
    };
  });
}

async function loadSupabaseRoleMap() {
  if (!supabase) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('roles')
    .select('role_id, role_name');

  if (error) {
    throw error;
  }

  return new Map((data || []).map((role) => [role.role_id, role.role_name]));
}

async function loadSupabaseApplicationRows({ pendingOnly = false } = {}) {
  const [
    { data: tickets, error: ticketError },
    { data: accounts, error: accountError },
    { data: consumers, error: consumerError },
  ] = await Promise.all([
    supabase
      .from('connection_ticket')
      .select('ticket_id, ticket_number, status, application_date, connection_type, requirements_submitted, account_id, consumer_id')
      .order('application_date', { ascending: false }),
    supabase
      .from('accounts')
      .select('account_id, username, account_status, created_at'),
    supabase
      .from('consumer')
      .select('consumer_id, first_name, middle_name, last_name, contact_number, address, purok, barangay, municipality, zip_code, account_number, status, zone_id, classification_id, login_id'),
  ]);

  if (ticketError) throw ticketError;
  if (accountError) throw accountError;
  if (consumerError) throw consumerError;

  const lookupResults = await Promise.allSettled([
    supabase.from('zone').select('zone_id, zone_name'),
    supabase.from('classification').select('classification_id, classification_name'),
  ]);

  const zonesResult = lookupResults[0].status === 'fulfilled' ? lookupResults[0].value : { data: [], error: lookupResults[0].reason };
  const classificationsResult = lookupResults[1].status === 'fulfilled' ? lookupResults[1].value : { data: [], error: lookupResults[1].reason };

  if (zonesResult.error) {
    console.warn(`Supabase applications lookup warning (zone): ${zonesResult.error.message}`);
  }
  if (classificationsResult.error) {
    console.warn(`Supabase applications lookup warning (classification): ${classificationsResult.error.message}`);
  }

  const accountMap = new Map((accounts || []).map((row) => [row.account_id, row]));
  const consumerMap = new Map((consumers || []).map((row) => [row.consumer_id, row]));
  const consumerByLoginId = new Map((consumers || []).map((row) => [row.login_id, row]));
  const zoneMap = new Map(((zonesResult.data) || []).map((row) => [row.zone_id, row.zone_name]));
  const classificationMap = new Map(((classificationsResult.data) || []).map((row) => [row.classification_id, row.classification_name]));

  const mapped = (tickets || [])
    .map((ticket) => {
      const account = accountMap.get(ticket.account_id);
      const consumer = consumerMap.get(ticket.consumer_id) || consumerByLoginId.get(ticket.account_id);
      return {
        Ticket_ID: ticket.ticket_id,
        Ticket_Number: ticket.ticket_number,
        Application_Status: ticket.status,
        Application_Date: ticket.application_date,
        Connection_Type: ticket.connection_type,
        Requirements_Submitted: ticket.requirements_submitted,
        Account_ID: account?.account_id ?? ticket.account_id,
        Username: account?.username ?? null,
        Account_Status: account?.account_status ?? null,
        Consumer_ID: consumer?.consumer_id ?? ticket.consumer_id ?? null,
        Consumer_Name: consumer ? [consumer.first_name, consumer.middle_name, consumer.last_name].filter(Boolean).join(' ') : null,
        Contact_Number: consumer?.contact_number ?? null,
        Address: consumer?.address ?? null,
        Purok: consumer?.purok ?? null,
        Barangay: consumer?.barangay ?? null,
        Municipality: consumer?.municipality ?? null,
        Zip_Code: consumer?.zip_code ?? null,
        Account_Number: consumer?.account_number ?? null,
        Consumer_Status: consumer?.status ?? null,
        Zone_ID: consumer?.zone_id ?? null,
        Zone_Name: zoneMap.get(consumer?.zone_id) || null,
        Classification_ID: consumer?.classification_id ?? null,
        Classification_Name: classificationMap.get(consumer?.classification_id) || null,
      };
    })
    .map(sanitizeApplicationRecord);

  const ticketAccountIds = new Set((tickets || []).map((ticket) => Number(ticket.account_id)).filter((value) => Number.isInteger(value) && value > 0));
  const orphanPendingApplications = (consumers || [])
    .filter((consumer) => {
      const loginId = Number(consumer?.login_id);
      if (!Number.isInteger(loginId) || loginId <= 0 || ticketAccountIds.has(loginId)) {
        return false;
      }

      const account = accountMap.get(loginId);
      return String(account?.account_status || '').toLowerCase() === 'pending' || String(consumer?.status || '').toLowerCase() === 'pending';
    })
    .map((consumer) => {
      const account = accountMap.get(consumer.login_id) || null;
      return buildPendingApplicationRow({
        ticketNumber: consumer.account_number || `PENDING-STAFF-${consumer.consumer_id}`,
        applicationDate: consumer.connection_date || account?.created_at || null,
        account,
        consumer,
        zoneName: zoneMap.get(consumer.zone_id) || null,
        classificationName: classificationMap.get(consumer.classification_id) || null,
      });
    });

  const combined = [...mapped, ...orphanPendingApplications]
    .sort((a, b) => new Date(b.Application_Date || 0).getTime() - new Date(a.Application_Date || 0).getTime());

  return pendingOnly
    ? combined.filter((row) => row.Application_Status === 'Pending')
    : combined;
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
        const roleMap = await loadSupabaseRoleMap();
        const { data, error } = await supabase
          .from('accounts')
          .select('account_id, username, password, role_id, account_status')
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
            Role_Name: roleMap.get(u.role_id) || null,
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
        const roleMap = await loadSupabaseRoleMap();
        const { data, error } = await supabase
          .from('accounts')
          .select('account_id, username, role_id, account_status')
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
            Role_Name: roleMap.get(u.role_id) || null,
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
        const roleMap = await loadSupabaseRoleMap();
        const { data, error } = await supabase
          .from('accounts')
          .select('account_id, username, role_id, account_status')
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
            Role_Name: roleMap.get(u.role_id) || null,
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

app.get('/api/applications/pending', async (req, res) => {
  try {
    const result = await withPostgresPrimary(
      'applications.pending.fetch',
      async () => {
        const { rows } = await pool.query(`
          SELECT
            ct.ticket_id AS "Ticket_ID",
            ct.ticket_number AS "Ticket_Number",
            ct.status AS "Application_Status",
            ct.application_date AS "Application_Date",
            ct.connection_type AS "Connection_Type",
            ct.requirements_submitted AS "Requirements_Submitted",
            a.account_id AS "Account_ID",
            a.username AS "Username",
            a.account_status AS "Account_Status",
            c.consumer_id AS "Consumer_ID",
            CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name) AS "Consumer_Name",
            c.contact_number AS "Contact_Number",
            c.address AS "Address",
            c.purok AS "Purok",
            c.barangay AS "Barangay",
            c.municipality AS "Municipality",
            c.zip_code AS "Zip_Code",
            c.account_number AS "Account_Number",
            c.status AS "Consumer_Status",
            c.zone_id AS "Zone_ID",
            z.zone_name AS "Zone_Name",
            c.classification_id AS "Classification_ID",
            cl.classification_name AS "Classification_Name"
          FROM connection_ticket ct
          JOIN accounts a ON a.account_id = ct.account_id
          LEFT JOIN consumer c ON c.consumer_id = ct.consumer_id
          LEFT JOIN zone z ON z.zone_id = c.zone_id
          LEFT JOIN classification cl ON cl.classification_id = c.classification_id
          WHERE ct.status = 'Pending'
          ORDER BY ct.application_date DESC NULLS LAST, ct.ticket_id DESC
        `);
        const { rows: orphanRows } = await pool.query(`
          SELECT
            NULL::integer AS "Ticket_ID",
            COALESCE(NULLIF(c.account_number, ''), CONCAT('PENDING-STAFF-', c.consumer_id)) AS "Ticket_Number",
            'Pending' AS "Application_Status",
            COALESCE(c.connection_date, a.created_at) AS "Application_Date",
            'Added by Staff' AS "Connection_Type",
            NULL::text AS "Requirements_Submitted",
            a.account_id AS "Account_ID",
            a.username AS "Username",
            a.account_status AS "Account_Status",
            c.consumer_id AS "Consumer_ID",
            CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name) AS "Consumer_Name",
            c.contact_number AS "Contact_Number",
            c.address AS "Address",
            c.purok AS "Purok",
            c.barangay AS "Barangay",
            c.municipality AS "Municipality",
            c.zip_code AS "Zip_Code",
            c.account_number AS "Account_Number",
            c.status AS "Consumer_Status",
            c.zone_id AS "Zone_ID",
            z.zone_name AS "Zone_Name",
            c.classification_id AS "Classification_ID",
            cl.classification_name AS "Classification_Name"
          FROM consumer c
          JOIN accounts a ON a.account_id = c.login_id
          LEFT JOIN connection_ticket ct ON ct.account_id = a.account_id
          LEFT JOIN zone z ON z.zone_id = c.zone_id
          LEFT JOIN classification cl ON cl.classification_id = c.classification_id
          WHERE ct.account_id IS NULL
            AND (COALESCE(a.account_status, '') = 'Pending' OR COALESCE(c.status, '') = 'Pending')
          ORDER BY COALESCE(c.connection_date, a.created_at) DESC NULLS LAST, c.consumer_id DESC
        `);
        return { success: true, data: [...rows, ...orphanRows].map(sanitizeApplicationRecord) };
      },
      async () => {
        const mapped = await loadSupabaseApplicationRows({ pendingOnly: true });
        return { success: true, data: mapped };
      }
    );
    return res.json(result);
  } catch (error) {
    await logRequestError(req, 'applications.pending.fetch', error);
    console.error('Error fetching pending applications:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/applications', async (req, res) => {
  try {
    const result = await withPostgresPrimary(
      'applications.fetchAll',
      async () => {
        const { rows } = await pool.query(`
          SELECT
            ct.ticket_id AS "Ticket_ID",
            ct.ticket_number AS "Ticket_Number",
            ct.status AS "Application_Status",
            ct.application_date AS "Application_Date",
            ct.connection_type AS "Connection_Type",
            ct.requirements_submitted AS "Requirements_Submitted",
            a.account_id AS "Account_ID",
            a.username AS "Username",
            a.account_status AS "Account_Status",
            c.consumer_id AS "Consumer_ID",
            CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name) AS "Consumer_Name",
            c.contact_number AS "Contact_Number",
            c.address AS "Address",
            c.purok AS "Purok",
            c.barangay AS "Barangay",
            c.municipality AS "Municipality",
            c.zip_code AS "Zip_Code",
            c.account_number AS "Account_Number",
            c.status AS "Consumer_Status",
            c.zone_id AS "Zone_ID",
            z.zone_name AS "Zone_Name",
            c.classification_id AS "Classification_ID",
            cl.classification_name AS "Classification_Name"
          FROM connection_ticket ct
          JOIN accounts a ON a.account_id = ct.account_id
          LEFT JOIN consumer c ON c.consumer_id = ct.consumer_id
          LEFT JOIN zone z ON z.zone_id = c.zone_id
          LEFT JOIN classification cl ON cl.classification_id = c.classification_id
          ORDER BY ct.application_date DESC NULLS LAST, ct.ticket_id DESC
        `);
        const { rows: orphanRows } = await pool.query(`
          SELECT
            NULL::integer AS "Ticket_ID",
            COALESCE(NULLIF(c.account_number, ''), CONCAT('PENDING-STAFF-', c.consumer_id)) AS "Ticket_Number",
            'Pending' AS "Application_Status",
            COALESCE(c.connection_date, a.created_at) AS "Application_Date",
            'Added by Staff' AS "Connection_Type",
            NULL::text AS "Requirements_Submitted",
            a.account_id AS "Account_ID",
            a.username AS "Username",
            a.account_status AS "Account_Status",
            c.consumer_id AS "Consumer_ID",
            CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name) AS "Consumer_Name",
            c.contact_number AS "Contact_Number",
            c.address AS "Address",
            c.purok AS "Purok",
            c.barangay AS "Barangay",
            c.municipality AS "Municipality",
            c.zip_code AS "Zip_Code",
            c.account_number AS "Account_Number",
            c.status AS "Consumer_Status",
            c.zone_id AS "Zone_ID",
            z.zone_name AS "Zone_Name",
            c.classification_id AS "Classification_ID",
            cl.classification_name AS "Classification_Name"
          FROM consumer c
          JOIN accounts a ON a.account_id = c.login_id
          LEFT JOIN connection_ticket ct ON ct.account_id = a.account_id
          LEFT JOIN zone z ON z.zone_id = c.zone_id
          LEFT JOIN classification cl ON cl.classification_id = c.classification_id
          WHERE ct.account_id IS NULL
            AND (COALESCE(a.account_status, '') = 'Pending' OR COALESCE(c.status, '') = 'Pending')
          ORDER BY COALESCE(c.connection_date, a.created_at) DESC NULLS LAST, c.consumer_id DESC
        `);
        return { success: true, data: [...rows, ...orphanRows].map(sanitizeApplicationRecord) };
      },
      async () => {
        const mapped = await loadSupabaseApplicationRows({ pendingOnly: false });
        return { success: true, data: mapped };
      }
    );
    return res.json(result);
  } catch (error) {
    await logRequestError(req, 'applications.fetchAll', error);
    console.error('Error fetching applications:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

const updatePendingApplicationHandler = async (req, res) => {
  const { accountId } = req.params;
  const payload = req.body || {};
  const normalizedUsername = String(payload.username || '').trim();
  const normalizedZoneId = Number(payload.zoneId);
  const normalizedClassificationId = Number(payload.classificationId);
  const normalizedAccountNumber = String(payload.accountNumber || '').trim();
  const rawContactNumber = payload.contactNumber;
  const normalizedContactNumber = normalizePhilippinePhoneNumber(rawContactNumber);

  if (!normalizedUsername || !payload.firstName || !payload.lastName) {
    return res.status(400).json({ success: false, message: 'Username, first name, and last name are required.' });
  }

  if (!Number.isInteger(normalizedZoneId) || normalizedZoneId <= 0) {
    return res.status(400).json({ success: false, message: 'Zone is required.' });
  }

  if (!Number.isInteger(normalizedClassificationId) || normalizedClassificationId <= 0) {
    return res.status(400).json({ success: false, message: 'Classification is required.' });
  }

  if (rawContactNumber && !normalizedContactNumber) {
    return res.status(400).json({ success: false, message: 'Contact number must be a valid Philippine mobile number.' });
  }

  try {
    const existingUsername = await withPostgresPrimary(
      'applications.pending.usernameCheck',
      async () => {
        const { rows } = await pool.query(
          'SELECT account_id FROM accounts WHERE LOWER(TRIM(username)) = LOWER(TRIM($1)) AND account_id <> $2 LIMIT 1',
          [normalizedUsername, accountId]
        );
        return rows[0] || null;
      },
      async () => {
        const { data, error } = await supabase
          .from('accounts')
          .select('account_id, username')
          .neq('account_id', accountId);
        if (error) throw error;
        return (data || []).find((row) => String(row.username || '').trim().toLowerCase() === normalizedUsername.toLowerCase()) || null;
      }
    );

    if (existingUsername) {
      return res.status(400).json({ success: false, message: 'Username is already taken.' });
    }

    const composedAddress = [
      String(payload.purok || '').trim(),
      String(payload.barangay || '').trim(),
      String(payload.municipality || '').trim(),
      String(payload.zipCode || '').trim(),
    ].filter(Boolean).join(', ');

    await withPostgresPrimary(
      'applications.pending.update',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          await client.query(
            'UPDATE accounts SET username = $1 WHERE account_id = $2',
            [normalizedUsername, accountId]
          );

          await client.query(`
            UPDATE consumer
            SET first_name = $1,
                middle_name = $2,
                last_name = $3,
                address = $4,
                purok = $5,
                barangay = $6,
                municipality = $7,
                zip_code = $8,
                zone_id = $9,
                classification_id = $10,
                contact_number = $11,
                account_number = COALESCE(NULLIF($12, ''), account_number)
            WHERE login_id = $13
          `, [
            String(payload.firstName || '').trim(),
            String(payload.middleName || '').trim() || null,
            String(payload.lastName || '').trim(),
            composedAddress,
            String(payload.purok || '').trim() || null,
            String(payload.barangay || '').trim() || null,
            String(payload.municipality || '').trim() || null,
            String(payload.zipCode || '').trim() || null,
            normalizedZoneId,
            normalizedClassificationId,
            normalizedContactNumber,
            normalizedAccountNumber,
            accountId,
          ]);

          await client.query(`
            UPDATE connection_ticket
            SET requirements_submitted = $1,
                connection_type = $2
            WHERE account_id = $3
          `, [
            String(payload.requirementsSubmitted || '').trim() || null,
            String(payload.connectionType || '').trim() || 'New Connection',
            accountId,
          ]);

          await client.query('COMMIT');

          if (supabase) {
            const { error: accountMirrorError } = await supabase
              .from('accounts')
              .update({ username: normalizedUsername })
              .eq('account_id', accountId);
            if (accountMirrorError) throw accountMirrorError;

            const consumerMirrorPayload = {
              first_name: String(payload.firstName || '').trim(),
              middle_name: String(payload.middleName || '').trim() || null,
              last_name: String(payload.lastName || '').trim(),
              address: composedAddress,
              purok: String(payload.purok || '').trim() || null,
              barangay: String(payload.barangay || '').trim() || null,
              municipality: String(payload.municipality || '').trim() || null,
              zip_code: String(payload.zipCode || '').trim() || null,
              zone_id: normalizedZoneId,
              classification_id: normalizedClassificationId,
              contact_number: normalizedContactNumber,
            };
            if (normalizedAccountNumber) {
              consumerMirrorPayload.account_number = normalizedAccountNumber;
            }

            const { error: consumerMirrorError } = await supabase
              .from('consumer')
              .update(consumerMirrorPayload)
              .eq('login_id', accountId);
            if (consumerMirrorError) throw consumerMirrorError;

            const { error: ticketMirrorError } = await supabase
              .from('connection_ticket')
              .update({
                requirements_submitted: String(payload.requirementsSubmitted || '').trim() || null,
                connection_type: String(payload.connectionType || '').trim() || 'New Connection',
              })
              .eq('account_id', accountId);
            if (ticketMirrorError) throw ticketMirrorError;
          }
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      async () => {
        const { error: accountError } = await supabase
          .from('accounts')
          .update({ username: normalizedUsername })
          .eq('account_id', accountId);
        if (accountError) throw accountError;

        const consumerPayload = {
          first_name: String(payload.firstName || '').trim(),
          middle_name: String(payload.middleName || '').trim() || null,
          last_name: String(payload.lastName || '').trim(),
          address: composedAddress,
          purok: String(payload.purok || '').trim() || null,
          barangay: String(payload.barangay || '').trim() || null,
          municipality: String(payload.municipality || '').trim() || null,
          zip_code: String(payload.zipCode || '').trim() || null,
          zone_id: normalizedZoneId,
          classification_id: normalizedClassificationId,
          contact_number: normalizedContactNumber,
        };
        if (normalizedAccountNumber) {
          consumerPayload.account_number = normalizedAccountNumber;
        }

        const { error: consumerError } = await supabase
          .from('consumer')
          .update(consumerPayload)
          .eq('login_id', accountId);
        if (consumerError) throw consumerError;

        const { error: ticketError } = await supabase
          .from('connection_ticket')
          .update({
            requirements_submitted: String(payload.requirementsSubmitted || '').trim() || null,
            connection_type: String(payload.connectionType || '').trim() || 'New Connection',
          })
          .eq('account_id', accountId);
        if (ticketError) throw ticketError;
      }
    );

    scheduleImmediateSync('applications-update');
    return res.json({ success: true, message: 'Application updated successfully.' });
  } catch (error) {
    await logRequestError(req, 'applications.pending.update', error);
    console.error('Error updating application:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: getRegisterErrorMessage(error) });
  }
};

app.put('/api/applications/:accountId', updatePendingApplicationHandler);
app.post('/api/applications/:accountId/update', updatePendingApplicationHandler);
app.post('/api/update-application/:accountId', updatePendingApplicationHandler);

// Approve Pending Account
app.post('/api/admin/approve-user', async (req, res) => {
  const { accountId, approvedBy, remarks } = req.body;
  const approverId = Number(approvedBy);
  try {
    if (!accountId || !Number.isInteger(approverId) || approverId <= 0) {
      return res.status(400).json({ success: false, message: 'Approver information is required.' });
    }

    await withPostgresPrimary(
      'users.approve',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('UPDATE accounts SET account_status = $1, role_id = $2 WHERE account_id = $3', ['Active', 5, accountId]);
          await client.query('UPDATE consumer SET status = $1 WHERE login_id = $2', ['Active', accountId]);
          await client.query('UPDATE connection_ticket SET status = $1 WHERE account_id = $2', ['Approved', accountId]);
          await client.query(`
            INSERT INTO account_approval (account_id, approved_by, approval_status, approval_date, remarks)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4)
          `, [accountId, approverId, 'Approved', String(remarks || '').trim() || null]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }

        if (supabase) {
          const { error: mirroredAccountError } = await supabase.from('accounts').update({ account_status: 'Active', role_id: 5 }).eq('account_id', accountId);
          if (mirroredAccountError) throw mirroredAccountError;
          const { error: mirroredConsumerError } = await supabase.from('consumer').update({ status: 'Active' }).eq('login_id', accountId);
          if (mirroredConsumerError) throw mirroredConsumerError;
          const { error: mirroredTicketError } = await supabase.from('connection_ticket').update({ status: 'Approved' }).eq('account_id', accountId);
          if (mirroredTicketError) throw mirroredTicketError;
          const { error: mirroredApprovalError } = await supabase.from('account_approval').insert([{
            account_id: accountId,
            approved_by: approverId,
            approval_status: 'Approved',
            approval_date: new Date().toISOString(),
            remarks: String(remarks || '').trim() || null,
          }]);
          if (mirroredApprovalError) throw mirroredApprovalError;
        }
      },
      async () => {
        const { error: accountError } = await supabase.from('accounts').update({ account_status: 'Active', role_id: 5 }).eq('account_id', accountId);
        if (accountError) throw accountError;
        const { error: consumerError } = await supabase.from('consumer').update({ status: 'Active' }).eq('login_id', accountId);
        if (consumerError) throw consumerError;
        const { error: ticketError } = await supabase.from('connection_ticket').update({ status: 'Approved' }).eq('account_id', accountId);
        if (ticketError) throw ticketError;
        const { error: approvalError } = await supabase.from('account_approval').insert([{
          account_id: accountId,
          approved_by: approverId,
          approval_status: 'Approved',
          approval_date: new Date().toISOString(),
          remarks: String(remarks || '').trim() || null,
        }]);
        if (approvalError) throw approvalError;
      }
    );
    scheduleImmediateSync('admin-approve-user');
    return res.json({ success: true, message: 'Account approved successfully' });
  } catch (error) {
    await logRequestError(req, 'users.approve', error);
    console.error('Approval error:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: getUserManagementErrorMessage(error) });
  }
});

// Reject Pending Account (Delete)
app.post('/api/admin/reject-user', async (req, res) => {
  const { accountId, approvedBy, remarks } = req.body;
  const approverId = Number(approvedBy);
  try {
    if (!accountId || !Number.isInteger(approverId) || approverId <= 0) {
      return res.status(400).json({ success: false, message: 'Approver information is required.' });
    }

    await withPostgresPrimary(
      'users.reject',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM connection_ticket WHERE account_id = $1', [accountId]);
          await client.query('DELETE FROM account_approval WHERE account_id = $1', [accountId]);
          await client.query('DELETE FROM consumer WHERE login_id = $1', [accountId]);
          await client.query('DELETE FROM accounts WHERE account_id = $1', [accountId]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }

        if (supabase) {
          const { error: mirroredTicketError } = await supabase.from('connection_ticket').delete().eq('account_id', accountId);
          if (mirroredTicketError) throw mirroredTicketError;
          const { error: mirroredApprovalError } = await supabase.from('account_approval').delete().eq('account_id', accountId);
          if (mirroredApprovalError) throw mirroredApprovalError;
          const { error: mirroredConsumerError } = await supabase.from('consumer').delete().eq('login_id', accountId);
          if (mirroredConsumerError) throw mirroredConsumerError;
          const { error: mirroredAccountError } = await supabase.from('accounts').delete().eq('account_id', accountId);
          if (mirroredAccountError) throw mirroredAccountError;
        }
      },
      async () => {
        const { error: ticketError } = await supabase.from('connection_ticket').delete().eq('account_id', accountId);
        if (ticketError) throw ticketError;
        const { error: approvalError } = await supabase.from('account_approval').delete().eq('account_id', accountId);
        if (approvalError) throw approvalError;
        const { error: consumerError } = await supabase.from('consumer').delete().eq('login_id', accountId);
        if (consumerError) throw consumerError;
        const { error: accountError } = await supabase.from('accounts').delete().eq('account_id', accountId);
        if (accountError) throw accountError;
      }
    );
    scheduleImmediateSync('admin-reject-user');
    return res.json({ success: true, message: 'Application rejected and deleted successfully' });
  } catch (error) {
    await logRequestError(req, 'users.reject', error);
    console.error('Rejection error:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: getUserManagementErrorMessage(error) });
  }
});

// Create user
app.post('/api/users', async (req, res) => {
  const { username, fullName, password, roleId } = req.body;
  
  if (!username || !password || !roleId) {
    return res.status(400).json({ success: false, message: 'Username, password, and role are required' });
  }
  
  try {
    const numericRoleId = Number(roleId);
    if (!Number.isInteger(numericRoleId) || numericRoleId <= 0) {
      return res.status(400).json({ success: false, message: 'A valid role is required.' });
    }

    const isConsumerRole = numericRoleId === 5;
    const initialAccountStatus = isConsumerRole ? 'Pending' : 'Active';
    const { firstName, lastName } = splitConsumerName(fullName, username);

    const user = await withPostgresPrimary(
      'users.create',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await synchronizePostgresSequences(client, [
            { tableName: 'accounts', primaryKey: 'account_id' },
            { tableName: 'consumer', primaryKey: 'consumer_id' },
            { tableName: 'connection_ticket', primaryKey: 'ticket_id' },
          ]);

          const { rows } = await client.query(
            'INSERT INTO accounts (username, password, role_id, account_status) VALUES ($1, $2, $3, $4) RETURNING *',
            [username, password, numericRoleId, initialAccountStatus]
          );
          const createdUser = rows[0];

          if (isConsumerRole) {
            const { rows: consumerRows } = await client.query(`
              INSERT INTO consumer (first_name, last_name, login_id, status)
              VALUES ($1, $2, $3, $4)
              RETURNING *
            `, [firstName, lastName, createdUser.account_id, 'Pending']);

            await client.query(`
              INSERT INTO connection_ticket (consumer_id, account_id, ticket_number, application_date, connection_type, requirements_submitted, status)
              VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6)
            `, [
              consumerRows[0].consumer_id,
              createdUser.account_id,
              getStaffAddedTicketLabel(),
              'Added by Staff',
              null,
              'Pending',
            ]);
          }

          await client.query('COMMIT');
          return createdUser;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      async () => {
        const { data, error } = await supabase
          .from('accounts')
          .insert([{ username, password, role_id: numericRoleId, account_status: initialAccountStatus }])
          .select()
          .single();
        if (error) throw error;

        if (isConsumerRole) {
          const { data: consumerData, error: consumerError } = await supabase
            .from('consumer')
            .insert([{
              first_name: firstName,
              last_name: lastName,
              login_id: data.account_id,
              status: 'Pending',
            }])
            .select()
            .single();
          if (consumerError) throw consumerError;

          const { error: ticketError } = await supabase
            .from('connection_ticket')
            .insert([{
              consumer_id: consumerData.consumer_id,
              account_id: data.account_id,
              ticket_number: getStaffAddedTicketLabel(),
              application_date: new Date().toISOString(),
              connection_type: 'Added by Staff',
              requirements_submitted: null,
              status: 'Pending',
            }]);
          if (ticketError) throw ticketError;
        }

        return data;
      }
    );
    user.auth_user_id = await ensureAccountAuthUser({
      accountId: user.account_id,
      username: user.username,
      password,
      authUserId: user.auth_user_id,
    }) || user.auth_user_id || null;
    scheduleImmediateSync('users-create');
    return res.json({ success: true, data: user });
  } catch (error) {
    await logRequestError(req, 'users.create', error);
    console.error('Error creating user:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: getUserManagementErrorMessage(error) });
  }
});

// Update user
app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { username, fullName, password, roleId } = req.body;
  
  try {
    const accountId = Number(id);
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return res.status(400).json({ success: false, message: 'A valid user ID is required.' });
    }

    const numericRoleId = Number(roleId);
    if (!username || !roleId || !Number.isInteger(numericRoleId) || numericRoleId <= 0) {
      return res.status(400).json({ success: false, message: 'Username and a valid role are required.' });
    }

    const isConsumerRole = numericRoleId === 5;
    const { firstName, lastName } = splitConsumerName(fullName, username);

    await withPostgresPrimary(
      'users.update',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          let query = 'UPDATE accounts SET role_id = $1';
          const params = [numericRoleId];
          
          if (password) {
            query += ', password = $2';
            params.push(password);
          }

          if (isConsumerRole) {
            query += `, account_status = $${params.length + 1}`;
            params.push('Pending');
          }
          
          query += ` WHERE account_id = $${params.length + 1}`;
          params.push(accountId);
          
          await client.query(query, params);

          if (isConsumerRole) {
            const { rows: consumerRows } = await client.query(
              'SELECT consumer_id FROM consumer WHERE login_id = $1 LIMIT 1',
              [accountId]
            );

            let consumerId = consumerRows[0]?.consumer_id;
            if (!consumerId) {
              const insertResult = await client.query(`
                INSERT INTO consumer (first_name, last_name, login_id, status)
                VALUES ($1, $2, $3, $4)
                RETURNING consumer_id
              `, [firstName, lastName, accountId, 'Pending']);
              consumerId = insertResult.rows[0].consumer_id;
            } else {
              await client.query(
                'UPDATE consumer SET status = $1 WHERE consumer_id = $2',
                ['Pending', consumerId]
              );
            }

            const { rows: ticketRows } = await client.query(
              'SELECT ticket_id FROM connection_ticket WHERE account_id = $1 LIMIT 1',
              [accountId]
            );

            if (!ticketRows.length) {
              await client.query(`
                INSERT INTO connection_ticket (consumer_id, account_id, ticket_number, application_date, connection_type, requirements_submitted, status)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6)
              `, [consumerId, accountId, getStaffAddedTicketLabel(), 'Added by Staff', null, 'Pending']);
            } else {
              await client.query(
                'UPDATE connection_ticket SET status = $1 WHERE ticket_id = $2',
                ['Pending', ticketRows[0].ticket_id]
              );
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
        const payload = { role_id: numericRoleId };
        if (password) {
          payload.password = password;
        }
        if (isConsumerRole) {
          payload.account_status = 'Pending';
        }
        const { error } = await supabase.from('accounts').update(payload).eq('account_id', accountId);
        if (error) throw error;

        if (isConsumerRole) {
          const { data: existingConsumer, error: consumerFetchError } = await supabase
            .from('consumer')
            .select('consumer_id')
            .eq('login_id', accountId)
            .maybeSingle();
          if (consumerFetchError) throw consumerFetchError;

          let consumerId = existingConsumer?.consumer_id;
          if (!consumerId) {
            const { data: consumerData, error: consumerInsertError } = await supabase
              .from('consumer')
              .insert([{ first_name: firstName, last_name: lastName, login_id: accountId, status: 'Pending' }])
              .select('consumer_id')
              .single();
            if (consumerInsertError) throw consumerInsertError;
            consumerId = consumerData.consumer_id;
          } else {
            const { error: consumerUpdateError } = await supabase
              .from('consumer')
              .update({ status: 'Pending' })
              .eq('consumer_id', consumerId);
            if (consumerUpdateError) throw consumerUpdateError;
          }

          const { data: existingTicket, error: ticketFetchError } = await supabase
            .from('connection_ticket')
            .select('ticket_id')
            .eq('account_id', accountId)
            .maybeSingle();
          if (ticketFetchError) throw ticketFetchError;

          if (!existingTicket?.ticket_id) {
            const { error: ticketInsertError } = await supabase
              .from('connection_ticket')
              .insert([{
                consumer_id: consumerId,
                account_id: accountId,
                ticket_number: getStaffAddedTicketLabel(),
                application_date: new Date().toISOString(),
                connection_type: 'Added by Staff',
                requirements_submitted: null,
                status: 'Pending',
              }]);
            if (ticketInsertError) throw ticketInsertError;
          } else {
            const { error: ticketUpdateError } = await supabase
              .from('connection_ticket')
              .update({ status: 'Pending' })
              .eq('ticket_id', existingTicket.ticket_id);
            if (ticketUpdateError) throw ticketUpdateError;
          }
        }
      }
    );
    scheduleImmediateSync('users-update');
    return res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    await logRequestError(req, 'users.update', error);
    console.error('Error updating user:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: getUserManagementErrorMessage(error) });
  }
});

// Delete user
app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const accountId = Number(id);

  if (!Number.isInteger(accountId) || accountId <= 0) {
    return res.status(400).json({ success: false, message: 'A valid user ID is required.' });
  }
  
  try {
    await withPostgresPrimary(
      'users.delete',
      async () => {
        const consumerResult = await pool.query(
          'SELECT consumer_id, status FROM consumer WHERE login_id = $1',
          [accountId]
        );
        const linkedConsumer = consumerResult.rows[0];

        if (linkedConsumer && String(linkedConsumer.status || '').toLowerCase() === 'active') {
          throw createHttpError('Active consumer accounts cannot be deleted from user management. Remove or deactivate the consumer record first.');
        }

        await pool.query('BEGIN');
        try {
          if (linkedConsumer) {
            await pool.query('DELETE FROM connection_ticket WHERE account_id = $1', [accountId]);
            await pool.query('DELETE FROM account_approval WHERE account_id = $1', [accountId]);
            await pool.query('DELETE FROM consumer WHERE login_id = $1', [accountId]);
          }
          await pool.query('DELETE FROM accounts WHERE account_id = $1', [accountId]);
          await pool.query('COMMIT');
        } catch (error) {
          await pool.query('ROLLBACK');
          throw error;
        }

        if (supabase) {
          if (linkedConsumer) {
            await mirrorDeleteToSupabase('connection_ticket', 'account_id', accountId);
            await mirrorDeleteToSupabase('account_approval', 'account_id', accountId);
            await mirrorDeleteToSupabase('consumer', 'login_id', accountId);
          }
          await mirrorDeleteToSupabase('accounts', 'account_id', accountId);
        }
      },
      async () => {
        const { data: linkedConsumers, error: consumerLookupError } = await supabase
          .from('consumer')
          .select('consumer_id, status')
          .eq('login_id', accountId);
        if (consumerLookupError) throw consumerLookupError;

        const linkedConsumer = linkedConsumers?.[0] || null;
        if (linkedConsumer && String(linkedConsumer.status || '').toLowerCase() === 'active') {
          throw createHttpError('Active consumer accounts cannot be deleted from user management. Remove or deactivate the consumer record first.');
        }

        if (linkedConsumer) {
          const { error: ticketError } = await supabase.from('connection_ticket').delete().eq('account_id', accountId);
          if (ticketError) throw ticketError;
          const { error: approvalError } = await supabase.from('account_approval').delete().eq('account_id', accountId);
          if (approvalError) throw approvalError;
          const { error: consumerDeleteError } = await supabase.from('consumer').delete().eq('login_id', accountId);
          if (consumerDeleteError) throw consumerDeleteError;
        }

        const { error } = await supabase.from('accounts').delete().eq('account_id', accountId);
        if (error) throw error;
      }
    );
    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    await logRequestError(req, 'users.delete', error);
    console.error('Error deleting user:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: getUserManagementErrorMessage(error) });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }

  try {
    let user = await withSupabaseFallback(
      'auth.login.consumerLookup',
      async () => {
        const supabaseUser = await findSupabaseAccountByUsername(username);
        return supabaseUser?.role_id === 5 ? supabaseUser : null;
      },
      async () => null
    );

    if (!user) {
      user = await withPostgresPrimary(
        'auth.login',
        async () => findPostgresAccountByUsername(username),
        async () => findSupabaseAccountByUsername(username)
      );
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username' });
    }
    if (user.account_status === 'Pending') {
      return res.status(401).json({ success: false, message: 'Please wait until you are registered to access the dashboard.' });
    }
    if (user.account_status === 'Rejected') {
      return res.status(401).json({ success: false, message: 'Your registration was rejected. Please contact the office for assistance.' });
    }
    if (user.account_status === 'Inactive') {
      return res.status(401).json({ success: false, message: 'Your account is inactive. Please contact the office for assistance.' });
    }
    if (user.password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    user.auth_user_id = await ensureAccountAuthUser({
      accountId: user.account_id,
      username: user.username,
      password,
      authUserId: user.auth_user_id,
    }) || user.auth_user_id || null;

    return res.status(200).json({
      success: true,
      user: {
        id: user.account_id,
        username: user.username,
        fullName: user.full_name || user.username,
        auth_user_id: user.auth_user_id || null,
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
        const { rows } = await insertWithSequenceRetry(
          'waterrates',
          'rate_id',
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
            c.purok AS "Purok",
            c.barangay AS "Barangay",
            c.municipality AS "Municipality",
            c.zip_code AS "Zip_Code",
            c.zone_id AS "Zone_ID",
            c.classification_id AS "Classification_ID",
            c.account_number AS "Account_Number",
            c.status AS "Status",
            c.contact_number AS "Contact_Number",
            c.connection_date AS "Connection_Date",
            m.meter_id AS "Meter_ID",
            m.meter_serial_number AS "Meter_Number",
            m.meter_status AS "Meter_Status",
            z.zone_name AS "Zone_Name", 
            cl.classification_name AS "Classification_Name"
          FROM consumer c
          LEFT JOIN accounts a ON a.account_id = c.login_id
          LEFT JOIN LATERAL (
            SELECT meter_id, meter_serial_number, meter_status
            FROM meter
            WHERE consumer_id = c.consumer_id
            ORDER BY meter_id DESC
            LIMIT 1
          ) m ON true
          LEFT JOIN zone z ON c.zone_id = z.zone_id
          LEFT JOIN classification cl ON c.classification_id = cl.classification_id
          WHERE c.login_id IS NULL OR COALESCE(a.account_status, 'Active') = 'Active'
          ORDER BY c.consumer_id DESC
        `);
        return rows;
      },
      async () => {
        const [{ data: consumers, error: consumerError }, { data: zones, error: zoneError }, { data: classifications, error: classificationError }, { data: meters, error: meterError }, { data: accounts, error: accountError }] = await Promise.all([
          supabase.from('consumer').select('*').order('consumer_id', { ascending: false }),
          supabase.from('zone').select('*'),
          supabase.from('classification').select('*'),
          supabase.from('meter').select('meter_id, consumer_id, meter_serial_number, meter_status').order('meter_id', { ascending: false }),
          supabase.from('accounts').select('account_id, account_status'),
        ]);

        if (consumerError) throw consumerError;
        if (zoneError) throw zoneError;
        if (classificationError) throw classificationError;
        if (meterError) throw meterError;
        if (accountError) throw accountError;

        const zoneMap = new Map((zones || []).map((zone) => [zone.zone_id, zone.zone_name]));
        const classificationMap = new Map((classifications || []).map((classification) => [classification.classification_id, classification.classification_name]));
        const accountMap = new Map((accounts || []).map((account) => [account.account_id, account.account_status]));
        const meterMap = new Map();
        for (const meter of meters || []) {
          if (!meterMap.has(meter.consumer_id)) {
            meterMap.set(meter.consumer_id, meter);
          }
        }

        return (consumers || [])
          .filter((consumer) => !consumer.login_id || accountMap.get(consumer.login_id) === 'Active')
          .map((consumer) => mapConsumerRecord(consumer, zoneMap, classificationMap, meterMap));
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
    const providedLoginId = normalizeRequiredForeignKeyId(consumer.Login_ID || consumer.login_id);
    const accountUsername = String(consumer.Username || consumer.username || '').trim();
    const accountPassword = String(consumer.Password || consumer.password || '').trim();
    const normalizedAccountNumber = String(consumer.Account_Number || consumer.account_number || '').trim();
    const rawContactNumber = consumer.Contact_Number || consumer.contact_number;
    const normalizedContactNumber = normalizePhilippinePhoneNumber(rawContactNumber);
    const purok = String(consumer.Purok || consumer.purok || '').trim() || null;
    const barangay = String(consumer.Barangay || consumer.barangay || '').trim() || null;
    const municipality = String(consumer.Municipality || consumer.municipality || '').trim() || 'San Lorenzo Ruiz';
    const zipCode = String(consumer.Zip_Code || consumer.zip_code || '').trim() || '4610';
    const composedAddress = [purok, barangay, municipality, zipCode].filter(Boolean).join(', ');
    const normalizedZoneId = normalizeRequiredForeignKeyId(consumer.Zone_ID || consumer.zone_id);
    const normalizedClassificationId = normalizeRequiredForeignKeyId(consumer.Classification_ID || consumer.classification_id);
    const meterNumber = String(consumer.Meter_Number || consumer.meter_number || '').trim();
    const meterStatus = String(consumer.Meter_Status || consumer.meter_status || 'Active').trim() || 'Active';
    const consumerStatus = String(consumer.Status || 'Pending').trim() || 'Pending';
    const accountStatus =
      consumerStatus === 'Inactive'
        ? 'Inactive'
        : consumerStatus === 'Pending'
          ? 'Pending'
          : 'Active';

    if (!providedLoginId && (!accountUsername || !accountPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required when creating a new consumer account.',
      });
    }

    if (normalizedAccountNumber && !isValidConsumerAccountNumber(normalizedAccountNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Account number must follow the format xx-xx-xxx or xx-xx-xxx-x.',
      });
    }

    if (rawContactNumber && !normalizedContactNumber) {
      return res.status(400).json({
        success: false,
        message: 'Contact number must be a valid Philippine mobile number.',
      });
    }

    if (!normalizedZoneId) {
      return res.status(400).json({
        success: false,
        message: 'Zone is required for every consumer.',
      });
    }

    if (!normalizedClassificationId) {
      return res.status(400).json({
        success: false,
        message: 'Classification is required for every consumer.',
      });
    }

    const createdConsumer = await withPostgresPrimary(
      'consumers.create',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await synchronizePostgresSequences(client, [
            { tableName: 'accounts', primaryKey: 'account_id' },
            { tableName: 'consumer', primaryKey: 'consumer_id' },
            { tableName: 'meter', primaryKey: 'meter_id' },
            { tableName: 'connection_ticket', primaryKey: 'ticket_id' },
          ]);

          let loginId = providedLoginId;
          if (!loginId) {
            const accountInsert = await client.query(`
              INSERT INTO accounts (username, password, role_id, account_status)
              VALUES ($1, $2, $3, $4)
              RETURNING account_id
            `, [accountUsername, accountPassword, 5, accountStatus]);
            loginId = accountInsert.rows[0].account_id;
          }

          const { rows } = await client.query(`
            INSERT INTO consumer (first_name, middle_name, last_name, address, purok, barangay, municipality, zip_code, zone_id, classification_id, account_number, status, contact_number, connection_date, login_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *
          `, [
            consumer.First_Name,
            consumer.Middle_Name,
            consumer.Last_Name,
            composedAddress,
            purok,
            barangay,
            municipality,
            zipCode,
            normalizedZoneId,
            normalizedClassificationId,
            normalizedAccountNumber || null,
            consumerStatus,
            normalizedContactNumber,
            consumer.Connection_Date,
            loginId
          ]);

          if (meterNumber) {
            await client.query(`
              INSERT INTO meter (consumer_id, meter_serial_number, meter_status)
              VALUES ($1, $2, $3)
            `, [rows[0].consumer_id, meterNumber, meterStatus]);
          }

          if (consumerStatus === 'Pending') {
            await client.query(`
              INSERT INTO connection_ticket (consumer_id, account_id, ticket_number, application_date, connection_type, requirements_submitted, status)
              VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6)
            `, [
              rows[0].consumer_id,
              loginId,
              getStaffAddedTicketLabel(),
              'Added by Staff',
              null,
              'Pending',
            ]);
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
        let dataRow;
        if (!providedLoginId) {
          const { data: accountData, error: accountError } = await supabase
            .from('accounts')
            .insert([{
              username: accountUsername,
              password: accountPassword,
              role_id: 5,
              account_status: accountStatus,
            }])
            .select('account_id')
            .single();
          if (accountError) throw accountError;

          const { data: consumerData, error: consumerInsertError } = await supabase
            .from('consumer')
            .insert([{
              first_name: consumer.First_Name,
              middle_name: consumer.Middle_Name,
              last_name: consumer.Last_Name,
              address: composedAddress,
              purok,
              barangay,
              municipality,
              zip_code: zipCode,
              zone_id: normalizedZoneId,
              classification_id: normalizedClassificationId,
              account_number: normalizedAccountNumber || null,
              status: consumerStatus,
              contact_number: normalizedContactNumber,
              connection_date: consumer.Connection_Date,
              login_id: accountData.account_id,
            }])
            .select()
            .single();
          if (consumerInsertError) throw consumerInsertError;
          dataRow = consumerData;
        } else {
          const { data: consumerData, error: consumerError } = await supabase
            .from('consumer')
            .insert([{
              first_name: consumer.First_Name,
              middle_name: consumer.Middle_Name,
              last_name: consumer.Last_Name,
              address: composedAddress,
              purok,
              barangay,
              municipality,
              zip_code: zipCode,
              zone_id: normalizedZoneId,
              classification_id: normalizedClassificationId,
              account_number: normalizedAccountNumber || null,
              status: consumerStatus,
              contact_number: normalizedContactNumber,
              connection_date: consumer.Connection_Date,
              login_id: providedLoginId,
            }])
            .select()
            .single();
          if (consumerError) throw consumerError;
          dataRow = consumerData;
        }

        if (meterNumber) {
          const { error: meterError } = await supabase
            .from('meter')
            .insert([{ consumer_id: dataRow.consumer_id, meter_serial_number: meterNumber, meter_status: meterStatus }]);
          if (meterError) throw meterError;
        }

        if (consumerStatus === 'Pending') {
          const { error: ticketError } = await supabase
            .from('connection_ticket')
            .insert([{
              consumer_id: dataRow.consumer_id,
              account_id: dataRow.login_id,
              ticket_number: getStaffAddedTicketLabel(),
              application_date: new Date().toISOString(),
              connection_type: 'Added by Staff',
              requirements_submitted: null,
              status: 'Pending',
            }]);
          if (ticketError) throw ticketError;
        }

        return dataRow;
      }
    );
    scheduleImmediateSync('consumers-create');
    return res.json({
      success: true,
      data: {
        Consumer_ID: createdConsumer.consumer_id,
        Login_ID: createdConsumer.login_id,
        ...consumer,
        Address: composedAddress,
        Purok: purok,
        Barangay: barangay,
        Municipality: municipality,
        Zip_Code: zipCode,
        Meter_Number: meterNumber || null,
        Meter_Status: meterNumber ? meterStatus : null,
      },
    });
  } catch (error) {
    await logRequestError(req, 'consumers.create', error);
    console.error('Error creating consumer:', error);
    const statusCode = error?.code === '23505' || error?.code === '23503' || error?.code === '23514' ? 400 : 500;
    return res.status(statusCode).json({ success: false, message: getConsumerSaveErrorMessage(error) });
  }
});

app.put('/api/consumers/:id', async (req, res) => {
  const { id } = req.params;
  const consumer = req.body;
  const normalizedAccountNumber = String(consumer.Account_Number || consumer.account_number || '').trim();
  const rawContactNumber = consumer.Contact_Number || consumer.contact_number;
  const normalizedContactNumber = normalizePhilippinePhoneNumber(rawContactNumber);
  const purok = String(consumer.Purok || consumer.purok || '').trim() || null;
  const barangay = String(consumer.Barangay || consumer.barangay || '').trim() || null;
  const municipality = String(consumer.Municipality || consumer.municipality || '').trim() || 'San Lorenzo Ruiz';
  const zipCode = String(consumer.Zip_Code || consumer.zip_code || '').trim() || '4610';
  const composedAddress = [purok, barangay, municipality, zipCode].filter(Boolean).join(', ');
  const normalizedZoneId = normalizeRequiredForeignKeyId(consumer.Zone_ID || consumer.zone_id);
  const normalizedClassificationId = normalizeRequiredForeignKeyId(consumer.Classification_ID || consumer.classification_id);
  const meterNumber = String(consumer.Meter_Number || consumer.meter_number || '').trim();
  const meterStatus = String(consumer.Meter_Status || consumer.meter_status || 'Active').trim() || 'Active';

  if (normalizedAccountNumber && !isValidConsumerAccountNumber(normalizedAccountNumber)) {
    return res.status(400).json({
      success: false,
      message: 'Account number must follow the format xx-xx-xxx or xx-xx-xxx-x.',
    });
  }

  if (rawContactNumber && !normalizedContactNumber) {
    return res.status(400).json({
      success: false,
      message: 'Contact number must be a valid Philippine mobile number.',
    });
  }

  if (!normalizedZoneId) {
    return res.status(400).json({
      success: false,
      message: 'Zone is required for every consumer.',
    });
  }

  if (!normalizedClassificationId) {
    return res.status(400).json({
      success: false,
      message: 'Classification is required for every consumer.',
    });
  }
  
  try {
    await withPostgresPrimary(
      'consumers.update',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          await client.query(`
            UPDATE consumer SET 
              first_name = $1, middle_name = $2, last_name = $3, address = $4, purok = $5, barangay = $6, municipality = $7, zip_code = $8, zone_id = $9, 
              classification_id = $10, account_number = $11, 
              status = $12, contact_number = $13, connection_date = $14
            WHERE consumer_id = $15
          `, [
            consumer.First_Name,
            consumer.Middle_Name,
            consumer.Last_Name,
            composedAddress,
            purok,
            barangay,
            municipality,
            zipCode,
            normalizedZoneId,
            normalizedClassificationId,
            normalizedAccountNumber || null,
            consumer.Status,
            normalizedContactNumber,
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
                SET meter_serial_number = $1,
                    meter_status = $2
                WHERE meter_id = $3
              `, [meterNumber, meterStatus, existingMeters[0].meter_id]);
            } else {
              await client.query(`
                INSERT INTO meter (consumer_id, meter_serial_number, meter_status)
                VALUES ($1, $2, $3)
              `, [id, meterNumber, meterStatus]);
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
            address: composedAddress,
            purok,
            barangay,
            municipality,
            zip_code: zipCode,
            zone_id: normalizedZoneId,
            classification_id: normalizedClassificationId,
            account_number: normalizedAccountNumber || null,
            status: consumer.Status,
            contact_number: normalizedContactNumber,
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
              .update({ meter_serial_number: meterNumber, meter_status: meterStatus })
              .eq('meter_id', existingMeters[0].meter_id);
            if (meterUpdateError) throw meterUpdateError;
          } else {
            const { error: meterInsertError } = await supabase
              .from('meter')
              .insert([{ consumer_id: Number(id), meter_serial_number: meterNumber, meter_status: meterStatus }]);
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
    const statusCode = error?.code === '23505' || error?.code === '23503' || error?.code === '23514' ? 400 : 500;
    return res.status(statusCode).json({ success: false, message: getConsumerSaveErrorMessage(error) });
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
    const consumerId = normalizeRequiredForeignKeyId(reading.Consumer_ID || reading.consumer_id);
    if (!consumerId) {
      return res.status(400).json({ error: 'A consumer must be selected before saving a meter reading.' });
    }

    const payload = {
      consumer_id: consumerId,
      meter_id: normalizeRequiredForeignKeyId(reading.Meter_ID || reading.meter_id),
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
        payload.meter_id = await resolvePostgresMeterIdForConsumer(pool, payload.consumer_id, payload.meter_id);
        if (!payload.meter_id) {
          throw createHttpError('No meter is assigned to this consumer. Add or sync the meter before saving a reading.');
        }

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
        payload.meter_id = await resolveSupabaseMeterIdForConsumer(payload.consumer_id, payload.meter_id);
        if (!payload.meter_id) {
          throw createHttpError('No meter is assigned to this consumer. Add or sync the meter before saving a reading.');
        }

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
    return res.status(error.statusCode || 500).json({ error: error.message });
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
            b.amount_due AS "Amount_Due", b.water_charge AS "Water_Charge", b.class_cost AS "Basic_Charge",
            b.meter_maintenance_fee AS "Environmental_Fee", b.meter_maintenance_fee AS "Meter_Fee",
            b.connection_fee AS "Connection_Fee",
            b.date_covered_from AS "Date_Covered_From", b.date_covered_to AS "Date_Covered_To",
            b.previous_balance AS "Previous_Balance", b.previous_penalty AS "Previous_Penalty",
            b.penalty AS "Penalties", b.penalty AS "Penalty", b.total_after_due_date AS "Total_After_Due_Date",
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
    const consumerId = normalizeRequiredForeignKeyId(bill.Consumer_ID || bill.consumer_id);
    if (!consumerId) {
      return res.status(400).json({ error: 'A consumer must be selected before saving a bill.' });
    }

    const billDate = bill.Bill_Date || new Date().toISOString();
    const dueDate = bill.Due_Date || billDate;
    const readingDate = bill.Reading_Date || billDate;
    const totalAmount = Number(bill.Total_Amount ?? bill.Amount_Due ?? 0);
    const penalty = Number(bill.Penalty ?? bill.Penalties ?? 0);
    const previousBalance = Number(bill.Previous_Balance ?? 0);
    const previousPenalty = Number(bill.Previous_Penalty ?? 0);
    const currentCharge = Number(bill.Water_Charge ?? bill.Basic_Charge ?? totalAmount);
    const maintenanceFee = Number(bill.Environmental_Fee ?? bill.Meter_Fee ?? 0);
    const connectionFee = Number(bill.Connection_Fee ?? 0);
    const previousReading = Number(bill.Previous_Reading ?? 0);
    const currentReading = Number(bill.Current_Reading ?? previousReading);
    const consumption = Number(bill.Consumption ?? Math.max(0, currentReading - previousReading));
    const totalAfterDueDate = Number(
      bill.Total_After_Due_Date ??
      (totalAmount + penalty)
    );
    const payload = {
      consumer_id: consumerId,
      reading_id: normalizeRequiredForeignKeyId(bill.Reading_ID || bill.reading_id),
      bill_date: billDate,
      due_date: dueDate,
      total_amount: totalAmount,
      status: bill.Status || 'Unpaid',
      billing_officer_id: Number(bill.Billing_Officer_ID || 1),
      billing_month: bill.Billing_Month || new Date(billDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      date_covered_from: bill.Date_Covered_From || billDate,
      date_covered_to: bill.Date_Covered_To || dueDate,
      class_cost: Number(bill.Basic_Charge ?? currentCharge),
      water_charge: currentCharge,
      meter_maintenance_fee: maintenanceFee,
      connection_fee: connectionFee,
      amount_due: Number(bill.Amount_Due ?? totalAmount),
      previous_balance: previousBalance,
      previous_penalty: previousPenalty,
      penalty,
      total_after_due_date: totalAfterDueDate,
    };
    const row = await withPostgresPrimary(
      'bills.create',
      async () => {
        if (payload.reading_id) {
          const existingBillForReading = await pool.query(
            'SELECT bill_id FROM bills WHERE reading_id = $1 LIMIT 1',
            [payload.reading_id]
          );
          if (existingBillForReading.rows.length > 0) {
            payload.reading_id = null;
          }
        }

        if (!payload.reading_id) {
          const meterId = await resolvePostgresMeterIdForConsumer(pool, payload.consumer_id, bill.Meter_ID || bill.meter_id);
          if (!meterId) {
            throw createHttpError('No meter is assigned to this consumer. Add or sync the meter before saving a manual bill.');
          }

          const readingInsert = await insertWithSequenceRetry(
            'meterreadings',
            'reading_id',
            `
            INSERT INTO meterreadings (
              consumer_id, meter_id, previous_reading, current_reading, consumption,
              reading_status, notes, reading_date, route_id, meter_reader_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING reading_id
          `,
            [
              payload.consumer_id,
              meterId,
              previousReading,
              currentReading,
              consumption,
              'Recorded',
              bill.Notes || (bill.Water_Charge !== undefined ? 'Auto-created from manual bill entry.' : 'Auto-created for bill record.'),
              readingDate,
              1,
              1,
            ]
          );
          payload.reading_id = readingInsert.rows[0]?.reading_id || null;
        }

        const { rows } = await insertWithSequenceRetry(
          'bills',
          'bill_id',
          `
          INSERT INTO bills (
            consumer_id, reading_id, bill_date, due_date, total_amount, status, billing_officer_id,
            billing_month, date_covered_from, date_covered_to, class_cost, water_charge,
            meter_maintenance_fee, connection_fee, amount_due, previous_balance, previous_penalty,
            penalty, total_after_due_date
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
          RETURNING *, bill_id AS "Bill_ID"
        `,
          [
            payload.consumer_id,
            payload.reading_id,
            payload.bill_date,
            payload.due_date,
            payload.total_amount,
            payload.status,
            payload.billing_officer_id,
            payload.billing_month,
            payload.date_covered_from,
            payload.date_covered_to,
            payload.class_cost,
            payload.water_charge,
            payload.meter_maintenance_fee,
            payload.connection_fee,
            payload.amount_due,
            payload.previous_balance,
            payload.previous_penalty,
            payload.penalty,
            payload.total_after_due_date,
          ]
        );
        return rows[0];
      },
      async () => {
        if (payload.reading_id) {
          const { data: existingBillsForReading, error: readingBillLookupError } = await supabase
            .from('bills')
            .select('bill_id')
            .eq('reading_id', payload.reading_id)
            .limit(1);
          if (readingBillLookupError) throw readingBillLookupError;
          if ((existingBillsForReading || []).length > 0) {
            payload.reading_id = null;
          }
        }

        if (!payload.reading_id) {
          const meterId = await resolveSupabaseMeterIdForConsumer(payload.consumer_id, bill.Meter_ID || bill.meter_id);
          if (!meterId) {
            throw createHttpError('No meter is assigned to this consumer. Add or sync the meter before saving a manual bill.');
          }

          const { data: readingRow, error: readingError } = await supabase
            .from('meterreadings')
            .insert([{
              consumer_id: payload.consumer_id,
              meter_id: meterId,
              previous_reading: previousReading,
              current_reading: currentReading,
              consumption,
              reading_status: 'Recorded',
              notes: bill.Notes || (bill.Water_Charge !== undefined ? 'Auto-created from manual bill entry.' : 'Auto-created for bill record.'),
              reading_date: readingDate,
              route_id: 1,
              meter_reader_id: 1,
            }])
            .select('reading_id')
            .single();
          if (readingError) throw readingError;
          payload.reading_id = readingRow?.reading_id || null;
        }

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
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

app.put('/api/bills/:id', async (req, res) => {
  try {
    const billId = Number(req.params.id);
    const bill = req.body;

    if (!Number.isFinite(billId)) {
      return res.status(400).json({ error: 'Invalid bill ID.' });
    }

    const consumerId = normalizeRequiredForeignKeyId(bill.Consumer_ID || bill.consumer_id);
    if (!consumerId) {
      return res.status(400).json({ error: 'A consumer must be selected before saving a bill.' });
    }

    const billDate = bill.Bill_Date || new Date().toISOString();
    const dueDate = bill.Due_Date || billDate;
    const readingDate = bill.Reading_Date || billDate;
    const totalAmount = Number(bill.Total_Amount ?? bill.Amount_Due ?? 0);
    const penalty = Number(bill.Penalty ?? bill.Penalties ?? 0);
    const previousBalance = Number(bill.Previous_Balance ?? 0);
    const previousPenalty = Number(bill.Previous_Penalty ?? 0);
    const currentCharge = Number(bill.Water_Charge ?? bill.Basic_Charge ?? totalAmount);
    const maintenanceFee = Number(bill.Environmental_Fee ?? bill.Meter_Fee ?? 0);
    const connectionFee = Number(bill.Connection_Fee ?? 0);
    const previousReading = Number(bill.Previous_Reading ?? 0);
    const currentReading = Number(bill.Current_Reading ?? previousReading);
    const consumption = Number(bill.Consumption ?? Math.max(0, currentReading - previousReading));
    const totalAfterDueDate = Number(
      bill.Total_After_Due_Date ??
      (totalAmount + penalty)
    );
    const payload = {
      consumer_id: consumerId,
      reading_id: normalizeRequiredForeignKeyId(bill.Reading_ID || bill.reading_id),
      bill_date: billDate,
      due_date: dueDate,
      total_amount: totalAmount,
      status: bill.Status || 'Unpaid',
      billing_officer_id: Number(bill.Billing_Officer_ID || 1),
      billing_month: bill.Billing_Month || new Date(billDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      date_covered_from: bill.Date_Covered_From || billDate,
      date_covered_to: bill.Date_Covered_To || dueDate,
      class_cost: Number(bill.Basic_Charge ?? currentCharge),
      water_charge: currentCharge,
      meter_maintenance_fee: maintenanceFee,
      connection_fee: connectionFee,
      amount_due: Number(bill.Amount_Due ?? totalAmount),
      previous_balance: previousBalance,
      previous_penalty: previousPenalty,
      penalty,
      total_after_due_date: totalAfterDueDate,
    };

    const row = await withPostgresPrimary(
      'bills.update',
      async () => {
        const existingBillResult = await pool.query(`
          SELECT bill_id, consumer_id, reading_id, status
          FROM bills
          WHERE bill_id = $1
          LIMIT 1
        `, [billId]);
        const existingBill = existingBillResult.rows[0];

        if (!existingBill) {
          throw new Error('Bill not found.');
        }

        if (String(existingBill.status || '').toLowerCase() === 'paid') {
          const paidError = new Error('Paid bills can no longer be edited.');
          paidError.statusCode = 400;
          throw paidError;
        }

        if (!payload.reading_id) {
          payload.reading_id = existingBill.reading_id || null;
        }

        if (!payload.reading_id) {
          const meterId = await resolvePostgresMeterIdForConsumer(pool, payload.consumer_id, bill.Meter_ID || bill.meter_id);
          if (!meterId) {
            throw createHttpError('No meter is assigned to this consumer. Add or sync the meter before saving a manual bill.');
          }

          const readingInsert = await pool.query(`
            INSERT INTO meterreadings (
              consumer_id, meter_id, previous_reading, current_reading, consumption,
              reading_status, notes, reading_date, route_id, meter_reader_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING reading_id
          `, [
            payload.consumer_id,
            meterId,
            previousReading,
            currentReading,
            consumption,
            'Recorded',
            bill.Notes || 'Updated from bill registry.',
            readingDate,
            1,
            1,
          ]);
          payload.reading_id = readingInsert.rows[0]?.reading_id || null;
        } else {
          await pool.query(`
            UPDATE meterreadings
            SET consumer_id = $1,
                previous_reading = $2,
                current_reading = $3,
                consumption = $4,
                reading_date = $5,
                notes = $6
            WHERE reading_id = $7
          `, [
            payload.consumer_id,
            previousReading,
            currentReading,
            consumption,
            readingDate,
            bill.Notes || 'Updated from bill registry.',
            payload.reading_id,
          ]);
        }

        const { rows } = await pool.query(`
          UPDATE bills
          SET consumer_id = $1,
              reading_id = $2,
              bill_date = $3,
              due_date = $4,
              total_amount = $5,
              status = $6,
              billing_officer_id = $7,
              billing_month = $8,
              date_covered_from = $9,
              date_covered_to = $10,
              class_cost = $11,
              water_charge = $12,
              meter_maintenance_fee = $13,
              connection_fee = $14,
              amount_due = $15,
              previous_balance = $16,
              previous_penalty = $17,
              penalty = $18,
              total_after_due_date = $19
          WHERE bill_id = $20
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
          payload.date_covered_to,
          payload.class_cost,
          payload.water_charge,
          payload.meter_maintenance_fee,
          payload.connection_fee,
          payload.amount_due,
          payload.previous_balance,
          payload.previous_penalty,
          payload.penalty,
          payload.total_after_due_date,
          billId,
        ]);
        return rows[0];
      },
      async () => {
        const { data: existingBill, error: existingBillError } = await supabase
          .from('bills')
          .select('bill_id, consumer_id, reading_id, status')
          .eq('bill_id', billId)
          .single();
        if (existingBillError) throw existingBillError;
        if (!existingBill) {
          throw new Error('Bill not found.');
        }
        if (String(existingBill.status || '').toLowerCase() === 'paid') {
          const paidError = new Error('Paid bills can no longer be edited.');
          paidError.statusCode = 400;
          throw paidError;
        }

        if (!payload.reading_id) {
          payload.reading_id = existingBill.reading_id || null;
        }

        if (!payload.reading_id) {
          const meterId = await resolveSupabaseMeterIdForConsumer(payload.consumer_id, bill.Meter_ID || bill.meter_id);
          if (!meterId) {
            throw createHttpError('No meter is assigned to this consumer. Add or sync the meter before saving a manual bill.');
          }

          const { data: readingRow, error: readingError } = await supabase
            .from('meterreadings')
            .insert([{
              consumer_id: payload.consumer_id,
              meter_id: meterId,
              previous_reading: previousReading,
              current_reading: currentReading,
              consumption,
              reading_status: 'Recorded',
              notes: bill.Notes || 'Updated from bill registry.',
              reading_date: readingDate,
              route_id: 1,
              meter_reader_id: 1,
            }])
            .select('reading_id')
            .single();
          if (readingError) throw readingError;
          payload.reading_id = readingRow?.reading_id || null;
        } else {
          const { error: readingUpdateError } = await supabase
            .from('meterreadings')
            .update({
              consumer_id: payload.consumer_id,
              previous_reading: previousReading,
              current_reading: currentReading,
              consumption,
              reading_date: readingDate,
              notes: bill.Notes || 'Updated from bill registry.',
            })
            .eq('reading_id', payload.reading_id);
          if (readingUpdateError) throw readingUpdateError;
        }

        const { data, error } = await supabase
          .from('bills')
          .update(payload)
          .eq('bill_id', billId)
          .select()
          .single();
        if (error) throw error;
        return { ...data, Bill_ID: data.bill_id };
      }
    );

    scheduleImmediateSync('bills-update');
    return res.json({ success: true, data: row });
  } catch (error) {
    await logRequestError(req, 'bills.update', error);
    console.error('Error updating bill:', error);
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// --- CONSUMER DASHBOARD ---
app.get('/api/consumer-dashboard/:accountId', async (req, res) => {
  const { accountId } = req.params;
  try {
    const result = await withPostgresPrimary(
      'consumerDashboard.fetch',
      async () => {
        const consumerResult = await pool.query(`
          SELECT c.*, z.zone_name, cl.classification_name, m.meter_serial_number AS meter_number
          FROM consumer c
          LEFT JOIN zone z ON z.zone_id = c.zone_id
          LEFT JOIN classification cl ON cl.classification_id = c.classification_id
          LEFT JOIN LATERAL (
            SELECT meter_serial_number
            FROM meter
            WHERE consumer_id = c.consumer_id
            ORDER BY meter_id DESC
            LIMIT 1
          ) m ON true
          WHERE c.login_id = $1
          LIMIT 1
        `, [accountId]);

        const consumer = consumerResult.rows[0];
        if (!consumer) {
          return null;
        }

        const [billRows, paymentRows, readingRows] = await Promise.all([
          pool.query('SELECT * FROM bills WHERE consumer_id = $1 ORDER BY bill_date DESC', [consumer.consumer_id]),
          pool.query('SELECT * FROM payment WHERE consumer_id = $1 ORDER BY payment_date DESC', [consumer.consumer_id]),
          pool.query('SELECT * FROM meterreadings WHERE consumer_id = $1 ORDER BY reading_date DESC LIMIT 6', [consumer.consumer_id]),
        ]);

        return {
          consumer: { ...consumer, Consumer_ID: consumer.consumer_id },
          bills: billRows.rows.map((b) => ({ ...b, Bill_ID: b.bill_id, Bill_Date: b.bill_date, Total_Amount: b.total_amount })),
          payments: paymentRows.rows.map((p) => ({
            ...p,
            Payment_ID: p.payment_id,
            Amount_Paid: p.amount_paid,
            Payment_Date: p.payment_date,
            Reference_Number: p.reference_number,
            Reference_No: p.reference_number,
            OR_Number: p.or_number,
          })),
          readings: readingRows.rows.map((r) => ({
            Reading_Date: r.reading_date || r.created_date,
            Consumption: r.consumption,
          })).reverse(),
        };
      },
      async () => {
        const { data: consumer, error: cErr } = await supabase
          .from('consumer')
          .select('*')
          .eq('login_id', accountId)
          .maybeSingle();
        if (cErr) throw cErr;
        if (!consumer) {
          return null;
        }

        const consumerId = consumer.consumer_id;
        const [{ data: bills, error: billsError }, { data: payments, error: paymentsError }, { data: readings, error: readingsError }, { data: meters, error: metersError }] = await Promise.all([
          supabase.from('bills').select('*').eq('consumer_id', consumerId).order('bill_date', { ascending: false }),
          supabase.from('payment').select('*').eq('consumer_id', consumerId).order('payment_date', { ascending: false }),
          supabase.from('meterreadings').select('*').eq('consumer_id', consumerId).order('reading_date', { ascending: false }).limit(6),
          supabase.from('meter').select('meter_serial_number').eq('consumer_id', consumerId).order('meter_id', { ascending: false }).limit(1),
        ]);
        if (billsError) throw billsError;
        if (paymentsError) throw paymentsError;
        if (readingsError) throw readingsError;
        if (metersError) throw metersError;

        return {
          consumer: {
            ...consumer,
            Consumer_ID: consumer.consumer_id,
            meter_number: meters?.[0]?.meter_serial_number || null,
          },
          bills: (bills || []).map((b) => ({ ...b, Bill_ID: b.bill_id, Bill_Date: b.bill_date, Total_Amount: b.total_amount })),
          payments: (payments || []).map((p) => ({
            ...p,
            Payment_ID: p.payment_id,
            Amount_Paid: p.amount_paid,
            Payment_Date: p.payment_date,
            Reference_Number: p.reference_number,
            Reference_No: p.reference_number,
            OR_Number: p.or_number,
          })),
          readings: (readings || []).map((r) => ({
            Reading_Date: r.reading_date || r.created_at || r.created_date,
            Consumption: r.consumption,
          })).reverse(),
        };
      }
    );

    if (!result) {
      return res.status(404).json({ success: false, message: 'Consumer not found' });
    }

    return res.json({ success: true, ...result });
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
            c.account_number AS "Account_Number",
            b.total_amount AS "Bill_Amount",
            b.billing_month AS "Billing_Month"
          FROM payment p
          LEFT JOIN consumer c ON p.consumer_id = c.consumer_id
          LEFT JOIN bills b ON p.bill_id = b.bill_id
        `);
        return rows;
      },
      async () => {
        const [{ data: payments, error: paymentsError }, { data: consumers, error: consumersError }, { data: bills, error: billsError }] = await Promise.all([
          supabase.from('payment').select('*').order('payment_date', { ascending: false }),
          supabase.from('consumer').select('consumer_id, first_name, last_name, account_number'),
          supabase.from('bills').select('bill_id, total_amount, billing_month'),
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
    const adminSettings = readAdminSettings();
    const payload = {
      bill_id: payment.Bill_ID,
      consumer_id: payment.Consumer_ID,
      amount_paid: Number(payment.Amount_Paid || 0),
      payment_date: payment.Payment_Date,
      payment_method: payment.Payment_Method,
      reference_number: payment.Reference_No || payment.Reference_Number || null,
      or_number: payment.OR_Number || null,
      status: payment.Status || 'Validated',
    };
    const row = await withPostgresPrimary(
      'payments.create',
      async () => {
        if (!payload.or_number) {
          payload.or_number = await generateOfficialReceiptNumber(pool, payload.payment_date);
        }
        if (!payload.reference_number) {
          payload.reference_number = payload.or_number;
        }

        const billLookup = await pool.query('SELECT * FROM bills WHERE bill_id = $1 LIMIT 1', [payload.bill_id]);
        const existingBill = billLookup.rows[0];
        const adjustedBill = applyBillPenaltySnapshot(existingBill, adminSettings, payload.payment_date || new Date());
        if (adjustedBill && existingBill) {
          await pool.query(
            `UPDATE bills
             SET penalty = $1, total_after_due_date = $2, status = $3
             WHERE bill_id = $4`,
            [
              adjustedBill.Penalty || 0,
              adjustedBill.Total_After_Due_Date || adjustedBill.Total_Amount || 0,
              adjustedBill.Status || existingBill.status,
              payload.bill_id,
            ]
          );
        }

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

        if (['validated', 'paid'].includes(String(payload.status || '').toLowerCase())) {
          const paymentTotals = await pool.query(
            `SELECT COALESCE(SUM(amount_paid), 0)::numeric AS total_paid
             FROM payment
             WHERE bill_id = $1
               AND LOWER(COALESCE(status, 'validated')) IN ('validated', 'paid')`,
            [payment.Bill_ID]
          );
          const totalPaid = Number(paymentTotals.rows[0]?.total_paid || 0);
          const amountDue = Number(adjustedBill?.Total_After_Due_Date || adjustedBill?.Total_Amount || existingBill?.total_after_due_date || existingBill?.total_amount || 0);
          const nextBillStatus = totalPaid >= amountDue && amountDue > 0 ? 'Paid' : 'Partially Paid';
          await pool.query(
            'UPDATE bills SET status = $1 WHERE bill_id = $2',
            [nextBillStatus, payment.Bill_ID]
          );
        }
        return rows[0];
      },
      async () => {
        if (!payload.or_number) {
          payload.or_number = await generateOfficialReceiptNumber(null, payload.payment_date);
        }
        if (!payload.reference_number) {
          payload.reference_number = payload.or_number;
        }

        const { data: existingBill, error: billLookupError } = await supabase
          .from('bills')
          .select('*')
          .eq('bill_id', payload.bill_id)
          .limit(1)
          .maybeSingle();
        if (billLookupError) throw billLookupError;

        const adjustedBill = applyBillPenaltySnapshot(existingBill, adminSettings, payload.payment_date || new Date());
        if (adjustedBill && existingBill) {
          const { error: billUpdateError } = await supabase
            .from('bills')
            .update({
              penalty: adjustedBill.Penalty || 0,
              total_after_due_date: adjustedBill.Total_After_Due_Date || adjustedBill.Total_Amount || 0,
              status: adjustedBill.Status || existingBill.status,
            })
            .eq('bill_id', payload.bill_id);
          if (billUpdateError) throw billUpdateError;
        }

        const { data, error } = await supabase.from('payment').insert([payload]).select().single();
        if (error) throw error;
        if (['validated', 'paid'].includes(String(payload.status || '').toLowerCase())) {
          const { data: billPayments, error: billPaymentsError } = await supabase
            .from('payment')
            .select('amount_paid, status')
            .eq('bill_id', payment.Bill_ID);
          if (billPaymentsError) throw billPaymentsError;

          const totalPaid = (billPayments || [])
            .filter((entry) => ['validated', 'paid'].includes(String(entry.status || 'validated').toLowerCase()))
            .reduce((sum, entry) => sum + Number(entry.amount_paid || 0), 0);
          const amountDue = Number(adjustedBill?.Total_After_Due_Date || adjustedBill?.Total_Amount || existingBill?.total_after_due_date || existingBill?.total_amount || 0);
          const nextBillStatus = totalPaid >= amountDue && amountDue > 0 ? 'Paid' : 'Partially Paid';
          const { error: billError } = await supabase.from('bills').update({ status: nextBillStatus }).eq('bill_id', payment.Bill_ID);
          if (billError) throw billError;
        }
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

app.put('/api/payments/:id', async (req, res) => {
  const { id } = req.params;
  const orNumber = String(req.body?.OR_Number || req.body?.or_number || '').trim();
  const referenceNumber = String(req.body?.Reference_No || req.body?.Reference_Number || req.body?.reference_number || orNumber).trim();

  if (!orNumber) {
    return res.status(400).json({ success: false, message: 'Official receipt number is required.' });
  }

  try {
    const updatedPayment = await withPostgresPrimary(
      'payments.update',
      async () => {
        const { rows } = await pool.query(
          `UPDATE payment
           SET or_number = $1,
               reference_number = $2
           WHERE payment_id = $3
           RETURNING payment_id AS "Payment_ID", or_number AS "OR_Number", reference_number AS "Reference_No"`,
          [orNumber, referenceNumber, id]
        );
        if (!rows[0]) {
          throw new Error('Payment not found.');
        }
        return rows[0];
      },
      async () => {
        const { data, error } = await supabase
          .from('payment')
          .update({ or_number: orNumber, reference_number: referenceNumber })
          .eq('payment_id', id)
          .select('payment_id, or_number, reference_number')
          .single();
        if (error) throw error;
        return {
          Payment_ID: data.payment_id,
          OR_Number: data.or_number,
          Reference_No: data.reference_number,
        };
      }
    );

    scheduleImmediateSync('payments-update');
    return res.json({ success: true, data: updatedPayment });
  } catch (error) {
    await logRequestError(req, 'payments.update', error);
    console.error('Error updating payment:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/payments/:id/status', async (req, res) => {
  const { id } = req.params;
  const normalizedStatus = String(req.body?.status || '').trim();

  if (!normalizedStatus) {
    return res.status(400).json({ success: false, message: 'Payment status is required.' });
  }

  try {
    await withPostgresPrimary(
      'payments.updateStatus',
      async () => {
        const paymentResult = await pool.query(
          'UPDATE payment SET status = $1 WHERE payment_id = $2 RETURNING payment_id, bill_id',
          [normalizedStatus, id]
        );
        const paymentRow = paymentResult.rows[0];
        if (!paymentRow) {
          throw new Error('Payment not found.');
        }

        if (String(normalizedStatus).toLowerCase() === 'rejected') {
          await pool.query('UPDATE bills SET status = $1 WHERE bill_id = $2', ['Unpaid', paymentRow.bill_id]);
        }
        if (['validated', 'paid'].includes(String(normalizedStatus).toLowerCase())) {
          await pool.query('UPDATE bills SET status = $1 WHERE bill_id = $2', ['Paid', paymentRow.bill_id]);
        }
      },
      async () => {
        const { data: paymentRow, error: paymentLookupError } = await supabase
          .from('payment')
          .update({ status: normalizedStatus })
          .eq('payment_id', id)
          .select('payment_id, bill_id')
          .single();
        if (paymentLookupError) throw paymentLookupError;

        if (String(normalizedStatus).toLowerCase() === 'rejected') {
          const { error: billError } = await supabase.from('bills').update({ status: 'Unpaid' }).eq('bill_id', paymentRow.bill_id);
          if (billError) throw billError;
        }
        if (['validated', 'paid'].includes(String(normalizedStatus).toLowerCase())) {
          const { error: billError } = await supabase.from('bills').update({ status: 'Paid' }).eq('bill_id', paymentRow.bill_id);
          if (billError) throw billError;
        }
      }
    );

    scheduleImmediateSync('payments-status-update');
    return res.json({ success: true, message: 'Payment status updated successfully.' });
  } catch (error) {
    await logRequestError(req, 'payments.updateStatus', error);
    return res.status(500).json({ success: false, message: error.message });
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
  const { 
    username, password, phone, firstName, middleName, lastName, 
    address, purok, barangay, municipality, zipCode, accountNumber
  } = req.body;
  const zoneId = req.body.zoneId || 1;
  const classificationId = req.body.classificationId ? parseInt(req.body.classificationId) : 1;
  const normalizedAccountNumber = String(accountNumber || '').trim() || generatePendingAccountNumber(zoneId);
  const normalizedPhoneNumber = normalizePhilippinePhoneNumber(phone);

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }

  if (!normalizedPhoneNumber) {
    return res.status(400).json({ success: false, message: 'Phone number must be a valid Philippine mobile number.' });
  }

  try {
    if (await isUsernameTaken(username)) {
      return res.status(400).json({ success: false, message: 'Username is already taken.' });
    }

    const ticketNumber = generateRegistrationTicketNumber();
    let createdAccountId = null;
    let authUserId = null;

    await withPostgresPrimary(
      'register',
      async () => {
        const client = await pool.connect();
        try {
          for (let attempt = 0; attempt < 2; attempt += 1) {
            await client.query('BEGIN');
            await synchronizePostgresSequences(client, [
              { tableName: 'accounts', primaryKey: 'account_id' },
              { tableName: 'consumer', primaryKey: 'consumer_id' },
              { tableName: 'connection_ticket', primaryKey: 'ticket_id' },
            ]);

            try {
              const { rows } = await client.query(
                'INSERT INTO accounts (username, password, role_id, account_status) VALUES ($1, $2, $3, $4) RETURNING account_id',
                [username, password, 5, 'Pending']
              );
              const accountId = rows[0].account_id;
              createdAccountId = accountId;

              const { rows: consumerRows } = await client.query(`
                INSERT INTO consumer (first_name, middle_name, last_name, address, purok, barangay, municipality, zip_code, zone_id, classification_id, login_id, status, contact_number, account_number)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING consumer_id
              `, [firstName, middleName, lastName, address, purok, barangay, municipality, zipCode, zoneId, classificationId, accountId, 'Pending', normalizedPhoneNumber, normalizedAccountNumber]);

              await client.query(`
                INSERT INTO connection_ticket (consumer_id, account_id, ticket_number, connection_type, requirements_submitted, status)
                VALUES ($1, $2, $3, $4, $5, $6)
              `, [consumerRows[0].consumer_id, accountId, ticketNumber, 'New Connection', 'Sedula', 'Pending']);

              await client.query('COMMIT');
              scheduleImmediateSync('register');
              return;
            } catch (error) {
              await client.query('ROLLBACK');
              if (attempt === 0 && isPrimaryKeyCollisionError(error, ['accounts_pkey', 'consumer_pkey', 'connection_ticket_pkey'])) {
                continue;
              }
              throw error;
            }
          }
        } catch (error) {
          throw error;
        } finally {
          client.release();
        }
      },
      async () => {
        let accountId = null;
        let consumerId = null;

        const accountRow = await insertSupabaseRowWithPrimaryKeyRetry(
          'accounts',
          'account_id',
          {
            username,
            password,
            role_id: 5,
            account_status: 'Pending',
          },
          'account_id'
        );
        accountId = accountRow.account_id;
        createdAccountId = accountId;

        const consumerRow = await insertSupabaseRowWithPrimaryKeyRetry(
          'consumer',
          'consumer_id',
          {
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            address,
            purok,
            barangay,
            municipality,
            zip_code: zipCode,
            zone_id: zoneId,
            classification_id: classificationId,
            login_id: accountId,
            status: 'Pending',
            contact_number: normalizedPhoneNumber,
            account_number: normalizedAccountNumber,
          },
          'consumer_id'
        );
        consumerId = consumerRow?.consumer_id ?? null;

        try {
          const ticketRow = await insertSupabaseRowWithPrimaryKeyRetry(
            'connection_ticket',
            'ticket_id',
            {
              consumer_id: consumerId,
              account_id: accountId,
              ticket_number: ticketNumber,
              connection_type: 'New Connection',
              requirements_submitted: 'Sedula',
              status: 'Pending',
            },
            'ticket_id, ticket_number'
          );

          if (!ticketRow?.ticket_id) {
            throw new Error('Supabase registration ticket was not created.');
          }
        } catch (ticketError) {
          if (consumerId) {
            await supabase.from('consumer').delete().eq('consumer_id', consumerId).catch(() => {});
          }
          if (accountId) {
            await supabase.from('accounts').delete().eq('account_id', accountId).catch(() => {});
          }
          throw ticketError;
        }
      }
    );

    if (createdAccountId) {
      authUserId = await ensureAccountAuthUser({
        accountId: createdAccountId,
        username,
        password,
        authUserId: null,
      });
    }

    return res.json({
      success: true,
      message: 'Registration requested successfully. Please wait for admin approval.',
      ticketNumber,
      authUserId,
    });
  } catch (error) {
    await logRequestError(req, 'auth.register', error);
    console.error('Registration error:', error);
    return res.status(500).json({ success: false, message: getRegisterErrorMessage(error) });
  }
});

app.get('/api/treasurer/dashboard-summary', async (req, res) => {
  const dateParam = String(req.query.date || new Date().toISOString().slice(0, 10));

  try {
    const result = await withPostgresPrimary(
      'treasurer.dashboardSummary',
      async () => {
        const [paymentSummary, pendingSummary, recentPayments] = await Promise.all([
          pool.query(`
            SELECT
              COALESCE(SUM(amount_paid), 0) AS total_collections,
              COUNT(*)::int AS payments_today
            FROM payment
            WHERE payment_date::date = $1::date
          `, [dateParam]),
          pool.query(`SELECT COUNT(*)::int AS pending_validation FROM payment WHERE status = 'Pending'`),
          pool.query(`
            SELECT 
              p.payment_id AS "Payment_ID",
              p.amount_paid AS "Amount_Paid",
              p.payment_date AS "Payment_Date",
              p.payment_method AS "Payment_Method",
              p.reference_number AS "Reference_No",
              p.or_number AS "OR_Number",
              p.status AS "Status",
              CONCAT(c.first_name, ' ', c.last_name) AS "Consumer_Name",
              c.account_number AS "Account_Number"
            FROM payment p
            LEFT JOIN consumer c ON c.consumer_id = p.consumer_id
            ORDER BY p.payment_date DESC, p.payment_id DESC
            LIMIT 10
          `),
        ]);

        return {
          success: true,
          data: {
            todaysCollections: Number(paymentSummary.rows[0]?.total_collections || 0),
            paymentsToday: Number(paymentSummary.rows[0]?.payments_today || 0),
            pendingValidation: Number(pendingSummary.rows[0]?.pending_validation || 0),
            recentPayments: recentPayments.rows.map(mapTreasurerRecentPayment),
          },
        };
      },
      async () => {
        const todayStart = `${dateParam}T00:00:00`;
        const todayEnd = `${dateParam}T23:59:59.999`;
        const [paymentsResult, consumersResult] = await Promise.all([
          supabase.from('payment').select('*').order('payment_date', { ascending: false }).limit(100),
          supabase.from('consumer').select('consumer_id, first_name, last_name, account_number'),
        ]);

        if (paymentsResult.error) throw paymentsResult.error;
        if (consumersResult.error) throw consumersResult.error;

        const consumerMap = new Map((consumersResult.data || []).map((consumer) => [consumer.consumer_id, consumer]));
        const payments = (paymentsResult.data || []).map((payment) => mapPaymentRecord(payment, consumerMap, new Map()));
        const paymentsToday = payments.filter((payment) => String(payment.Payment_Date || '') >= todayStart && String(payment.Payment_Date || '') <= todayEnd);
        const pendingValidation = payments.filter((payment) => String(payment.Status || '').toLowerCase() === 'pending');

        return {
          success: true,
          data: {
            todaysCollections: paymentsToday.reduce((sum, payment) => sum + Number(payment.Amount_Paid || 0), 0),
            paymentsToday: paymentsToday.length,
            pendingValidation: pendingValidation.length,
            recentPayments: payments.slice(0, 10).map(mapTreasurerRecentPayment),
          },
        };
      }
    );

    return res.json(result);
  } catch (error) {
    await logRequestError(req, 'treasurer.dashboardSummary', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/treasurer/account-lookup', async (req, res) => {
  const query = String(req.query.q || '').trim();

  if (!query) {
    return res.status(400).json({ success: false, message: 'Search query is required.' });
  }

  try {
    const adminSettings = readAdminSettings();
    const result = await withPostgresPrimary(
      'treasurer.accountLookup',
      async () => {
        const consumerResult = await pool.query(`
          SELECT c.*, z.zone_name, cl.classification_name, m.meter_serial_number AS meter_number
          FROM consumer c
          LEFT JOIN accounts a ON a.account_id = c.login_id
          LEFT JOIN zone z ON z.zone_id = c.zone_id
          LEFT JOIN classification cl ON cl.classification_id = c.classification_id
          LEFT JOIN LATERAL (
            SELECT meter_serial_number
            FROM meter
            WHERE consumer_id = c.consumer_id
            ORDER BY meter_id DESC
            LIMIT 1
          ) m ON true
          WHERE (c.account_number = $1
             OR CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name) ILIKE $2)
            AND (c.login_id IS NULL OR COALESCE(a.account_status, 'Active') = 'Active')
          ORDER BY CASE WHEN c.account_number = $1 THEN 0 ELSE 1 END, c.consumer_id DESC
          LIMIT 1
        `, [query, `%${query}%`]);

        const consumer = consumerResult.rows[0];
        if (!consumer) {
          return null;
        }

        const [billRows, paymentRows] = await Promise.all([
          pool.query('SELECT * FROM bills WHERE consumer_id = $1 ORDER BY bill_date DESC, bill_id DESC', [consumer.consumer_id]),
          pool.query('SELECT * FROM payment WHERE consumer_id = $1 ORDER BY payment_date DESC, payment_id DESC', [consumer.consumer_id]),
        ]);

        const mappedBills = billRows.rows.map((bill) => mapBillRecord(bill, new Map([[consumer.consumer_id, consumer]]), new Map([[consumer.classification_id, consumer.classification_name]])));
        const mappedPayments = paymentRows.rows.map((payment) => mapPaymentRecord(payment, new Map([[consumer.consumer_id, consumer]]), new Map(mappedBills.map((bill) => [bill.Bill_ID, { total_amount: bill.Total_Amount, billing_month: bill.Billing_Month }]))));
        const rawCurrentBill = mappedBills.find((bill) => String(bill.Status || '').toLowerCase() !== 'paid') || mappedBills[0] || null;
        const currentBill = applyBillPenaltySnapshot(rawCurrentBill, adminSettings);
        const previousBalance = mappedBills
          .filter((bill) => currentBill ? bill.Bill_ID !== currentBill.Bill_ID : true)
          .filter((bill) => String(bill.Status || '').toLowerCase() !== 'paid')
          .reduce((sum, bill) => sum + Number(bill.Total_Amount || 0), 0);
        const totalDue = roundCurrency(Number(currentBill?.Amount_Due || currentBill?.Total_Amount || 0) + previousBalance + Number(currentBill?.Penalty || 0));

        return {
          success: true,
          data: {
            consumer: {
              Consumer_ID: consumer.consumer_id,
              Consumer_Name: [consumer.first_name, consumer.middle_name, consumer.last_name].filter(Boolean).join(' '),
              Address: consumer.address,
              Account_Number: consumer.account_number,
              Classification: consumer.classification_name || null,
              Connection_Date: consumer.connection_date,
              Meter_Number: consumer.meter_number || null,
              Zone_Name: consumer.zone_name || null,
            },
            currentBill,
            summary: {
              currentBillAmount: Number(currentBill?.Amount_Due || currentBill?.Total_Amount || 0),
              previousBalance,
              overduePenalty: Number(currentBill?.Penalty || 0),
              totalDue,
              dueDate: currentBill?.Due_Date || null,
              billingMonth: currentBill?.Billing_Month || null,
              lateFeePercentage: Number(currentBill?.Late_Fee_Percentage || adminSettings?.lateFee || 0),
              isOverdue: Boolean(currentBill?.Is_Overdue),
            },
            bills: mappedBills,
            payments: mappedPayments,
            ledger: buildLedgerRecords(mappedBills, mappedPayments),
          },
        };
      },
      async () => {
        const [consumerResult, classificationsResult, metersResult, billsResult, paymentsResult, accountsResult] = await Promise.all([
          supabase.from('consumer').select('*'),
          supabase.from('classification').select('classification_id, classification_name'),
          supabase.from('meter').select('consumer_id, meter_serial_number, meter_id').order('meter_id', { ascending: false }),
          supabase.from('bills').select('*').order('bill_date', { ascending: false }),
          supabase.from('payment').select('*').order('payment_date', { ascending: false }),
          supabase.from('accounts').select('account_id, account_status'),
        ]);

        if (consumerResult.error) throw consumerResult.error;
        if (classificationsResult.error) throw classificationsResult.error;
        if (metersResult.error) throw metersResult.error;
        if (billsResult.error) throw billsResult.error;
        if (paymentsResult.error) throw paymentsResult.error;
        if (accountsResult.error) throw accountsResult.error;

        const accountMap = new Map((accountsResult.data || []).map((account) => [account.account_id, account.account_status]));

        const matchedConsumer = (consumerResult.data || []).find((consumer) => {
          if (consumer.login_id && accountMap.get(consumer.login_id) !== 'Active') {
            return false;
          }
          const fullName = [consumer.first_name, consumer.middle_name, consumer.last_name].filter(Boolean).join(' ').toLowerCase();
          return String(consumer.account_number || '').toLowerCase() === query.toLowerCase() || fullName.includes(query.toLowerCase());
        });

        if (!matchedConsumer) {
          return null;
        }

        const classificationMap = new Map((classificationsResult.data || []).map((classification) => [classification.classification_id, classification.classification_name]));
        const meter = (metersResult.data || []).find((entry) => entry.consumer_id === matchedConsumer.consumer_id);
        const mappedBills = (billsResult.data || [])
          .filter((bill) => bill.consumer_id === matchedConsumer.consumer_id)
          .map((bill) => mapBillRecord(bill, new Map([[matchedConsumer.consumer_id, matchedConsumer]]), classificationMap));
        const mappedPayments = (paymentsResult.data || [])
          .filter((payment) => payment.consumer_id === matchedConsumer.consumer_id)
          .map((payment) => mapPaymentRecord(payment, new Map([[matchedConsumer.consumer_id, matchedConsumer]]), new Map(mappedBills.map((bill) => [bill.Bill_ID, { total_amount: bill.Total_Amount, billing_month: bill.Billing_Month }]))));
        const rawCurrentBill = mappedBills.find((bill) => String(bill.Status || '').toLowerCase() !== 'paid') || mappedBills[0] || null;
        const currentBill = applyBillPenaltySnapshot(rawCurrentBill, adminSettings);
        const previousBalance = mappedBills
          .filter((bill) => currentBill ? bill.Bill_ID !== currentBill.Bill_ID : true)
          .filter((bill) => String(bill.Status || '').toLowerCase() !== 'paid')
          .reduce((sum, bill) => sum + Number(bill.Total_Amount || 0), 0);
        const totalDue = roundCurrency(Number(currentBill?.Amount_Due || currentBill?.Total_Amount || 0) + previousBalance + Number(currentBill?.Penalty || 0));

        return {
          success: true,
          data: {
            consumer: {
              Consumer_ID: matchedConsumer.consumer_id,
              Consumer_Name: [matchedConsumer.first_name, matchedConsumer.middle_name, matchedConsumer.last_name].filter(Boolean).join(' '),
              Address: matchedConsumer.address,
              Account_Number: matchedConsumer.account_number,
              Classification: classificationMap.get(matchedConsumer.classification_id) || null,
              Connection_Date: matchedConsumer.connection_date,
              Meter_Number: meter?.meter_serial_number || null,
              Zone_Name: matchedConsumer.zone_id ? String(matchedConsumer.zone_id) : null,
            },
            currentBill,
            summary: {
              currentBillAmount: Number(currentBill?.Amount_Due || currentBill?.Total_Amount || 0),
              previousBalance,
              overduePenalty: Number(currentBill?.Penalty || 0),
              totalDue,
              dueDate: currentBill?.Due_Date || null,
              billingMonth: currentBill?.Billing_Month || null,
              lateFeePercentage: Number(currentBill?.Late_Fee_Percentage || adminSettings?.lateFee || 0),
              isOverdue: Boolean(currentBill?.Is_Overdue),
            },
            bills: mappedBills,
            payments: mappedPayments,
            ledger: buildLedgerRecords(mappedBills, mappedPayments),
          },
        };
      }
    );

    if (!result) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }

    return res.json(result);
  } catch (error) {
    await logRequestError(req, 'treasurer.accountLookup', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/dashboard-summary', async (req, res) => {
  try {
    const result = await withPostgresPrimary(
      'admin.dashboardSummary',
      async () => {
        const [staffResult, consumerResult, billsResult, applicationsResult, logsResult] = await Promise.all([
          pool.query(`
            SELECT COUNT(*)::int AS count
            FROM accounts
            WHERE role_id NOT IN (4, 5)
          `),
          pool.query('SELECT COUNT(*)::int AS count FROM consumer'),
          pool.query(`
            SELECT COUNT(*)::int AS count
            FROM bills
            WHERE LOWER(COALESCE(status, 'unpaid')) <> 'paid'
          `),
          pool.query(`
            SELECT COUNT(*)::int AS count
            FROM accounts
            WHERE LOWER(COALESCE(account_status, 'pending')) = 'pending'
          `),
          pool.query(`
            SELECT
              sl.log_id,
              sl.timestamp,
              sl.role,
              sl.action,
              sl.account_id,
              a.username
            FROM system_logs sl
            LEFT JOIN accounts a ON a.account_id = sl.account_id
            ORDER BY sl.timestamp DESC
            LIMIT 10
          `),
        ]);

        return {
          success: true,
          data: {
            stats: {
              staffMembers: Number(staffResult.rows[0]?.count || 0),
              totalConsumers: Number(consumerResult.rows[0]?.count || 0),
              pendingBills: Number(billsResult.rows[0]?.count || 0),
              pendingApplications: Number(applicationsResult.rows[0]?.count || 0),
            },
            recentLogs: logsResult.rows.map(mapAdminLogRow),
          },
        };
      },
      async () => {
        const [accountsResult, consumerResult, billsResult, logsResult] = await Promise.all([
          supabase.from('accounts').select('account_id, role_id, account_status, username'),
          supabase.from('consumer').select('consumer_id'),
          supabase.from('bills').select('bill_id, status'),
          supabase.from('system_logs').select('log_id, timestamp, role, action, account_id').order('timestamp', { ascending: false }).limit(10),
        ]);

        if (accountsResult.error) throw accountsResult.error;
        if (consumerResult.error) throw consumerResult.error;
        if (billsResult.error) throw billsResult.error;
        if (logsResult.error) throw logsResult.error;

        const accounts = accountsResult.data || [];
        const accountMap = new Map(accounts.map((account) => [account.account_id, account]));

        return {
          success: true,
          data: {
            stats: {
              staffMembers: accounts.filter((account) => ![4, 5].includes(Number(account.role_id))).length,
              totalConsumers: (consumerResult.data || []).length,
              pendingBills: (billsResult.data || []).filter((bill) => String(bill.status || 'unpaid').toLowerCase() !== 'paid').length,
              pendingApplications: accounts.filter((account) => String(account.account_status || '').toLowerCase() === 'pending').length,
            },
            recentLogs: (logsResult.data || []).map((row) => mapAdminLogRow({
              ...row,
              username: accountMap.get(row.account_id)?.username || null,
            })),
          },
        };
      }
    );

    return res.json(result);
  } catch (error) {
    await logRequestError(req, 'admin.dashboardSummary', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/reports/overview', async (req, res) => {
  const fromDate = normalizeDateInput(req.query.fromDate);
  const toDate = normalizeDateInput(req.query.toDate || fromDate);
  const nextDate = addOneDay(toDate);
  const zoneId = Number(req.query.zoneId || 0);

  try {
    const result = await withPostgresPrimary(
      'admin.reports.overview',
      async () => {
        const consumerParams = [];
        const consumerZoneClause = zoneId ? ` WHERE c.zone_id = $1` : '';
        if (zoneId) {
          consumerParams.push(zoneId);
        }

        const params = [fromDate, nextDate];
        const zoneClause = zoneId ? ` AND c.zone_id = $3` : '';
        if (zoneId) {
          params.push(zoneId);
        }

        const [consumerResult, billsResult, paymentsResult] = await Promise.all([
          pool.query(`
            SELECT COUNT(*)::int AS count
            FROM consumer c
            ${consumerZoneClause}
          `, consumerParams),
          pool.query(`
            SELECT COUNT(*)::int AS count
            FROM bills b
            JOIN consumer c ON c.consumer_id = b.consumer_id
            WHERE b.bill_date >= $1::date
              AND b.bill_date < $2::date
              ${zoneClause}
          `, params),
          pool.query(`
            SELECT COALESCE(SUM(p.amount_paid), 0) AS total
            FROM payment p
            JOIN consumer c ON c.consumer_id = p.consumer_id
            WHERE p.payment_date >= $1::date
              AND p.payment_date < $2::date
              AND LOWER(COALESCE(p.status, 'pending')) <> 'rejected'
              ${zoneClause}
          `, params),
        ]);

        return {
          success: true,
          data: {
            totalConsumers: Number(consumerResult.rows[0]?.count || 0),
            totalBills: Number(billsResult.rows[0]?.count || 0),
            totalRevenue: Number(paymentsResult.rows[0]?.total || 0),
          },
        };
      },
      async () => {
        const [consumerResult, billsResult, paymentsResult] = await Promise.all([
          supabase.from('consumer').select('consumer_id, zone_id'),
          supabase.from('bills').select('bill_id, consumer_id, bill_date'),
          supabase.from('payment').select('payment_id, consumer_id, amount_paid, payment_date, status'),
        ]);

        if (consumerResult.error) throw consumerResult.error;
        if (billsResult.error) throw billsResult.error;
        if (paymentsResult.error) throw paymentsResult.error;

        const consumerIds = new Set((consumerResult.data || [])
          .filter((consumer) => !zoneId || Number(consumer.zone_id) === zoneId)
          .map((consumer) => consumer.consumer_id));

        const bills = (billsResult.data || []).filter((bill) => {
          const billDate = normalizeDateInput(bill.bill_date, fromDate);
          return consumerIds.has(bill.consumer_id) && billDate >= fromDate && billDate < nextDate;
        });

        const payments = (paymentsResult.data || []).filter((payment) => {
          const paymentDate = normalizeDateInput(payment.payment_date, fromDate);
          return consumerIds.has(payment.consumer_id)
            && paymentDate >= fromDate
            && paymentDate < nextDate
            && String(payment.status || 'pending').toLowerCase() !== 'rejected';
        });

        return {
          success: true,
          data: {
            totalConsumers: consumerIds.size,
            totalBills: bills.length,
            totalRevenue: payments.reduce((sum, payment) => sum + Number(payment.amount_paid || 0), 0),
          },
        };
      }
    );

    return res.json(result);
  } catch (error) {
    await logRequestError(req, 'admin.reports.overview', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/reports/consumers', async (req, res) => {
  const zoneId = Number(req.query.zoneId || 0);

  try {
    const result = await withPostgresPrimary(
      'admin.reports.consumers',
      async () => {
        const params = [];
        const zoneClause = zoneId ? `WHERE z.zone_id = $1` : '';
        if (zoneId) {
          params.push(zoneId);
        }

        const { rows } = await pool.query(`
          SELECT
            z.zone_id,
            z.zone_name,
            COUNT(c.consumer_id)::int AS total_consumers,
            COALESCE(SUM(CASE WHEN LOWER(COALESCE(a.account_status, c.status, 'active')) = 'active' THEN 1 ELSE 0 END), 0)::int AS active_consumers,
            COALESCE(SUM(CASE WHEN LOWER(COALESCE(a.account_status, c.status, 'active')) <> 'active' THEN 1 ELSE 0 END), 0)::int AS inactive_consumers
          FROM zone z
          LEFT JOIN consumer c ON c.zone_id = z.zone_id
          LEFT JOIN accounts a ON a.account_id = c.login_id
          ${zoneClause}
          GROUP BY z.zone_id, z.zone_name
          ORDER BY z.zone_id
        `, params);

        return {
          success: true,
          data: rows.map((row) => {
            const totalConsumers = Number(row.total_consumers || 0);
            const activeConsumers = Number(row.active_consumers || 0);
            const inactiveConsumers = Number(row.inactive_consumers || 0);

            return {
              zone: formatZoneDisplay(row.zone_name, row.zone_id),
              totalConsumers,
              active: activeConsumers,
              inactive: inactiveConsumers,
              percentage: totalConsumers ? `${((activeConsumers / totalConsumers) * 100).toFixed(1)}%` : '0.0%',
            };
          }),
        };
      },
      async () => {
        const [zoneResult, consumerResult, accountResult] = await Promise.all([
          supabase.from('zone').select('zone_id, zone_name').order('zone_id', { ascending: true }),
          supabase.from('consumer').select('consumer_id, zone_id, status, login_id'),
          supabase.from('accounts').select('account_id, account_status'),
        ]);

        if (zoneResult.error) throw zoneResult.error;
        if (consumerResult.error) throw consumerResult.error;
        if (accountResult.error) throw accountResult.error;

        const accountMap = new Map((accountResult.data || []).map((account) => [account.account_id, account.account_status]));
        const zones = (zoneResult.data || []).filter((zone) => !zoneId || Number(zone.zone_id) === zoneId);

        return {
          success: true,
          data: zones.map((zone) => {
            const consumers = (consumerResult.data || []).filter((consumer) => Number(consumer.zone_id) === Number(zone.zone_id));
            const active = consumers.filter((consumer) => String(getActiveAccountStatus(consumer, accountMap.get(consumer.login_id))).toLowerCase() === 'active').length;
            const inactive = consumers.length - active;

            return {
              zone: formatZoneDisplay(zone.zone_name, zone.zone_id),
              totalConsumers: consumers.length,
              active,
              inactive,
              percentage: consumers.length ? `${((active / consumers.length) * 100).toFixed(1)}%` : '0.0%',
            };
          }),
        };
      }
    );

    return res.json(result);
  } catch (error) {
    await logRequestError(req, 'admin.reports.consumers', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/reports/monthly', async (req, res) => {
  const fromDate = normalizeDateInput(req.query.fromDate, new Date(new Date().getFullYear(), 0, 1));
  const toDate = normalizeDateInput(req.query.toDate);
  const nextDate = addOneDay(toDate);
  const zoneId = Number(req.query.zoneId || 0);

  try {
    const result = await withPostgresPrimary(
      'admin.reports.monthly',
      async () => {
        const params = [fromDate, nextDate];
        const zoneClause = zoneId ? ` AND c.zone_id = $3` : '';
        if (zoneId) {
          params.push(zoneId);
        }

        const { rows } = await pool.query(`
          WITH monthly_summary AS (
            SELECT
              COALESCE(NULLIF(b.billing_month, ''), TO_CHAR(b.bill_date, 'FMMonth YYYY')) AS period,
              DATE_TRUNC('month', COALESCE(b.bill_date, CURRENT_DATE)) AS sort_month,
              COUNT(b.bill_id)::int AS bills_generated,
              COALESCE(SUM(b.total_amount), 0) AS total_invoiced,
              COALESCE(SUM(CASE WHEN LOWER(COALESCE(b.status, 'unpaid')) = 'paid' THEN b.total_amount ELSE 0 END), 0) AS total_collected,
              COALESCE(SUM(CASE WHEN LOWER(COALESCE(b.status, 'unpaid')) <> 'paid' THEN b.total_amount ELSE 0 END), 0) AS unpaid_balance
            FROM bills b
            JOIN consumer c ON c.consumer_id = b.consumer_id
            WHERE b.bill_date >= $1::date
              AND b.bill_date < $2::date
              ${zoneClause}
            GROUP BY period, sort_month
          )
          SELECT *
          FROM monthly_summary
          ORDER BY sort_month DESC
        `, params);

        return {
          success: true,
          data: rows.map((row) => {
            const totalInvoiced = Number(row.total_invoiced || 0);
            const totalCollected = Number(row.total_collected || 0);
            return {
              period: row.period,
              billsGenerated: Number(row.bills_generated || 0),
              totalInvoiced,
              totalCollected,
              collectionRate: totalInvoiced ? `${((totalCollected / totalInvoiced) * 100).toFixed(1)}%` : '0.0%',
              unpaidBalance: Number(row.unpaid_balance || 0),
            };
          }),
        };
      },
      async () => {
        const [consumerResult, billsResult] = await Promise.all([
          supabase.from('consumer').select('consumer_id, zone_id'),
          supabase.from('bills').select('bill_id, consumer_id, bill_date, billing_month, total_amount, status').order('bill_date', { ascending: false }),
        ]);

        if (consumerResult.error) throw consumerResult.error;
        if (billsResult.error) throw billsResult.error;

        const consumerMap = new Map((consumerResult.data || []).map((consumer) => [consumer.consumer_id, consumer]));
        const monthlyMap = new Map();

        (billsResult.data || []).forEach((bill) => {
          const consumer = consumerMap.get(bill.consumer_id);
          if (!consumer || (zoneId && Number(consumer.zone_id) !== zoneId)) {
            return;
          }

          const billDate = normalizeDateInput(bill.bill_date, fromDate);
          if (billDate < fromDate || billDate >= nextDate) {
            return;
          }

          const key = bill.bill_date ? new Date(bill.bill_date).toISOString().slice(0, 7) : billDate.slice(0, 7);
          const existing = monthlyMap.get(key) || {
            period: formatMonthPeriod(bill.billing_month, bill.bill_date),
            sortMonth: key,
            billsGenerated: 0,
            totalInvoiced: 0,
            totalCollected: 0,
            unpaidBalance: 0,
          };

          const amount = Number(bill.total_amount || 0);
          existing.billsGenerated += 1;
          existing.totalInvoiced += amount;
          if (String(bill.status || 'unpaid').toLowerCase() === 'paid') {
            existing.totalCollected += amount;
          } else {
            existing.unpaidBalance += amount;
          }
          monthlyMap.set(key, existing);
        });

        const data = Array.from(monthlyMap.values())
          .sort((a, b) => String(b.sortMonth).localeCompare(String(a.sortMonth)))
          .map((row) => ({
            period: row.period,
            billsGenerated: row.billsGenerated,
            totalInvoiced: row.totalInvoiced,
            totalCollected: row.totalCollected,
            collectionRate: row.totalInvoiced ? `${((row.totalCollected / row.totalInvoiced) * 100).toFixed(1)}%` : '0.0%',
            unpaidBalance: row.unpaidBalance,
          }));

        return { success: true, data };
      }
    );

    return res.json(result);
  } catch (error) {
    await logRequestError(req, 'admin.reports.monthly', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/settings', async (req, res) => {
  try {
    const [settings, waterRates] = await Promise.all([
      Promise.resolve(readAdminSettings()),
      withPostgresPrimary(
        'admin.settings.latestRates',
        async () => {
          const { rows } = await pool.query(`
            SELECT rate_id, minimum_cubic, minimum_rate, excess_rate_per_cubic, effective_date, modified_by, modified_date
            FROM waterrates
            ORDER BY effective_date DESC, rate_id DESC
            LIMIT 1
          `);
          return rows[0] || null;
        },
        async () => {
          const { data, error } = await supabase
            .from('waterrates')
            .select('rate_id, minimum_cubic, minimum_rate, excess_rate_per_cubic, effective_date, modified_by, modified_date')
            .order('effective_date', { ascending: false })
            .order('rate_id', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          return data || null;
        }
      ),
    ]);

    return res.json({
      success: true,
      data: {
        systemSettings: settings,
        waterRates,
      },
    });
  } catch (error) {
    await logRequestError(req, 'admin.settings.fetch', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/settings', async (req, res) => {
  try {
    const savedSettings = writeAdminSettings(req.body || {});
    await writeSystemLog('[admin-settings] System configuration updated.', {
      userId: Number(req.body?.modifiedBy || defaultSystemLogAccountId),
      role: 'Admin',
    });
    return res.json({ success: true, data: savedSettings });
  } catch (error) {
    await logRequestError(req, 'admin.settings.save', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/maintenance', async (req, res) => {
  try {
    const result = await withPostgresPrimary(
      'admin.maintenance.fetch',
      async () => {
        const [logsResult, backupsResult] = await Promise.all([
          pool.query(`
            SELECT sl.log_id, sl.timestamp, sl.role, sl.action, sl.account_id, a.username
            FROM system_logs sl
            LEFT JOIN accounts a ON a.account_id = sl.account_id
            ORDER BY sl.timestamp DESC
            LIMIT 50
          `),
          pool.query(`
            SELECT backup_id, backup_name, backup_time, backup_size, backup_type, created_by
            FROM backuplogs
            ORDER BY backup_time DESC, backup_id DESC
            LIMIT 10
          `),
        ]);

        return {
          success: true,
          data: {
            dbStatus: isPostgresAvailable ? 'CONNECTED' : 'FALLBACK',
            primaryEndpoint: postgresConfig.host || 'PostgreSQL',
            sync: {
              configured: Boolean(supabase),
              running: syncState.running,
              lastCompletedAt: syncState.lastCompletedAt,
              lastError: syncState.lastError,
            },
            logs: logsResult.rows.map((row) => ({
              id: row.log_id,
              timestamp: row.timestamp,
              type: String(row.action || '').toLowerCase().includes('error') ? 'ERROR' : String(row.action || '').toLowerCase().includes('warning') ? 'WARNING' : 'INFO',
              action: row.role || 'System',
              description: row.action,
              user: row.username || `Account #${row.account_id ?? 'System'}`,
            })),
            backups: backupsResult.rows.map(mapBackupRow),
          },
        };
      },
      async () => {
        const [logsResult, backupsResult, accountsResult] = await Promise.all([
          supabase.from('system_logs').select('log_id, timestamp, role, action, account_id').order('timestamp', { ascending: false }).limit(50),
          supabase.from('backuplogs').select('backup_id, backup_name, backup_time, backup_size, backup_type, created_by').order('backup_time', { ascending: false }).limit(10),
          supabase.from('accounts').select('account_id, username'),
        ]);

        if (logsResult.error) throw logsResult.error;
        if (backupsResult.error) throw backupsResult.error;
        if (accountsResult.error) throw accountsResult.error;

        const accountMap = new Map((accountsResult.data || []).map((account) => [account.account_id, account.username]));

        return {
          success: true,
          data: {
            dbStatus: isPostgresAvailable ? 'CONNECTED' : 'FALLBACK',
            primaryEndpoint: supabaseUrl || 'Supabase',
            sync: {
              configured: Boolean(supabase),
              running: syncState.running,
              lastCompletedAt: syncState.lastCompletedAt,
              lastError: syncState.lastError,
            },
            logs: (logsResult.data || []).map((row) => ({
              id: row.log_id,
              timestamp: row.timestamp,
              type: String(row.action || '').toLowerCase().includes('error') ? 'ERROR' : String(row.action || '').toLowerCase().includes('warning') ? 'WARNING' : 'INFO',
              action: row.role || 'System',
              description: row.action,
              user: accountMap.get(row.account_id) || `Account #${row.account_id ?? 'System'}`,
            })),
            backups: (backupsResult.data || []).map(mapBackupRow),
          },
        };
      }
    );

    return res.json(result);
  } catch (error) {
    await logRequestError(req, 'admin.maintenance.fetch', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/maintenance/test-connection', async (req, res) => {
  try {
    if (isPostgresAvailable) {
      await pool.query('SELECT 1');
    } else if (supabase) {
      const { error } = await supabase.from('accounts').select('account_id').limit(1);
      if (error) throw error;
    } else {
      throw new Error('No database connection is configured.');
    }

    return res.json({
      success: true,
      status: isPostgresAvailable ? 'CONNECTED' : 'FALLBACK',
      message: isPostgresAvailable ? 'PostgreSQL connection verified.' : 'Supabase fallback connection verified.',
    });
  } catch (error) {
    await logRequestError(req, 'admin.maintenance.testConnection', error);
    return res.status(500).json({ success: false, status: 'ERROR', message: error.message });
  }
});

app.post('/api/admin/maintenance/backup', async (req, res) => {
  const backupName = `manual-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const createdBy = Number(req.body?.createdBy || defaultSystemLogAccountId);

  try {
    const result = await withPostgresPrimary(
      'admin.maintenance.backup',
      async () => {
        const { rows } = await pool.query(`
          INSERT INTO backuplogs (backup_name, backup_time, backup_size, backup_type, created_by)
          VALUES ($1, NOW(), $2, $3, $4)
          RETURNING backup_id, backup_name, backup_time, backup_size, backup_type, created_by
        `, [backupName, 'Generated on demand', 'Manual Snapshot', createdBy]);
        return rows[0];
      },
      async () => {
        const { data, error } = await supabase
          .from('backuplogs')
          .insert([{
            backup_name: backupName,
            backup_time: new Date().toISOString(),
            backup_size: 'Generated on demand',
            backup_type: 'Manual Snapshot',
            created_by: createdBy,
          }])
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    );

    await writeSystemLog(`[backup] ${backupName} created.`, { userId: createdBy, role: 'Admin' });
    return res.json({ success: true, data: mapBackupRow(result) });
  } catch (error) {
    await logRequestError(req, 'admin.maintenance.backup', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/admin/maintenance/logs', async (req, res) => {
  try {
    await withPostgresPrimary(
      'admin.maintenance.clearLogs',
      async () => {
        await pool.query('DELETE FROM system_logs');
      },
      async () => {
        const { error } = await supabase.from('system_logs').delete().neq('log_id', 0);
        if (error) throw error;
      }
    );

    return res.json({ success: true, message: 'System logs cleared.' });
  } catch (error) {
    await logRequestError(req, 'admin.maintenance.clearLogs', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/close-day-summary', async (req, res) => {
  const date = normalizeDateInput(req.query.date);
  const nextDate = addOneDay(date);

  try {
    const result = await withPostgresPrimary(
      'admin.closeDay.summary',
      async () => {
        const [summaryResult, transactionsResult] = await Promise.all([
          pool.query(`
            SELECT COALESCE(SUM(amount_paid), 0) AS total
            FROM payment
            WHERE payment_date >= $1::date
              AND payment_date < $2::date
              AND LOWER(COALESCE(status, 'pending')) <> 'rejected'
          `, [date, nextDate]),
          pool.query(`
            SELECT
              p.or_number,
              p.payment_date,
              a.username AS cashier,
              c.account_number,
              CONCAT(c.first_name, ' ', c.last_name) AS consumer,
              p.amount_paid,
              COALESCE(b.billing_month, p.payment_method, 'Payment') AS notes
            FROM payment p
            LEFT JOIN consumer c ON c.consumer_id = p.consumer_id
            LEFT JOIN bills b ON b.bill_id = p.bill_id
            LEFT JOIN accounts a ON a.account_id = p.validated_by
            WHERE p.payment_date >= $1::date
              AND p.payment_date < $2::date
              AND LOWER(COALESCE(p.status, 'pending')) <> 'rejected'
            ORDER BY p.payment_date DESC, p.payment_id DESC
          `, [date, nextDate]),
        ]);

        const systemTotal = Number(summaryResult.rows[0]?.total || 0);
        return {
          success: true,
          data: {
            date,
            systemTotal,
            cashOnHand: systemTotal,
            discrepancy: 0,
            transactions: transactionsResult.rows.map((row) => ({
              orNumber: row.or_number || 'Pending OR',
              time: row.payment_date ? new Date(row.payment_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'N/A',
              cashier: row.cashier || 'System',
              accountNumber: row.account_number || 'N/A',
              consumer: row.consumer || 'Unknown Consumer',
              amount: Number(row.amount_paid || 0),
              notes: row.notes || 'Payment',
            })),
          },
        };
      },
      async () => {
        const [paymentsResult, billsResult, consumerResult, accountsResult] = await Promise.all([
          supabase.from('payment').select('payment_id, payment_date, amount_paid, or_number, payment_method, bill_id, consumer_id, validated_by, status').order('payment_date', { ascending: false }),
          supabase.from('bills').select('bill_id, billing_month'),
          supabase.from('consumer').select('consumer_id, first_name, last_name, account_number'),
          supabase.from('accounts').select('account_id, username'),
        ]);

        if (paymentsResult.error) throw paymentsResult.error;
        if (billsResult.error) throw billsResult.error;
        if (consumerResult.error) throw consumerResult.error;
        if (accountsResult.error) throw accountsResult.error;

        const billMap = new Map((billsResult.data || []).map((bill) => [bill.bill_id, bill]));
        const consumerMap = new Map((consumerResult.data || []).map((consumer) => [consumer.consumer_id, consumer]));
        const accountMap = new Map((accountsResult.data || []).map((account) => [account.account_id, account.username]));

        const transactions = (paymentsResult.data || []).filter((payment) => {
          const paymentDate = normalizeDateInput(payment.payment_date, date);
          return paymentDate >= date && paymentDate < nextDate && String(payment.status || 'pending').toLowerCase() !== 'rejected';
        }).map((payment) => {
          const consumer = consumerMap.get(payment.consumer_id);
          const bill = billMap.get(payment.bill_id);
          return {
            orNumber: payment.or_number || 'Pending OR',
            time: payment.payment_date ? new Date(payment.payment_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'N/A',
            cashier: accountMap.get(payment.validated_by) || 'System',
            accountNumber: consumer?.account_number || 'N/A',
            consumer: [consumer?.first_name, consumer?.last_name].filter(Boolean).join(' ') || 'Unknown Consumer',
            amount: Number(payment.amount_paid || 0),
            notes: bill?.billing_month || payment.payment_method || 'Payment',
          };
        });

        const systemTotal = transactions.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
        return {
          success: true,
          data: {
            date,
            systemTotal,
            cashOnHand: systemTotal,
            discrepancy: 0,
            transactions,
          },
        };
      }
    );

    return res.json(result);
  } catch (error) {
    await logRequestError(req, 'admin.closeDay.summary', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/close-day', async (req, res) => {
  const date = normalizeDateInput(req.body?.date);
  const cashOnHand = Number(req.body?.cashOnHand || 0);
  const systemTotal = Number(req.body?.systemTotal || 0);
  const discrepancy = Number((systemTotal - cashOnHand).toFixed(2));
  const userId = Number(req.body?.userId || defaultSystemLogAccountId);

  try {
    const action = `[close-day] ${date} closed. System total: PHP ${formatCurrencyAmount(systemTotal)}. Cash on hand: PHP ${formatCurrencyAmount(cashOnHand)}. Variance: PHP ${formatCurrencyAmount(discrepancy)}.`;
    await writeSystemLog(action, { userId, role: 'Admin' });
    return res.json({
      success: true,
      message: 'Close day record logged successfully.',
      data: { date, systemTotal, cashOnHand, discrepancy },
    });
  } catch (error) {
    await logRequestError(req, 'admin.closeDay.lock', error);
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
    isPostgresAvailable = true;
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

