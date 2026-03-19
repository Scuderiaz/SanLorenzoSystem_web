const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('⚠️  WARNING: Supabase credentials not found in .env file');
  console.log('The server will run but database operations will fail.');
} else {
  console.log('✅ Supabase URL:', supabaseUrl);
  console.log('✅ Supabase Key (first 20 chars):', supabaseKey.substring(0, 20) + '...');
  
  // Decode JWT to check role
  try {
    const payload = supabaseKey.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
    console.log('✅ Key type:', decoded.role === 'service_role' ? 'SERVICE ROLE ✓' : 'ANON');
  } catch (e) {
    console.log('✅ Key type: Unable to decode');
  }
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Initialize SQLite for offline mode
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'water_billing.db');
const db = new Database(dbPath);

db.exec(`
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
`);

const seedData = db.prepare('SELECT COUNT(*) as count FROM roles').get();
if (seedData.count === 0) {
  const insertRole = db.prepare('INSERT INTO roles (Role_Name) VALUES (?)');
  insertRole.run('Admin');
  insertRole.run('Meter Reader');
  insertRole.run('Billing Officer');
  insertRole.run('Cashier');
  insertRole.run('Consumer');

  const insertAccount = db.prepare('INSERT INTO accounts (Username, Password, Full_Name, Role_ID) VALUES (?, ?, ?, ?)');
  insertAccount.run('admin', 'admin123', 'System Administrator', 1);
  insertAccount.run('billing', 'billing123', 'Billing Officer', 3);
  insertAccount.run('cashier', 'cashier123', 'Cashier Staff', 4);

  const insertZone = db.prepare('INSERT INTO zones (Zone_Name) VALUES (?)');
  insertZone.run('Zone 1');
  insertZone.run('Zone 2');
  insertZone.run('Zone 3');
  insertZone.run('Zone 4');

  const insertClassification = db.prepare('INSERT INTO classifications (Classification_Name) VALUES (?)');
  insertClassification.run('Residential');
  insertClassification.run('Commercial');
  insertClassification.run('Industrial');

  console.log('✅ Database seeded with initial data');
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
        SELECT a.AccountID, a.Username, a.Password, a.Full_Name, a.Role_ID, r.Role_Name
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
  const { username, password, role_name } = req.body;

  if (!username || !password || !role_name) {
    return res.status(400).json({ success: false, message: 'Username, password, and role are required' });
  }

  try {
    if (supabase) {
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .select('Role_ID')
        .eq('Role_Name', role_name)
        .single();

      if (roleError || !roleData) {
        console.error("Role Error:", roleError);
        return res.status(400).json({ success: false, message: 'Invalid role specified', error: roleError });
      }

      const { data: userData, error: userError } = await supabase
        .from('accounts')
        .select(`
          AccountID,
          Username,
          Password,
          Full_Name,
          Role_ID,
          roles ( Role_Name )
        `)
        .eq('Username', username)
        .eq('Role_ID', roleData.Role_ID)
        .single();

      if (userError || !userData) {
        return res.status(401).json({ success: false, message: 'Invalid username or role' });
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
      const role = db.prepare('SELECT Role_ID FROM roles WHERE Role_Name = ?').get(role_name);
      if (!role) {
        return res.status(400).json({ success: false, message: 'Invalid role specified' });
      }

      const user = db.prepare(`
        SELECT a.AccountID, a.Username, a.Password, a.Full_Name, a.Role_ID, r.Role_Name
        FROM accounts a
        JOIN roles r ON a.Role_ID = r.Role_ID
        WHERE a.Username = ? AND a.Role_ID = ?
      `).get(username, role.Role_ID);

      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid username or role' });
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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📊 Database: ${supabase ? 'Supabase (Online)' : 'SQLite (Offline)'}`);
});
