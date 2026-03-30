const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
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
const syncIntervalMs = Number(process.env.SUPABASE_SYNC_INTERVAL_MS || 60000);
let isSupabaseSyncRunning = false;

const syncTableConfigs = [
  { tableName: 'roles', primaryKey: 'Role_ID' },
  { tableName: 'zones', primaryKey: 'Zone_ID' },
  { tableName: 'classifications', primaryKey: 'Classification_ID' },
  { tableName: 'accounts', primaryKey: 'AccountID' },
  { tableName: 'consumer', primaryKey: 'Consumer_ID' },
  { tableName: 'meters', primaryKey: 'Meter_ID' },
  { tableName: 'meterreadings', primaryKey: 'Reading_ID' },
  { tableName: 'bills', primaryKey: 'Bill_ID' },
  { tableName: 'payments', primaryKey: 'Payment_ID' },
  { tableName: 'otp_verifications', primaryKey: 'ID' },
  { tableName: 'registration_tickets', primaryKey: 'ID' },
];

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS roles (
      "Role_ID" SERIAL PRIMARY KEY,
      "Role_Name" TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      "AccountID" SERIAL PRIMARY KEY,
      "Username" TEXT NOT NULL UNIQUE,
      "Password" TEXT NOT NULL,
      "Full_Name" TEXT,
      "Phone_Number" TEXT,
      "Status" TEXT DEFAULT 'Active',
      "Role_ID" INTEGER,
      CONSTRAINT accounts_role_fk FOREIGN KEY ("Role_ID") REFERENCES roles("Role_ID")
    );

    CREATE TABLE IF NOT EXISTS otp_verifications (
      "ID" SERIAL PRIMARY KEY,
      "AccountID" INTEGER,
      "Code" TEXT NOT NULL,
      "ExpiresAt" TIMESTAMP NOT NULL,
      "IsUsed" BOOLEAN DEFAULT FALSE,
      "Attempts" INTEGER DEFAULT 0,
      CONSTRAINT otp_account_fk FOREIGN KEY ("AccountID") REFERENCES accounts("AccountID")
    );

    CREATE TABLE IF NOT EXISTS registration_tickets (
      "ID" SERIAL PRIMARY KEY,
      "TicketNumber" TEXT UNIQUE NOT NULL,
      "AccountID" INTEGER,
      "CreatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "Status" TEXT DEFAULT 'Pending',
      CONSTRAINT registration_account_fk FOREIGN KEY ("AccountID") REFERENCES accounts("AccountID")
    );

    CREATE TABLE IF NOT EXISTS zones (
      "Zone_ID" SERIAL PRIMARY KEY,
      "Zone_Name" TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS classifications (
      "Classification_ID" SERIAL PRIMARY KEY,
      "Classification_Name" TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS consumer (
      "Consumer_ID" SERIAL PRIMARY KEY,
      "First_Name" TEXT,
      "Middle_Name" TEXT,
      "Last_Name" TEXT,
      "Address" TEXT,
      "Zone_ID" INTEGER,
      "Classification_ID" INTEGER,
      "Login_ID" INTEGER,
      "Account_Number" TEXT UNIQUE,
      "Meter_Number" TEXT,
      "Status" TEXT DEFAULT 'Active',
      "Contact_Number" TEXT,
      "Connection_Date" TEXT,
      CONSTRAINT consumer_zone_fk FOREIGN KEY ("Zone_ID") REFERENCES zones("Zone_ID"),
      CONSTRAINT consumer_classification_fk FOREIGN KEY ("Classification_ID") REFERENCES classifications("Classification_ID"),
      CONSTRAINT consumer_login_fk FOREIGN KEY ("Login_ID") REFERENCES accounts("AccountID")
    );

    CREATE TABLE IF NOT EXISTS meters (
      "Meter_ID" SERIAL PRIMARY KEY,
      "Consumer_ID" INTEGER UNIQUE,
      "Meter_Serial_Number" TEXT,
      "Meter_Size" TEXT,
      CONSTRAINT meters_consumer_fk FOREIGN KEY ("Consumer_ID") REFERENCES consumer("Consumer_ID")
    );

    CREATE TABLE IF NOT EXISTS meterreadings (
      "Reading_ID" SERIAL PRIMARY KEY,
      "Route_ID" INTEGER,
      "Consumer_ID" INTEGER,
      "Meter_ID" INTEGER,
      "Meter_Reader_ID" INTEGER,
      "Created_Date" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "Reading_Status" TEXT DEFAULT 'Normal',
      "Previous_Reading" DOUBLE PRECISION DEFAULT 0,
      "Current_Reading" DOUBLE PRECISION DEFAULT 0,
      "Consumption" DOUBLE PRECISION DEFAULT 0,
      "Notes" TEXT,
      "Status" TEXT DEFAULT 'Pending',
      "Reading_Date" DATE DEFAULT CURRENT_DATE,
      CONSTRAINT meterreadings_consumer_fk FOREIGN KEY ("Consumer_ID") REFERENCES consumer("Consumer_ID"),
      CONSTRAINT meterreadings_meter_fk FOREIGN KEY ("Meter_ID") REFERENCES meters("Meter_ID")
    );

    CREATE TABLE IF NOT EXISTS bills (
      "Bill_ID" SERIAL PRIMARY KEY,
      "Consumer_ID" INTEGER,
      "Reading_ID" INTEGER,
      "Bill_Date" DATE DEFAULT CURRENT_DATE,
      "Due_Date" TEXT,
      "Total_Amount" DOUBLE PRECISION DEFAULT 0,
      "Status" TEXT DEFAULT 'Unpaid',
      CONSTRAINT bills_consumer_fk FOREIGN KEY ("Consumer_ID") REFERENCES consumer("Consumer_ID"),
      CONSTRAINT bills_reading_fk FOREIGN KEY ("Reading_ID") REFERENCES meterreadings("Reading_ID")
    );

    CREATE TABLE IF NOT EXISTS payments (
      "Payment_ID" SERIAL PRIMARY KEY,
      "Bill_ID" INTEGER,
      "Consumer_ID" INTEGER,
      "Amount_Paid" DOUBLE PRECISION,
      "Payment_Date" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      "Payment_Method" TEXT,
      "Reference_Number" TEXT,
      CONSTRAINT payments_bill_fk FOREIGN KEY ("Bill_ID") REFERENCES bills("Bill_ID"),
      CONSTRAINT payments_consumer_fk FOREIGN KEY ("Consumer_ID") REFERENCES consumer("Consumer_ID")
    );
  `);

  const seedRes = await pool.query('SELECT COUNT(*)::int AS count FROM roles');
  if (seedRes.rows[0].count === 0) {
    await pool.query('INSERT INTO roles ("Role_Name") VALUES ($1), ($2), ($3), ($4), ($5)', [
      'Admin',
      'Meter Reader',
      'Billing Officer',
      'Cashier',
      'Consumer',
    ]);

    await pool.query(
      'INSERT INTO accounts ("Username", "Password", "Full_Name", "Role_ID", "Phone_Number") VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10), ($11, $12, $13, $14, $15)',
      [
        'admin', 'admin123', 'System Administrator', 1, NULL,
        'billing', 'billing123', 'Billing Officer', 3, NULL,
        'cashier', 'cashier123', 'Cashier Staff', 4, NULL,
      ]
    );

    // Create a default consumer for testing
    await pool.query(
      'INSERT INTO accounts ("Username", "Password", "Full_Name", "Role_ID", "Phone_Number") VALUES ($1, $2, $3, $4, $5)',
      ['consumer1', 'consumer123', 'Test Consumer', 5, '09288938507']
    );

    await pool.query('INSERT INTO zones ("Zone_Name") VALUES ($1), ($2), ($3), ($4)', [
      'Zone 1',
      'Zone 2',
      'Zone 3',
      'Zone 4',
    ]);

    await pool.query('INSERT INTO classifications ("Classification_Name") VALUES ($1), ($2), ($3)', [
      'Residential',
      'Commercial',
      'Industrial',
    ]);
  }
}

async function syncTableToSupabase(tableName, primaryKey) {
  const { rows } = await pool.query(`SELECT * FROM ${tableName}`);

  if (rows.length === 0) {
    return { tableName, synced: 0 };
  }

  const { error } = await supabase.from(tableName).upsert(rows, {
    onConflict: primaryKey,
    ignoreDuplicates: false,
  });

  if (error) {
    throw new Error(`${tableName}: ${error.message}`);
  }

  return { tableName, synced: rows.length };
}

async function syncPostgresToSupabase() {
  if (!supabase || isSupabaseSyncRunning) {
    return [];
  }

  isSupabaseSyncRunning = true;

  try {
    const results = [];

    for (const { tableName, primaryKey } of syncTableConfigs) {
      results.push(await syncTableToSupabase(tableName, primaryKey));
    }

    return results;
  } finally {
    isSupabaseSyncRunning = false;
  }
}

function startSupabaseSyncScheduler() {
  if (!supabase) {
    return;
  }

  setInterval(() => {
    syncPostgresToSupabase().catch((error) => {
      console.warn('Supabase sync skipped:', error.message);
    });
  }, syncIntervalMs);
}

// Get roles
app.get('/api/roles', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('roles').select('*');
      if (error) throw error;
      return res.json({ success: true, data });
    } else {
      const roles = db.prepare('SELECT * FROM roles').all();
      return res.json({ success: true, data: roles });
    }
  } catch (error) {
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
        roleIds = '1,3,4';
      } else {
        roleIds = '2,5';
      }
      
      const users = db.prepare(`
        SELECT a.AccountID, a.Username, a.Password, a.Full_Name, a.Role_ID, a.Status, r.Role_Name
        FROM accounts a
        JOIN roles r ON a.Role_ID = r.Role_ID
        WHERE a.Role_ID IN (${roleIds})
      `).all();
      
      return res.json({ success: true, data: users });
    }
  } catch (error) {
    console.error('Error fetching users:', error);
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
      
      const users = data.map(u => ({
        ...u,
        Role_Name: u.roles?.Role_Name
      }));
      
      return res.json({ success: true, data: users });
    } else {
      const users = db.prepare(`
        SELECT a.AccountID, a.Username, a.Full_Name, a.Role_ID, a.Status, a.Phone_Number, r.Role_Name
        FROM accounts a
        LEFT JOIN roles r ON a.Role_ID = r.Role_ID
        ORDER BY a.AccountID DESC
      `).all();
      return res.json({ success: true, data: users });
    }
  } catch (error) {
    console.error('Error fetching unified users:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Approve Pending Account
app.post('/api/admin/approve-user', async (req, res) => {
  const { accountId } = req.body;
  try {
    if (supabase) {
      const { error: aErr } = await supabase.from('accounts').update({ Status: 'Active' }).eq('AccountID', accountId);
      if (aErr) throw aErr;
      const { error: cErr } = await supabase.from('consumer').update({ Status: 'Active' }).eq('Login_ID', accountId);
      if (cErr) throw cErr;
      return res.json({ success: true, message: 'Account approved successfully' });
    } else {
      db.prepare('UPDATE accounts SET Status = "Active" WHERE AccountID = ?').run(accountId);
      db.prepare('UPDATE consumer SET Status = "Active" WHERE Login_ID = ?').run(accountId);
      return res.json({ success: true, message: 'Account approved successfully' });
    }
  } catch (error) {
    console.error('Approval error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Reject Pending Account (Delete)
app.post('/api/admin/reject-user', async (req, res) => {
  const { accountId } = req.body;
  try {
    if (supabase) {
      // Delete registration ticket first if exists
      await supabase.from('registration_tickets').delete().eq('AccountID', accountId);
      // Delete consumer record
      await supabase.from('consumer').delete().eq('Login_ID', accountId);
      // Delete account
      const { error } = await supabase.from('accounts').delete().eq('AccountID', accountId);
      if (error) throw error;
      return res.json({ success: true, message: 'Account rejected and deleted' });
    } else {
      db.prepare('DELETE FROM registration_tickets WHERE AccountID = ?').run(accountId);
      db.prepare('DELETE FROM consumer WHERE Login_ID = ?').run(accountId);
      db.prepare('DELETE FROM accounts WHERE AccountID = ?').run(accountId);
      return res.json({ success: true, message: 'Account rejected and deleted' });
    }
  } catch (error) {
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
        .insert([{ Username: username, Full_Name: fullName, Password: password, Role_ID: roleId }])
        .select();
      
      if (error) throw error;
      return res.json({ success: true, data });
    } else {
      const stmt = db.prepare('INSERT INTO accounts (Username, Full_Name, Password, Role_ID) VALUES (?, ?, ?, ?)');
      const result = stmt.run(username, fullName, password, roleId);
      return res.json({ success: true, data: { AccountID: result.lastInsertRowid, Username: username, Full_Name: fullName, Role_ID: roleId } });
    }
  } catch (error) {
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
      const updateData = { Full_Name: fullName, Role_ID: roleId };
      if (password) {
        updateData.Password = password;
      }
      
      const { data, error } = await supabase
        .from('accounts')
        .update(updateData)
        .eq('AccountID', id)
        .select();
      
      if (error) throw error;
      return res.json({ success: true, data });
    } else {
      let query = 'UPDATE accounts SET Full_Name = ?, Role_ID = ?';
      let params = [fullName, roleId];
      
      if (password) {
        query += ', Password = ?';
        params.push(password);
      }
      
      query += ' WHERE AccountID = ?';
      params.push(id);
      
      const stmt = db.prepare(query);
      stmt.run(...params);
      return res.json({ success: true, message: 'User updated successfully' });
    }
  } catch (error) {
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
        .eq('AccountID', id);
      
      if (error) throw error;
      return res.json({ success: true, message: 'User deleted successfully' });
    } else {
      const stmt = db.prepare('DELETE FROM accounts WHERE AccountID = ?');
      stmt.run(id);
      return res.json({ success: true, message: 'User deleted successfully' });
    }
  } catch (error) {
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
    if (supabase) {

      const { data: userData, error: userError } = await supabase
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
        .single();

      if (userError || !userData) {
        return res.status(401).json({ success: false, message: 'Invalid username' });
      }

      if (userData.Status === 'Pending') {
        return res.status(401).json({ success: false, message: 'Please wait until you are registered to access the dashboard.' });
      }

      if (userData.Password !== password) {
        return res.status(401).json({ success: false, message: 'Invalid password' });
      }

      return res.json({
        success: true,
        user: {
          id: userData.AccountID,
          username: userData.Username,
          fullName: userData.Full_Name || userData.Username,
          role_id: userData.Role_ID,
          role_name: userData.roles.Role_Name,
        },
      });
    } else {
      const user = db.prepare(`
        SELECT a.AccountID, a.Username, a.Password, a.Full_Name, a.Role_ID, r.Role_Name
        FROM accounts a
        JOIN roles r ON a.Role_ID = r.Role_ID
        WHERE a.Username = ?
      `).get(username);

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
    }
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Database error: ' + error.message });
  }
});

// Get zones
app.get('/api/zones', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('zones').select('*');
      if (error) throw error;
      return res.json({ success: true, data });
    } else {
      const zones = db.prepare('SELECT * FROM zones').all();
      return res.json({ success: true, data: zones });
    }
  } catch (error) {
    console.error('Error fetching zones:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Get classifications
app.get('/api/classifications', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('classifications').select('*');
      if (error) throw error;
      return res.json({ success: true, data });
    } else {
      const classifications = db.prepare('SELECT * FROM classifications').all();
      return res.json({ success: true, data: classifications });
    }
  } catch (error) {
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
          zones (Zone_Name),
          classifications (Classification_Name)
        `);
      if (error) throw error;
      
      const consumers = data.map(c => ({
        ...c,
        Zone_Name: c.zones?.Zone_Name,
        Classification_Name: c.classifications?.Classification_Name
      }));
      
      return res.json(consumers);
    } else {
      const consumers = db.prepare(`
        SELECT c.*, z.Zone_Name, cl.Classification_Name
        FROM consumer c
        LEFT JOIN zones z ON c.Zone_ID = z.Zone_ID
        LEFT JOIN classifications cl ON c.Classification_ID = cl.Classification_ID
      `).all();
      return res.json(consumers);
    }
  } catch (error) {
    console.error('Error fetching consumers:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/consumers', async (req, res) => {
  try {
    const consumer = req.body;
    if (supabase) {
      const { data, error } = await supabase.from('consumer').insert([consumer]).select();
      if (error) throw error;
      return res.json({ success: true, data });
    } else {
      const stmt = db.prepare(`
        INSERT INTO consumer (First_Name, Last_Name, Address, Zone_ID, Classification_ID, Account_Number, Meter_Number, Status, Contact_Number, Connection_Date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        consumer.First_Name,
        consumer.Last_Name,
        consumer.Address,
        consumer.Zone_ID,
        consumer.Classification_ID,
        consumer.Account_Number,
        consumer.Meter_Number,
        consumer.Status || 'Active',
        consumer.Contact_Number,
        consumer.Connection_Date
      );
      return res.json({ success: true, data: { Consumer_ID: result.lastInsertRowid, ...consumer } });
    }
  } catch (error) {
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
      const data = db.prepare('SELECT * FROM classifications ORDER BY Classification_ID').all();
      return res.json({ success: true, data });
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
      const data = db.prepare('SELECT * FROM zones ORDER BY Zone_ID').all();
      return res.json({ success: true, data });
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
        .update(consumer)
        .eq('Consumer_ID', id)
        .select();
      if (error) throw error;
      return res.json({ success: true, data });
    } else {
      const stmt = db.prepare(`
        UPDATE consumer SET 
          First_Name = ?, Last_Name = ?, Address = ?, Zone_ID = ?, 
          Classification_ID = ?, Account_Number = ?, Meter_Number = ?, 
          Status = ?, Contact_Number = ?, Connection_Date = ?
        WHERE Consumer_ID = ?
      `);
      stmt.run(
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
        id
      );
      return res.json({ success: true, message: 'Consumer updated successfully' });
    }
  } catch (error) {
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
        .eq('Consumer_ID', id);
      if (error) throw error;
      return res.json({ success: true, message: 'Consumer deleted successfully' });
    } else {
      const stmt = db.prepare('DELETE FROM consumer WHERE Consumer_ID = ?');
      stmt.run(id);
      return res.json({ success: true, message: 'Consumer deleted successfully' });
    }
  } catch (error) {
    console.error('Error deleting consumer:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/meter-readings', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('meterreadings').select('*');
      if (error) throw error;
      return res.json(data);
    } else {
      const readings = db.prepare('SELECT * FROM meterreadings').all();
      return res.json(readings);
    }
  } catch (error) {
    console.error('Error fetching meter readings:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/meter-readings', async (req, res) => {
  try {
    const reading = req.body;
    if (supabase) {
      const { data, error } = await supabase.from('meterreadings').insert([reading]).select();
      if (error) throw error;
      return res.json(data);
    } else {
      const stmt = db.prepare(`
        INSERT INTO meterreadings (Consumer_ID, Meter_ID, Previous_Reading, Current_Reading, Consumption, Reading_Status, Notes, Reading_Date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        reading.Consumer_ID,
        reading.Meter_ID,
        reading.Previous_Reading,
        reading.Current_Reading,
        reading.Consumption,
        reading.Reading_Status || 'Normal',
        reading.Notes,
        reading.Reading_Date
      );
      return res.json({ Reading_ID: result.lastInsertRowid, ...reading });
    }
  } catch (error) {
    console.error('Error creating meter reading:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('bills').select('*');
      if (error) throw error;
      return res.json(data);
    } else {
      const bills = db.prepare('SELECT * FROM bills').all();
      return res.json(bills);
    }
  } catch (error) {
    console.error('Error fetching bills:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/bills', async (req, res) => {
  try {
    const bill = req.body;
    if (supabase) {
      const { data, error } = await supabase.from('bills').insert([bill]).select();
      if (error) throw error;
      return res.json(data);
    } else {
      const stmt = db.prepare(`
        INSERT INTO bills (Consumer_ID, Reading_ID, Bill_Date, Due_Date, Total_Amount, Status)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        bill.Consumer_ID,
        bill.Reading_ID,
        bill.Bill_Date,
        bill.Due_Date,
        bill.Total_Amount,
        bill.Status || 'Unpaid'
      );
      return res.json({ Bill_ID: result.lastInsertRowid, ...bill });
    }
  } catch (error) {
    console.error('Error creating bill:', error);
    return res.status(500).json({ error: error.message });
  }
});

// --- CONSUMER DASHBOARD ---
app.get('/api/consumer-dashboard/:accountId', async (req, res) => {
  const { accountId } = req.params;
  try {
    if (supabase) {
      // Get consumer profile
      console.log('Fetching dashboard for accountId:', accountId);
      const { data: consumer, error: cErr } = await supabase
        .from('consumer')
        .select('*') // Simplify to check if basic fetch works
        .eq('Login_ID', accountId)
        .maybeSingle();
      
      if (cErr) {
        console.error('Consumer Fetch Error:', cErr);
        throw cErr;
      }
      
      console.log('Consumer found:', consumer);
      if (!consumer) return res.status(404).json({ success: false, message: 'Consumer profile not found' });

      const consumerId = consumer.Consumer_ID;
      console.log('Consumer ID:', consumerId);

      // Get bills
      let bills = [];
      try {
        const { data, error } = await supabase
          .from('bills')
          .select('*')
          .eq('Consumer_ID', consumerId)
          .order('Bill_Date', { ascending: false });
        if (error) {
          console.error('Bills Fetch Error:', error);
          // Don't throw, just use empty list
        } else {
          bills = data || [];
        }
      } catch (e) { console.error('Bills catch:', e); }

      // Get payments (with linked bill info for billing month)
      let payments = [];
      try {
        const { data, error } = await supabase
          .from('payments')
          .select('*, bills(Bill_Date)')
          .eq('Consumer_ID', consumerId)
          .order('Payment_Date', { ascending: false });
        if (error) {
          console.error('Payments Fetch Error:', error);
        } else {
          payments = data || [];
        }
      } catch (e) { console.error('Payments catch:', e); }

      // Get meter readings for chart (last 6)
      let readings = [];
      try {
        const { data, error } = await supabase
          .from('meterreadings')
          .select('Reading_Date, Consumption')
          .eq('Consumer_ID', consumerId)
          .order('Reading_Date', { ascending: false })
          .limit(6);
        if (error) {
          console.error('Readings Fetch Error:', error);
        } else {
          readings = (data || []).reverse();
        }
      } catch (e) { console.error('Readings catch:', e); }

      return res.json({ success: true, consumer, bills, payments, readings });
    } else {
      const consumer = db.prepare('SELECT * FROM consumer WHERE Login_ID = ?').get(accountId);
      if (!consumer) return res.status(404).json({ success: false, message: 'Consumer not found' });
      const bills = db.prepare('SELECT * FROM bills WHERE Consumer_ID = ? ORDER BY Bill_Date DESC').all(consumer.Consumer_ID);
      const payments = db.prepare(`
        SELECT p.*, b.Bill_Date 
        FROM payments p 
        LEFT JOIN bills b ON p.Bill_ID = b.Bill_ID 
        WHERE p.Consumer_ID = ? 
        ORDER BY p.Payment_Date DESC
      `).all(consumer.Consumer_ID);
      const readings = db.prepare('SELECT Reading_Date, Consumption FROM meterreadings WHERE Consumer_ID = ? ORDER BY Reading_Date DESC LIMIT 6').all(consumer.Consumer_ID).reverse();
      return res.json({ success: true, consumer, bills, payments, readings });
    }
  } catch (error) {
    console.error('Consumer dashboard error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/payments', async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('payments').select('*');
      if (error) throw error;
      return res.json(data);
    } else {
      const payments = db.prepare('SELECT * FROM payments').all();
      return res.json(payments);
    }
  } catch (error) {
    console.error('Error fetching payments:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/payments', async (req, res) => {
  try {
    const payment = req.body;
    if (supabase) {
      const { data, error } = await supabase.from('payments').insert([payment]).select();
      if (error) throw error;
      return res.json(data);
    } else {
      const stmt = db.prepare(`
        INSERT INTO payments (Bill_ID, Consumer_ID, Amount_Paid, Payment_Date, Payment_Method, Reference_Number)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        payment.Bill_ID,
        payment.Consumer_ID,
        payment.Amount_Paid,
        payment.Payment_Date,
        payment.Payment_Method,
        payment.Reference_Number
      );
      return res.json({ Payment_ID: result.lastInsertRowid, ...payment });
    }
  } catch (error) {
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
    let user;
    if (supabase) {
      const { data, error } = await supabase.from('accounts').select('*').eq('Username', username).single();
      if (error || !data) return res.status(404).json({ success: false, message: 'User not found' });
      user = data;
    } else {
      user = db.prepare('SELECT * FROM accounts WHERE Username = ?').get(username);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.Phone_Number) {
      return res.status(400).json({ success: false, message: 'No phone number linked to this account. Please contact admin.' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString(); // 10 minutes from now

    if (supabase) {
      const { error } = await supabase.from('otp_verifications').insert([{
        AccountID: user.AccountID,
        Code: otpCode,
        ExpiresAt: expiresAt
      }]);
      if (error) throw error;
    } else {
      db.prepare('INSERT INTO otp_verifications (AccountID, Code, ExpiresAt) VALUES (?, ?, ?)').run(user.AccountID, otpCode, expiresAt);
    }

    await sendSMS(user.Phone_Number, `Your San Lorenzo Water System reset code is: ${otpCode}. Valid for 10 mins.`);

    return res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Forgot password request error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Verify OTP
app.post('/api/forgot-password/verify', async (req, res) => {
  const { username, code } = req.body;
  if (!username || !code) return res.status(400).json({ success: false, message: 'Username and code are required' });

  try {
    let user;
    if (supabase) {
      const { data } = await supabase.from('accounts').select('*').eq('Username', username).single();
      user = data;
    } else {
      user = db.prepare('SELECT * FROM accounts WHERE Username = ?').get(username);
    }

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let latestOtp;
    if (supabase) {
      const { data, error } = await supabase
        .from('otp_verifications')
        .select('*')
        .eq('AccountID', user.AccountID)
        .eq('IsUsed', false)
        .order('ExpiresAt', { ascending: false })
        .limit(1)
        .single();
      latestOtp = data;
    } else {
      latestOtp = db.prepare(`
        SELECT * FROM otp_verifications 
        WHERE AccountID = ? AND IsUsed = 0 
        ORDER BY ExpiresAt DESC LIMIT 1
      `).get(user.AccountID);
    }

    if (!latestOtp) return res.status(400).json({ success: false, message: 'No active OTP found' });
    if (new Date() > new Date(latestOtp.ExpiresAt)) return res.status(400).json({ success: false, message: 'OTP has expired' });
    if (latestOtp.Code !== code) {
      // Increment attempts
      if (supabase) {
        await supabase.from('otp_verifications').update({ Attempts: (latestOtp.Attempts || 0) + 1 }).eq('ID', latestOtp.ID);
      } else {
        db.prepare('UPDATE otp_verifications SET Attempts = Attempts + 1 WHERE ID = ?').run(latestOtp.ID);
      }
      return res.status(400).json({ success: false, message: 'Invalid code' });
    }

    // Success - mark as used during reset, or here if we use a token
    // For simplicity, we'll verify it again during reset or return a success flag
    return res.json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    console.error('OTP verification error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// Reset Password
app.post('/api/forgot-password/reset', async (req, res) => {
  const { username, code, newPassword } = req.body;
  if (!username || !code || !newPassword) return res.status(400).json({ success: false, message: 'Missing required fields' });

  try {
    let user;
    if (supabase) {
      const { data } = await supabase.from('accounts').select('*').eq('Username', username).single();
      user = data;
    } else {
      user = db.prepare('SELECT * FROM accounts WHERE Username = ?').get(username);
    }

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Final verification of OTP
    let latestOtp;
    if (supabase) {
      const { data } = await supabase
        .from('otp_verifications')
        .select('*')
        .eq('AccountID', user.AccountID)
        .eq('Code', code)
        .eq('IsUsed', false)
        .single();
      latestOtp = data;
    } else {
      latestOtp = db.prepare('SELECT * FROM otp_verifications WHERE AccountID = ? AND Code = ? AND IsUsed = 0').get(user.AccountID, code);
    }

    if (!latestOtp || new Date() > new Date(latestOtp.ExpiresAt)) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    // Update password
    if (supabase) {
      await supabase.from('accounts').update({ Password: newPassword }).eq('AccountID', user.AccountID);
      await supabase.from('otp_verifications').update({ IsUsed: true }).eq('ID', latestOtp.ID);
    } else {
      db.prepare('UPDATE accounts SET Password = ? WHERE AccountID = ?').run(newPassword, user.AccountID);
      db.prepare('UPDATE otp_verifications SET IsUsed = 1 WHERE ID = ?').run(latestOtp.ID);
    }

    return res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
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
    if (supabase) {
      const { data, error } = await supabase
        .from('accounts')
        .insert([{ 
          Username: username, 
          Password: password, 
          Full_Name: fullName, 
          Role_ID: 5, 
          Phone_Number: phone,
          Status: 'Pending'
        }])
        .select();
      if (error) throw error;
      accountId = data[0].AccountID;
    } else {
      const result = db.prepare('INSERT INTO accounts (Username, Password, Full_Name, Role_ID, Phone_Number, Status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(username, password, fullName, 5, phone, 'Pending');
      accountId = result.lastInsertRowid;
    }

    // 2. Create Consumer Record
    if (supabase) {
      const { error } = await supabase
        .from('consumer')
        .insert([{
          First_Name: firstName,
          Middle_Name: middleName,
          Last_Name: lastName,
          Address: address,
          Zone_ID: zoneId,
          Classification_ID: classificationId,
          Login_ID: accountId,
          Status: 'Pending'
        }]);
      if (error) throw error;
    } else {
      db.prepare(`
        INSERT INTO consumer (First_Name, Middle_Name, Last_Name, Address, Zone_ID, Classification_ID, Login_ID, Status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(firstName, middleName, lastName, address, zoneId, classificationId, accountId, 'Pending');
    }

    // 3. Generate Ticket
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.floor(1000 + Math.random() * 9000).toString();
    const ticketNumber = `REG-${dateStr}-${randomStr}`;

    if (supabase) {
      const { error } = await supabase
        .from('registration_tickets')
        .insert([{ TicketNumber: ticketNumber, AccountID: accountId }]);
      if (error) throw error;
    } else {
      db.prepare('INSERT INTO registration_tickets (TicketNumber, AccountID) VALUES (?, ?)').run(ticketNumber, accountId);
    }

    return res.json({ success: true, ticketNumber });
  } catch (error) {
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
    if (!supabase) {
      return res.status(400).json({
        success: false,
        message: 'Supabase is not configured on this server.',
      });
    }

    const results = await syncPostgresToSupabase();
    return res.json({ success: true, results });
  } catch (error) {
    console.error('Manual Supabase sync failed:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

async function startServer() {
  try {
    await pool.query('SELECT 1');
    await initDb();
    if (supabase) {
      try {
        const initialSyncResults = await syncPostgresToSupabase();
        console.log('Initial PostgreSQL to Supabase sync complete:', initialSyncResults);
      } catch (error) {
        console.warn('Initial PostgreSQL to Supabase sync failed:', error.message);
      }
      startSupabaseSyncScheduler();
    }

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(
        `Database: PostgreSQL (${process.env.DB_NAME || 'SLRWs'})${supabase ? ' with Supabase enabled' : ''}`
      );
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

const legacyStartupLog = () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📊 Database: ${supabase ? 'Supabase (Online)' : 'SQLite (Offline)'}`);
};
