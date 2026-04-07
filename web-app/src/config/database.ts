import initSqlJs, { Database } from 'sql.js';

let db: Database | null = null;

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
      createOfflineTables(db);
    }

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
        FOREIGN KEY (Bill_ID) REFERENCES bills(Bill_ID),
        FOREIGN KEY (Consumer_ID) REFERENCES consumer(Consumer_ID)
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER DEFAULT 0
      );
    `);
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

export const addToSyncQueue = async (
  tableName: string,
  operation: string,
  data: any
) => {
  try {
    const database = await initOfflineDB();
    database.run(
      'INSERT INTO sync_queue (table_name, operation, data) VALUES (?, ?, ?)',
      [tableName, operation, JSON.stringify(data)]
    );
    await saveOfflineDB(database);
  } catch (error) {
    console.error('Failed to add record to sync queue:', error);
    throw error;
  }
};
