const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const pg = require('pg');
const { Pool } = pg;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
require('dotenv').config({
  path: path.join(__dirname, '.env'),
  override: true,
});

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Keep date/timestamp fields as raw strings to avoid timezone drift during JS Date parsing.
pg.types.setTypeParser(1082, (value) => value); // DATE
pg.types.setTypeParser(1114, (value) => value); // TIMESTAMP WITHOUT TIME ZONE

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
      password: process.env.DB_PASSWORD || undefined,
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
const backendBuildMarker = '2026-05-04-google-consumer-address-fix-v2';
console.log(`[BACKEND] Build marker: ${backendBuildMarker}`);
const smsProvider = String(process.env.SMS_PROVIDER || 'mock').trim().toLowerCase();
const hasSemaphoreApiKey = Boolean(String(process.env.SMS_SEMAPHORE_API_KEY || '').trim());
if (smsProvider === 'semaphore' && !hasSemaphoreApiKey) {
  console.warn('[SMS] Provider is set to semaphore but SMS_SEMAPHORE_API_KEY is missing.');
} else {
  console.log(`[SMS] Provider: ${smsProvider}${smsProvider === 'semaphore' ? ' (real sending enabled)' : ' (mock mode)'}`);
}
const defaultAdminSettings = {
  systemName: 'San Lorenzo Ruiz Water Billing System',
  currency: 'PHP',
  dueDateDays: '15',
  lateFee: '10.0',
};
const primaryZoneCoverageTable = 'zone_coverage';
const legacyZoneCoverageTables = ['zone_barangay_map', 'zone_coverage_config'];
const zoneCoverageTableCandidates = [primaryZoneCoverageTable, ...legacyZoneCoverageTables];
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
  { tableName: 'admin_settings', primaryKey: 'settings_id', syncWithSupabase: false },
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
  { tableName: 'account_review_log', primaryKey: 'review_id' },
  { tableName: 'error_logs', primaryKey: 'error_id', syncWithSupabase: false },
  { tableName: 'system_logs', primaryKey: 'log_id', syncWithSupabase: false },
  { tableName: 'backuplogs', primaryKey: 'backup_id' },
  { tableName: 'waterrates', primaryKey: 'rate_id' },
  { tableName: 'consumer_concerns', primaryKey: 'concern_id' },
];

const syncTableColumns = {
  roles: ['role_id', 'role_name'],
  zone: ['zone_id', 'zone_name'],
  classification: ['classification_id', 'classification_name'],
  admin_settings: ['settings_id', 'system_name', 'currency', 'due_date_days', 'late_fee', 'modified_by', 'modified_date'],
  accounts: ['account_id', 'username', 'password', 'full_name', 'email', 'role_id', 'account_status', 'created_at', 'auth_user_id', 'profile_picture_url'],
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
  account_review_log: [
    'review_id',
    'account_id',
    'reviewed_by',
    'review_status',
    'review_date',
    'remarks',
  ],
  waterrates: [
    'rate_id',
    'classification_id',
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
  consumer_concerns: [
    'concern_id',
    'consumer_id',
    'account_id',
    'category',
    'subject',
    'description',
    'status',
    'priority',
    'created_at',
    'resolved_at',
    'resolved_by',
    'remarks',
    'full_name',
    'barangay',
    'contact_number',
  ],
};

const syncConflictPolicies = {
  roles: { mode: 'auto-merge' },
  zone: { mode: 'auto-merge' },
  classification: { mode: 'auto-merge' },
  admin_settings: { mode: 'auto-merge' },
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
    mode: 'auto-merge',
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
    mode: 'auto-merge',
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
    mode: 'auto-merge',
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

async function ensureWaterRatesEffectiveDateColumnIsDate() {
  const result = await pool.query(
    `SELECT data_type
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name = 'waterrates'
       AND column_name = 'effective_date'
     LIMIT 1`,
    [supabaseSchema]
  );

  const currentType = String(result.rows[0]?.data_type || '').toLowerCase();
  if (!currentType || currentType === 'date') {
    return;
  }

  await pool.query(`
    ALTER TABLE waterrates
    ALTER COLUMN effective_date TYPE DATE
    USING DATE(effective_date)
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

function extractMissingSupabaseColumnError(message, expectedTableName) {
  const normalizedMessage = String(message || '');
  const match = normalizedMessage.match(/Could not find the '([^']+)' column of '([^']+)'/i);
  if (!match) {
    return null;
  }

  const columnName = String(match[1] || '').trim();
  const tableName = String(match[2] || '').trim();
  if (!columnName || !tableName) {
    return null;
  }

  if (expectedTableName && tableName.toLowerCase() !== String(expectedTableName).toLowerCase()) {
    return null;
  }

  return {
    columnName,
    tableName,
  };
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
  const accountId = Number(options.accountId ?? options.userId ?? defaultSystemLogAccountId);
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

  const message = String(error?.message || '').toLowerCase();
  if (message.includes('permission')) {
    return 403;
  }

  if (message.includes('not found')) {
    return 404;
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

  if (loweredMessage.includes('profile picture must be a valid')) {
    return 'Profile picture must be a valid PNG, JPG, WEBP, or GIF image.';
  }

  if (loweredMessage.includes('profile picture is too large')) {
    return 'Profile picture is too large. Please upload a smaller image.';
  }

  if (loweredMessage.includes('you do not have permission to update this profile picture')) {
    return 'You do not have permission to update this profile picture.';
  }

  if (loweredMessage.includes('user not found')) {
    return 'User not found.';
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

function getManilaYearMonthPrefix(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: '2-digit',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  return `${year}${month}`;
}

async function generateSequentialRegistrationTicketNumber(options = {}) {
  const { pgClient = null, useSupabase = false } = options;
  const prefix = getManilaYearMonthPrefix();

  if (pgClient) {
    await pgClient.query('LOCK TABLE connection_ticket IN SHARE ROW EXCLUSIVE MODE');
    const { rows } = await pgClient.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 5 FOR 6) AS INTEGER)), 0) AS max_sequence
       FROM connection_ticket
       WHERE ticket_number ~ '^[0-9]{10}$'
         AND SUBSTRING(ticket_number FROM 1 FOR 4) = $1`,
      [prefix]
    );
    const nextSequence = Number(rows?.[0]?.max_sequence || 0) + 1;
    return `${prefix}${String(nextSequence).padStart(6, '0')}`;
  }

  if (useSupabase && supabase) {
    const { data, error } = await supabase
      .from('connection_ticket')
      .select('ticket_number')
      .like('ticket_number', `${prefix}%`)
      .order('ticket_number', { ascending: false })
      .limit(200);
    if (error) throw error;

    const maxSequence = (data || []).reduce((max, row) => {
      const ticketNumber = String(row?.ticket_number || '').trim();
      if (!/^\d{10}$/.test(ticketNumber)) {
        return max;
      }
      if (!ticketNumber.startsWith(prefix)) {
        return max;
      }
      const sequence = Number(ticketNumber.slice(4));
      return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
    }, 0);

    return `${prefix}${String(maxSequence + 1).padStart(6, '0')}`;
  }

  return generateRegistrationTicketNumber();
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

function readLegacyAdminSettings() {
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

function writeLegacyAdminSettings(settings) {
  const nextSettings = { ...defaultAdminSettings, ...(settings || {}) };
  fs.mkdirSync(path.dirname(adminSettingsFile), { recursive: true });
  fs.writeFileSync(adminSettingsFile, JSON.stringify(nextSettings, null, 2), 'utf8');
  return nextSettings;
}

function mapAdminSettingsRow(row) {
  if (!row) {
    return { ...defaultAdminSettings };
  }

  return {
    systemName: String(row.system_name ?? row.systemName ?? defaultAdminSettings.systemName),
    currency: String(row.currency ?? defaultAdminSettings.currency),
    dueDateDays: String(row.due_date_days ?? row.dueDateDays ?? defaultAdminSettings.dueDateDays),
    lateFee: String(row.late_fee ?? row.lateFee ?? defaultAdminSettings.lateFee),
    modifiedBy: row.modified_by ?? row.modifiedBy ?? null,
  };
}

const PROFILE_PICTURE_ALLOWED_ROLES = new Set([1, 2, 3, 4, 5]);
const PROFILE_PICTURE_DATA_URL_PATTERN = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
const MAX_PROFILE_PICTURE_LENGTH = 1_600_000;

function normalizeProfilePictureUrl(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  if (!PROFILE_PICTURE_DATA_URL_PATTERN.test(normalized)) {
    throw new Error('Profile picture must be a valid PNG, JPG, WEBP, or GIF image.');
  }

  if (normalized.length > MAX_PROFILE_PICTURE_LENGTH) {
    throw new Error('Profile picture is too large. Please upload a smaller image.');
  }

  return normalized;
}

function normalizeRequirementSubmission(value, options = {}) {
  const { allowText = true } = options;

  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  if (PROFILE_PICTURE_DATA_URL_PATTERN.test(normalized)) {
    if (normalized.length > MAX_PROFILE_PICTURE_LENGTH) {
      throw new Error('Uploaded requirement image is too large. Please upload a smaller image.');
    }
    return normalized;
  }

  if (allowText) {
    return normalized;
  }

  throw new Error('Sedula must be uploaded as a valid PNG, JPG, WEBP, or GIF image.');
}

function canManageProfilePicture(actorAccountId, actorRoleId, targetAccountId, targetRoleId) {
  if (!Number.isInteger(actorAccountId) || actorAccountId <= 0) {
    return false;
  }

  if (!Number.isInteger(actorRoleId) || actorRoleId <= 0) {
    return false;
  }

  if (!Number.isInteger(targetAccountId) || targetAccountId <= 0) {
    return false;
  }

  if (!Number.isInteger(targetRoleId) || targetRoleId <= 0) {
    return false;
  }

  if (!PROFILE_PICTURE_ALLOWED_ROLES.has(targetRoleId)) {
    return false;
  }

  if (actorAccountId === targetAccountId && PROFILE_PICTURE_ALLOWED_ROLES.has(actorRoleId)) {
    return true;
  }

  return actorRoleId === 1 && PROFILE_PICTURE_ALLOWED_ROLES.has(targetRoleId);
}

function normalizeAdminSettingsInput(settings, options = {}) {
  const merged = { ...defaultAdminSettings, ...(settings || {}) };
  const dueDateDays = Number(merged.dueDateDays);
  const lateFee = Number(merged.lateFee);
  const modifiedBy = Number(merged.modifiedBy ?? options.modifiedBy);

  return {
    settings_id: 1,
    system_name: String(merged.systemName || defaultAdminSettings.systemName).trim() || defaultAdminSettings.systemName,
    currency: String(merged.currency || defaultAdminSettings.currency).trim() || defaultAdminSettings.currency,
    due_date_days: Number.isFinite(dueDateDays) ? dueDateDays : Number(defaultAdminSettings.dueDateDays),
    late_fee: Number.isFinite(lateFee) ? lateFee : Number(defaultAdminSettings.lateFee),
    modified_by: Number.isInteger(modifiedBy) && modifiedBy > 0 ? modifiedBy : null,
    modified_date: new Date().toISOString(),
  };
}

function isMissingAdminSettingsStorageError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return code === '42P01'
    || code === 'PGRST205'
    || (message.includes('admin_settings') && (
      message.includes('does not exist')
      || message.includes('schema cache')
      || message.includes('find the table')
      || message.includes('undefined table')
    ));
}

function isMissingSupabaseTableError(error, tableNames = []) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const tableHints = tableNames
    .map((tableName) => String(tableName || '').toLowerCase())
    .filter(Boolean);

  if (code === '42P01' || code === 'PGRST205') {
    return true;
  }

  if (!message) {
    return false;
  }

  if (message.includes('schema cache') || message.includes('find the table') || message.includes('does not exist')) {
    if (!tableHints.length) {
      return true;
    }
    return tableHints.some((hint) => message.includes(hint));
  }

  return false;
}

async function saveAdminSettingsToPostgres(settings, executor = pool) {
  const payload = normalizeAdminSettingsInput(settings);
  const { rows } = await executor.query(`
    INSERT INTO admin_settings (
      settings_id,
      system_name,
      currency,
      due_date_days,
      late_fee,
      modified_by,
      modified_date
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (settings_id) DO UPDATE
    SET system_name = EXCLUDED.system_name,
        currency = EXCLUDED.currency,
        due_date_days = EXCLUDED.due_date_days,
        late_fee = EXCLUDED.late_fee,
        modified_by = EXCLUDED.modified_by,
        modified_date = EXCLUDED.modified_date
    RETURNING settings_id, system_name, currency, due_date_days, late_fee, modified_by, modified_date
  `, [
    payload.settings_id,
    payload.system_name,
    payload.currency,
    payload.due_date_days,
    payload.late_fee,
    payload.modified_by,
    payload.modified_date,
  ]);
  return mapAdminSettingsRow(rows[0] || null);
}

async function loadAdminSettingsFromPostgres(executor = pool) {
  const { rows } = await executor.query(`
    SELECT settings_id, system_name, currency, due_date_days, late_fee, modified_by, modified_date
    FROM admin_settings
    WHERE settings_id = 1
    LIMIT 1
  `);
  if (rows[0]) {
    return mapAdminSettingsRow(rows[0]);
  }

  return saveAdminSettingsToPostgres({ ...readLegacyAdminSettings(), modifiedBy: null }, executor);
}

async function saveAdminSettingsToSupabase(settings) {
  const payload = normalizeAdminSettingsInput(settings);
  const { data, error } = await supabase
    .from('admin_settings')
    .upsert([payload], { onConflict: 'settings_id' })
    .select('settings_id, system_name, currency, due_date_days, late_fee, modified_by, modified_date')
    .single();
  if (error) throw error;
  return mapAdminSettingsRow(data || null);
}

async function loadAdminSettingsFromSupabase() {
  const { data, error } = await supabase
    .from('admin_settings')
    .select('settings_id, system_name, currency, due_date_days, late_fee, modified_by, modified_date')
    .eq('settings_id', 1)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    return mapAdminSettingsRow(data);
  }

  return saveAdminSettingsToSupabase({ ...readLegacyAdminSettings(), modifiedBy: null });
}

async function loadResolvedAdminSettings() {
  return withPostgresPrimary(
    'admin.settings.data',
    async () => loadAdminSettingsFromPostgres(),
    async () => {
      try {
        return await loadAdminSettingsFromSupabase();
      } catch (error) {
        if (isMissingAdminSettingsStorageError(error)) {
          return readLegacyAdminSettings();
        }
        throw error;
      }
    }
  );
}

async function saveResolvedAdminSettings(settings) {
  const normalized = { ...settings };
  const legacyMirror = writeLegacyAdminSettings(normalized);
  return withPostgresPrimary(
    'admin.settings.saveData',
    async () => saveAdminSettingsToPostgres(normalized),
    async () => {
      try {
        return await saveAdminSettingsToSupabase(normalized);
      } catch (error) {
        if (isMissingAdminSettingsStorageError(error)) {
          return legacyMirror;
        }
        throw error;
      }
    }
  );
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

function applyBillPenaltySnapshot(bill, settings = defaultAdminSettings, referenceDate = new Date()) {
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
  return /^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+(-[A-Z0-9]+)?$/i.test(String(accountNumber || '').trim());
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

const PASSWORD_HASH_PREFIX = 'scrypt';
const PASSWORD_RESET_EXPIRATION_MINUTES = Number(process.env.PASSWORD_RESET_EXPIRATION_MINUTES || 10);

function validatePasswordStrength(password, fieldLabel = 'Password') {
  const normalizedPassword = String(password || '');
  if (normalizedPassword.length < 8) {
    throw createHttpError(`${fieldLabel} must be at least 8 characters long.`);
  }

  return normalizedPassword;
}

function hashPassword(password) {
  const normalizedPassword = validatePasswordStrength(password);
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(normalizedPassword, salt, 64).toString('hex');
  return `${PASSWORD_HASH_PREFIX}$${salt}$${derivedKey}`;
}

function isPasswordHash(value) {
  return typeof value === 'string' && value.startsWith(`${PASSWORD_HASH_PREFIX}$`);
}

function verifyPassword(password, storedPassword) {
  const normalizedPassword = String(password || '');
  const normalizedStoredPassword = String(storedPassword || '');

  if (!normalizedStoredPassword) {
    return false;
  }

  if (!isPasswordHash(normalizedStoredPassword)) {
    return normalizedPassword === normalizedStoredPassword;
  }

  const [, salt, storedDigest] = normalizedStoredPassword.split('$');
  if (!salt || !storedDigest) {
    return false;
  }

  const computedDigest = crypto.scryptSync(normalizedPassword, salt, 64).toString('hex');
  const left = Buffer.from(computedDigest, 'hex');
  const right = Buffer.from(storedDigest, 'hex');
  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

async function persistAccountPasswordHash(accountId, passwordHash) {
  if (!accountId || !passwordHash) {
    return;
  }

  const updates = [];

  if (isPostgresAvailable) {
    updates.push(
      pool.query('UPDATE accounts SET password = $1 WHERE account_id = $2', [passwordHash, accountId])
        .catch((error) => {
          console.warn(`Failed to persist password hash in PostgreSQL for account ${accountId}: ${error.message}`);
        })
    );
  }

  if (supabase) {
    updates.push(
      supabase.from('accounts').update({ password: passwordHash }).eq('account_id', accountId)
        .then(({ error }) => {
          if (error) {
            throw error;
          }
        })
        .catch((error) => {
          console.warn(`Failed to persist password hash in Supabase for account ${accountId}: ${error.message}`);
        })
    );
  }

  await Promise.all(updates);
}

async function upgradeLegacyAccountPassword(accountId, plaintextPassword) {
  if (!accountId || !plaintextPassword) {
    return null;
  }

  const passwordHash = hashPassword(plaintextPassword);
  await persistAccountPasswordHash(accountId, passwordHash);
  scheduleImmediateSync('password-upgrade');
  return passwordHash;
}

function generatePasswordResetCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function buildPasswordResetExpiration() {
  const expiration = new Date();
  expiration.setMinutes(expiration.getMinutes() + PASSWORD_RESET_EXPIRATION_MINUTES);
  return expiration.toISOString();
}

function parseRequiredWaterRateClassificationId(value) {
  const classificationId = normalizeRequiredForeignKeyId(value);
  if (!classificationId) {
    throw createHttpError('Classification is required for each water rate.');
  }
  return classificationId;
}

function normalizeWaterRateNumericValue(value, label, parser = Number) {
  const parsedValue = parser(value);
  if (!Number.isFinite(parsedValue)) {
    throw createHttpError(`${label} must be a valid number.`);
  }
  return parsedValue;
}

const WATER_RATE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function formatDateInTimeZoneToKey(date, timeZone = 'Asia/Manila') {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw createHttpError('Unable to normalize effective date.', 500);
  }
  return `${year}-${month}-${day}`;
}

function normalizeWaterRateEffectiveDate(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    throw createHttpError('Effective date is required for each water rate.');
  }

  const dateOnlyMatch = rawValue.match(WATER_RATE_DATE_PATTERN);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}`;
  }

  const datePrefixMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (datePrefixMatch) {
    return `${datePrefixMatch[1]}-${datePrefixMatch[2]}-${datePrefixMatch[3]}`;
  }

  const parsedDate = new Date(rawValue);
  if (Number.isNaN(parsedDate.getTime())) {
    throw createHttpError('Effective date must be a valid date.');
  }

  // Use Asia/Manila business timezone to avoid UTC day rollbacks.
  return formatDateInTimeZoneToKey(parsedDate, 'Asia/Manila');
}

function getTodayDateKey() {
  return formatDateInTimeZoneToKey(new Date(), 'Asia/Manila');
}

function assertWaterRateDateIsNotPast(effectiveDate, actionLabel = 'Water rate') {
  const todayDate = getTodayDateKey();
  if (String(effectiveDate) < todayDate) {
    throw createHttpError(`${actionLabel} cannot use a past effective date.`);
  }
}

function normalizeWaterRateQueryDate(value, fallbackDateKey = getTodayDateKey()) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return fallbackDateKey;
  }
  return normalizeWaterRateEffectiveDate(rawValue);
}

function normalizeWaterRateRowForResponse(row) {
  if (!row) return row;
  const rawEffectiveDate = row.effective_date;
  let normalizedEffectiveDate = '';
  if (rawEffectiveDate !== undefined && rawEffectiveDate !== null && String(rawEffectiveDate).trim()) {
    try {
      normalizedEffectiveDate = normalizeWaterRateEffectiveDate(rawEffectiveDate);
    } catch (error) {
      normalizedEffectiveDate = String(rawEffectiveDate);
    }
  }
  return {
    ...row,
    effective_date: normalizedEffectiveDate,
  };
}

function computeWaterChargeFromRate(consumption, rate) {
  const normalizedConsumption = Number(consumption);
  if (!Number.isFinite(normalizedConsumption) || normalizedConsumption < 0) {
    return 0;
  }

  if (!rate) {
    throw createHttpError('No active water rate is configured for this consumer classification.');
  }

  const minimumCubic = Number(rate.minimum_cubic || 0);
  const minimumRate = Number(rate.minimum_rate || 0);
  const excessRate = Number(rate.excess_rate_per_cubic || 0);

  if (normalizedConsumption <= minimumCubic) {
    return minimumRate;
  }

  return minimumRate + ((normalizedConsumption - minimumCubic) * excessRate);
}

async function validateClassificationExists(classificationId) {
  const normalizedClassificationId = normalizeRequiredForeignKeyId(classificationId);
  if (!normalizedClassificationId) {
    throw createHttpError('Classification is required for each water rate.');
  }

  const result = await withPostgresPrimary(
    'waterRates.validateClassification',
    async () => {
      const { rows } = await pool.query(
        'SELECT classification_id, classification_name FROM classification WHERE classification_id = $1 LIMIT 1',
        [normalizedClassificationId]
      );
      return rows[0] || null;
    },
    async () => {
      const { data, error } = await supabase
        .from('classification')
        .select('classification_id, classification_name')
        .eq('classification_id', normalizedClassificationId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    }
  );

  if (!result) {
    throw createHttpError('Selected classification is invalid.');
  }

  return result;
}

async function mirrorWaterRateRowToSupabase(row) {
  if (!supabase || !row) return;
  const payload = {
    rate_id: Number(row.rate_id),
    classification_id: Number(row.classification_id),
    minimum_cubic: Number(row.minimum_cubic),
    minimum_rate: Number(row.minimum_rate),
    excess_rate_per_cubic: Number(row.excess_rate_per_cubic),
    effective_date: normalizeWaterRateEffectiveDate(row.effective_date),
    modified_by: normalizeRequiredForeignKeyId(row.modified_by) || null,
    modified_date: row.modified_date || new Date().toISOString(),
  };
  const { error } = await supabase
    .from('waterrates')
    .upsert([payload], { onConflict: 'rate_id' });
  if (error) throw error;
}

async function mirrorWaterRateDeleteToSupabase(rateId) {
  if (!supabase) return;
  const { error } = await supabase
    .from('waterrates')
    .delete()
    .eq('rate_id', Number(rateId));
  if (error) throw error;
}

async function resolveConsumerClassificationId(consumerId) {
  const normalizedConsumerId = normalizeRequiredForeignKeyId(consumerId);
  if (!normalizedConsumerId) {
    throw createHttpError('A consumer must be selected before saving a bill.');
  }

  const result = await withPostgresPrimary(
    'waterRates.resolveConsumerClassification',
    async () => {
      const { rows } = await pool.query(
        'SELECT classification_id FROM consumer WHERE consumer_id = $1 LIMIT 1',
        [normalizedConsumerId]
      );
      return rows[0] || null;
    },
    async () => {
      const { data, error } = await supabase
        .from('consumer')
        .select('classification_id')
        .eq('consumer_id', normalizedConsumerId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    }
  );

  const classificationId = normalizeRequiredForeignKeyId(result?.classification_id);
  if (!classificationId) {
    throw createHttpError('The selected consumer has no classification assigned.');
  }

  return classificationId;
}

async function resolveApplicableWaterRate(classificationId, effectiveOn = getTodayDateKey()) {
  const normalizedClassificationId = normalizeRequiredForeignKeyId(classificationId);
  if (!normalizedClassificationId) {
    throw createHttpError('Classification is required to resolve the water rate.');
  }

  const effectiveDate = normalizeWaterRateQueryDate(effectiveOn, getTodayDateKey());
  const rate = await withPostgresPrimary(
    'waterRates.resolveApplicable',
    async () => {
      const { rows } = await pool.query(`
        SELECT
          wr.rate_id,
          wr.classification_id,
          cl.classification_name,
          wr.minimum_cubic,
          wr.minimum_rate,
          wr.excess_rate_per_cubic,
          DATE(wr.effective_date) AS effective_date,
          wr.modified_by,
          wr.modified_date
        FROM waterrates wr
        JOIN classification cl ON cl.classification_id = wr.classification_id
        WHERE wr.classification_id = $1
          AND DATE(wr.effective_date) <= $2::date
        ORDER BY DATE(wr.effective_date) DESC, wr.rate_id DESC
        LIMIT 1
      `, [normalizedClassificationId, effectiveDate]);
      return rows[0] || null;
    },
    async () => {
      const [rateResult, classificationResult] = await Promise.all([
        supabase
          .from('waterrates')
          .select('rate_id, classification_id, minimum_cubic, minimum_rate, excess_rate_per_cubic, effective_date, modified_by, modified_date')
          .eq('classification_id', normalizedClassificationId)
          .lte('effective_date', effectiveDate)
          .order('effective_date', { ascending: false })
          .order('rate_id', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('classification')
          .select('classification_name')
          .eq('classification_id', normalizedClassificationId)
          .maybeSingle(),
      ]);

      if (rateResult.error) throw rateResult.error;
      if (classificationResult.error) throw classificationResult.error;
      if (!rateResult.data) {
        return null;
      }

      return normalizeWaterRateRowForResponse({
        ...rateResult.data,
        classification_name: classificationResult.data?.classification_name || null,
      });
    }
  );

  return normalizeWaterRateRowForResponse(rate) || null;
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

function extractTaggedRemark(remarks, tag) {
  const normalizedTag = String(tag || '').trim().toLowerCase();
  if (!normalizedTag) return null;
  const lines = String(remarks || '')
    .split(/\r?\n/)
    .map((line) => String(line || '').trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (!match) continue;
    if (String(match[1] || '').trim().toLowerCase() !== normalizedTag) continue;
    const value = String(match[2] || '').trim();
    return value || null;
  }

  return null;
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

function stripActionTags(action) {
  let cleaned = String(action || '').trim();
  while (/^\[[^\]]+\]\s*/.test(cleaned)) {
    cleaned = cleaned.replace(/^\[[^\]]+\]\s*/, '').trim();
  }
  return cleaned;
}

function isTechnicalSystemAction(action) {
  const normalized = String(action || '').trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (
    normalized.startsWith('[postgres]') ||
    normalized.startsWith('[supabase]') ||
    normalized.startsWith('[request]') ||
    normalized.startsWith('[sync]')
  ) {
    return true;
  }

  return (
    normalized.includes('starting supabase to postgresql sync cycle') ||
    normalized.includes('starting postgresql to supabase sync cycle') ||
    normalized.includes('supabase pull cycle complete') ||
    normalized.includes('sync cycle complete') ||
    normalized.includes('preparing sync for table') ||
    normalized.includes('no rows to sync') ||
    normalized.includes('no rows pulled from supabase') ||
    normalized.includes('pulled ') && normalized.includes('from supabase') ||
    normalized.includes('held for review')
  );
}

function mapDashboardActivityLogRow(row) {
  const action = String(row?.action || '').trim();
  const normalized = action.toLowerCase();

  let category = 'General';
  if (normalized.includes('[applications.')) {
    category = 'Applications';
  } else if (normalized.includes('[water-rates.')) {
    category = 'Water Rates';
  } else if (normalized.includes('[profile')) {
    category = 'Profile';
  } else if (normalized.includes('[password.')) {
    category = 'Security';
  } else if (normalized.includes('[admin-settings]')) {
    category = 'Settings';
  } else if (normalized.includes('[consumer.reconnectionrequest]') || normalized.includes('[consumers.disconnect]')) {
    category = 'Consumer Accounts';
  } else if (normalized.includes('[close-day]')) {
    category = 'Billing';
  } else if (normalized.includes('[backup]')) {
    category = 'Backup';
  } else if (normalized.includes('[auth]')) {
    category = 'Authentication';
  } else if (normalized.includes('[public-contact]')) {
    category = 'Public Concerns';
  }

  return {
    id: row.log_id ?? row.id,
    timestamp: row.timestamp,
    category,
    operator: row.username || row.operator || `Account #${row.account_id ?? 'System'}`,
    description: stripActionTags(action) || action || 'Activity recorded.',
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
    email: row.email || null,
    auth_user_id: row.auth_user_id,
    profile_picture_url: row.profile_picture_url || null,
    full_name: row.full_name || row.username,
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
    .select('*, roles ( role_name )')
    .eq('username', username)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return mapSupabaseAccountRow(data);
}

async function findPostgresAccountByUsername(username) {
  const { rows } = await pool.query(`
    SELECT a.account_id, a.username, a.password, a.email, a.auth_user_id, a.profile_picture_url, COALESCE(NULLIF(a.full_name, ''), a.username) AS full_name, a.role_id, a.account_status, r.role_name
    FROM accounts a
    JOIN roles r ON a.role_id = r.role_id
    WHERE a.username = $1
  `, [username]);

  return rows[0] || null;
}

async function findAccountByEmail(email) {
  if (!email) return null;
  const normalizedEmail = String(email).trim().toLowerCase();

  return await withPostgresPrimary(
    'auth.findByEmail',
    async () => {
      const { rows } = await pool.query(`
        SELECT a.account_id, a.username, a.password, a.email, a.auth_user_id, a.profile_picture_url, COALESCE(NULLIF(a.full_name, ''), a.username) AS full_name, a.role_id, a.account_status, r.role_name
        FROM accounts a
        JOIN roles r ON a.role_id = r.role_id
        WHERE LOWER(TRIM(a.email)) = $1
        LIMIT 1
      `, [normalizedEmail]);
      return rows[0] || null;
    },
    async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*, roles ( role_name )')
        .ilike('email', normalizedEmail)
        .maybeSingle();
      if (error) throw error;
      return mapSupabaseAccountRow(data);
    }
  );
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

async function syncAccountAuthCredentials({ accountId, username, password, authUserId }) {
  if (!supabase?.auth?.admin || !accountId || !username) {
    return authUserId || null;
  }

  const effectiveAuthUserId = authUserId || await ensureAccountAuthUser({
    accountId,
    username,
    password,
    authUserId,
  });

  if (!effectiveAuthUserId) {
    return null;
  }

  const updatePayload = {
    email: buildSupabaseAuthEmail(username),
    user_metadata: {
      account_id: accountId,
      username,
    },
  };

  if (password) {
    updatePayload.password = password;
  }

  try {
    const { error } = await supabase.auth.admin.updateUserById(effectiveAuthUserId, updatePayload);
    if (error) {
      throw error;
    }
  } catch (error) {
    console.warn(`Supabase auth credential sync failed for account ${accountId}: ${error.message}`);
  }

  return effectiveAuthUserId;
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

async function generateAvailableUsername(baseUsername) {
  const cleanedBase = String(baseUsername || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 24) || 'googleuser';

  let candidate = cleanedBase;
  let counter = 0;
  while (await isUsernameTaken(candidate)) {
    counter += 1;
    if (counter > 9999) {
      candidate = `googleuser${Date.now().toString().slice(-6)}`;
      if (!(await isUsernameTaken(candidate))) {
        return candidate;
      }
      continue;
    }
    candidate = `${cleanedBase}${String(counter).padStart(3, '0')}`;
  }

  return candidate;
}

function isAccountsUsernameDuplicateError(error) {
  const code = String(error?.code || '').trim();
  const constraint = String(error?.constraint || '').trim();
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  return (
    code === '23505' &&
    (
      constraint === 'accounts_username_key' ||
      message.includes('accounts_username_key') ||
      details.includes('(username)=') ||
      message.includes('duplicate key value')
    )
  );
}

function splitPersonName(fullName, fallback = 'Consumer') {
  const normalized = String(fullName || '').trim();
  const fallbackName = String(fallback || 'Consumer').trim() || 'Consumer';
  const source = normalized || fallbackName;
  const parts = source.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: 'Consumer', lastName: 'User' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

async function ensureConsumerProfileForAccount(accountId, fullName = '', contactNumber = null) {
  const normalizedAccountId = normalizeRequiredForeignKeyId(accountId);
  if (!normalizedAccountId) {
    return null;
  }

  const defaults = {
    municipality: 'San Lorenzo Ruiz',
    zipCode: '4610',
    barangay: 'Not Specified',
    purok: 'Not Specified',
  };
  const address = [defaults.purok, defaults.barangay, defaults.municipality, defaults.zipCode].join(', ');
  const { firstName, lastName } = splitPersonName(fullName, 'Consumer');

  return withPostgresPrimary(
    'auth.google.ensureConsumerProfile',
    async () => {
      const existing = await pool.query(
        'SELECT consumer_id FROM consumer WHERE login_id = $1 LIMIT 1',
        [normalizedAccountId]
      );
      if (existing.rows[0]?.consumer_id) {
        return Number(existing.rows[0].consumer_id);
      }

      try {
        const inserted = await pool.query(
          `INSERT INTO consumer
            (first_name, last_name, login_id, status, address, purok, barangay, municipality, zip_code, contact_number)
           VALUES ($1, $2, $3, 'Pending', $4, $5, $6, $7, $8, $9)
           RETURNING consumer_id`,
          [firstName, lastName, normalizedAccountId, address, defaults.purok, defaults.barangay, defaults.municipality, defaults.zipCode, contactNumber]
        );
        return Number(inserted.rows[0]?.consumer_id || 0) || null;
      } catch (error) {
        if (String(error?.code || '') === '23505') {
          const retry = await pool.query(
            'SELECT consumer_id FROM consumer WHERE login_id = $1 LIMIT 1',
            [normalizedAccountId]
          );
          return Number(retry.rows[0]?.consumer_id || 0) || null;
        }
        throw error;
      }
    },
    async () => {
      if (!supabase) return null;

      const { data: existing, error: existingError } = await supabase
        .from('consumer')
        .select('consumer_id')
        .eq('login_id', normalizedAccountId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing?.consumer_id) {
        return Number(existing.consumer_id);
      }

      const { data: inserted, error: insertError } = await supabase
        .from('consumer')
        .insert([{
          first_name: firstName,
          last_name: lastName,
          login_id: normalizedAccountId,
          status: 'Pending',
          address,
          purok: defaults.purok,
          barangay: defaults.barangay,
          municipality: defaults.municipality,
          zip_code: defaults.zipCode,
          contact_number: contactNumber,
        }])
        .select('consumer_id')
        .maybeSingle();
      if (insertError) throw insertError;
      return Number(inserted?.consumer_id || 0) || null;
    }
  );
}

async function ensureConsumerProfileForConsumerAccount(accountId) {
  const normalizedAccountId = normalizeRequiredForeignKeyId(accountId);
  if (!normalizedAccountId) {
    return null;
  }

  const account = await withPostgresPrimary(
    'auth.google.fetchAccountForConsumerProfile',
    async () => {
      const { rows } = await pool.query(
        `SELECT account_id, role_id, full_name, username, account_status
         FROM accounts
         WHERE account_id = $1
         LIMIT 1`,
        [normalizedAccountId]
      );
      return rows[0] || null;
    },
    async () => {
      if (!supabase) return null;
      const { data, error } = await supabase
        .from('accounts')
        .select('account_id, role_id, full_name, username, account_status')
        .eq('account_id', normalizedAccountId)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    }
  );

  if (!account || Number(account.role_id) !== 5) {
    return null;
  }

  const fallbackName = String(account.full_name || account.username || 'Consumer').trim() || 'Consumer';
  return ensureConsumerProfileForAccount(normalizedAccountId, fallbackName, null);
}

function isUnsetConsumerProfileValue(value) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) {
    return true;
  }

  return ['not specified', 'n/a', 'na', 'none', 'null', 'undefined'].includes(normalized);
}

function collectConsumerProfileMissingFields(consumerProfile) {
  const missing = [];
  if (!consumerProfile || typeof consumerProfile !== 'object') {
    return ['first name', 'last name', 'contact number', 'purok', 'barangay', 'municipality', 'ZIP code'];
  }

  if (isUnsetConsumerProfileValue(consumerProfile.first_name)) missing.push('first name');
  if (isUnsetConsumerProfileValue(consumerProfile.last_name)) missing.push('last name');
  if (isUnsetConsumerProfileValue(consumerProfile.contact_number)) missing.push('contact number');
  if (isUnsetConsumerProfileValue(consumerProfile.purok)) missing.push('purok');
  if (isUnsetConsumerProfileValue(consumerProfile.barangay)) missing.push('barangay');
  if (isUnsetConsumerProfileValue(consumerProfile.municipality)) missing.push('municipality');
  if (isUnsetConsumerProfileValue(consumerProfile.zip_code)) missing.push('ZIP code');

  return missing;
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
    CREATE TABLE IF NOT EXISTS admin_settings (
      settings_id INTEGER PRIMARY KEY,
      system_name VARCHAR(255) NOT NULL,
      currency VARCHAR(20) NOT NULL DEFAULT 'PHP',
      due_date_days INTEGER NOT NULL DEFAULT 15,
      late_fee NUMERIC(8,2) NOT NULL DEFAULT 10.0,
      modified_by INTEGER,
      modified_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_admin_settings_modified_by
        FOREIGN KEY (modified_by) REFERENCES accounts(account_id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
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
    CREATE TABLE IF NOT EXISTS consumer_concerns (
      concern_id SERIAL PRIMARY KEY,
      sync_id UUID DEFAULT gen_random_uuid() NOT NULL,
      consumer_id INTEGER,
      account_id INTEGER NOT NULL,
      category CHARACTER VARYING(50) NOT NULL,
      subject CHARACTER VARYING(255) NOT NULL,
      description TEXT NOT NULL,
      status CHARACTER VARYING(20) DEFAULT 'Pending' NOT NULL,
      priority CHARACTER VARYING(20) DEFAULT 'Normal' NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
      resolved_at TIMESTAMP WITHOUT TIME ZONE,
      resolved_by INTEGER,
      remarks TEXT,
      CONSTRAINT consumer_concerns_status_check CHECK (status IN ('Pending', 'In Progress', 'Resolved', 'Closed', 'Rejected')),
      CONSTRAINT consumer_concerns_priority_check CHECK (priority IN ('Low', 'Normal', 'High', 'Urgent'))
    );
    CREATE INDEX IF NOT EXISTS idx_consumer_concerns_account_id ON consumer_concerns(account_id);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset (
      reset_id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL,
      reset_token VARCHAR(20) NOT NULL,
      expiration_time TIMESTAMP NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'Pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT password_reset_status_check CHECK (status IN ('Pending', 'Used', 'Expired', 'Cancelled'))
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_account_id ON password_reset(account_id);
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

  await ensureTableColumn('accounts', 'profile_picture_url', 'TEXT');
  await ensureTableColumn('accounts', 'full_name', 'TEXT');
  await ensureTableColumn('accounts', 'email', 'VARCHAR(255)');
  await ensureTableColumn('accounts', 'contact_number', 'VARCHAR(20)');
  await pool.query(`
    ALTER TABLE consumer
      ALTER COLUMN address SET DEFAULT 'Not Specified, Not Specified, San Lorenzo Ruiz, 4610',
      ALTER COLUMN purok SET DEFAULT 'Not Specified',
      ALTER COLUMN barangay SET DEFAULT 'Not Specified',
      ALTER COLUMN municipality SET DEFAULT 'San Lorenzo Ruiz',
      ALTER COLUMN zip_code SET DEFAULT '4610';
  `);
  await ensureTableColumn('consumer_concerns', 'full_name', 'VARCHAR(160)');
  await ensureTableColumn('consumer_concerns', 'barangay', 'VARCHAR(120)');
  await ensureTableColumn('consumer_concerns', 'contact_number', 'VARCHAR(20)');
  await ensureTableColumn('waterrates', 'classification_id', 'INTEGER');
  await ensureWaterRatesEffectiveDateColumnIsDate();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${quoteIdentifier(primaryZoneCoverageTable)} (
      config_id SERIAL PRIMARY KEY,
      zone_id INTEGER NOT NULL REFERENCES zone(zone_id) ON UPDATE CASCADE ON DELETE CASCADE,
      barangay VARCHAR(120) NOT NULL,
      purok_count INTEGER NOT NULL DEFAULT 0,
      is_split BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT zone_coverage_unique UNIQUE (zone_id, barangay)
    );
    CREATE INDEX IF NOT EXISTS idx_zone_coverage_zone_id ON ${quoteIdentifier(primaryZoneCoverageTable)}(zone_id);
    CREATE INDEX IF NOT EXISTS idx_zone_coverage_barangay ON ${quoteIdentifier(primaryZoneCoverageTable)}(barangay);
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF to_regclass('zone_barangay_map') IS NOT NULL THEN
        INSERT INTO ${quoteIdentifier(primaryZoneCoverageTable)} (zone_id, barangay, purok_count, is_split, created_at, updated_at)
        SELECT zone_id, barangay, purok_count, is_split, COALESCE(created_at, NOW()), COALESCE(updated_at, NOW())
        FROM zone_barangay_map
        ON CONFLICT (zone_id, barangay) DO UPDATE
        SET purok_count = EXCLUDED.purok_count,
            is_split = EXCLUDED.is_split,
            updated_at = NOW();
      END IF;

      IF to_regclass('zone_coverage_config') IS NOT NULL THEN
        INSERT INTO ${quoteIdentifier(primaryZoneCoverageTable)} (zone_id, barangay, purok_count, is_split, created_at, updated_at)
        SELECT zone_id, barangay, purok_count, is_split, COALESCE(created_at, NOW()), COALESCE(updated_at, NOW())
        FROM zone_coverage_config
        ON CONFLICT (zone_id, barangay) DO UPDATE
        SET purok_count = EXCLUDED.purok_count,
            is_split = EXCLUDED.is_split,
            updated_at = NOW();
      END IF;
    END
    $$;
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION set_zone_coverage_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    DROP TRIGGER IF EXISTS trg_zone_coverage_updated_at ON ${quoteIdentifier(primaryZoneCoverageTable)};
    CREATE TRIGGER trg_zone_coverage_updated_at
    BEFORE UPDATE ON ${quoteIdentifier(primaryZoneCoverageTable)}
    FOR EACH ROW EXECUTE FUNCTION set_zone_coverage_updated_at();
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_waterrates_classification'
      ) THEN
        ALTER TABLE waterrates
          ADD CONSTRAINT fk_waterrates_classification
          FOREIGN KEY (classification_id) REFERENCES classification(classification_id)
          ON UPDATE CASCADE
          ON DELETE RESTRICT;
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
    const seededAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || `Admin#${crypto.randomBytes(6).toString('hex')}`;
    await pool.query('INSERT INTO roles (role_name) VALUES ($1), ($2), ($3), ($4)', [
      'Admin',
      'Meter Reader',
      'Billing Officer',
      'Consumer',
    ]);

    await pool.query(
      'INSERT INTO accounts (username, password, role_id) VALUES ($1, $2, $3)',
      ['admin', hashPassword(seededAdminPassword), 1]
    );
    if (!process.env.DEFAULT_ADMIN_PASSWORD) {
      console.warn(`Seeded default admin password generated for first boot: ${seededAdminPassword}`);
    }

    await pool.query('INSERT INTO zone (zone_name) VALUES ($1), ($2)', [
      'Zone 1',
      'Zone 2',
    ]);

    await pool.query('INSERT INTO classification (classification_name) VALUES ($1), ($2)', [
      'Residential',
      'Commercial',
    ]);
  }

  await loadAdminSettingsFromPostgres();
}

async function syncTableToSupabase(tableName, primaryKey) {
  await logPostgresEvent(`Preparing sync for table ${tableName}.`);
  const { rows } = await pool.query(`SELECT * FROM ${tableName}`);
  let normalizedRows = normalizeSyncRows(tableName, rows);
  let conflictCount = 0;

  if (tableName === 'waterrates') {
    normalizedRows = normalizedRows.map((row) => ({
      ...row,
      effective_date: normalizeWaterRateEffectiveDate(row.effective_date),
    }));
  }

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

  const columnsToSkip = new Set();
  let syncedRows = normalizedRows;
  while (true) {
    const rowsForUpsert = columnsToSkip.size
      ? normalizedRows.map((row) => {
          const nextRow = { ...row };
          for (const columnName of columnsToSkip) {
            delete nextRow[columnName];
          }
          return nextRow;
        })
      : normalizedRows;

    const { error } = await supabase.from(tableName).upsert(rowsForUpsert, {
      onConflict: primaryKey,
      ignoreDuplicates: false,
    });

    if (!error) {
      syncedRows = rowsForUpsert;
      break;
    }

    const missingColumn = extractMissingSupabaseColumnError(error.message, tableName);
    if (missingColumn && !columnsToSkip.has(missingColumn.columnName)) {
      columnsToSkip.add(missingColumn.columnName);
      await logSupabaseEvent(
        `Table ${tableName}: Supabase schema is missing column "${missingColumn.columnName}". Retrying sync without that column.`
      );
      continue;
    }

    await logDatabaseError(`supabase.sync.${tableName}`, error);
    throw new Error(`${tableName}: ${error.message}`);
  }

  // For water rates, propagate hard deletes from PostgreSQL to Supabase as well.
  // The upsert sync keeps existing rows but cannot remove rows deleted in PostgreSQL.
  if (tableName === 'waterrates') {
    const postgresIds = new Set(
      syncedRows
        .map((row) => Number(row[primaryKey]))
        .filter((value) => Number.isFinite(value))
    );

    const { data: supabaseIds, error: supabaseIdsError } = await supabase
      .from(tableName)
      .select(primaryKey);

    if (supabaseIdsError) {
      await logDatabaseError(`supabase.sync.${tableName}.fetchIds`, supabaseIdsError);
      throw new Error(`${tableName}: ${supabaseIdsError.message}`);
    }

    const staleSupabaseIds = (supabaseIds || [])
      .map((row) => Number(row?.[primaryKey]))
      .filter((value) => Number.isFinite(value) && !postgresIds.has(value));

    if (staleSupabaseIds.length > 0) {
      const { error: pruneError } = await supabase
        .from(tableName)
        .delete()
        .in(primaryKey, staleSupabaseIds);

      if (pruneError) {
        await logDatabaseError(`supabase.sync.${tableName}.prune`, pruneError);
        throw new Error(`${tableName}: ${pruneError.message}`);
      }
    }
  }

  await logSupabaseEvent(`Table ${tableName}: synced ${syncedRows.length} row(s) with ${conflictCount} conflict(s) held for review.`);
  return { tableName, synced: syncedRows.length, conflicts: conflictCount };
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

  if (tableName === 'waterrates') {
    rows = rows.map((row) => ({
      ...row,
      effective_date: normalizeWaterRateEffectiveDate(row.effective_date),
    }));
  }
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

      const skipReason = shouldSkipSupabaseSyncForDependency(tableName, results);
      if (skipReason) {
        await logSupabaseEvent(`Table ${tableName}: ${skipReason}`);
        results.push({ tableName, synced: 0, skipped: true, reason: skipReason });
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

function shouldSkipSupabaseSyncForDependency(tableName, priorResults = []) {
  const resultByTable = new Map((priorResults || []).map((row) => [row.tableName, row]));
  const hasBlockingIssue = (row) => Boolean(row && (row.error || Number(row.conflicts || 0) > 0));

  if (tableName === 'payment') {
    const billsResult = resultByTable.get('bills');
    if (hasBlockingIssue(billsResult)) {
      return 'Skipped payment sync because bills has unresolved sync conflicts/errors in this cycle.';
    }
  }

  if (tableName === 'connection_ticket') {
    const accountsResult = resultByTable.get('accounts');
    if (hasBlockingIssue(accountsResult)) {
      return 'Skipped connection_ticket sync because accounts has unresolved sync conflicts/errors in this cycle.';
    }
  }

  return null;
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
    Connection_Fee: bill.connection_fee ?? 0,
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
    Bill_Date: bill?.bill_date || null,
    Due_Date: bill?.due_date || null,
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

function isDeletedApplicationRecord(row) {
  return false;
}

function buildPendingApplicationRow({ ticketId = null, ticketNumber, applicationDate, connectionType = 'Added by Staff', requirementsSubmitted = null, remarks = null, account, consumer, zoneName = null, classificationName = null }) {
  return sanitizeApplicationRecord({
    Ticket_ID: ticketId,
    Ticket_Number: ticketNumber || consumer?.account_number || `PENDING-${account?.account_id ?? consumer?.consumer_id ?? Date.now()}`,
    Application_Status: 'Pending',
    Application_Date: applicationDate || consumer?.connection_date || account?.created_at || null,
    Connection_Type: connectionType,
    Requirements_Submitted: requirementsSubmitted,
    Remarks: remarks,
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
      .select('ticket_id, ticket_number, status, application_date, connection_type, requirements_submitted, remarks, account_id, consumer_id')
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
        Remarks: ticket.remarks || null,
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
                 COALESCE(NULLIF(a.full_name, ''), a.username) AS "Full_Name", a.contact_number AS "Contact_Number", a.role_id AS "Role_ID", a.account_status AS "Status", a.profile_picture_url AS "Profile_Picture_URL", r.role_name AS "Role_Name"
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
          .select('*')
          .in('role_id', roleIds);
        if (error) throw error;
        return {
          success: true,
          data: (data || []).map((u) => ({
            AccountID: u.account_id,
            Username: u.username,
            Password: u.password,
            Full_Name: u.full_name || u.username || 'N/A',
            Contact_Number: u.contact_number || null,
            Role_ID: u.role_id,
            Status: u.account_status,
            Profile_Picture_URL: u.profile_picture_url || null,
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
                 COALESCE(NULLIF(a.full_name, ''), a.username) AS "Full_Name", a.contact_number AS "Contact_Number", a.role_id AS "Role_ID", a.profile_picture_url AS "Profile_Picture_URL",
                 a.account_status AS "Status", a.created_at AS "Created_At", r.role_name AS "Role_Name"
          FROM accounts a
          LEFT JOIN roles r ON a.role_id = r.role_id
          WHERE a.role_id IN (1, 2, 3, 4)
          ORDER BY a.account_id DESC
        `);
        return { success: true, data: rows };
      },
      async () => {
        const roleMap = await loadSupabaseRoleMap();
        const { data, error } = await supabase
          .from('accounts')
          .select('*')
          .in('role_id', [1, 2, 3, 4])
          .order('account_id', { ascending: false });
        if (error) throw error;
        return {
          success: true,
          data: (data || []).map((u) => ({
            AccountID: u.account_id,
            Username: u.username,
            Full_Name: u.full_name || u.username || 'N/A',
            Contact_Number: u.contact_number || null,
            Role_ID: u.role_id,
            Status: u.account_status,
            Created_At: u.created_at || null,
            Profile_Picture_URL: u.profile_picture_url || null,
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
          SELECT
                 a.account_id AS "AccountID",
                 a.username AS "Username",
                 COALESCE(NULLIF(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name), ''), NULLIF(a.full_name, ''), a.username) AS "Full_Name",
                 a.role_id AS "Role_ID",
                 a.profile_picture_url AS "Profile_Picture_URL",
                 a.account_status AS "Status",
                 a.created_at AS "Created_At",
                 r.role_name AS "Role_Name",
                 c.consumer_id AS "Consumer_ID",
                 c.account_number AS "Account_Number",
                 c.contact_number AS "Contact_Number",
                 NULLIF(CONCAT_WS(', ',
                   NULLIF(c.address, ''),
                   NULLIF(c.purok, ''),
                   NULLIF(c.barangay, ''),
                   NULLIF(c.municipality, ''),
                   NULLIF(c.zip_code, '')
                 ), '') AS "Address",
                 z.zone_name AS "Zone_Name",
                 cl.classification_name AS "Classification_Name",
                 CASE
                   WHEN c.consumer_id IS NOT NULL THEN 'Consumer Profile'
                   ELSE 'Account Only'
                 END AS "Profile_Source"
          FROM accounts a
          LEFT JOIN roles r ON a.role_id = r.role_id
          LEFT JOIN consumer c ON c.login_id = a.account_id
          LEFT JOIN zone z ON z.zone_id = c.zone_id
          LEFT JOIN classification cl ON cl.classification_id = c.classification_id
          ORDER BY a.account_id DESC
        `);
        return { success: true, data: rows };
      },
      async () => {
        const [
          roleMap,
          { data: accounts, error: accountError },
          { data: consumers, error: consumerError },
          { data: zones, error: zoneError },
          { data: classifications, error: classificationError },
        ] = await Promise.all([
          loadSupabaseRoleMap(),
          supabase
            .from('accounts')
            .select('*')
            .order('account_id', { ascending: false }),
          supabase
            .from('consumer')
            .select('consumer_id, first_name, middle_name, last_name, contact_number, address, purok, barangay, municipality, zip_code, account_number, zone_id, classification_id, login_id'),
          supabase
            .from('zone')
            .select('zone_id, zone_name'),
          supabase
            .from('classification')
            .select('classification_id, classification_name'),
        ]);

        if (accountError) throw accountError;
        if (consumerError) throw consumerError;
        if (zoneError) throw zoneError;
        if (classificationError) throw classificationError;

        const consumerByLoginId = new Map((consumers || []).map((consumer) => [consumer.login_id, consumer]));
        const zoneMap = new Map((zones || []).map((zone) => [zone.zone_id, zone.zone_name]));
        const classificationMap = new Map((classifications || []).map((classification) => [classification.classification_id, classification.classification_name]));

        return {
          success: true,
          data: (accounts || []).map((u) => {
            const consumer = consumerByLoginId.get(u.account_id) || null;
            const fullName = consumer
              ? [consumer.first_name, consumer.middle_name, consumer.last_name].filter(Boolean).join(' ').trim()
              : '';
            const address = consumer
              ? [consumer.address, consumer.purok, consumer.barangay, consumer.municipality, consumer.zip_code].filter(Boolean).join(', ')
              : '';

            return {
              AccountID: u.account_id,
              Username: u.username,
              Full_Name: fullName || u.full_name || u.username || 'N/A',
              Role_ID: u.role_id,
              Status: u.account_status,
              Created_At: u.created_at || null,
              Profile_Picture_URL: u.profile_picture_url || null,
              Role_Name: roleMap.get(u.role_id) || null,
              Consumer_ID: consumer?.consumer_id || null,
              Account_Number: consumer?.account_number || null,
              Contact_Number: consumer?.contact_number || null,
              Address: address || null,
              Zone_Name: consumer?.zone_id ? zoneMap.get(consumer.zone_id) || null : null,
              Classification_Name: consumer?.classification_id ? classificationMap.get(consumer.classification_id) || null : null,
              Profile_Source: consumer?.consumer_id ? 'Consumer Profile' : 'Account Only',
            };
          }),
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
            ct.remarks AS "Remarks",
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
            AND LOWER(COALESCE(a.account_status, '')) <> 'rejected'
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
            NULL::text AS "Remarks",
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
            ct.remarks AS "Remarks",
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
            NULL::text AS "Remarks",
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
  let normalizedRequirementsSubmitted = null;

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
    normalizedRequirementsSubmitted = normalizeRequirementSubmission(payload.requirementsSubmitted, { allowText: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
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
            normalizedRequirementsSubmitted,
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
                requirements_submitted: normalizedRequirementsSubmitted,
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
            requirements_submitted: normalizedRequirementsSubmitted,
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
  const normalizedRemarks = String(remarks || '').trim();
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
            INSERT INTO account_review_log (account_id, reviewed_by, review_status, review_date, remarks)
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
          const { error: mirroredApprovalError } = await supabase.from('account_review_log').insert([{
            account_id: accountId,
            reviewed_by: approverId,
            review_status: 'Approved',
            review_date: new Date().toISOString(),
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
        const { error: approvalError } = await supabase.from('account_review_log').insert([{
          account_id: accountId,
          reviewed_by: approverId,
          review_status: 'Approved',
          review_date: new Date().toISOString(),
          remarks: String(remarks || '').trim() || null,
        }]);
        if (approvalError) throw approvalError;
      }
    );
    const approvedSummary = await withPostgresPrimary(
      'users.approve.summary',
      async () => {
        const { rows } = await pool.query(
          `SELECT c.account_number, CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name) AS consumer_name
           FROM consumer c
           WHERE c.login_id = $1
           ORDER BY c.consumer_id DESC
           LIMIT 1`,
          [accountId]
        );
        return rows[0] || null;
      },
      async () => {
        const { data, error } = await supabase
          .from('consumer')
          .select('account_number, first_name, middle_name, last_name')
          .eq('login_id', accountId)
          .order('consumer_id', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        return {
          account_number: data.account_number,
          consumer_name: [data.first_name, data.middle_name, data.last_name].filter(Boolean).join(' ').trim() || null,
        };
      }
    );

    await writeSystemLog(
      `[applications.approve] ${approvedSummary?.consumer_name || `Account #${accountId}`} (${approvedSummary?.account_number || 'N/A'}) approved.${normalizedRemarks ? ` Remarks: ${normalizedRemarks}` : ''}`,
      { userId: approverId, role: 'Admin' }
    );

    scheduleImmediateSync('admin-approve-user');
    return res.json({ success: true, message: 'Account approved successfully' });
  } catch (error) {
    await logRequestError(req, 'users.approve', error);
    console.error('Approval error:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: getUserManagementErrorMessage(error) });
  }
});

// Reject Pending Account
app.post('/api/admin/reject-user', async (req, res) => {
  const { accountId, approvedBy, remarks } = req.body;
  const approverId = Number(approvedBy);
  const normalizedRemarks = String(remarks || '').trim();
  try {
    if (!accountId || !Number.isInteger(approverId) || approverId <= 0) {
      return res.status(400).json({ success: false, message: 'Approver information is required.' });
    }
    if (!normalizedRemarks) {
      return res.status(400).json({ success: false, message: 'A rejection reason is required.' });
    }

    await withPostgresPrimary(
      'users.reject',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const { rows: accountRows } = await client.query(
            'SELECT account_id, created_at FROM accounts WHERE account_id = $1 LIMIT 1',
            [accountId]
          );
          if (!accountRows[0]) {
            throw createHttpError('Account not found.', 404);
          }

          const { rows: consumerRows } = await client.query(
            `SELECT consumer_id, account_number, connection_date
             FROM consumer
             WHERE login_id = $1
             ORDER BY consumer_id DESC
             LIMIT 1`,
            [accountId]
          );
          const consumer = consumerRows[0] || null;

          await client.query(
            'UPDATE accounts SET account_status = $1 WHERE account_id = $2',
            ['Rejected', accountId]
          );
          await client.query(
            'UPDATE consumer SET status = $1 WHERE login_id = $2',
            ['Rejected', accountId]
          );

          const { rows: ticketRows } = await client.query(
            `SELECT ticket_id, ticket_number
             FROM connection_ticket
             WHERE account_id = $1
             ORDER BY ticket_id DESC
             LIMIT 1`,
            [accountId]
          );
          const existingTicket = ticketRows[0] || null;

          if (existingTicket) {
            await client.query(
              `UPDATE connection_ticket
               SET status = $1,
                   remarks = $2
               WHERE account_id = $3`,
              ['Rejected', normalizedRemarks, accountId]
            );
          } else if (consumer) {
            const fallbackTicketNumber = consumer.account_number || `PENDING-STAFF-${consumer.consumer_id}`;
            const applicationDate = consumer.connection_date || accountRows[0].created_at || new Date().toISOString();
            await client.query(
              `INSERT INTO connection_ticket (
                consumer_id,
                account_id,
                ticket_number,
                application_date,
                connection_type,
                requirements_submitted,
                status,
                remarks
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                consumer.consumer_id,
                accountId,
                fallbackTicketNumber,
                applicationDate,
                'Added by Staff',
                null,
                'Rejected',
                normalizedRemarks,
              ]
            );
          }

          await client.query(
            `INSERT INTO account_review_log (account_id, reviewed_by, review_status, review_date, remarks)
             VALUES ($1, $2, $3, $4, $5)`,
            [accountId, approverId, 'Rejected', new Date().toISOString(), normalizedRemarks]
          );
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }

        if (supabase) {
          const { data: mirroredConsumer, error: mirroredConsumerLookupError } = await supabase
            .from('consumer')
            .select('consumer_id, account_number, connection_date')
            .eq('login_id', accountId)
            .order('consumer_id', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (mirroredConsumerLookupError) throw mirroredConsumerLookupError;

          const { data: mirroredAccount, error: mirroredAccountLookupError } = await supabase
            .from('accounts')
            .select('account_id, created_at')
            .eq('account_id', accountId)
            .maybeSingle();
          if (mirroredAccountLookupError) throw mirroredAccountLookupError;
          if (!mirroredAccount) {
            throw createHttpError('Account not found.', 404);
          }

          const { error: mirroredAccountError } = await supabase
            .from('accounts')
            .update({ account_status: 'Rejected' })
            .eq('account_id', accountId);
          if (mirroredAccountError) throw mirroredAccountError;

          const { error: mirroredConsumerError } = await supabase
            .from('consumer')
            .update({ status: 'Rejected' })
            .eq('login_id', accountId);
          if (mirroredConsumerError) throw mirroredConsumerError;

          const { data: mirroredTicket, error: mirroredTicketLookupError } = await supabase
            .from('connection_ticket')
            .select('ticket_id')
            .eq('account_id', accountId)
            .order('ticket_id', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (mirroredTicketLookupError) throw mirroredTicketLookupError;

          if (mirroredTicket) {
            const { error: mirroredTicketError } = await supabase
              .from('connection_ticket')
              .update({ status: 'Rejected', remarks: normalizedRemarks })
              .eq('account_id', accountId);
            if (mirroredTicketError) throw mirroredTicketError;
          } else if (mirroredConsumer) {
            const fallbackTicketNumber = mirroredConsumer.account_number || `PENDING-STAFF-${mirroredConsumer.consumer_id}`;
            const applicationDate = mirroredConsumer.connection_date || mirroredAccount.created_at || new Date().toISOString();
            await insertSupabaseRowWithPrimaryKeyRetry(
              'connection_ticket',
              'ticket_id',
              {
                consumer_id: mirroredConsumer.consumer_id,
                account_id: accountId,
                ticket_number: fallbackTicketNumber,
                application_date: applicationDate,
                connection_type: 'Added by Staff',
                requirements_submitted: null,
                status: 'Rejected',
                remarks: normalizedRemarks,
              },
              'ticket_id'
            );
          }

          const { error: mirroredApprovalError } = await supabase
            .from('account_review_log')
            .insert([{
              account_id: accountId,
              reviewed_by: approverId,
              review_status: 'Rejected',
              review_date: new Date().toISOString(),
              remarks: normalizedRemarks,
            }]);
          if (mirroredApprovalError) throw mirroredApprovalError;
        }
      },
      async () => {
        const { data: mirroredConsumer, error: mirroredConsumerLookupError } = await supabase
          .from('consumer')
          .select('consumer_id, account_number, connection_date')
          .eq('login_id', accountId)
          .order('consumer_id', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (mirroredConsumerLookupError) throw mirroredConsumerLookupError;

        const { data: mirroredAccount, error: mirroredAccountLookupError } = await supabase
          .from('accounts')
          .select('account_id, created_at')
          .eq('account_id', accountId)
          .maybeSingle();
        if (mirroredAccountLookupError) throw mirroredAccountLookupError;
        if (!mirroredAccount) {
          throw createHttpError('Account not found.', 404);
        }

        const { error: accountError } = await supabase
          .from('accounts')
          .update({ account_status: 'Rejected' })
          .eq('account_id', accountId);
        if (accountError) throw accountError;

        const { error: consumerError } = await supabase
          .from('consumer')
          .update({ status: 'Rejected' })
          .eq('login_id', accountId);
        if (consumerError) throw consumerError;

        const { data: mirroredTicket, error: mirroredTicketLookupError } = await supabase
          .from('connection_ticket')
          .select('ticket_id')
          .eq('account_id', accountId)
          .order('ticket_id', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (mirroredTicketLookupError) throw mirroredTicketLookupError;

        if (mirroredTicket) {
          const { error: ticketError } = await supabase
            .from('connection_ticket')
            .update({ status: 'Rejected', remarks: normalizedRemarks })
            .eq('account_id', accountId);
          if (ticketError) throw ticketError;
        } else if (mirroredConsumer) {
          const fallbackTicketNumber = mirroredConsumer.account_number || `PENDING-STAFF-${mirroredConsumer.consumer_id}`;
          const applicationDate = mirroredConsumer.connection_date || mirroredAccount.created_at || new Date().toISOString();
          await insertSupabaseRowWithPrimaryKeyRetry(
            'connection_ticket',
            'ticket_id',
            {
              consumer_id: mirroredConsumer.consumer_id,
              account_id: accountId,
              ticket_number: fallbackTicketNumber,
              application_date: applicationDate,
              connection_type: 'Added by Staff',
              requirements_submitted: null,
              status: 'Rejected',
              remarks: normalizedRemarks,
            },
            'ticket_id'
          );
        }

        const { error: approvalError } = await supabase
          .from('account_review_log')
          .insert([{
            account_id: accountId,
            reviewed_by: approverId,
            review_status: 'Rejected',
            review_date: new Date().toISOString(),
            remarks: normalizedRemarks,
          }]);
        if (approvalError) throw approvalError;
      }
    );
    const rejectedSummary = await withPostgresPrimary(
      'users.reject.summary',
      async () => {
        const { rows } = await pool.query(
          `SELECT c.account_number, CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name) AS consumer_name
           FROM consumer c
           WHERE c.login_id = $1
           ORDER BY c.consumer_id DESC
           LIMIT 1`,
          [accountId]
        );
        return rows[0] || null;
      },
      async () => {
        const { data, error } = await supabase
          .from('consumer')
          .select('account_number, first_name, middle_name, last_name')
          .eq('login_id', accountId)
          .order('consumer_id', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;
        return {
          account_number: data.account_number,
          consumer_name: [data.first_name, data.middle_name, data.last_name].filter(Boolean).join(' ').trim() || null,
        };
      }
    );

    await writeSystemLog(
      `[applications.reject] ${rejectedSummary?.consumer_name || `Account #${accountId}`} (${rejectedSummary?.account_number || 'N/A'}) rejected. Remarks: ${normalizedRemarks}`,
      { userId: approverId, role: 'Admin' }
    );

    scheduleImmediateSync('admin-reject-user');
    return res.json({ success: true, message: 'Application rejected successfully.' });
  } catch (error) {
    await logRequestError(req, 'users.reject', error);
    console.error('Rejection error:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: getUserManagementErrorMessage(error) });
  }
});

// Create user
app.post('/api/users', async (req, res) => {
  const { username, fullName, password, roleId, contactNumber, contact_number } = req.body;
  
  if (!username || !password || !roleId) {
    return res.status(400).json({ success: false, message: 'Username, password, and role are required' });
  }
  
  try {
    const passwordHash = hashPassword(password);
    const numericRoleId = Number(roleId);
    const normalizedContactNumber = normalizePhilippinePhoneNumber(contactNumber || contact_number);
    if (!Number.isInteger(numericRoleId) || numericRoleId <= 0) {
      return res.status(400).json({ success: false, message: 'A valid role is required.' });
    }
    if ((contactNumber || contact_number) && !normalizedContactNumber) {
      return res.status(400).json({ success: false, message: 'Contact number must be a valid Philippine mobile number.' });
    }

    const isConsumerRole = numericRoleId === 5;
    const initialAccountStatus = isConsumerRole ? 'Pending' : 'Active';
    const normalizedFullName = String(fullName || '').trim() || username;
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
            'INSERT INTO accounts (username, password, full_name, contact_number, role_id, account_status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [username, passwordHash, normalizedFullName, normalizedContactNumber, numericRoleId, initialAccountStatus]
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
          .insert([{ username, password: passwordHash, full_name: normalizedFullName, contact_number: normalizedContactNumber, role_id: numericRoleId, account_status: initialAccountStatus }])
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
  const { username, fullName, password, roleId, contactNumber, contact_number } = req.body;
  
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
    const normalizedFullName = String(fullName || '').trim() || username;
    const { firstName, lastName } = splitConsumerName(fullName, username);
    const passwordHash = password ? hashPassword(password) : null;
    const normalizedContactNumber = normalizePhilippinePhoneNumber(contactNumber || contact_number);
    if ((contactNumber || contact_number) && !normalizedContactNumber) {
      return res.status(400).json({ success: false, message: 'Contact number must be a valid Philippine mobile number.' });
    }

    await withPostgresPrimary(
      'users.update',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          let query = 'UPDATE accounts SET username = $1, full_name = $2, contact_number = $3, role_id = $4';
          const params = [username, normalizedFullName, normalizedContactNumber, numericRoleId];
          
          if (password) {
            query += ', password = $5';
            params.push(passwordHash);
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
        const payload = { username, full_name: normalizedFullName, contact_number: normalizedContactNumber, role_id: numericRoleId };
        if (password) {
          payload.password = passwordHash;
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
    await syncAccountAuthCredentials({
      accountId,
      username,
      password,
      authUserId: null,
    });
    scheduleImmediateSync('users-update');
    return res.json({ success: true, message: 'User updated successfully' });
  } catch (error) {
    await logRequestError(req, 'users.update', error);
    console.error('Error updating user:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: getUserManagementErrorMessage(error) });
  }
});

app.put('/api/users/:id/profile-picture', async (req, res) => {
  const { id } = req.params;
  const targetAccountId = Number(id);
  const actorAccountId = Number(req.body?.actorAccountId);
  const actorRoleId = Number(req.body?.actorRoleId);
  const removePicture = Boolean(req.body?.removePicture);

  if (!Number.isInteger(targetAccountId) || targetAccountId <= 0) {
    return res.status(400).json({ success: false, message: 'A valid user ID is required.' });
  }

  if (!Number.isInteger(actorAccountId) || actorAccountId <= 0 || !Number.isInteger(actorRoleId) || actorRoleId <= 0) {
    return res.status(400).json({ success: false, message: 'Actor account information is required.' });
  }

  let normalizedProfilePictureUrl = null;
  try {
    normalizedProfilePictureUrl = removePicture ? null : normalizeProfilePictureUrl(req.body?.profilePictureUrl);
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }

  if (!removePicture && !normalizedProfilePictureUrl) {
    return res.status(400).json({ success: false, message: 'A profile picture is required.' });
  }

  try {
    const updatedUser = await withPostgresPrimary(
      'users.profilePicture.update',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const { rows: targetRows } = await client.query(
            'SELECT account_id, role_id, username, account_status, profile_picture_url FROM accounts WHERE account_id = $1 LIMIT 1',
            [targetAccountId]
          );
          const targetUser = targetRows[0] || null;

          if (!targetUser) {
            throw new Error('User not found.');
          }

          if (!canManageProfilePicture(actorAccountId, actorRoleId, targetAccountId, Number(targetUser.role_id))) {
            throw new Error('You do not have permission to update this profile picture.');
          }

          const { rows: updatedRows } = await client.query(
            'UPDATE accounts SET profile_picture_url = $1 WHERE account_id = $2 RETURNING account_id, username, role_id, account_status, profile_picture_url',
            [normalizedProfilePictureUrl, targetAccountId]
          );

          await client.query('COMMIT');
          return updatedRows[0];
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      async () => {
        const { data: targetUser, error: fetchError } = await supabase
          .from('accounts')
          .select('*')
          .eq('account_id', targetAccountId)
          .maybeSingle();
        if (fetchError) throw fetchError;
        if (!targetUser) {
          throw new Error('User not found.');
        }

        if (!canManageProfilePicture(actorAccountId, actorRoleId, targetAccountId, Number(targetUser.role_id))) {
          throw new Error('You do not have permission to update this profile picture.');
        }

        const { data: updatedRow, error: updateError } = await supabase
          .from('accounts')
          .update({ profile_picture_url: normalizedProfilePictureUrl })
          .eq('account_id', targetAccountId)
          .select('*')
          .single();
        if (updateError) throw updateError;
        return updatedRow;
      }
    );

    if (supabase && isPostgresAvailable) {
      const { error: mirroredAccountError } = await supabase
        .from('accounts')
        .update({ profile_picture_url: updatedUser.profile_picture_url || null })
        .eq('account_id', targetAccountId);

      if (mirroredAccountError) {
        throw mirroredAccountError;
      }
    }

    await writeSystemLog(
      removePicture
        ? `[profile] Cleared profile picture for account #${targetAccountId}.`
        : `[profile] Updated profile picture for account #${targetAccountId}.`,
      { userId: actorAccountId, role: actorRoleId === 1 ? 'Admin' : 'Staff' }
    );

    scheduleImmediateSync('users-profile-picture-update');

    return res.json({
      success: true,
      message: removePicture ? 'Profile picture removed successfully.' : 'Profile picture updated successfully.',
      data: {
        AccountID: updatedUser.account_id,
        Username: updatedUser.username,
        Role_ID: updatedUser.role_id,
        Status: updatedUser.account_status,
        Profile_Picture_URL: updatedUser.profile_picture_url || null,
      },
    });
  } catch (error) {
    await logRequestError(req, 'users.profilePicture.update', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: getUserManagementErrorMessage(error) || error.message });
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
            await pool.query('DELETE FROM account_review_log WHERE account_id = $1', [accountId]);
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
            await mirrorDeleteToSupabase('account_review_log', 'account_id', accountId);
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
          const { error: approvalError } = await supabase.from('account_review_log').delete().eq('account_id', accountId);
          if (approvalError) throw approvalError;
          const { error: consumerDeleteError } = await supabase.from('consumer').delete().eq('login_id', accountId);
          if (consumerDeleteError) throw consumerDeleteError;
        }

        const { error } = await supabase.from('accounts').delete().eq('account_id', accountId);
        if (error) throw error;
      }
    );
    await writeSystemLog(
      `[applications.delete] Account #${accountId} was deleted from user management.`,
      { userId: defaultSystemLogAccountId, role: 'Admin' }
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
    // Pending consumers are allowed to log in — they see their application status in the dashboard
    if (user.account_status === 'Rejected') {
      return res.status(401).json({ success: false, message: 'Your registration was rejected. Please contact the office for assistance.' });
    }
    if (user.account_status === 'Inactive') {
      return res.status(401).json({ success: false, message: 'Your account is inactive. Please contact the office for assistance.' });
    }
    if (!verifyPassword(password, user.password)) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }

    if (!isPasswordHash(user.password)) {
      user.password = await upgradeLegacyAccountPassword(user.account_id, password);
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
        profile_picture_url: user.profile_picture_url || null,
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
app.get('/api/water-rates', async (req, res) => {
  try {
    const classificationId = normalizeRequiredForeignKeyId(req.query.classification_id);
    const latestOnly = String(req.query.latest_only || '').toLowerCase() === 'true';
    const activeOnly = req.query.active_only === undefined
      ? true
      : String(req.query.active_only).toLowerCase() !== 'false';
    const effectiveOn = normalizeWaterRateQueryDate(req.query.effective_on, getTodayDateKey());

    const rows = await withPostgresPrimary(
      'waterRates.fetchAll',
      async () => {
        const values = [];
        const whereConditions = [];

        if (classificationId) {
          values.push(classificationId);
          whereConditions.push(`wr.classification_id = $${values.length}`);
        }

        if (activeOnly) {
          values.push(effectiveOn);
          whereConditions.push(`DATE(wr.effective_date) <= $${values.length}::date`);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        const query = latestOnly
          ? `
            WITH ranked_rates AS (
              SELECT
                wr.rate_id,
                wr.classification_id,
                cl.classification_name,
                wr.minimum_cubic,
                wr.minimum_rate,
                wr.excess_rate_per_cubic,
                DATE(wr.effective_date) AS effective_date,
                wr.modified_by,
                wr.modified_date,
                ROW_NUMBER() OVER (
                  PARTITION BY wr.classification_id
                  ORDER BY DATE(wr.effective_date) DESC, wr.rate_id DESC
                ) AS rate_rank
              FROM waterrates wr
              JOIN classification cl ON cl.classification_id = wr.classification_id
              ${whereClause}
            )
            SELECT rate_id, classification_id, classification_name, minimum_cubic, minimum_rate,
                   excess_rate_per_cubic, effective_date, modified_by, modified_date
            FROM ranked_rates
            WHERE rate_rank = 1
            ORDER BY classification_name ASC, DATE(effective_date) DESC, rate_id DESC
          `
          : `
            SELECT
              wr.rate_id,
              wr.classification_id,
              cl.classification_name,
              wr.minimum_cubic,
              wr.minimum_rate,
              wr.excess_rate_per_cubic,
              DATE(wr.effective_date) AS effective_date,
              wr.modified_by,
              wr.modified_date
            FROM waterrates wr
            JOIN classification cl ON cl.classification_id = wr.classification_id
            ${whereClause}
            ORDER BY cl.classification_name ASC, DATE(wr.effective_date) DESC, wr.rate_id DESC
          `;

        const { rows } = await pool.query(query, values);
        return rows;
      },
      async () => {
        const [ratesResult, classificationsResult] = await Promise.all([
          (() => {
            let query = supabase
              .from('waterrates')
              .select('rate_id, classification_id, minimum_cubic, minimum_rate, excess_rate_per_cubic, effective_date, modified_by, modified_date')
              .order('effective_date', { ascending: false })
              .order('rate_id', { ascending: false });

            if (classificationId) {
              query = query.eq('classification_id', classificationId);
            }

            if (activeOnly) {
              query = query.lte('effective_date', effectiveOn);
            }

            return query;
          })(),
          supabase.from('classification').select('classification_id, classification_name'),
        ]);

        if (ratesResult.error) throw ratesResult.error;
        if (classificationsResult.error) throw classificationsResult.error;

        const classificationMap = new Map((classificationsResult.data || []).map((row) => [row.classification_id, row.classification_name]));
        const mappedRows = (ratesResult.data || [])
          .filter((row) => normalizeRequiredForeignKeyId(row.classification_id))
          .map((row) => normalizeWaterRateRowForResponse({
            ...row,
            classification_name: classificationMap.get(row.classification_id) || null,
          }))
          .filter((row) => row.classification_name);

        if (!latestOnly) {
          return mappedRows.sort((left, right) =>
            String(left.classification_name || '').localeCompare(String(right.classification_name || '')) ||
            String(right.effective_date || '').localeCompare(String(left.effective_date || '')) ||
            Number(right.rate_id || 0) - Number(left.rate_id || 0)
          );
        }

        const latestRateMap = new Map();
        for (const row of mappedRows) {
          if (!latestRateMap.has(row.classification_id)) {
            latestRateMap.set(row.classification_id, row);
          }
        }

        return Array.from(latestRateMap.values()).sort((left, right) =>
          String(left.classification_name || '').localeCompare(String(right.classification_name || ''))
        );
      }
    );

    return res.json({
      success: true,
      data: (rows || []).map((row) => normalizeWaterRateRowForResponse(row)),
    });
  } catch (error) {
    await logRequestError(req, 'waterRates.fetchAll', error);
    console.error('Error fetching water rates:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
  }
});

app.get('/api/zone-coverage-config', async (req, res) => {
  try {
    const rows = await withPostgresPrimary(
      'zoneCoverageConfig.fetch',
      async () => {
        const { rows } = await pool.query(`
          SELECT
            zcc.config_id AS "Config_ID",
            zcc.zone_id AS "Zone_ID",
            z.zone_name AS "Zone_Name",
            zcc.barangay AS "Barangay",
            zcc.purok_count AS "Purok_Count",
            zcc.is_split AS "Is_Split"
          FROM ${quoteIdentifier(primaryZoneCoverageTable)} zcc
          JOIN zone z ON z.zone_id = zcc.zone_id
          ORDER BY zcc.zone_id ASC, zcc.barangay ASC
        `);
        return rows;
      },
      async () => {
        let configRows = [];
        let configLoaded = false;

        for (const tableName of zoneCoverageTableCandidates) {
          const result = await supabase.from(tableName).select('config_id, zone_id, barangay, purok_count, is_split');
          if (result.error) {
            if (isMissingSupabaseTableError(result.error, [tableName])) {
              continue;
            }
            throw result.error;
          }
          configRows = result.data || [];
          configLoaded = true;
          break;
        }

        if (!configLoaded) {
          return [];
        }

        const zoneResult = await supabase.from('zone').select('zone_id, zone_name');
        if (zoneResult.error) throw zoneResult.error;
        const zoneMap = new Map((zoneResult.data || []).map((zone) => [zone.zone_id, zone.zone_name]));
        return configRows.map((row) => ({
          Config_ID: row.config_id,
          Zone_ID: row.zone_id,
          Zone_Name: zoneMap.get(row.zone_id) || null,
          Barangay: row.barangay,
          Purok_Count: Number(row.purok_count || 0),
          Is_Split: Boolean(row.is_split),
        }));
      }
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    await logRequestError(req, 'zoneCoverageConfig.fetch', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
  }
});

app.post('/api/zone-coverage-config', async (req, res) => {
  const zoneId = normalizeRequiredForeignKeyId(req.body?.zone_id || req.body?.zoneId);
  const barangay = String(req.body?.barangay || '').trim();
  const purokCount = Number(req.body?.purok_count ?? req.body?.purokCount ?? 0);
  const isSplit = Boolean(req.body?.is_split ?? req.body?.isSplit);
  if (!zoneId) return res.status(400).json({ success: false, message: 'A valid zone is required.' });
  if (!barangay) return res.status(400).json({ success: false, message: 'Barangay is required.' });
  if (!Number.isInteger(purokCount) || purokCount < 0) {
    return res.status(400).json({ success: false, message: 'Purok count must be a non-negative integer.' });
  }

  try {
    const row = await withPostgresPrimary(
      'zoneCoverageConfig.upsert',
      async () => {
        const { rows } = await pool.query(`
          INSERT INTO ${quoteIdentifier(primaryZoneCoverageTable)} (zone_id, barangay, purok_count, is_split)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (zone_id, barangay) DO UPDATE
          SET purok_count = EXCLUDED.purok_count,
              is_split = EXCLUDED.is_split,
              updated_at = NOW()
          RETURNING
            config_id AS "Config_ID",
            zone_id AS "Zone_ID",
            barangay AS "Barangay",
            purok_count AS "Purok_Count",
            is_split AS "Is_Split"
        `, [zoneId, barangay, purokCount, isSplit]);
        return rows[0];
      },
      async () => {
        for (const tableName of zoneCoverageTableCandidates) {
          const { data, error } = await supabase
            .from(tableName)
            .upsert([{ zone_id: zoneId, barangay: barangay, purok_count: purokCount, is_split: isSplit }], { onConflict: 'zone_id,barangay' })
            .select('config_id, zone_id, barangay, purok_count, is_split')
            .single();

          if (error) {
            if (isMissingSupabaseTableError(error, [tableName])) {
              continue;
            }
            throw error;
          }

          return {
            Config_ID: data.config_id,
            Zone_ID: data.zone_id,
            Barangay: data.barangay,
            Purok_Count: Number(data.purok_count || 0),
            Is_Split: Boolean(data.is_split),
          };
        }

        throw createHttpError(
          `Zone coverage table is missing in schema "${supabaseSchema}". Expected "${primaryZoneCoverageTable}" (or legacy: ${legacyZoneCoverageTables.join(', ')}).`,
          500
        );
      }
    );
    scheduleImmediateSync('zone-coverage-config-upsert');
    return res.json({ success: true, data: row });
  } catch (error) {
    await logRequestError(req, 'zoneCoverageConfig.upsert', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
  }
});

app.delete('/api/zone-coverage-config/:id', async (req, res) => {
  const id = normalizeRequiredForeignKeyId(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'A valid config ID is required.' });
  try {
    await withPostgresPrimary(
      'zoneCoverageConfig.delete',
      async () => {
        await pool.query(`DELETE FROM ${quoteIdentifier(primaryZoneCoverageTable)} WHERE config_id = $1`, [id]);
      },
      async () => {
        let deleted = false;
        for (const tableName of zoneCoverageTableCandidates) {
          const { error } = await supabase.from(tableName).delete().eq('config_id', id);
          if (error) {
            if (isMissingSupabaseTableError(error, [tableName])) {
              continue;
            }
            throw error;
          }
          deleted = true;
          break;
        }

        if (!deleted) {
          throw createHttpError(
            `Zone coverage table is missing in schema "${supabaseSchema}". Expected "${primaryZoneCoverageTable}" (or legacy: ${legacyZoneCoverageTables.join(', ')}).`,
            500
          );
        }
      }
    );
    scheduleImmediateSync('zone-coverage-config-delete');
    return res.json({ success: true });
  } catch (error) {
    await logRequestError(req, 'zoneCoverageConfig.delete', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
  }
});

// Get the latest active water rate, optionally for a specific classification.
app.get('/api/water-rates/latest', async (req, res) => {
  try {
    const classificationId = normalizeRequiredForeignKeyId(req.query.classification_id);
    const effectiveOn = normalizeWaterRateQueryDate(req.query.effective_on, getTodayDateKey());

    if (classificationId) {
      const rate = await resolveApplicableWaterRate(classificationId, effectiveOn);
      return res.json({ success: true, data: rate });
    }

    const row = await withPostgresPrimary(
      'waterRates.fetchLatest',
      async () => {
        const { rows } = await pool.query(`
          SELECT
            wr.rate_id,
            wr.classification_id,
            cl.classification_name,
            wr.minimum_cubic,
            wr.minimum_rate,
            wr.excess_rate_per_cubic,
            DATE(wr.effective_date) AS effective_date,
            wr.modified_by,
            wr.modified_date
          FROM waterrates wr
          JOIN classification cl ON cl.classification_id = wr.classification_id
          WHERE DATE(wr.effective_date) <= $1::date
          ORDER BY DATE(wr.effective_date) DESC, wr.rate_id DESC
          LIMIT 1
        `, [effectiveOn]);
        return rows[0] || null;
      },
      async () => {
        const [rateResult, classificationsResult] = await Promise.all([
          supabase
            .from('waterrates')
            .select('rate_id, classification_id, minimum_cubic, minimum_rate, excess_rate_per_cubic, effective_date, modified_by, modified_date')
            .lte('effective_date', effectiveOn)
            .order('effective_date', { ascending: false })
            .order('rate_id', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from('classification').select('classification_id, classification_name'),
        ]);

        if (rateResult.error) throw rateResult.error;
        if (classificationsResult.error) throw classificationsResult.error;
        if (!rateResult.data) {
          return null;
        }

        const classificationMap = new Map((classificationsResult.data || []).map((row) => [row.classification_id, row.classification_name]));
        return normalizeWaterRateRowForResponse({
          ...rateResult.data,
          classification_name: classificationMap.get(rateResult.data.classification_id) || null,
        });
      }
    );

    return res.json({ success: true, data: normalizeWaterRateRowForResponse(row) });
  } catch (error) {
    await logRequestError(req, 'waterRates.fetchLatest', error);
    console.error('Error fetching latest water rates:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
  }
});

// Create new water rate entry
app.post('/api/water-rates', async (req, res) => {
  try {
    const classification = await validateClassificationExists(req.body.classification_id || req.body.classificationId);
    const effectiveDate = normalizeWaterRateEffectiveDate(req.body.effective_date || req.body.effectiveDate);
    assertWaterRateDateIsNotPast(effectiveDate, 'Water rate');
    const payload = {
      classification_id: parseRequiredWaterRateClassificationId(req.body.classification_id || req.body.classificationId),
      minimum_cubic: normalizeWaterRateNumericValue(req.body.minimum_cubic, 'Minimum cubic', parseInt),
      minimum_rate: normalizeWaterRateNumericValue(req.body.minimum_rate, 'Minimum rate', parseFloat),
      excess_rate_per_cubic: normalizeWaterRateNumericValue(req.body.excess_rate_per_cubic, 'Excess rate per cubic', parseFloat),
      effective_date: effectiveDate,
      modified_by: normalizeRequiredForeignKeyId(req.body.modified_by || req.body.modifiedBy),
      modified_date: new Date().toISOString(),
    };

    const row = await withPostgresPrimary(
      'waterRates.create',
      async () => {
        const { rows } = await insertWithSequenceRetry(
          'waterrates',
          'rate_id',
          `INSERT INTO waterrates (classification_id, minimum_cubic, minimum_rate, excess_rate_per_cubic, effective_date, modified_by, modified_date)
           VALUES ($1, $2, $3, $4, $5::date, $6, $7)
           RETURNING rate_id, classification_id, minimum_cubic, minimum_rate, excess_rate_per_cubic, effective_date, modified_by, modified_date`,
          [
            payload.classification_id,
            payload.minimum_cubic,
            payload.minimum_rate,
            payload.excess_rate_per_cubic,
            payload.effective_date,
            payload.modified_by,
            payload.modified_date,
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

    if (isPostgresAvailable && supabase) {
      try {
        await mirrorWaterRateRowToSupabase(row);
      } catch (mirrorError) {
        await logRequestError(req, 'waterRates.create.mirrorSupabase', mirrorError);
      }
    }

    await writeSystemLog(
      `[water-rates.create] ${classification.classification_name || `Classification #${payload.classification_id}`} rate created: PHP ${formatCurrencyAmount(payload.minimum_rate)} minimum, PHP ${formatCurrencyAmount(payload.excess_rate_per_cubic)} excess per cubic meter, ${payload.minimum_cubic} m3 minimum cubic, effective ${payload.effective_date}.`,
      { accountId: payload.modified_by, role: 'Admin' }
    );
    scheduleImmediateSync('water-rates-create');
    const normalizedRow = normalizeWaterRateRowForResponse(row);
    return res.json({
      success: true,
      message: 'Water rate created successfully.',
      data: {
        ...normalizedRow,
        classification_name: classification.classification_name || null,
      },
    });
  } catch (error) {
    await logRequestError(req, 'waterRates.create', error);
    console.error('Error creating water rate:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
  }
});

app.put('/api/water-rates/:id', async (req, res) => {
  try {
    const rateId = Number(req.params.id);
    if (!Number.isFinite(rateId)) {
      return res.status(400).json({ success: false, message: 'Invalid water rate ID.' });
    }

    const classification = await validateClassificationExists(req.body.classification_id || req.body.classificationId);
    const existingRate = await withPostgresPrimary(
      'waterRates.fetchByIdForUpdate',
      async () => {
        const { rows } = await pool.query(
          'SELECT rate_id, classification_id, effective_date FROM waterrates WHERE rate_id = $1 LIMIT 1',
          [rateId]
        );
        return rows[0] || null;
      },
      async () => {
        const { data, error } = await supabase
          .from('waterrates')
          .select('rate_id, classification_id, effective_date')
          .eq('rate_id', rateId)
          .maybeSingle();
        if (error) throw error;
        return data || null;
      }
    );
    if (!existingRate) {
      return res.status(404).json({ success: false, message: 'Water rate not found.' });
    }

    const existingDateKey = normalizeWaterRateEffectiveDate(existingRate.effective_date);
    const todayDateKey = getTodayDateKey();
    const existingClassificationId = parseRequiredWaterRateClassificationId(existingRate.classification_id);
    let latestActiveRate = null;
    try {
      latestActiveRate = await resolveApplicableWaterRate(existingClassificationId, todayDateKey);
    } catch (error) {
      latestActiveRate = null;
    }
    const isCurrentActiveRate = Number(latestActiveRate?.rate_id || 0) === rateId;
    const isUpcomingRate = existingDateKey > todayDateKey;

    if (!isCurrentActiveRate && !isUpcomingRate) {
      return res.status(400).json({
        success: false,
        message: 'Only current active or upcoming water rates can be edited.',
      });
    }

    const normalizedEffectiveDate = normalizeWaterRateEffectiveDate(req.body.effective_date || req.body.effectiveDate);
    assertWaterRateDateIsNotPast(normalizedEffectiveDate, 'Water rate');
    const payload = {
      classification_id: parseRequiredWaterRateClassificationId(req.body.classification_id || req.body.classificationId),
      minimum_cubic: normalizeWaterRateNumericValue(req.body.minimum_cubic, 'Minimum cubic', parseInt),
      minimum_rate: normalizeWaterRateNumericValue(req.body.minimum_rate, 'Minimum rate', parseFloat),
      excess_rate_per_cubic: normalizeWaterRateNumericValue(req.body.excess_rate_per_cubic, 'Excess rate per cubic', parseFloat),
      effective_date: normalizedEffectiveDate,
      modified_by: normalizeRequiredForeignKeyId(req.body.modified_by || req.body.modifiedBy),
      modified_date: new Date().toISOString(),
    };

    const row = await withPostgresPrimary(
      'waterRates.update',
      async () => {
        const { rows } = await pool.query(
          `UPDATE waterrates
           SET classification_id = $1,
               minimum_cubic = $2,
               minimum_rate = $3,
               excess_rate_per_cubic = $4,
               effective_date = $5::date,
               modified_by = $6,
               modified_date = $7
           WHERE rate_id = $8
           RETURNING rate_id, classification_id, minimum_cubic, minimum_rate, excess_rate_per_cubic, effective_date, modified_by, modified_date`,
          [
            payload.classification_id,
            payload.minimum_cubic,
            payload.minimum_rate,
            payload.excess_rate_per_cubic,
            payload.effective_date,
            payload.modified_by,
            payload.modified_date,
            rateId,
          ]
        );

        if (!rows[0]) {
          throw createHttpError('Water rate not found.', 404);
        }

        return rows[0];
      },
      async () => {
        const { data, error } = await supabase
          .from('waterrates')
          .update({
            classification_id: payload.classification_id,
            minimum_cubic: payload.minimum_cubic,
            minimum_rate: payload.minimum_rate,
            excess_rate_per_cubic: payload.excess_rate_per_cubic,
            effective_date: payload.effective_date,
            modified_by: payload.modified_by,
            modified_date: payload.modified_date,
          })
          .eq('rate_id', rateId)
          .select()
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          throw createHttpError('Water rate not found.', 404);
        }
        return data;
      }
    );

    if (isPostgresAvailable && supabase) {
      try {
        await mirrorWaterRateRowToSupabase(row);
      } catch (mirrorError) {
        await logRequestError(req, 'waterRates.update.mirrorSupabase', mirrorError);
      }
    }

    await writeSystemLog(
      `[water-rates.update] ${classification.classification_name || `Classification #${payload.classification_id}`} rate #${rateId} updated: PHP ${formatCurrencyAmount(payload.minimum_rate)} minimum, PHP ${formatCurrencyAmount(payload.excess_rate_per_cubic)} excess per cubic meter, ${payload.minimum_cubic} m3 minimum cubic, effective ${payload.effective_date}.`,
      { accountId: payload.modified_by, role: 'Admin' }
    );
    scheduleImmediateSync('water-rates-update');
    const normalizedRow = normalizeWaterRateRowForResponse(row);
    return res.json({
      success: true,
      message: 'Water rate updated successfully.',
      data: {
        ...normalizedRow,
        classification_name: classification.classification_name || null,
      },
    });
  } catch (error) {
    await logRequestError(req, 'waterRates.update', error);
    console.error('Error updating water rate:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
  }
});

app.delete('/api/water-rates/:id', async (req, res) => {
  try {
    const rateId = Number(req.params.id);
    if (!Number.isFinite(rateId)) {
      return res.status(400).json({ success: false, message: 'Invalid water rate ID.' });
    }

    const actorAccountId =
      normalizeRequiredForeignKeyId(req.body?.modified_by || req.body?.modifiedBy || req.query?.modified_by || req.query?.modifiedBy) ||
      defaultSystemLogAccountId;

    const existingRate = await withPostgresPrimary(
      'waterRates.fetchByIdForDelete',
      async () => {
        const { rows } = await pool.query(
          `SELECT rate_id, classification_id, minimum_cubic, minimum_rate, excess_rate_per_cubic, effective_date
           FROM waterrates
           WHERE rate_id = $1
           LIMIT 1`,
          [rateId]
        );
        return rows[0] || null;
      },
      async () => {
        const { data, error } = await supabase
          .from('waterrates')
          .select('rate_id, classification_id, minimum_cubic, minimum_rate, excess_rate_per_cubic, effective_date')
          .eq('rate_id', rateId)
          .maybeSingle();
        if (error) throw error;
        return data || null;
      }
    );

    if (!existingRate) {
      return res.status(404).json({ success: false, message: 'Water rate not found.' });
    }

    const classification = await validateClassificationExists(existingRate.classification_id);

    await withPostgresPrimary(
      'waterRates.delete',
      async () => {
        const { rowCount } = await pool.query('DELETE FROM waterrates WHERE rate_id = $1', [rateId]);
        if (!rowCount) {
          throw createHttpError('Water rate not found.', 404);
        }
      },
      async () => {
        const { data, error } = await supabase
          .from('waterrates')
          .delete()
          .eq('rate_id', rateId)
          .select('rate_id');
        if (error) throw error;
        if (!(data || []).length) {
          throw createHttpError('Water rate not found.', 404);
        }
      }
    );

    if (isPostgresAvailable && supabase) {
      try {
        await mirrorWaterRateDeleteToSupabase(rateId);
      } catch (mirrorError) {
        await logRequestError(req, 'waterRates.delete.mirrorSupabase', mirrorError);
      }
    }

    await writeSystemLog(
      `[water-rates.delete] ${classification.classification_name || `Classification #${existingRate.classification_id}`} rate #${rateId} deleted: PHP ${formatCurrencyAmount(existingRate.minimum_rate)} minimum, PHP ${formatCurrencyAmount(existingRate.excess_rate_per_cubic)} excess per cubic meter, ${existingRate.minimum_cubic} m3 minimum cubic, effective ${normalizeWaterRateEffectiveDate(existingRate.effective_date)}.`,
      { accountId: actorAccountId, role: 'Admin' }
    );
    scheduleImmediateSync('water-rates-delete');
    return res.json({ success: true, message: 'Water rate deleted successfully.' });
  } catch (error) {
    await logRequestError(req, 'waterRates.delete', error);
    console.error('Error deleting water rate:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
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
    let accountPasswordHash = null;

    if (!providedLoginId && (!accountUsername || !accountPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required when creating a new consumer account.',
      });
    }

    if (!providedLoginId) {
      accountPasswordHash = hashPassword(accountPassword);
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
            `, [accountUsername, accountPasswordHash, 5, accountStatus]);
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
              password: accountPasswordHash,
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

app.put('/api/consumers/:id/profile', async (req, res) => {
  const { id } = req.params;
  const consumer = req.body || {};
  const requestedUsername = String(consumer.Username || consumer.username || '').trim();
  const requestedPassword = String(consumer.Password || consumer.password || '').trim();
  const firstName = String(consumer.First_Name || consumer.first_name || '').trim();
  const middleName = String(consumer.Middle_Name || consumer.middle_name || '').trim() || null;
  const lastName = String(consumer.Last_Name || consumer.last_name || '').trim();
  const rawContactNumber = consumer.Contact_Number || consumer.contact_number;
  const normalizedContactNumber = normalizePhilippinePhoneNumber(rawContactNumber);
  const purok = String(consumer.Purok || consumer.purok || '').trim() || null;
  const barangay = String(consumer.Barangay || consumer.barangay || '').trim() || null;
  const municipality = String(consumer.Municipality || consumer.municipality || '').trim() || 'San Lorenzo Ruiz';
  const zipCode = String(consumer.Zip_Code || consumer.zip_code || '').trim() || '4610';
  const composedAddress = [purok, barangay, municipality, zipCode].filter(Boolean).join(', ');

  if (!firstName) {
    return res.status(400).json({
      success: false,
      message: 'First name is required.',
    });
  }

  if (!lastName) {
    return res.status(400).json({
      success: false,
      message: 'Last name is required.',
    });
  }

  if (!requestedUsername) {
    return res.status(400).json({
      success: false,
      message: 'Username is required.',
    });
  }

  if (rawContactNumber && !normalizedContactNumber) {
    return res.status(400).json({
      success: false,
      message: 'Contact number must be a valid Philippine mobile number.',
    });
  }

  if (requestedPassword && requestedPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'New password must be at least 6 characters long.',
    });
  }

  try {
    const updatedProfile = await withPostgresPrimary(
      'consumers.profile.update',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const { rows: existingRows } = await client.query(`
            SELECT c.consumer_id, c.login_id, a.account_id, a.username, a.auth_user_id
            FROM consumer c
            LEFT JOIN accounts a ON a.account_id = c.login_id
            WHERE c.consumer_id = $1
            LIMIT 1
          `, [id]);

          const existingProfile = existingRows[0];
          if (!existingProfile?.consumer_id || !existingProfile?.account_id) {
            const error = new Error('Consumer not found.');
            error.statusCode = 404;
            throw error;
          }

          const normalizedCurrentUsername = String(existingProfile.username || '').trim().toLowerCase();
          if (requestedUsername.toLowerCase() !== normalizedCurrentUsername) {
            const { rows: duplicateRows } = await client.query(
              'SELECT account_id FROM accounts WHERE LOWER(TRIM(username)) = LOWER(TRIM($1)) AND account_id <> $2 LIMIT 1',
              [requestedUsername, existingProfile.account_id]
            );
            if (duplicateRows.length) {
              const duplicateError = new Error('Username is already taken.');
              duplicateError.statusCode = 400;
              throw duplicateError;
            }
          }

          const accountUpdateSets = ['username = $1'];
          const accountParams = [requestedUsername];
          if (requestedPassword) {
            accountUpdateSets.push(`password = $${accountParams.length + 1}`);
            accountParams.push(requestedPassword);
          }
          accountParams.push(existingProfile.account_id);

          const { rows: accountRows } = await client.query(`
            UPDATE accounts
            SET ${accountUpdateSets.join(', ')}
            WHERE account_id = $${accountParams.length}
            RETURNING account_id, username, auth_user_id
          `, accountParams);

          const { rows: consumerRows } = await client.query(`
            UPDATE consumer
            SET first_name = $1,
                middle_name = $2,
                last_name = $3,
                address = $4,
                purok = $5,
                barangay = $6,
                municipality = $7,
                zip_code = $8,
                contact_number = $9
            WHERE consumer_id = $10
            RETURNING *
          `, [
            firstName,
            middleName,
            lastName,
            composedAddress,
            purok,
            barangay,
            municipality,
            zipCode,
            normalizedContactNumber,
            id,
          ]);

          await client.query('COMMIT');

          return {
            consumer: consumerRows[0],
            account: accountRows[0] || {
              account_id: existingProfile.account_id,
              username: requestedUsername,
              auth_user_id: existingProfile.auth_user_id || null,
            },
          };
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      async () => {
        const { data: existingConsumer, error: existingConsumerError } = await supabase
          .from('consumer')
          .select('consumer_id, login_id')
          .eq('consumer_id', id)
          .maybeSingle();

        if (existingConsumerError) {
          throw existingConsumerError;
        }

        if (!existingConsumer?.login_id) {
          const notFoundError = new Error('Consumer not found.');
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const { data: duplicateAccounts, error: duplicateAccountsError } = await supabase
          .from('accounts')
          .select('account_id, username')
          .neq('account_id', existingConsumer.login_id);

        if (duplicateAccountsError) {
          throw duplicateAccountsError;
        }

        const duplicateAccount = (duplicateAccounts || []).find(
          (row) => String(row.username || '').trim().toLowerCase() === requestedUsername.toLowerCase()
        );

        if (duplicateAccount) {
          const duplicateError = new Error('Username is already taken.');
          duplicateError.statusCode = 400;
          throw duplicateError;
        }

        const accountPayload = { username: requestedUsername };
        if (requestedPassword) {
          accountPayload.password = requestedPassword;
        }

        const { data: accountData, error: accountError } = await supabase
          .from('accounts')
          .update(accountPayload)
          .eq('account_id', existingConsumer.login_id)
          .select('account_id, username, auth_user_id')
          .maybeSingle();

        if (accountError) {
          throw accountError;
        }

        const { data, error } = await supabase
          .from('consumer')
          .update({
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            address: composedAddress,
            purok,
            barangay,
            municipality,
            zip_code: zipCode,
            contact_number: normalizedContactNumber,
          })
          .eq('consumer_id', id)
          .select()
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          const notFoundError = new Error('Consumer not found.');
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        return {
          consumer: data,
          account: accountData || {
            account_id: existingConsumer.login_id,
            username: requestedUsername,
            auth_user_id: null,
          },
        };
      }
    );

    await syncAccountAuthCredentials({
      accountId: updatedProfile.account?.account_id,
      username: updatedProfile.account?.username || requestedUsername,
      password: requestedPassword || null,
      authUserId: updatedProfile.account?.auth_user_id || null,
    });

    const fullName = [updatedProfile.consumer.first_name, updatedProfile.consumer.middle_name, updatedProfile.consumer.last_name]
      .filter(Boolean)
      .join(' ')
      .trim() || `Consumer #${updatedProfile.consumer.consumer_id}`;
    await writeSystemLog(
      requestedPassword
        ? `[password.change] ${fullName} updated account credentials.`
        : `[profile.update] ${fullName} updated profile details.`,
      { accountId: updatedProfile.account?.account_id || defaultSystemLogAccountId, role: 'Consumer' }
    );

    scheduleImmediateSync('consumers-profile-update');
    return res.json({
      success: true,
      message: requestedPassword ? 'Profile and login credentials updated successfully.' : 'Profile updated successfully.',
      data: {
        Consumer_ID: updatedProfile.consumer.consumer_id,
        First_Name: updatedProfile.consumer.first_name,
        Middle_Name: updatedProfile.consumer.middle_name,
        Last_Name: updatedProfile.consumer.last_name,
        Address: updatedProfile.consumer.address,
        Purok: updatedProfile.consumer.purok,
        Barangay: updatedProfile.consumer.barangay,
        Municipality: updatedProfile.consumer.municipality,
        Zip_Code: updatedProfile.consumer.zip_code,
        Contact_Number: updatedProfile.consumer.contact_number,
        Username: updatedProfile.account?.username || requestedUsername,
      },
    });
  } catch (error) {
    await logRequestError(req, 'consumers.profile.update', error);
    console.error('Error updating consumer profile:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to update consumer profile.',
    });
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

app.put('/api/consumers/:id/disconnect', async (req, res) => {
  const consumerId = normalizeRequiredForeignKeyId(req.params.id);
  const reason = String(req.body?.reason || '').trim();
  const monthsOverdue = Number(req.body?.months_overdue || req.body?.monthsOverdue || 0);
  const unpaidBills = Number(req.body?.unpaid_bills || req.body?.unpaidBills || 0);
  const actorAccountId = normalizeRequiredForeignKeyId(req.body?.actor_account_id || req.body?.actorAccountId);
  const actorRoleName = String(req.body?.actor_role_name || req.body?.actorRoleName || '').trim();
  const disconnectionScope = String(req.body?.disconnection_scope || req.body?.disconnectionScope || 'service').trim().toLowerCase() === 'account'
    ? 'Account Access Restriction'
    : 'Full Service Disconnect';
  const effectiveDate = String(req.body?.effective_date || req.body?.effectiveDate || '').trim();
  const referenceNo = String(req.body?.reference_no || req.body?.referenceNo || '').trim();

  if (!consumerId) {
    return res.status(400).json({ success: false, message: 'A valid consumer ID is required.' });
  }
  if (!reason) {
    return res.status(400).json({ success: false, message: 'Disconnection reason is required.' });
  }

  try {
    const result = await withPostgresPrimary(
      'consumers.disconnect',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const { rows: consumerRows } = await client.query(
            `SELECT consumer_id, first_name, middle_name, last_name, account_number, login_id
             FROM consumer
             WHERE consumer_id = $1
             LIMIT 1`,
            [consumerId]
          );
          if (!consumerRows.length) {
            throw createHttpError('Consumer not found.', 404);
          }
          const consumer = consumerRows[0];

          await client.query(
            `UPDATE consumer
             SET status = 'Disconnected'
             WHERE consumer_id = $1`,
            [consumerId]
          );

          if (Number(consumer.login_id) > 0) {
            await client.query(
              `UPDATE accounts
               SET account_status = 'Disconnected',
                   updated_at = NOW()
               WHERE account_id = $1`,
              [consumer.login_id]
            );

            await client.query(
              `UPDATE connection_ticket
               SET status = 'Disconnected',
                   remarks = CASE
                     WHEN COALESCE(NULLIF(TRIM(remarks), ''), '') = '' THEN $2
                     ELSE remarks || E'\n' || $2
                   END
               WHERE account_id = $1`,
              [consumer.login_id, `[disconnect] ${reason}${referenceNo ? ` | Ref: ${referenceNo}` : ''}${effectiveDate ? ` | Effective: ${effectiveDate}` : ''}${disconnectionScope ? ` | Scope: ${disconnectionScope}` : ''}`]
            );
          }

          await client.query('COMMIT');
          return consumer;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      async () => {
        const { data: consumer, error: consumerError } = await supabase
          .from('consumer')
          .select('consumer_id, first_name, middle_name, last_name, account_number, login_id')
          .eq('consumer_id', consumerId)
          .maybeSingle();
        if (consumerError) throw consumerError;
        if (!consumer) {
          throw createHttpError('Consumer not found.', 404);
        }

        const { error: consumerUpdateError } = await supabase
          .from('consumer')
          .update({ status: 'Disconnected' })
          .eq('consumer_id', consumerId);
        if (consumerUpdateError) throw consumerUpdateError;

        if (Number(consumer.login_id) > 0) {
          const { error: accountUpdateError } = await supabase
            .from('accounts')
            .update({ account_status: 'Disconnected' })
            .eq('account_id', consumer.login_id);
          if (accountUpdateError) throw accountUpdateError;

          const { data: ticketRows, error: ticketFetchError } = await supabase
            .from('connection_ticket')
            .select('ticket_id, remarks')
            .eq('account_id', consumer.login_id);
          if (ticketFetchError) throw ticketFetchError;

          for (const ticket of ticketRows || []) {
            const nextRemarks = ticket.remarks
              ? `${String(ticket.remarks).trim()}\n[disconnect] ${reason}${referenceNo ? ` | Ref: ${referenceNo}` : ''}${effectiveDate ? ` | Effective: ${effectiveDate}` : ''}${disconnectionScope ? ` | Scope: ${disconnectionScope}` : ''}`
              : `[disconnect] ${reason}${referenceNo ? ` | Ref: ${referenceNo}` : ''}${effectiveDate ? ` | Effective: ${effectiveDate}` : ''}${disconnectionScope ? ` | Scope: ${disconnectionScope}` : ''}`;
            const { error: ticketUpdateError } = await supabase
              .from('connection_ticket')
              .update({ status: 'Disconnected', remarks: nextRemarks })
              .eq('ticket_id', ticket.ticket_id);
            if (ticketUpdateError) throw ticketUpdateError;
          }
        }

        return consumer;
      }
    );

    const fullName = [result.first_name, result.middle_name, result.last_name].filter(Boolean).join(' ').trim() || `Consumer #${consumerId}`;
    await writeSystemLog(
      `[consumers.disconnect] ${fullName} (${result.account_number || 'N/A'}) marked Disconnected. Reason: ${reason}. Scope: ${disconnectionScope}.${effectiveDate ? ` Effective: ${effectiveDate}.` : ''}${referenceNo ? ` Ref: ${referenceNo}.` : ''} Overdue: ${monthsOverdue} month(s). Unpaid bills: ${unpaidBills}.`,
      { role: actorRoleName || 'Billing Officer', accountId: actorAccountId || defaultSystemLogAccountId }
    );
    scheduleImmediateSync('consumers-disconnect');
    return res.json({ success: true, message: 'Consumer disconnected successfully.' });
  } catch (error) {
    await logRequestError(req, 'consumers.disconnect', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
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
    const penalty = Number(bill.Penalty ?? bill.Penalties ?? 0);
    const previousBalance = Number(bill.Previous_Balance ?? 0);
    const previousPenalty = Number(bill.Previous_Penalty ?? 0);
    const maintenanceFee = Number(bill.Environmental_Fee ?? bill.Meter_Fee ?? 0);
    const connectionFee = Number(bill.Connection_Fee ?? 0);
    const previousReading = Number(bill.Previous_Reading ?? 0);
    const currentReading = Number(bill.Current_Reading ?? previousReading);
    const consumption = Number(bill.Consumption ?? Math.max(0, currentReading - previousReading));
    const classificationId = await resolveConsumerClassificationId(consumerId);
    const applicableRate = await resolveApplicableWaterRate(classificationId, billDate);
    const currentChargeOverride = bill.Current_Charge_Override ?? bill.current_charge_override;
    const hasCurrentChargeOverride = currentChargeOverride !== undefined && currentChargeOverride !== null && currentChargeOverride !== '';
    const computedCurrentCharge = computeWaterChargeFromRate(consumption, applicableRate);
    const currentCharge = hasCurrentChargeOverride
      ? Number(currentChargeOverride)
      : Number(bill.Water_Charge ?? bill.Basic_Charge ?? computedCurrentCharge);
    const computedTotalAmount = currentCharge + maintenanceFee + connectionFee + previousBalance + previousPenalty;
    const totalAmount = Number(bill.Total_Amount ?? bill.Amount_Due ?? computedTotalAmount);
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
    const penalty = Number(bill.Penalty ?? bill.Penalties ?? 0);
    const previousBalance = Number(bill.Previous_Balance ?? 0);
    const previousPenalty = Number(bill.Previous_Penalty ?? 0);
    const maintenanceFee = Number(bill.Environmental_Fee ?? bill.Meter_Fee ?? 0);
    const connectionFee = Number(bill.Connection_Fee ?? 0);
    const previousReading = Number(bill.Previous_Reading ?? 0);
    const currentReading = Number(bill.Current_Reading ?? previousReading);
    const consumption = Number(bill.Consumption ?? Math.max(0, currentReading - previousReading));
    const classificationId = await resolveConsumerClassificationId(consumerId);
    const applicableRate = await resolveApplicableWaterRate(classificationId, billDate);
    const currentChargeOverride = bill.Current_Charge_Override ?? bill.current_charge_override;
    const hasCurrentChargeOverride = currentChargeOverride !== undefined && currentChargeOverride !== null && currentChargeOverride !== '';
    const computedCurrentCharge = computeWaterChargeFromRate(consumption, applicableRate);
    const currentCharge = hasCurrentChargeOverride
      ? Number(currentChargeOverride)
      : Number(bill.Water_Charge ?? bill.Basic_Charge ?? computedCurrentCharge);
    const computedTotalAmount = currentCharge + maintenanceFee + connectionFee + previousBalance + previousPenalty;
    const totalAmount = Number(bill.Total_Amount ?? bill.Amount_Due ?? computedTotalAmount);
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
  const normalizedAccountId = normalizeRequiredForeignKeyId(req.params.accountId);
  if (!normalizedAccountId) {
    return res.status(400).json({ success: false, message: 'Invalid account ID.' });
  }

  try {
    await ensureConsumerProfileForConsumerAccount(normalizedAccountId);

    const result = await withPostgresPrimary(
      'consumerDashboard.fetch',
      async () => {
        const consumerResult = await pool.query(`
          SELECT c.*,
                 a.username,
                 a.profile_picture_url,
                 a.account_status,
                 z.zone_name,
                 cl.classification_name,
                 m.meter_serial_number AS meter_number,
                 m.meter_status
          FROM consumer c
          LEFT JOIN accounts a ON a.account_id = c.login_id
          LEFT JOIN zone z ON z.zone_id = c.zone_id
          LEFT JOIN classification cl ON cl.classification_id = c.classification_id
          LEFT JOIN LATERAL (
            SELECT meter_serial_number, meter_status
            FROM meter
            WHERE consumer_id = c.consumer_id
            ORDER BY meter_id DESC
            LIMIT 1
          ) m ON true
          WHERE c.login_id = $1
          LIMIT 1
        `, [normalizedAccountId]);

        const consumer = consumerResult.rows[0];
        if (!consumer) {
          return null;
        }

        const [billRows, paymentRows, readingRows, ticketRows] = await Promise.all([
          pool.query('SELECT * FROM bills WHERE consumer_id = $1 ORDER BY bill_date DESC', [consumer.consumer_id]),
          pool.query('SELECT * FROM payment WHERE consumer_id = $1 ORDER BY payment_date DESC', [consumer.consumer_id]),
          pool.query('SELECT * FROM meterreadings WHERE consumer_id = $1 ORDER BY reading_date DESC LIMIT 6', [consumer.consumer_id]),
          pool.query('SELECT ticket_id, ticket_number, connection_type, status, application_date, approved_date, remarks FROM connection_ticket WHERE account_id = $1 ORDER BY ticket_id DESC LIMIT 1', [normalizedAccountId]),
        ]);

        const mappedBills = billRows.rows.map((bill) => mapBillRecord(bill, new Map([[consumer.consumer_id, consumer]]), new Map([[consumer.classification_id, consumer.classification_name]])));
        const billMap = new Map(billRows.rows.map((bill) => [bill.bill_id, bill]));
        const ticket = ticketRows.rows[0] || null;
        const disconnectionReason = extractTaggedRemark(ticket?.remarks, 'disconnect');
        const reconnectionReason = extractTaggedRemark(ticket?.remarks, 'reconnection-request');

        return {
          consumer: { ...consumer, Consumer_ID: consumer.consumer_id },
          bills: mappedBills,
          payments: paymentRows.rows.map((payment) => mapPaymentRecord(payment, new Map([[consumer.consumer_id, consumer]]), billMap)),
          readings: readingRows.rows.map((r) => ({
            Reading_Date: r.reading_date || r.created_date,
            Consumption: r.consumption,
          })).reverse(),
          ticket: ticket ? {
            Ticket_ID: ticket.ticket_id,
            Ticket_Number: ticket.ticket_number,
            Connection_Type: ticket.connection_type,
            Status: ticket.status,
            Application_Date: ticket.application_date,
            Approved_Date: ticket.approved_date,
            Remarks: ticket.remarks,
            Disconnection_Reason: disconnectionReason,
            Reconnection_Reason: reconnectionReason,
          } : null,
        };
      },
      async () => {
        const { data: consumer, error: cErr } = await supabase
          .from('consumer')
          .select('*')
          .eq('login_id', normalizedAccountId)
          .maybeSingle();
        if (cErr) throw cErr;
        if (!consumer) {
          return null;
        }

        const consumerId = consumer.consumer_id;
        const [
          { data: bills, error: billsError },
          { data: payments, error: paymentsError },
          { data: readings, error: readingsError },
          { data: meters, error: metersError },
          { data: account, error: accountError },
          { data: zone, error: zoneError },
          { data: classification, error: classificationError },
          { data: tickets, error: ticketError },
        ] = await Promise.all([
          supabase.from('bills').select('*').eq('consumer_id', consumerId).order('bill_date', { ascending: false }),
          supabase.from('payment').select('*').eq('consumer_id', consumerId).order('payment_date', { ascending: false }),
          supabase.from('meterreadings').select('*').eq('consumer_id', consumerId).order('reading_date', { ascending: false }).limit(6),
          supabase.from('meter').select('meter_serial_number, meter_status').eq('consumer_id', consumerId).order('meter_id', { ascending: false }).limit(1),
          supabase.from('accounts').select('username, profile_picture_url, account_status').eq('account_id', normalizedAccountId).maybeSingle(),
          supabase.from('zone').select('zone_name').eq('zone_id', consumer.zone_id).maybeSingle(),
          supabase.from('classification').select('classification_name').eq('classification_id', consumer.classification_id).maybeSingle(),
          supabase.from('connection_ticket').select('ticket_id, ticket_number, connection_type, status, application_date, approved_date, remarks').eq('account_id', normalizedAccountId).order('ticket_id', { ascending: false }).limit(1),
        ]);
        if (billsError) throw billsError;
        if (paymentsError) throw paymentsError;
        if (readingsError) throw readingsError;
        if (metersError) throw metersError;
        if (accountError) throw accountError;
        if (zoneError) throw zoneError;
        if (classificationError) throw classificationError;

        const billMap = new Map((bills || []).map((bill) => [bill.bill_id, bill]));
        const rawTicket = tickets?.[0] || null;
        const disconnectionReason = extractTaggedRemark(rawTicket?.remarks, 'disconnect');
        const reconnectionReason = extractTaggedRemark(rawTicket?.remarks, 'reconnection-request');

        return {
          consumer: {
            ...consumer,
            Consumer_ID: consumer.consumer_id,
            Username: account?.username || null,
            Profile_Picture_URL: account?.profile_picture_url || null,
            Account_Status: account?.account_status || consumer.status || null,
            Zone_Name: zone?.zone_name || null,
            Classification_Name: classification?.classification_name || null,
            meter_number: meters?.[0]?.meter_serial_number || null,
            meter_status: meters?.[0]?.meter_status || null,
          },
          bills: (bills || []).map((bill) => mapBillRecord(bill, new Map([[consumerId, consumer]]), new Map([[consumer.classification_id, classification?.classification_name || null]]))),
          payments: (payments || []).map((payment) => mapPaymentRecord(payment, new Map([[consumerId, consumer]]), billMap)),
          readings: (readings || []).map((r) => ({
            Reading_Date: r.reading_date || r.created_at || r.created_date,
            Consumption: r.consumption,
          })).reverse(),
          ticket: rawTicket ? {
            Ticket_ID: rawTicket.ticket_id,
            Ticket_Number: rawTicket.ticket_number,
            Connection_Type: rawTicket.connection_type,
            Status: rawTicket.status,
            Application_Date: rawTicket.application_date,
            Approved_Date: rawTicket.approved_date,
            Remarks: rawTicket.remarks,
            Disconnection_Reason: disconnectionReason,
            Reconnection_Reason: reconnectionReason,
          } : null,
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

app.post('/api/consumer/reconnection-request', async (req, res) => {
  const accountId = normalizeRequiredForeignKeyId(req.body?.accountId);
  const reason = String(req.body?.reason || '').trim();

  if (!accountId) {
    return res.status(400).json({ success: false, message: 'Account ID is required.' });
  }
  if (!reason) {
    return res.status(400).json({ success: false, message: 'Reconnection reason is required.' });
  }

  try {
    const ticketNumber = generateRegistrationTicketNumber();
    const result = await withPostgresPrimary(
      'consumer.reconnectionRequest',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const { rows: consumerRows } = await client.query(
            `SELECT consumer_id, status, first_name, middle_name, last_name, account_number
             FROM consumer
             WHERE login_id = $1
             LIMIT 1`,
            [accountId]
          );
          const consumer = consumerRows[0] || null;
          if (!consumer) {
            throw createHttpError('Consumer record not found.', 404);
          }

          if (String(consumer.status || '').trim().toLowerCase() !== 'disconnected') {
            throw createHttpError('Only disconnected accounts can request reconnection.', 400);
          }

          const { rows: existingRows } = await client.query(
            `SELECT ticket_id, ticket_number
             FROM connection_ticket
             WHERE account_id = $1
               AND LOWER(COALESCE(status, 'pending')) = 'pending'
               AND LOWER(COALESCE(connection_type, '')) = 'reconnection'
             ORDER BY ticket_id DESC
             LIMIT 1`,
            [accountId]
          );
          if (existingRows.length) {
            throw createHttpError(`A reconnection request is already pending (Ticket: ${existingRows[0].ticket_number}).`, 409);
          }

          await client.query(
            `INSERT INTO connection_ticket (consumer_id, account_id, ticket_number, application_date, connection_type, requirements_submitted, status, remarks)
             VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 'Reconnection', NULL, 'Pending', $4)`,
            [consumer.consumer_id, accountId, ticketNumber, `[reconnection-request] ${reason}`]
          );

          await client.query(
            `UPDATE accounts
             SET updated_at = NOW()
             WHERE account_id = $1`,
            [accountId]
          );

          await client.query('COMMIT');
          return consumer;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      async () => {
        const { data: consumer, error: consumerError } = await supabase
          .from('consumer')
          .select('consumer_id, status, first_name, middle_name, last_name, account_number')
          .eq('login_id', accountId)
          .maybeSingle();
        if (consumerError) throw consumerError;
        if (!consumer) {
          throw createHttpError('Consumer record not found.', 404);
        }
        if (String(consumer.status || '').trim().toLowerCase() !== 'disconnected') {
          throw createHttpError('Only disconnected accounts can request reconnection.', 400);
        }

        const { data: existingTickets, error: existingError } = await supabase
          .from('connection_ticket')
          .select('ticket_id, ticket_number')
          .eq('account_id', accountId)
          .eq('status', 'Pending')
          .eq('connection_type', 'Reconnection')
          .order('ticket_id', { ascending: false })
          .limit(1);
        if (existingError) throw existingError;
        if ((existingTickets || []).length) {
          throw createHttpError(`A reconnection request is already pending (Ticket: ${existingTickets[0].ticket_number}).`, 409);
        }

        await insertSupabaseRowWithPrimaryKeyRetry(
          'connection_ticket',
          'ticket_id',
          {
            consumer_id: consumer.consumer_id,
            account_id: accountId,
            ticket_number: ticketNumber,
            application_date: new Date().toISOString(),
            connection_type: 'Reconnection',
            requirements_submitted: null,
            status: 'Pending',
            remarks: `[reconnection-request] ${reason}`,
          },
          'ticket_id'
        );

        return consumer;
      }
    );

    const fullName = [result.first_name, result.middle_name, result.last_name].filter(Boolean).join(' ').trim() || `Consumer #${result.consumer_id}`;
    await writeSystemLog(
      `[consumer.reconnectionRequest] ${fullName} (${result.account_number || 'N/A'}) submitted reconnection request. Reason: ${reason}`,
      { role: 'Consumer', accountId }
    );
    scheduleImmediateSync('consumer-reconnection-request');
    return res.json({ success: true, ticketNumber, message: 'Reconnection request submitted successfully.' });
  } catch (error) {
    await logRequestError(req, 'consumer.reconnectionRequest', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
  }
});


// Consumer applies for water connection from within the dashboard
app.post('/api/consumer/apply', async (req, res) => {
  const { accountId, classificationId, connectionType, sedulaImage } = req.body;
  const normalizedAccountId = normalizeRequiredForeignKeyId(accountId);
  if (!normalizedAccountId) return res.status(400).json({ success: false, message: 'Account ID is required.' });
  const normalizedClassificationId = classificationId === null || classificationId === undefined || classificationId === ''
    ? null
    : normalizeRequiredForeignKeyId(classificationId);
  if (classificationId !== null && classificationId !== undefined && classificationId !== '' && !normalizedClassificationId) {
    return res.status(400).json({ success: false, message: 'Classification must be a valid ID.' });
  }
  let normalizedSedula = null;
  if (sedulaImage) {
    try { normalizedSedula = normalizeRequirementSubmission(sedulaImage, { allowText: false }); }
    catch (error) { return res.status(400).json({ success: false, message: error.message }); }
  }
  try {
    if (normalizedClassificationId) {
      await validateClassificationExists(normalizedClassificationId);
    }

    await ensureConsumerProfileForConsumerAccount(normalizedAccountId);

    const consumerProfile = await withPostgresPrimary(
      'consumer.apply.profile',
      async () => {
        const { rows } = await pool.query(
          `SELECT consumer_id, first_name, middle_name, last_name, contact_number, purok, barangay, municipality, zip_code, classification_id
           FROM consumer
           WHERE login_id = $1
           ORDER BY consumer_id DESC
           LIMIT 1`,
          [normalizedAccountId]
        );
        return rows[0] || null;
      },
      async () => {
        const { data, error } = await supabase
          .from('consumer')
          .select('consumer_id, first_name, middle_name, last_name, contact_number, purok, barangay, municipality, zip_code, classification_id')
          .eq('login_id', normalizedAccountId)
          .order('consumer_id', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data || null;
      }
    );

    if (!consumerProfile?.consumer_id) {
      return res.status(404).json({ success: false, message: 'Consumer profile not found. Please complete your profile first.' });
    }

    const missingProfileFields = collectConsumerProfileMissingFields(consumerProfile);
    if (missingProfileFields.length) {
      return res.status(400).json({
        success: false,
        message: `Complete your profile first before applying. Missing: ${missingProfileFields.join(', ')}.`,
      });
    }

    const normalizedProfilePhone = normalizePhilippinePhoneNumber(consumerProfile.contact_number);
    if (!normalizedProfilePhone) {
      return res.status(400).json({
        success: false,
        message: 'Complete your profile first before applying. Contact number must be a valid Philippine mobile number.',
      });
    }

    const existingTicket = await withPostgresPrimary(
      'consumer.apply.check',
      async () => { const { rows } = await pool.query("SELECT ticket_id, ticket_number FROM connection_ticket WHERE account_id = $1 AND status IN ('Pending','Active') LIMIT 1", [normalizedAccountId]); return rows[0] || null; },
      async () => { const { data } = await supabase.from('connection_ticket').select('ticket_id, ticket_number').eq('account_id', normalizedAccountId).in('status', ['Pending','Active']).limit(1); return data?.[0] || null; }
    );
    if (existingTicket) return res.status(409).json({ success: false, message: `You already have a pending application (Ticket: ${existingTicket.ticket_number}).` });
    let ticketNumber = null;
    const fullName = [consumerProfile.first_name, consumerProfile.middle_name, consumerProfile.last_name].filter(Boolean).join(' ').trim();
    await withPostgresPrimary(
      'consumer.apply.create',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          ticketNumber = await generateSequentialRegistrationTicketNumber({ pgClient: client });
          await client.query(
            `UPDATE consumer
             SET status = 'Pending',
                 classification_id = COALESCE($1::int, classification_id)
             WHERE consumer_id = $2`,
            [normalizedClassificationId || null, consumerProfile.consumer_id]
          );
          await client.query("INSERT INTO connection_ticket (consumer_id,account_id,ticket_number,connection_type,requirements_submitted,status) VALUES ($1,$2,$3,$4,$5,'Pending')",
            [consumerProfile.consumer_id, normalizedAccountId, ticketNumber, connectionType || 'New Connection', normalizedSedula]);
          if (fullName) await client.query("UPDATE accounts SET full_name=$1 WHERE account_id=$2 AND (full_name IS NULL OR full_name='')", [fullName, normalizedAccountId]);
          await client.query('COMMIT');
        } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      },
      async () => {
        ticketNumber = await generateSequentialRegistrationTicketNumber({ useSupabase: true });
        const { error: consumerUpdateError } = await supabase
          .from('consumer')
          .update({ classification_id: normalizedClassificationId || consumerProfile.classification_id || null, status: 'Pending' })
          .eq('consumer_id', consumerProfile.consumer_id);
        if (consumerUpdateError) throw consumerUpdateError;
        await insertSupabaseRowWithPrimaryKeyRetry('connection_ticket', 'ticket_id', { consumer_id: consumerProfile.consumer_id, account_id: normalizedAccountId, ticket_number: ticketNumber, connection_type: connectionType || 'New Connection', requirements_submitted: normalizedSedula, status: 'Pending' }, 'ticket_id');
      }
    );
    scheduleImmediateSync('consumer-apply');    return res.json({ success: true, ticketNumber, message: 'Application submitted successfully.' });
  } catch (error) {
    await logRequestError(req, 'consumer.apply', error);
    console.error('Consumer apply error:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message || 'Internal server error during application.' });
  }
});

app.post('/api/consumer/report-concern', async (req, res) => {
  const { accountId, category, subject, description, priority } = req.body;
  if (!accountId || !category || !subject || !description) {
    return res.status(400).json({ success: false, message: 'All required fields must be provided.' });
  }

  try {
    const consumerData = await withPostgresPrimary(
      'consumer.concern.getConsumer',
      async () => {
        const { rows } = await pool.query("SELECT consumer_id FROM consumer WHERE login_id = $1 LIMIT 1", [accountId]);
        return rows[0] || null;
      },
      async () => {
        const { data } = await supabase.from('consumer').select('consumer_id').eq('login_id', accountId).maybeSingle();
        return data || null;
      }
    );

    if (!consumerData) {
      return res.status(404).json({ success: false, message: 'Consumer account not found.' });
    }

    const consumerId = consumerData.consumer_id;

    await withPostgresPrimary(
      'consumer.concern.create',
      async () => {
        await pool.query(
          "INSERT INTO consumer_concerns (consumer_id, account_id, category, subject, description, priority, status) VALUES ($1, $2, $3, $4, $5, $6, 'Pending')",
          [consumerId, accountId, category, subject, description, priority || 'Normal']
        );
      },
      async () => {
        await supabase.from('consumer_concerns').insert({
          consumer_id: consumerId,
          account_id: accountId,
          category,
          subject,
          description,
          priority: priority || 'Normal',
          status: 'Pending'
        });
      }
    );

    scheduleImmediateSync('consumer-concern-report');
    return res.json({ success: true, message: 'Problem reported successfully.' });
  } catch (error) {
    await logRequestError(req, 'consumer.report-concern', error);
    console.error('Consumer report concern error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit report.' });
  }
});

app.get('/api/consumer/concerns/:accountId', async (req, res) => {
  const { accountId } = req.params;
  try {
    const concerns = await withPostgresPrimary(
      'consumer.concerns.list',
      async () => {
        const { rows } = await pool.query(
          "SELECT * FROM consumer_concerns WHERE account_id = $1 ORDER BY created_at DESC",
          [accountId]
        );
        return rows;
      },
      async () => {
        const { data } = await supabase
          .from('consumer_concerns')
          .select('*')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false });
        return data || [];
      }
    );
    return res.json({ success: true, concerns });
  } catch (error) {
    await logRequestError(req, 'consumer.concerns.list', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch concerns history.' });
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
    const adminSettings = await loadResolvedAdminSettings();
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

function normalizePhilippineSmsRecipient(phoneNumber) {
  const localFormat = normalizePhilippinePhoneNumber(phoneNumber);
  if (!localFormat) {
    return null;
  }
  return `63${localFormat.slice(1)}`;
}

function sendFormUrlEncodedRequest(targetUrl, payload, { headers = {}, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
    } catch (error) {
      reject(new Error(`Invalid SMS URL: ${targetUrl}`));
      return;
    }

    const body = new URLSearchParams(payload).toString();
    const request = https.request({
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
      timeout: timeoutMs,
    }, (response) => {
      let responseBody = '';
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          statusCode: response.statusCode,
          body: responseBody,
        });
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('SMS request timed out.'));
    });
    request.on('error', (error) => reject(error));
    request.write(body);
    request.end();
  });
}

async function sendSmsViaSemaphore(phone, message) {
  const apiKey = String(process.env.SMS_SEMAPHORE_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('SMS_SEMAPHORE_API_KEY is missing. Configure it in backend/.env.');
  }

  const recipient = normalizePhilippineSmsRecipient(phone);
  if (!recipient) {
    throw new Error('Recipient phone number is invalid for SMS sending.');
  }

  const senderName = String(process.env.SMS_SEMAPHORE_SENDERNAME || '').trim();
  const endpoint = String(process.env.SMS_SEMAPHORE_ENDPOINT || 'https://api.semaphore.co/api/v4/messages').trim();
  const timeoutMs = Number(process.env.SMS_TIMEOUT_MS || 15000);
  const payload = {
    apikey: apiKey,
    number: recipient,
    message: String(message || '').trim(),
  };
  if (senderName) {
    payload.sendername = senderName;
  }

  const response = await sendFormUrlEncodedRequest(endpoint, payload, { timeoutMs });
  if (!response.ok) {
    throw new Error(`Semaphore SMS failed (${response.statusCode}): ${response.body || 'No response body'}`);
  }

  let parsed;
  try {
    parsed = response.body ? JSON.parse(response.body) : null;
  } catch (error) {
    parsed = response.body || null;
  }

  return {
    success: true,
    provider: 'semaphore',
    recipient,
    response: parsed,
  };
}

// SMS provider driver (default is mock; set SMS_PROVIDER=semaphore for actual sending)
const sendSMS = async (phone, message) => {
  const provider = String(process.env.SMS_PROVIDER || 'mock').trim().toLowerCase();
  const messageText = String(message || '').trim();
  if (!messageText) {
    throw new Error('SMS message is empty.');
  }

  if (provider === 'mock') {
    console.log(`\n--- MOCK SMS SENT ---`);
    console.log(`To: ${phone}`);
    console.log(`Message: ${messageText}`);
    console.log(`----------------------\n`);
    return { success: true, provider: 'mock', recipient: phone };
  }

  if (provider === 'semaphore') {
    return sendSmsViaSemaphore(phone, messageText);
  }

  throw new Error(`Unsupported SMS_PROVIDER "${provider}". Use "semaphore" or "mock".`);
};

function buildPublicConcernSmsReply(subject, replyText) {
  return [
    'San Lorenzo Ruiz Waterworks System',
    `Re: ${subject || 'Public Concern'}`,
    String(replyText || '').trim(),
  ]
    .filter(Boolean)
    .join('\n');
}

// --- FORGOT PASSWORD ENDPOINTS ---
app.post('/api/forgot-password/request', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  if (!username) {
    return res.status(400).json({ success: false, message: 'Username is required.' });
  }

  try {
    const user = await withPostgresPrimary(
      'forgotPassword.request',
      async () => {
        const { rows } = await pool.query('SELECT account_id, username, contact_number FROM accounts WHERE username = $1', [username]);
        return rows[0] || null;
      },
      async () => {
        const { data, error } = await supabase.from('accounts').select('account_id, username, contact_number').eq('username', username).maybeSingle();
        if (error) throw error;
        return data || null;
      }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const resetCode = generatePasswordResetCode();
    const expirationTime = buildPasswordResetExpiration();

    await withPostgresPrimary(
      'forgotPassword.request.store',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(
            `UPDATE password_reset
             SET status = CASE WHEN expiration_time < NOW() THEN 'Expired' ELSE 'Cancelled' END
             WHERE account_id = $1 AND status = 'Pending'`,
            [user.account_id]
          );
          await client.query(
            `INSERT INTO password_reset (account_id, reset_token, expiration_time, status)
             VALUES ($1, $2, $3, 'Pending')`,
            [user.account_id, resetCode, expirationTime]
          );
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      async () => {
        const { error: cancelError } = await supabase
          .from('password_reset')
          .update({ status: 'Cancelled' })
          .eq('account_id', user.account_id)
          .eq('status', 'Pending');
        if (cancelError) throw cancelError;

        const { error: insertError } = await supabase
          .from('password_reset')
          .insert([{
            account_id: user.account_id,
            reset_token: resetCode,
            expiration_time: expirationTime,
            status: 'Pending',
          }]);
        if (insertError) throw insertError;
      }
    );

    await sendSMS(user.contact_number, `Password reset code for ${username}: ${resetCode}`);
    return res.json({
      success: true,
      message: 'Password reset code generated successfully.',
      ...(process.env.NODE_ENV === 'production' ? {} : { debugCode: resetCode }),
    });
  } catch (error) {
    await logRequestError(req, 'forgotPassword.request', error);
    console.error('Forgot password request error:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
  }
});

app.post('/api/public/contact', async (req, res) => {
  const fullName = String(req.body?.fullName || '').trim();
  const barangay = String(req.body?.barangay || '').trim();
  const rawContactNumber = String(req.body?.contactNumber || '').trim();
  const subject = String(req.body?.subject || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!fullName || !barangay || !rawContactNumber || !subject || !message) {
    return res.status(400).json({ success: false, message: 'All required fields must be provided.' });
  }

  const normalizedContactNumber = normalizePhilippinePhoneNumber(rawContactNumber);
  if (!normalizedContactNumber) {
    return res.status(400).json({ success: false, message: 'Contact number must be a valid Philippine mobile number.' });
  }

  if (message.length < 10) {
    return res.status(400).json({ success: false, message: 'Message must be at least 10 characters long.' });
  }

  try {
    await withPostgresPrimary(
      'public.contact.submit',
      async () => {
        await pool.query(
          `INSERT INTO consumer_concerns
            (consumer_id, account_id, category, subject, description, priority, status, full_name, barangay, contact_number)
           VALUES (NULL, $1, $2, $3, $4, 'Normal', 'Pending', $5, $6, $7)`,
          [defaultSystemLogAccountId, 'Public Contact', subject, message, fullName, barangay, normalizedContactNumber]
        );
      },
      async () => {
        const { error } = await supabase.from('consumer_concerns').insert([{
          consumer_id: null,
          account_id: defaultSystemLogAccountId,
          category: 'Public Contact',
          subject,
          description: message,
          priority: 'Normal',
          status: 'Pending',
          full_name: fullName,
          barangay,
          contact_number: normalizedContactNumber,
        }]);
        if (error) throw error;
      }
    );

    await writeSystemLog(`[public-contact] ${fullName} submitted: ${subject}`, { role: 'Public' });
    scheduleImmediateSync('public-contact-submit');
    return res.json({ success: true, message: 'Message submitted successfully.' });
  } catch (error) {
    await logRequestError(req, 'public.contact.submit', error);
    return res.status(500).json({ success: false, message: 'Failed to submit message.' });
  }
});

app.get('/api/public-contact-messages', async (req, res) => {
  const query = String(req.query?.q || '').trim().toLowerCase();
  const statusFilter = String(req.query?.status || '').trim();

  try {
    const rows = await withPostgresPrimary(
      'public.contact.list',
      async () => {
        const clauses = [];
        const values = [['Public Contact', 'Public Concern']];

        if (statusFilter) {
          values.push(statusFilter);
          clauses.push(`cc.status = $${values.length}`);
        }

        if (query) {
          values.push(`%${query}%`);
          clauses.push(
            `(LOWER(COALESCE(
                  NULLIF(cc.full_name, ''),
                  NULLIF(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name), ''),
                  NULLIF(a.full_name, ''),
                  a.username,
                  ''
                )) LIKE $${values.length}
              OR LOWER(COALESCE(NULLIF(cc.barangay, ''), NULLIF(c.barangay, ''), '')) LIKE $${values.length}
              OR LOWER(COALESCE(cc.subject, '')) LIKE $${values.length}
              OR LOWER(COALESCE(cc.description, '')) LIKE $${values.length}
              OR LOWER(COALESCE(NULLIF(cc.contact_number, ''), NULLIF(c.contact_number, ''), NULLIF(a.contact_number, ''), '')) LIKE $${values.length})`
          );
        }

        const whereClause = `WHERE cc.category = ANY($1::text[])${clauses.length ? ` AND ${clauses.join(' AND ')}` : ''}`;
        const { rows } = await pool.query(
          `SELECT concern_id AS message_id,
                  COALESCE(
                    NULLIF(cc.full_name, ''),
                    NULLIF(CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name), ''),
                    NULLIF(a.full_name, ''),
                    a.username,
                    ''
                  ) AS full_name,
                  COALESCE(NULLIF(cc.barangay, ''), NULLIF(c.barangay, ''), '') AS barangay,
                  COALESCE(NULLIF(cc.contact_number, ''), NULLIF(c.contact_number, ''), NULLIF(a.contact_number, ''), '') AS contact_number,
                  cc.subject,
                  cc.description AS message,
                  cc.status,
                  cc.created_at,
                  cc.resolved_at AS reviewed_at,
                  cc.resolved_by AS reviewed_by,
                  cc.remarks
           FROM consumer_concerns cc
           LEFT JOIN consumer c ON c.consumer_id = cc.consumer_id
           LEFT JOIN accounts a ON a.account_id = cc.account_id
           ${whereClause}
           ORDER BY cc.created_at DESC, cc.concern_id DESC
           LIMIT 500`,
          values
        );
        return rows || [];
      },
      async () => {
        let builder = supabase
          .from('consumer_concerns')
          .select('concern_id, consumer_id, account_id, category, subject, description, status, created_at, resolved_at, resolved_by, remarks, full_name, barangay, contact_number')
          .in('category', ['Public Contact', 'Public Concern'])
          .order('created_at', { ascending: false })
          .limit(500);

        if (statusFilter) {
          builder = builder.eq('status', statusFilter);
        }

        const { data, error } = await builder;
        if (error) throw error;

        const concerns = data || [];
        const consumerIds = Array.from(new Set(
          concerns
            .map((row) => Number(row?.consumer_id || 0))
            .filter((value) => Number.isInteger(value) && value > 0)
        ));
        const accountIds = Array.from(new Set(
          concerns
            .map((row) => Number(row?.account_id || 0))
            .filter((value) => Number.isInteger(value) && value > 0)
        ));

        const [consumerResult, accountResult] = await Promise.all([
          consumerIds.length
            ? supabase
                .from('consumer')
                .select('consumer_id, first_name, middle_name, last_name, barangay, contact_number')
                .in('consumer_id', consumerIds)
            : Promise.resolve({ data: [], error: null }),
          accountIds.length
            ? supabase
                .from('accounts')
                .select('account_id, username, full_name, contact_number')
                .in('account_id', accountIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (consumerResult.error) throw consumerResult.error;
        if (accountResult.error) throw accountResult.error;

        const consumerMap = new Map((consumerResult.data || []).map((row) => [Number(row.consumer_id), row]));
        const accountMap = new Map((accountResult.data || []).map((row) => [Number(row.account_id), row]));

        const normalizedData = concerns.map((row) => {
          const consumer = consumerMap.get(Number(row?.consumer_id || 0)) || null;
          const account = accountMap.get(Number(row?.account_id || 0)) || null;
          const consumerName = [consumer?.first_name, consumer?.middle_name, consumer?.last_name]
            .filter(Boolean)
            .join(' ')
            .trim();

          return {
            ...row,
            full_name: row?.full_name || consumerName || account?.full_name || account?.username || '',
            barangay: row?.barangay || consumer?.barangay || '',
            contact_number: row?.contact_number || consumer?.contact_number || account?.contact_number || '',
          };
        });

        if (!query) return normalizedData;
        return normalizedData.filter((row) => {
          const haystack = [
            row.full_name,
            row.barangay,
            row.subject,
            row.description,
            row.contact_number,
          ]
            .map((value) => String(value || '').toLowerCase())
            .join(' ');
          return haystack.includes(query);
        });
      }
    );

    return res.json({
      success: true,
      data: rows.map(mapPublicContactMessageRow),
    });
  } catch (error) {
    await logRequestError(req, 'public.contact.list', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
  }
});

app.patch('/api/public-contact-messages/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const nextStatus = String(req.body?.status || '').trim();
  const remarks = String(req.body?.remarks || '').trim() || null;
  const reviewedBy = normalizeRequiredForeignKeyId(req.body?.reviewedBy || req.body?.reviewed_by || req.body?.actorAccountId);
  const allowedStatuses = new Set(['Pending', 'In Progress', 'Resolved', 'Closed']);

  if (!id || id < 1) {
    return res.status(400).json({ success: false, message: 'A valid message ID is required.' });
  }

  if (!allowedStatuses.has(nextStatus)) {
    return res.status(400).json({ success: false, message: 'Invalid status. Allowed values are Pending, In Progress, Resolved, and Closed.' });
  }

  try {
    const updated = await withPostgresPrimary(
      'public.contact.updateStatus',
      async () => {
        const { rows } = await pool.query(
          `UPDATE consumer_concerns
              SET status = $1::varchar,
                  remarks = COALESCE($2, remarks),
                  resolved_by = COALESCE($3, resolved_by),
                  resolved_at = CASE
                    WHEN $1::varchar IN ('Resolved', 'Closed') THEN NOW()
                    WHEN $1::varchar IN ('Pending', 'In Progress') THEN NULL
                    ELSE resolved_at
                  END
            WHERE concern_id = $4
              AND category = ANY($5::text[])
            RETURNING concern_id AS message_id, full_name, barangay, contact_number, subject, description AS message, status, created_at, resolved_at AS reviewed_at, resolved_by AS reviewed_by, remarks`,
          [nextStatus, remarks, reviewedBy, id, ['Public Contact', 'Public Concern']]
        );
        return rows[0] || null;
      },
      async () => {
        const payload = {
          status: nextStatus,
          remarks: remarks,
          resolved_by: reviewedBy,
          resolved_at: ['Resolved', 'Closed'].includes(nextStatus) ? new Date().toISOString() : null,
        };
        const { data, error } = await supabase
          .from('consumer_concerns')
          .update(payload)
          .eq('concern_id', id)
          .in('category', ['Public Contact', 'Public Concern'])
          .select('concern_id, subject, description, status, created_at, resolved_at, resolved_by, remarks, full_name, barangay, contact_number')
          .maybeSingle();
        if (error) throw error;
        return data || null;
      }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Public concern not found.' });
    }

    if (remarks && updated.contact_number) {
      const smsReply = buildPublicConcernSmsReply(updated.subject, remarks);
      await sendSMS(updated.contact_number, smsReply);
    }

    await writeSystemLog(`[public-contact] Message #${id} marked ${nextStatus}.`, {
      userId: reviewedBy || defaultSystemLogAccountId,
      role: 'Admin',
    });
    scheduleImmediateSync('public-contact-status-update');

    return res.json({
      success: true,
      message: 'Public concern status updated successfully.',
      data: mapPublicContactMessageRow(updated),
    });
  } catch (error) {
    await logRequestError(req, 'public.contact.updateStatus', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
  }
});

app.patch('/api/public-contact-messages/:id/reply', async (req, res) => {
  const id = Number(req.params.id);
  const reply = String(req.body?.reply || '').trim();
  const reviewedBy = normalizeRequiredForeignKeyId(req.body?.reviewedBy || req.body?.reviewed_by || req.body?.actorAccountId);

  if (!id || id < 1) {
    return res.status(400).json({ success: false, message: 'A valid message ID is required.' });
  }

  if (!reply) {
    return res.status(400).json({ success: false, message: 'Reply message is required.' });
  }

  try {
    const updated = await withPostgresPrimary(
      'public.contact.reply',
      async () => {
        const { rows } = await pool.query(
          `UPDATE consumer_concerns
              SET remarks = $1,
                  resolved_by = COALESCE($2, resolved_by),
                  resolved_at = NOW(),
                  status = CASE WHEN status = 'Pending' THEN 'In Progress' ELSE status END
            WHERE concern_id = $3
              AND category = ANY($4::text[])
            RETURNING concern_id AS message_id, full_name, barangay, contact_number, subject, description AS message, status, created_at, resolved_at AS reviewed_at, resolved_by AS reviewed_by, remarks`,
          [reply, reviewedBy, id, ['Public Contact', 'Public Concern']]
        );
        return rows[0] || null;
      },
      async () => {
        const payload = {
          remarks: reply,
          resolved_by: reviewedBy,
          resolved_at: new Date().toISOString(),
        };
        const { data, error } = await supabase
          .from('consumer_concerns')
          .update(payload)
          .eq('concern_id', id)
          .in('category', ['Public Contact', 'Public Concern'])
          .select('concern_id, subject, description, status, created_at, resolved_at, resolved_by, remarks, full_name, barangay, contact_number')
          .maybeSingle();
        if (error) throw error;
        if (!data) return null;

        if (data.status === 'Pending') {
          const { data: updatedStatusData, error: statusError } = await supabase
            .from('consumer_concerns')
            .update({ status: 'In Progress' })
            .eq('concern_id', id)
            .in('category', ['Public Contact', 'Public Concern'])
            .select('concern_id, subject, description, status, created_at, resolved_at, resolved_by, remarks, full_name, barangay, contact_number')
            .maybeSingle();
          if (statusError) throw statusError;
          return updatedStatusData || data;
        }

        return data;
      }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Public concern not found.' });
    }

    if (updated.contact_number) {
      const smsReply = buildPublicConcernSmsReply(updated.subject, reply);
      await sendSMS(updated.contact_number, smsReply);
    }

    await writeSystemLog(`[public-contact] Message #${id} replied.`, {
      userId: reviewedBy || defaultSystemLogAccountId,
      role: 'Billing Officer',
    });
    scheduleImmediateSync('public-contact-reply');

    return res.json({
      success: true,
      message: 'Reply sent successfully.',
      data: mapPublicContactMessageRow(updated),
    });
  } catch (error) {
    await logRequestError(req, 'public.contact.reply', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
  }
});

app.post('/api/forgot-password/verify-otp', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const code = String(req.body?.code || '').trim();

  if (!username || !code) {
    return res.status(400).json({ success: false, message: 'Username and reset code are required.' });
  }

  try {
    const user = await withPostgresPrimary(
      'forgotPassword.verify.lookupUser',
      async () => {
        const { rows } = await pool.query('SELECT account_id FROM accounts WHERE username = $1 LIMIT 1', [username]);
        return rows[0] || null;
      },
      async () => {
        const { data, error } = await supabase.from('accounts').select('account_id').eq('username', username).maybeSingle();
        if (error) throw error;
        return data || null;
      }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const resetEntry = await withPostgresPrimary(
      'forgotPassword.verify.lookupCode',
      async () => {
        const { rows } = await pool.query(`
          SELECT reset_id
          FROM password_reset
          WHERE account_id = $1
            AND reset_token = $2
            AND status = 'Pending'
            AND expiration_time >= NOW()
          ORDER BY created_at DESC
          LIMIT 1
        `, [user.account_id, code]);
        return rows[0] || null;
      },
      async () => {
        const { data, error } = await supabase
          .from('password_reset')
          .select('reset_id, expiration_time')
          .eq('account_id', user.account_id)
          .eq('reset_token', code)
          .eq('status', 'Pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!data || new Date(data.expiration_time).getTime() < Date.now()) {
          return null;
        }
        return data;
      }
    );

    if (!resetEntry) {
      return res.status(400).json({ success: false, message: 'Reset code is invalid or expired.' });
    }

    return res.json({ success: true, message: 'Reset code verified successfully.' });
  } catch (error) {
    await logRequestError(req, 'forgotPassword.verify', error);
    console.error('Verify OTP error:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
  }
});

app.post('/api/forgot-password/reset', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const code = String(req.body?.code || '').trim();
  const newPassword = String(req.body?.newPassword || '');

  if (!username || !code || !newPassword) {
    return res.status(400).json({ success: false, message: 'Username, reset code, and new password are required.' });
  }

  let passwordHash = null;
  try {
    passwordHash = hashPassword(newPassword);
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }

  try {
    const user = await withPostgresPrimary(
      'forgotPassword.reset.lookupUser',
      async () => findPostgresAccountByUsername(username),
      async () => findSupabaseAccountByUsername(username)
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await withPostgresPrimary(
      'forgotPassword.reset',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const { rows } = await client.query(`
            SELECT reset_id
            FROM password_reset
            WHERE account_id = $1
              AND reset_token = $2
              AND status = 'Pending'
              AND expiration_time >= NOW()
            ORDER BY created_at DESC
            LIMIT 1
            FOR UPDATE
          `, [user.account_id, code]);

          if (!rows[0]) {
            throw createHttpError('Reset code is invalid or expired.');
          }

          await client.query('UPDATE accounts SET password = $1 WHERE account_id = $2', [passwordHash, user.account_id]);
          await client.query('UPDATE password_reset SET status = $1 WHERE reset_id = $2', ['Used', rows[0].reset_id]);
          await client.query(
            `UPDATE password_reset
             SET status = CASE WHEN expiration_time < NOW() THEN 'Expired' ELSE 'Cancelled' END
             WHERE account_id = $1 AND status = 'Pending' AND reset_id <> $2`,
            [user.account_id, rows[0].reset_id]
          );
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      async () => {
        const { data: resetEntry, error: lookupError } = await supabase
          .from('password_reset')
          .select('reset_id, expiration_time')
          .eq('account_id', user.account_id)
          .eq('reset_token', code)
          .eq('status', 'Pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lookupError) throw lookupError;
        if (!resetEntry || new Date(resetEntry.expiration_time).getTime() < Date.now()) {
          throw createHttpError('Reset code is invalid or expired.');
        }

        const { error: accountError } = await supabase.from('accounts').update({ password: passwordHash }).eq('account_id', user.account_id);
        if (accountError) throw accountError;

        const { error: usedError } = await supabase.from('password_reset').update({ status: 'Used' }).eq('reset_id', resetEntry.reset_id);
        if (usedError) throw usedError;

        const { error: cancelError } = await supabase
          .from('password_reset')
          .update({ status: 'Cancelled' })
          .eq('account_id', user.account_id)
          .eq('status', 'Pending');
        if (cancelError) throw cancelError;
      }
    );

    await syncAccountAuthCredentials({
      accountId: user.account_id,
      username: user.username,
      password: newPassword,
      authUserId: user.auth_user_id || null,
    });
    await writeSystemLog(
      `[password.reset] Password reset completed for account #${user.account_id} (${user.username}).`,
      { userId: user.account_id, role: user.role_name || 'Consumer' }
    );
    scheduleImmediateSync('forgot-password-reset');
    return res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    await logRequestError(req, 'forgotPassword.reset', error);
    console.error('Reset password error:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
  }
});

// --- CONSUMER SIGN-UP ---

app.post('/api/register', async (req, res) => {
  const { 
    username, password, phone, firstName, middleName, lastName, 
    address, purok, barangay, municipality, zipCode, accountNumber
  } = req.body;
  const zoneId = req.body.zoneId || 1;
  const classificationId = req.body.classificationId ? parseInt(req.body.classificationId, 10) : 1;
  const normalizedAccountNumber = String(accountNumber || '').trim() || generatePendingAccountNumber(zoneId);
  const normalizedPhoneNumber = normalizePhilippinePhoneNumber(phone);
  let normalizedRequirementsSubmitted = null;
  let passwordHash = null;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }

  if (!normalizedPhoneNumber) {
    return res.status(400).json({ success: false, message: 'Phone number must be a valid Philippine mobile number.' });
  }

  try {
    passwordHash = hashPassword(password);
    normalizedRequirementsSubmitted = normalizeRequirementSubmission(req.body.sedulaImage || req.body.requirementsSubmitted, { allowText: false });
    await validateClassificationExists(classificationId);
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }

  if (!normalizedRequirementsSubmitted) {
    return res.status(400).json({ success: false, message: 'Sedula image is required to complete registration.' });
  }

  try {
    if (await isUsernameTaken(username)) {
      return res.status(400).json({ success: false, message: 'Username is already taken.' });
    }

    let ticketNumber = null;
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
            ticketNumber = await generateSequentialRegistrationTicketNumber({ pgClient: client });

            try {
              const { rows } = await client.query(
                'INSERT INTO accounts (username, password, role_id, account_status) VALUES ($1, $2, $3, $4) RETURNING account_id',
                [username, passwordHash, 5, 'Pending']
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
              `, [consumerRows[0].consumer_id, accountId, ticketNumber, 'New Connection', normalizedRequirementsSubmitted, 'Pending']);

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
        ticketNumber = await generateSequentialRegistrationTicketNumber({ useSupabase: true });

        const accountRow = await insertSupabaseRowWithPrimaryKeyRetry(
          'accounts',
          'account_id',
          {
            username,
            password: passwordHash,
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
            requirements_submitted: normalizedRequirementsSubmitted,
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

// --- GOOGLE OAUTH ---
app.post('/api/auth/google', async (req, res) => {
  const { access_token, intent: rawIntent } = req.body;
  const intent = ['login', 'signup'].includes(String(rawIntent || '').toLowerCase())
    ? String(rawIntent).toLowerCase()
    : 'login';

  if (!access_token) {
    return res.status(400).json({ success: false, message: 'Access token is required.' });
  }

  if (!supabase) {
    return res.status(500).json({ success: false, message: 'Supabase is not configured on this server.' });
  }

  try {
    // Verify the access token with Supabase Auth
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(access_token);
    if (authError || !authUser) {
      return res.status(401).json({ success: false, message: 'Invalid or expired Google token.' });
    }

    const googleEmail = String(authUser.email || '').trim().toLowerCase();
    const googleName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || '';
    const googleAvatar = authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture || null;
    const authUserId = authUser.id;

    if (!googleEmail) {
      return res.status(400).json({ success: false, message: 'Google account does not have an email address.' });
    }

    // Check if an account with this email already exists
    let existingAccount = await findAccountByEmail(googleEmail);

    if (existingAccount) {
      // Existing Google user — update auth_user_id if needed and return session
      if (!existingAccount.auth_user_id && authUserId) {
        await persistAccountAuthUserId(existingAccount.account_id, authUserId);
      }

      // Update avatar if available and not already set
      if (googleAvatar && !existingAccount.profile_picture_url) {
        try {
          await withPostgresPrimary(
            'auth.google.updateAvatar',
            async () => {
              await pool.query('UPDATE accounts SET profile_picture_url = $1 WHERE account_id = $2', [googleAvatar, existingAccount.account_id]);
            },
            async () => {
              await supabase.from('accounts').update({ profile_picture_url: googleAvatar }).eq('account_id', existingAccount.account_id);
            }
          );
        } catch (avatarError) {
          console.warn('Failed to update Google avatar:', avatarError.message);
        }
      }

      if (existingAccount.account_status === 'Inactive') {
        return res.status(401).json({ success: false, message: 'Your account is inactive. Please contact the office for assistance.' });
      }

      if (Number(existingAccount.role_id) === 5) {
        await ensureConsumerProfileForAccount(
          existingAccount.account_id,
          existingAccount.full_name || googleName || existingAccount.username || 'Consumer',
          null
        );
      }

      return res.json({
        success: true,
        user: {
          id: existingAccount.account_id,
          username: existingAccount.username,
          fullName: existingAccount.full_name || googleName || existingAccount.username,
          email: googleEmail,
          auth_user_id: authUserId || existingAccount.auth_user_id || null,
          profile_picture_url: existingAccount.profile_picture_url || googleAvatar || null,
          role_id: existingAccount.role_id,
          role_name: existingAccount.role_name || 'Consumer',
        },
      });
    }

    if (intent === 'login') {
      return res.status(404).json({
        success: false,
        message: 'No Google-linked account found. Please sign up with Google first.',
      });
    }

    // New Google user — create account + consumer in Pending state
    const [firstName = '', ...restName] = googleName.split(' ');
    const lastName = restName.join(' ') || firstName;
    const defaultMunicipality = 'San Lorenzo Ruiz';
    const defaultZipCode = '4610';
    const defaultBarangay = 'Not Specified';
    const defaultPurok = 'Not Specified';
    const defaultAddress = [defaultPurok, defaultBarangay, defaultMunicipality, defaultZipCode].join(', ');
    const generatedUsernameSeed = googleEmail.split('@')[0] || `google_${Date.now()}`;
    const generatedPassword = `google_${crypto.randomUUID()}`;
    const generatedPasswordHash = hashPassword(generatedPassword);

    const createdAccount = await withPostgresPrimary(
      'auth.google.createAccount',
      async () => {
        const maxAttempts = 8;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const suffix = attempt === 0 ? '' : `${Date.now().toString().slice(-4)}${attempt}`;
          const candidateUsername = await generateAvailableUsername(`${generatedUsernameSeed}${suffix}`);

          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            await synchronizePostgresSequences(client, [
              { tableName: 'accounts', primaryKey: 'account_id' },
              { tableName: 'consumer', primaryKey: 'consumer_id' },
            ]);

            const { rows: accountRows } = await client.query(`
              INSERT INTO accounts (username, password, email, full_name, role_id, account_status, auth_user_id, profile_picture_url)
              VALUES ($1, $2, $3, $4, $5, $6, $7::uuid, $8)
              RETURNING account_id, username, email, full_name, role_id, account_status, auth_user_id, profile_picture_url
            `, [candidateUsername, generatedPasswordHash, googleEmail, googleName || candidateUsername, 5, 'Pending', authUserId, googleAvatar]);

            const accountId = accountRows[0].account_id;

            await client.query(`
              INSERT INTO consumer (first_name, last_name, login_id, status, address, purok, barangay, municipality, zip_code, contact_number)
              VALUES (
                $1,
                $2,
                $3,
                $4,
                COALESCE(NULLIF($5, ''), 'Not Specified, Not Specified, San Lorenzo Ruiz, 4610'),
                COALESCE(NULLIF($6, ''), 'Not Specified'),
                COALESCE(NULLIF($7, ''), 'Not Specified'),
                COALESCE(NULLIF($8, ''), 'San Lorenzo Ruiz'),
                COALESCE(NULLIF($9, ''), '4610'),
                $10
              )
            `, [
              firstName || candidateUsername,
              lastName || '',
              accountId,
              'Pending',
              defaultAddress,
              defaultPurok,
              defaultBarangay,
              defaultMunicipality,
              defaultZipCode,
              null,
            ]);

            await client.query('COMMIT');
            return accountRows[0];
          } catch (error) {
            await client.query('ROLLBACK');
            if (isAccountsUsernameDuplicateError(error) && attempt < maxAttempts - 1) {
              continue;
            }
            throw error;
          } finally {
            client.release();
          }
        }
        throw new Error('Unable to generate a unique username for Google sign-in.');
      },
      async () => {
        const maxAttempts = 8;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const suffix = attempt === 0 ? '' : `${Date.now().toString().slice(-4)}${attempt}`;
          const candidateUsername = await generateAvailableUsername(`${generatedUsernameSeed}${suffix}`);

          const { data: accountData, error: accountError } = await supabase
            .from('accounts')
            .insert([{
              username: candidateUsername,
              password: generatedPasswordHash,
              email: googleEmail,
              full_name: googleName || candidateUsername,
              role_id: 5,
              account_status: 'Pending',
              auth_user_id: authUserId,
              profile_picture_url: googleAvatar,
            }])
            .select('account_id, username, email, full_name, role_id, account_status, auth_user_id, profile_picture_url')
            .single();

          if (accountError) {
            if (isAccountsUsernameDuplicateError(accountError) && attempt < maxAttempts - 1) {
              continue;
            }
            throw accountError;
          }

          const { error: consumerError } = await supabase
            .from('consumer')
            .insert([{
              first_name: firstName || candidateUsername,
              last_name: lastName || '',
              login_id: accountData.account_id,
              status: 'Pending',
              address: defaultAddress,
              purok: defaultPurok,
              barangay: defaultBarangay,
              municipality: defaultMunicipality,
              zip_code: defaultZipCode,
              contact_number: null,
            }]);
          if (consumerError) throw consumerError;

          return accountData;
        }
        throw new Error('Unable to generate a unique username for Google sign-in.');
      }
    );

    scheduleImmediateSync('google-auth-register');

    await writeSystemLog(
      `[auth] Google sign-up: account #${createdAccount.account_id} created for ${googleEmail}.`,
      { userId: createdAccount.account_id, role: 'Consumer' }
    );

    return res.json({
      success: true,
      user: {
        id: createdAccount.account_id,
        username: createdAccount.username,
        fullName: createdAccount.full_name || googleName || createdAccount.username,
        email: googleEmail,
        auth_user_id: authUserId,
        profile_picture_url: createdAccount.profile_picture_url || googleAvatar || null,
        role_id: 5,
        role_name: 'Consumer',
      },
    });
  } catch (error) {
    await logRequestError(req, 'auth.google', error);
    console.error('Google auth error:', error);

    const isDuplicate = error?.code === '23505';
    if (isDuplicate) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email or username already exists. Try logging in instead.',
      });
    }

    return res.status(500).json({ success: false, message: error.message || 'Google authentication failed.' });
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
  const normalizedQuery = query.toLowerCase();
  const normalizedAccountDigits = query.replace(/\D/g, '');
  const queryLike = `%${query}%`;
  const digitsLike = normalizedAccountDigits ? `%${normalizedAccountDigits}%` : null;

  if (!query) {
    return res.status(400).json({ success: false, message: 'Search query is required.' });
  }

  try {
    const adminSettings = await loadResolvedAdminSettings();
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
          WHERE (
                c.account_number = $1
                OR c.account_number ILIKE $2
                OR (
                  NULLIF($3, '') IS NOT NULL
                  AND regexp_replace(COALESCE(c.account_number, ''), '[^0-9]', '', 'g') ILIKE $4
                )
                OR CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name) ILIKE $2
              )
            AND (c.login_id IS NULL OR COALESCE(a.account_status, 'Active') = 'Active')
          ORDER BY
            CASE
              WHEN c.account_number = $1 THEN 0
              WHEN c.account_number ILIKE $2 THEN 1
              WHEN NULLIF($3, '') IS NOT NULL
                AND regexp_replace(COALESCE(c.account_number, ''), '[^0-9]', '', 'g') ILIKE $4 THEN 2
              ELSE 3
            END,
            c.consumer_id DESC
          LIMIT 1
        `, [query, queryLike, normalizedAccountDigits, digitsLike]);

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
        const rawCurrentBill = mappedBills.find((bill) => String(bill.Status || '').toLowerCase() !== 'paid') || null;
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
          const accountNumber = String(consumer.account_number || '');
          const accountDigits = accountNumber.replace(/\D/g, '');
          return (
            accountNumber.toLowerCase() === normalizedQuery ||
            accountNumber.toLowerCase().includes(normalizedQuery) ||
            (!!normalizedAccountDigits && accountDigits.includes(normalizedAccountDigits)) ||
            fullName.includes(normalizedQuery)
          );
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
        const rawCurrentBill = mappedBills.find((bill) => String(bill.Status || '').toLowerCase() !== 'paid') || null;
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
            LIMIT 200
          `),
        ]);

        const recentLogs = (logsResult.rows || [])
          .filter((row) => !isTechnicalSystemAction(row.action))
          .map(mapDashboardActivityLogRow)
          .slice(0, 10);

        return {
          success: true,
          data: {
            stats: {
              staffMembers: Number(staffResult.rows[0]?.count || 0),
              totalConsumers: Number(consumerResult.rows[0]?.count || 0),
              pendingBills: Number(billsResult.rows[0]?.count || 0),
              pendingApplications: Number(applicationsResult.rows[0]?.count || 0),
            },
            recentLogs,
          },
        };
      },
      async () => {
        const [accountsResult, consumerResult, billsResult, logsResult] = await Promise.all([
          supabase.from('accounts').select('account_id, role_id, account_status, username'),
          supabase.from('consumer').select('consumer_id'),
          supabase.from('bills').select('bill_id, status'),
          supabase.from('system_logs').select('log_id, timestamp, role, action, account_id').order('timestamp', { ascending: false }).limit(200),
        ]);

        if (accountsResult.error) throw accountsResult.error;
        if (consumerResult.error) throw consumerResult.error;
        if (billsResult.error) throw billsResult.error;
        if (logsResult.error) throw logsResult.error;

        const accounts = accountsResult.data || [];
        const accountMap = new Map(accounts.map((account) => [account.account_id, account]));
        const recentLogs = (logsResult.data || [])
          .map((row) => ({
            ...row,
            username: accountMap.get(row.account_id)?.username || null,
          }))
          .filter((row) => !isTechnicalSystemAction(row.action))
          .map(mapDashboardActivityLogRow)
          .slice(0, 10);

        return {
          success: true,
          data: {
            stats: {
              staffMembers: accounts.filter((account) => ![4, 5].includes(Number(account.role_id))).length,
              totalConsumers: (consumerResult.data || []).length,
              pendingBills: (billsResult.data || []).filter((bill) => String(bill.status || 'unpaid').toLowerCase() !== 'paid').length,
              pendingApplications: accounts.filter((account) => String(account.account_status || '').toLowerCase() === 'pending').length,
            },
            recentLogs,
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
      loadResolvedAdminSettings(),
      withPostgresPrimary(
        'admin.settings.latestRates',
        async () => {
          const { rows } = await pool.query(`
            SELECT
              wr.rate_id,
              wr.classification_id,
              cl.classification_name,
              wr.minimum_cubic,
              wr.minimum_rate,
              wr.excess_rate_per_cubic,
              DATE(wr.effective_date) AS effective_date,
              wr.modified_by,
              wr.modified_date
            FROM waterrates wr
            LEFT JOIN classification cl ON cl.classification_id = wr.classification_id
            WHERE DATE(wr.effective_date) <= CURRENT_DATE
            ORDER BY DATE(wr.effective_date) DESC, wr.rate_id DESC
            LIMIT 1
          `);
          return rows[0] || null;
        },
        async () => {
          const todayDateKey = getTodayDateKey();
          const [rateResult, classificationsResult] = await Promise.all([
            supabase
              .from('waterrates')
              .select('rate_id, classification_id, minimum_cubic, minimum_rate, excess_rate_per_cubic, effective_date, modified_by, modified_date')
              .lte('effective_date', todayDateKey)
              .order('effective_date', { ascending: false })
              .order('rate_id', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase.from('classification').select('classification_id, classification_name'),
          ]);
          if (rateResult.error) throw rateResult.error;
          if (classificationsResult.error) throw classificationsResult.error;
          if (!rateResult.data) {
            return null;
          }
          const classificationMap = new Map((classificationsResult.data || []).map((row) => [row.classification_id, row.classification_name]));
          return normalizeWaterRateRowForResponse({
            ...rateResult.data,
            classification_name: classificationMap.get(rateResult.data.classification_id) || null,
          });
        }
      ),
    ]);

    return res.json({
      success: true,
      data: {
        systemSettings: settings,
        waterRates: normalizeWaterRateRowForResponse(waterRates),
      },
    });
  } catch (error) {
    await logRequestError(req, 'admin.settings.fetch', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/settings', async (req, res) => {
  try {
    const savedSettings = await saveResolvedAdminSettings(req.body || {});
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

app.get('/api/billing/logs', async (req, res) => {
  try {
    const result = await withPostgresPrimary(
      'billing.logs.fetch',
      async () => {
        const [disconnectLogsResult, approvalLogsResult] = await Promise.all([
          pool.query(`
            SELECT
              sl.log_id,
              sl.timestamp,
              sl.action,
              actor.username AS actor_username
            FROM system_logs sl
            LEFT JOIN accounts actor ON actor.account_id = sl.account_id
            WHERE LOWER(COALESCE(sl.action, '')) LIKE '%consumers.disconnect%'
               OR LOWER(COALESCE(sl.action, '')) LIKE '%marked disconnected%'
            ORDER BY sl.timestamp DESC
            LIMIT 200
          `),
          pool.query(`
            SELECT
              ar.review_id,
              ar.review_date,
              ar.review_status,
              ar.remarks,
              reviewer.username AS reviewed_by_username,
              c.account_number,
              CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name) AS consumer_name
            FROM account_review_log ar
            LEFT JOIN accounts reviewer ON reviewer.account_id = ar.reviewed_by
            LEFT JOIN accounts target_account ON target_account.account_id = ar.account_id
            LEFT JOIN consumer c ON c.login_id = target_account.account_id
            WHERE LOWER(COALESCE(ar.review_status, '')) IN ('approved', 'rejected')
            ORDER BY ar.review_date DESC
            LIMIT 200
          `),
        ]);

        const disconnectLogs = disconnectLogsResult.rows.map((row) => {
          const actionText = String(row.action || '');
          const nameMatch = actionText.match(/\]\s*(.*?)\s*\((.*?)\)\s*marked disconnected/i);
          const reasonMatch = actionText.match(/Reason:\s*(.*?)(?:\. Overdue:|$)/i);
          return {
            id: `disconnect-${row.log_id}`,
            timestamp: row.timestamp,
            event_type: 'Disconnection',
            consumer_name: nameMatch?.[1] || 'Unknown',
            account_number: nameMatch?.[2] || 'N/A',
            performed_by: row.actor_username || 'System',
            reason: reasonMatch?.[1]?.trim() || 'No reason recorded',
            status: 'Disconnected',
          };
        });

        const approvalLogs = approvalLogsResult.rows.map((row) => ({
          id: `review-${row.review_id}`,
          timestamp: row.review_date,
          event_type: String(row.review_status || '').toLowerCase() === 'approved' ? 'Approval' : 'Rejection',
          consumer_name: row.consumer_name || 'Unknown',
          account_number: row.account_number || 'N/A',
          performed_by: row.reviewed_by_username || 'System',
          reason: row.remarks || (String(row.review_status || '').toLowerCase() === 'approved' ? 'Application approved.' : 'Application rejected.'),
          status: String(row.review_status || '').trim() || 'Reviewed',
        }));

        const merged = [...disconnectLogs, ...approvalLogs]
          .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
          .slice(0, 300);

        return { success: true, data: merged };
      },
      async () => {
        const [
          { data: systemLogs, error: systemLogsError },
          { data: reviewLogs, error: reviewLogsError },
          { data: accounts, error: accountsError },
          { data: consumers, error: consumersError },
        ] = await Promise.all([
          supabase
            .from('system_logs')
            .select('log_id, timestamp, action, account_id')
            .order('timestamp', { ascending: false })
            .limit(200),
          supabase
            .from('account_review_log')
            .select('review_id, review_date, review_status, remarks, reviewed_by, account_id')
            .order('review_date', { ascending: false })
            .limit(200),
          supabase
            .from('accounts')
            .select('account_id, username'),
          supabase
            .from('consumer')
            .select('login_id, first_name, middle_name, last_name, account_number'),
        ]);

        if (systemLogsError) throw systemLogsError;
        if (reviewLogsError) throw reviewLogsError;
        if (accountsError) throw accountsError;
        if (consumersError) throw consumersError;

        const accountMap = new Map((accounts || []).map((row) => [row.account_id, row.username]));
        const consumerByLoginId = new Map((consumers || []).map((row) => [row.login_id, row]));

        const disconnectLogs = (systemLogs || [])
          .filter((row) => {
            const action = String(row.action || '').toLowerCase();
            return action.includes('consumers.disconnect') || action.includes('marked disconnected');
          })
          .map((row) => {
            const actionText = String(row.action || '');
            const nameMatch = actionText.match(/\]\s*(.*?)\s*\((.*?)\)\s*marked disconnected/i);
            const reasonMatch = actionText.match(/Reason:\s*(.*?)(?:\. Overdue:|$)/i);
            return {
              id: `disconnect-${row.log_id}`,
              timestamp: row.timestamp,
              event_type: 'Disconnection',
              consumer_name: nameMatch?.[1] || 'Unknown',
              account_number: nameMatch?.[2] || 'N/A',
              performed_by: accountMap.get(row.account_id) || 'System',
              reason: reasonMatch?.[1]?.trim() || 'No reason recorded',
              status: 'Disconnected',
            };
          });

        const approvalLogs = (reviewLogs || [])
          .filter((row) => ['approved', 'rejected'].includes(String(row.review_status || '').toLowerCase()))
          .map((row) => {
            const consumer = consumerByLoginId.get(row.account_id);
            return {
              id: `review-${row.review_id}`,
              timestamp: row.review_date,
              event_type: String(row.review_status || '').toLowerCase() === 'approved' ? 'Approval' : 'Rejection',
              consumer_name: consumer ? [consumer.first_name, consumer.middle_name, consumer.last_name].filter(Boolean).join(' ').trim() : 'Unknown',
              account_number: consumer?.account_number || 'N/A',
              performed_by: accountMap.get(row.reviewed_by) || 'System',
              reason: row.remarks || (String(row.review_status || '').toLowerCase() === 'approved' ? 'Application approved.' : 'Application rejected.'),
              status: String(row.review_status || '').trim() || 'Reviewed',
            };
          });

        const merged = [...disconnectLogs, ...approvalLogs]
          .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
          .slice(0, 300);

        return { success: true, data: merged };
      }
    );

    return res.json(result);
  } catch (error) {
    await logRequestError(req, 'billing.logs.fetch', error);
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

const READING_SCHEDULE_ALLOWED_STATUSES = new Set(['Scheduled', 'Cancelled']);

function normalizeReadingScheduleStatus(value) {
  const normalized = String(value || 'Scheduled').trim().toLowerCase();
  if (normalized === 'cancelled') {
    return 'Cancelled';
  }
  return 'Scheduled';
}

function normalizeReadingSchedulePayload(rawSchedule, overrideDate = null) {
  const scheduleDate = normalizeDateInput(overrideDate || rawSchedule?.Schedule_Date || rawSchedule?.schedule_date);
  const zoneId = normalizeRequiredForeignKeyId(rawSchedule?.Zone_ID || rawSchedule?.zone_id);
  const meterReaderId = rawSchedule?.Meter_Reader_ID || rawSchedule?.meter_reader_id;
  const normalizedReaderId = meterReaderId === null || meterReaderId === undefined || meterReaderId === ''
    ? null
    : normalizeRequiredForeignKeyId(meterReaderId);
  const status = normalizeReadingScheduleStatus(rawSchedule?.Status || rawSchedule?.status);

  if (!scheduleDate) {
    throw createHttpError('A valid schedule date is required.', 400);
  }
  if (!zoneId) {
    throw createHttpError('A valid zone is required.', 400);
  }
  if (meterReaderId && !normalizedReaderId) {
    throw createHttpError('A valid meter reader is required.', 400);
  }
  if (!READING_SCHEDULE_ALLOWED_STATUSES.has(status)) {
    throw createHttpError('Invalid reading schedule status.', 400);
  }

  return {
    schedule_date: scheduleDate,
    zone_id: zoneId,
    meter_reader_id: normalizedReaderId,
    status,
  };
}

function mapPublicContactMessageRow(row) {
  const fullName = String(row?.full_name || '').trim();
  const barangay = String(row?.barangay || '').trim();
  const contactNumber = String(row?.contact_number || '').trim();
  return {
    message_id: Number(row?.message_id || row?.concern_id || 0),
    full_name: fullName || 'Unknown sender',
    barangay: barangay || 'Not specified',
    contact_number: contactNumber || 'Not provided',
    subject: row?.subject || '',
    message: row?.message || row?.description || '',
    status: row?.status || 'Pending',
    created_at: row?.created_at || null,
    reviewed_at: row?.reviewed_at || row?.resolved_at || null,
    reviewed_by: row?.reviewed_by || row?.resolved_by || null,
    remarks: row?.remarks || null,
  };
}

async function validateReadingScheduleReferencesPostgres(client, assignments) {
  const zoneIds = Array.from(new Set(assignments.map((assignment) => assignment.zone_id)));
  if (zoneIds.length > 0) {
    const { rows: zoneRows } = await client.query(
      'SELECT zone_id FROM zone WHERE zone_id = ANY($1::int[])',
      [zoneIds]
    );
    if (zoneRows.length !== zoneIds.length) {
      throw createHttpError('One or more selected zones are invalid.', 400);
    }
  }

  const readerIds = Array.from(new Set(
    assignments
      .map((assignment) => assignment.meter_reader_id)
      .filter((value) => Number.isInteger(value) && value > 0)
  ));
  if (readerIds.length > 0) {
    const { rows: readerRows } = await client.query(
      `SELECT account_id
       FROM accounts
       WHERE account_id = ANY($1::int[])
         AND role_id = 3
         AND LOWER(COALESCE(account_status, 'active')) = 'active'`,
      [readerIds]
    );
    if (readerRows.length !== readerIds.length) {
      throw createHttpError('One or more selected meter readers are invalid or inactive.', 400);
    }
  }
}

async function validateReadingScheduleReferencesSupabase(assignments) {
  const zoneIds = Array.from(new Set(assignments.map((assignment) => assignment.zone_id)));
  if (zoneIds.length > 0) {
    const { data: zoneRows, error: zoneError } = await supabase.from('zone').select('zone_id').in('zone_id', zoneIds);
    if (zoneError) throw zoneError;
    if ((zoneRows || []).length !== zoneIds.length) {
      throw createHttpError('One or more selected zones are invalid.', 400);
    }
  }

  const readerIds = Array.from(new Set(
    assignments
      .map((assignment) => assignment.meter_reader_id)
      .filter((value) => Number.isInteger(value) && value > 0)
  ));
  if (readerIds.length > 0) {
    const { data: readerRows, error: readerError } = await supabase
      .from('accounts')
      .select('account_id')
      .in('account_id', readerIds)
      .eq('role_id', 3)
      .eq('account_status', 'Active');
    if (readerError) throw readerError;
    if ((readerRows || []).length !== readerIds.length) {
      throw createHttpError('One or more selected meter readers are invalid or inactive.', 400);
    }
  }
}

async function fetchReadingSchedulesPostgres() {
  const { rows } = await pool.query(`
    SELECT 
      r.schedule_id AS "Schedule_ID",
      TO_CHAR(r.schedule_date, 'YYYY-MM-DD') AS "Schedule_Date",
      r.zone_id AS "Zone_ID",
      z.zone_name AS "Zone_Name",
      r.meter_reader_id AS "Meter_Reader_ID",
      COALESCE(NULLIF(a.full_name, ''), a.username) AS "Meter_Reader_Name",
      a.contact_number AS "Meter_Reader_Contact",
      r.status AS "Status"
    FROM reading_schedule r
    LEFT JOIN zone z ON r.zone_id = z.zone_id
    LEFT JOIN accounts a ON r.meter_reader_id = a.account_id
    ORDER BY r.schedule_date DESC, r.zone_id ASC
  `);
  return rows;
}

async function fetchReadingSchedulesSupabase() {
  const [{ data: schedules, error: scheduleError }, { data: zones, error: zoneError }, { data: accounts, error: accountError }] = await Promise.all([
    supabase.from('reading_schedule').select('*').order('schedule_date', { ascending: false }),
    supabase.from('zone').select('zone_id, zone_name'),
    supabase.from('accounts').select('account_id, username, full_name, contact_number'),
  ]);
  if (scheduleError) {
    if (scheduleError.code === '42P01') return [];
    throw scheduleError;
  }
  if (zoneError) throw zoneError;
  if (accountError) throw accountError;

  const zoneMap = new Map((zones || []).map((zone) => [zone.zone_id, zone.zone_name]));
  const accountMap = new Map((accounts || []).map((account) => [account.account_id, account]));

  return (schedules || []).map((schedule) => {
    const reader = schedule.meter_reader_id ? accountMap.get(schedule.meter_reader_id) : null;
    return {
      Schedule_ID: schedule.schedule_id,
      Schedule_Date: schedule.schedule_date,
      Zone_ID: schedule.zone_id,
      Zone_Name: zoneMap.get(schedule.zone_id) || `Zone ${schedule.zone_id}`,
      Meter_Reader_ID: schedule.meter_reader_id,
      Meter_Reader_Name: reader ? (reader.full_name || reader.username || 'Unknown') : null,
      Meter_Reader_Contact: reader?.contact_number || null,
      Status: normalizeReadingScheduleStatus(schedule.status),
    };
  });
}

app.get('/api/reading-schedules', async (req, res) => {
  try {
    const rows = await withPostgresPrimary(
      'readingSchedules.fetch',
      async () => fetchReadingSchedulesPostgres(),
      async () => fetchReadingSchedulesSupabase()
    );
    return res.json(rows);
  } catch (error) {
    await logRequestError(req, 'readingSchedules.fetch', error);
    console.error('Error fetching schedules:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/reading-schedules', async (req, res) => {
  try {
    const payload = normalizeReadingSchedulePayload(req.body);

    const row = await withPostgresPrimary(
      'readingSchedules.create',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await validateReadingScheduleReferencesPostgres(client, [payload]);
          const { rows } = await client.query(`
            INSERT INTO reading_schedule (schedule_date, zone_id, meter_reader_id, status)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (schedule_date, zone_id) DO UPDATE 
            SET meter_reader_id = EXCLUDED.meter_reader_id, status = EXCLUDED.status, updated_at = NOW()
            RETURNING schedule_id AS "Schedule_ID"
          `, [payload.schedule_date, payload.zone_id, payload.meter_reader_id, payload.status]);
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
        await validateReadingScheduleReferencesSupabase([payload]);
        const { data, error } = await supabase.from('reading_schedule').upsert([payload], { onConflict: 'schedule_date,zone_id' }).select('schedule_id').single();
        if (error) {
          if (error.code === '42P01') return { Schedule_ID: Date.now() }; 
          throw error;
        }
        return { Schedule_ID: data.schedule_id };
      }
    );
    scheduleImmediateSync('reading-schedules-create');
    return res.json({ success: true, ...row });
  } catch (error) {
    await logRequestError(req, 'readingSchedules.create', error);
    console.error('Error creating schedule:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
  }
});

app.post('/api/reading-schedules/bulk-upsert', async (req, res) => {
  try {
    const scheduleDate = normalizeDateInput(req.body?.schedule_date || req.body?.scheduleDate);
    const assignments = Array.isArray(req.body?.assignments) ? req.body.assignments : [];
    if (!scheduleDate) {
      return res.status(400).json({ success: false, message: 'A valid schedule date is required.' });
    }
    if (!assignments.length) {
      return res.status(400).json({ success: false, message: 'At least one assignment is required.' });
    }

    const normalizedAssignments = assignments.map((assignment) => normalizeReadingSchedulePayload(assignment, scheduleDate));
    const duplicateZoneIds = normalizedAssignments
      .map((assignment) => assignment.zone_id)
      .filter((zoneId, index, values) => values.indexOf(zoneId) !== index);
    if (duplicateZoneIds.length > 0) {
      return res.status(400).json({ success: false, message: 'A zone can only appear once per schedule date.' });
    }

    const rows = await withPostgresPrimary(
      'readingSchedules.bulkUpsert',
      async () => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await validateReadingScheduleReferencesPostgres(client, normalizedAssignments);
          const savedRows = [];
          for (const assignment of normalizedAssignments) {
            const { rows } = await client.query(`
              INSERT INTO reading_schedule (schedule_date, zone_id, meter_reader_id, status)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (schedule_date, zone_id) DO UPDATE
              SET meter_reader_id = EXCLUDED.meter_reader_id,
                  status = EXCLUDED.status,
                  updated_at = NOW()
              RETURNING schedule_id AS "Schedule_ID"
            `, [assignment.schedule_date, assignment.zone_id, assignment.meter_reader_id, assignment.status]);
            savedRows.push(rows[0]);
          }
          await client.query('COMMIT');
          return savedRows;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      },
      async () => {
        await validateReadingScheduleReferencesSupabase(normalizedAssignments);
        const { data, error } = await supabase
          .from('reading_schedule')
          .upsert(normalizedAssignments, { onConflict: 'schedule_date,zone_id' })
          .select('schedule_id');
        if (error) {
          if (error.code === '42P01') {
            return normalizedAssignments.map((_, index) => ({ Schedule_ID: Date.now() + index }));
          }
          throw error;
        }
        return (data || []).map((row) => ({ Schedule_ID: row.schedule_id }));
      }
    );
    scheduleImmediateSync('reading-schedules-bulk-upsert');
    return res.json({ success: true, data: rows });
  } catch (error) {
    await logRequestError(req, 'readingSchedules.bulkUpsert', error);
    console.error('Error saving bulk schedules:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
  }
});

app.delete('/api/reading-schedules/:id', async (req, res) => {
  const id = normalizeRequiredForeignKeyId(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: 'A valid schedule ID is required.' });
  }
  try {
    await withPostgresPrimary(
      'readingSchedules.delete',
      async () => {
        await pool.query('DELETE FROM reading_schedule WHERE schedule_id = $1', [id]);
      },
      async () => {
        const { error } = await supabase.from('reading_schedule').delete().eq('schedule_id', id);
        if (error && error.code !== '42P01') throw error;
      }
    );
    scheduleImmediateSync('reading-schedules-delete');
    return res.json({ success: true, message: 'Schedule deleted successfully' });
  } catch (error) {
    await logRequestError(req, 'readingSchedules.delete', error);
    console.error('Error deleting schedule:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
  }
});

app.put('/api/reading-schedules/:id/status', async (req, res) => {
  const id = normalizeRequiredForeignKeyId(req.params.id);
  if (!id) {
    return res.status(400).json({ success: false, message: 'A valid schedule ID is required.' });
  }
  const normalizedStatus = normalizeReadingScheduleStatus(req.body?.status);
  try {
    await withPostgresPrimary(
      'readingSchedules.updateStatus',
      async () => {
        await pool.query('UPDATE reading_schedule SET status = $1, updated_at = NOW() WHERE schedule_id = $2', [normalizedStatus, id]);
      },
      async () => {
        const { error } = await supabase.from('reading_schedule').update({ status: normalizedStatus }).eq('schedule_id', id);
        if (error && error.code !== '42P01') throw error;
      }
    );
    scheduleImmediateSync(`reading-schedules-status-${normalizedStatus.toLowerCase()}`);
    return res.json({ success: true, message: 'Schedule status updated' });
  } catch (error) {
    await logRequestError(req, 'readingSchedules.updateStatus', error);
    console.error('Error updating schedule status:', error);
    return res.status(getRequestFailureStatusCode(error)).json({ success: false, message: error.message });
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

