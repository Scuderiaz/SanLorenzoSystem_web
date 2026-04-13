import initSqlJs, { Database } from 'sql.js';
import { getClientDeviceId, getSourceSiteId } from '../utils/syncIdentity';

let db: Database | null = null;

const hasColumn = (database: Database, tableName: string, columnName: string) => {
  const result = database.exec(`PRAGMA table_info(${tableName})`);
  if (!result.length || !result[0].values.length) {
    return false;
  }

  return result[0].values.some((row) => String(row[1]) === columnName);
};

const ensureColumn = (database: Database, tableName: string, columnName: string, definition: string) => {
  if (!hasColumn(database, tableName, columnName)) {
    database.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
};

const generateOperationId = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `op-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

export const initOfflineDB = async (): Promise<Database> => {
  try {
    if (db) return db;

    const SQL = await initSqlJs({
      locateFile: () => `/sql-wasm.wasm`
    });

    const savedData = localStorage.getItem('offline-db');
    
    if (savedData) {
      const uint8Array = new Uint8Array(JSON.parse(savedData));
      db = new SQL.Database(uint8Array);
    } else {
      db = new SQL.Database();
    }

    createOfflineTables(db);

    return db;
  } catch (error) {
    console.error('Failed to initialize offline database:', error);
    throw error;
  }
};

const createOfflineTables = (database: Database) => {
  try {
    database.run(`
      CREATE TABLE IF NOT EXISTS roles (
        Role_ID INTEGER PRIMARY KEY AUTOINCREMENT,
        Role_Name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS accounts (
        AccountID INTEGER PRIMARY KEY AUTOINCREMENT,
        Username TEXT NOT NULL UNIQUE,
        Password TEXT NOT NULL,
        Full_Name TEXT,
        Role_ID INTEGER,
        FOREIGN KEY (Role_ID) REFERENCES roles(Role_ID)
      );

      CREATE TABLE IF NOT EXISTS zones (
        Zone_ID INTEGER PRIMARY KEY AUTOINCREMENT,
        Zone_Name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS classifications (
        Classification_ID INTEGER PRIMARY KEY AUTOINCREMENT,
        Classification_Name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS consumer (
        Consumer_ID INTEGER PRIMARY KEY AUTOINCREMENT,
        First_Name TEXT,
        Last_Name TEXT,
        Address TEXT,
        Zone_ID INTEGER,
        Classification_ID INTEGER,
        Login_ID INTEGER,
        Account_Number TEXT UNIQUE,
        Meter_Number TEXT,
        Status TEXT DEFAULT 'Active',
        Contact_Number TEXT,
        Connection_Date TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        source_site_id TEXT,
        sync_status TEXT DEFAULT 'synced',
        FOREIGN KEY (Zone_ID) REFERENCES zones(Zone_ID),
        FOREIGN KEY (Classification_ID) REFERENCES classifications(Classification_ID),
        FOREIGN KEY (Login_ID) REFERENCES accounts(AccountID)
      );

      CREATE TABLE IF NOT EXISTS meters (
        Meter_ID INTEGER PRIMARY KEY AUTOINCREMENT,
        Consumer_ID INTEGER UNIQUE,
        Meter_Serial_Number TEXT,
        Meter_Size TEXT,
        FOREIGN KEY (Consumer_ID) REFERENCES consumer(Consumer_ID)
      );

      CREATE TABLE IF NOT EXISTS meterreadings (
        Reading_ID INTEGER PRIMARY KEY AUTOINCREMENT,
        Route_ID INTEGER,
        Consumer_ID INTEGER,
        Meter_ID INTEGER,
        Meter_Reader_ID INTEGER,
        Created_Date TEXT DEFAULT CURRENT_TIMESTAMP,
        Reading_Status TEXT DEFAULT 'Normal',
        Previous_Reading REAL DEFAULT 0,
        Current_Reading REAL DEFAULT 0,
        Consumption REAL DEFAULT 0,
        Notes TEXT,
        Status TEXT DEFAULT 'Pending',
        Reading_Date TEXT DEFAULT CURRENT_DATE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        source_site_id TEXT,
        sync_status TEXT DEFAULT 'synced',
        FOREIGN KEY (Consumer_ID) REFERENCES consumer(Consumer_ID),
        FOREIGN KEY (Meter_ID) REFERENCES meters(Meter_ID)
      );

      CREATE TABLE IF NOT EXISTS bills (
        Bill_ID INTEGER PRIMARY KEY AUTOINCREMENT,
        Consumer_ID INTEGER,
        Reading_ID INTEGER,
        Bill_Date TEXT DEFAULT CURRENT_DATE,
        Due_Date TEXT,
        Total_Amount REAL DEFAULT 0,
        Status TEXT DEFAULT 'Unpaid',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        source_site_id TEXT,
        sync_status TEXT DEFAULT 'synced',
        FOREIGN KEY (Consumer_ID) REFERENCES consumer(Consumer_ID),
        FOREIGN KEY (Reading_ID) REFERENCES meterreadings(Reading_ID)
      );

      CREATE TABLE IF NOT EXISTS payments (
        Payment_ID INTEGER PRIMARY KEY AUTOINCREMENT,
        Bill_ID INTEGER,
        Consumer_ID INTEGER,
        Amount_Paid REAL,
        Payment_Date TEXT DEFAULT CURRENT_TIMESTAMP,
        Payment_Method TEXT,
        Reference_Number TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        source_site_id TEXT,
        sync_status TEXT DEFAULT 'synced',
        FOREIGN KEY (Bill_ID) REFERENCES bills(Bill_ID),
        FOREIGN KEY (Consumer_ID) REFERENCES consumer(Consumer_ID)
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER DEFAULT 0,
        operation_id TEXT UNIQUE,
        created_by_device TEXT,
        attempt_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS app_cache (
        dataset_key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    ensureColumn(database, 'consumer', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');
    ensureColumn(database, 'consumer', 'updated_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');
    ensureColumn(database, 'consumer', 'source_site_id', 'TEXT');
    ensureColumn(database, 'consumer', 'sync_status', "TEXT DEFAULT 'synced'");
    ensureColumn(database, 'meterreadings', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');
    ensureColumn(database, 'meterreadings', 'updated_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');
    ensureColumn(database, 'meterreadings', 'source_site_id', 'TEXT');
    ensureColumn(database, 'meterreadings', 'sync_status', "TEXT DEFAULT 'synced'");
    ensureColumn(database, 'bills', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');
    ensureColumn(database, 'bills', 'updated_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');
    ensureColumn(database, 'bills', 'source_site_id', 'TEXT');
    ensureColumn(database, 'bills', 'sync_status', "TEXT DEFAULT 'synced'");
    ensureColumn(database, 'payments', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');
    ensureColumn(database, 'payments', 'updated_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');
    ensureColumn(database, 'payments', 'source_site_id', 'TEXT');
    ensureColumn(database, 'payments', 'sync_status', "TEXT DEFAULT 'synced'");
    ensureColumn(database, 'sync_queue', 'operation_id', 'TEXT');
    ensureColumn(database, 'sync_queue', 'created_by_device', 'TEXT');
    ensureColumn(database, 'sync_queue', 'attempt_count', 'INTEGER DEFAULT 0');
  } catch (error) {
    console.error('Failed to create offline tables:', error);
    throw error;
  }
};

export const saveOfflineDB = async (database: Database) => {
  try {
    const data = database.export();
    const dataArray = Array.from(data);
    localStorage.setItem('offline-db', JSON.stringify(dataArray));
  } catch (error) {
    console.error('Failed to save offline database:', error);
    throw error;
  }
};

export const getOfflineDB = (): Database | null => {
  return db;
};

export const saveOfflineDataset = async (datasetKey: string, payload: unknown) => {
  try {
    const database = await initOfflineDB();
    database.run(
      'INSERT OR REPLACE INTO app_cache (dataset_key, payload, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [datasetKey, JSON.stringify(payload ?? null)]
    );
    await saveOfflineDB(database);
  } catch (error) {
    console.error(`Failed to save offline dataset "${datasetKey}":`, error);
    throw error;
  }
};

export const loadOfflineDataset = async <T = unknown>(datasetKey: string): Promise<T | null> => {
  try {
    const database = await initOfflineDB();
    const result = database.exec('SELECT payload FROM app_cache WHERE dataset_key = ? LIMIT 1', [datasetKey]);
    if (!result.length || !result[0].values.length) {
      return null;
    }

    const rawPayload = result[0].values[0]?.[0];
    if (typeof rawPayload !== 'string' || !rawPayload.trim()) {
      return null;
    }

    return JSON.parse(rawPayload) as T;
  } catch (error) {
    console.error(`Failed to load offline dataset "${datasetKey}":`, error);
    throw error;
  }
};

export const addToSyncQueue = async (
  tableName: string,
  operation: string,
  data: any
) => {
  try {
    const database = await initOfflineDB();
    const operationId = generateOperationId();
    const createdByDevice = getClientDeviceId();
    database.run(
      'INSERT INTO sync_queue (table_name, operation, data, operation_id, created_by_device, attempt_count) VALUES (?, ?, ?, ?, ?, ?)',
      [tableName, operation, JSON.stringify(data), operationId, createdByDevice, 0]
    );
    await saveOfflineDB(database);
    return {
      operationId,
      createdByDevice,
      sourceSiteId: getSourceSiteId(),
    };
  } catch (error) {
    console.error('Failed to add record to sync queue:', error);
    throw error;
  }
};
