import axios from 'axios';
import { supabase } from '../config/supabase';
import { initOfflineDB, saveOfflineDB, addToSyncQueue } from '../config/database';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const authService = {
  login: async (username: string, password: string) => {
    try {
      if (navigator.onLine) {
        const response = await api.post('/login', { username, password });
        return response.data;
      } else {
        const db = await initOfflineDB();
        const result = db.exec(`
          SELECT a.AccountID, a.Username, a.Full_Name, a.Role_ID, r.Role_Name
          FROM accounts a
          JOIN roles r ON a.Role_ID = r.Role_ID
          WHERE a.Username = ? AND a.Password = ?
        `, [username, password]);

        if (result.length > 0 && result[0].values.length > 0) {
          const [id, uname, fullName, roleId, roleName] = result[0].values[0];
          return {
            success: true,
            user: {
              id,
              username: uname,
              fullName: fullName || uname,
              role_id: roleId,
              role_name: roleName,
            },
          };
        }
        return { success: false, message: 'Invalid credentials' };
      }
    } catch (error: any) {
      // Use the server's specific message if available, otherwise fall back to Axios message
      const msg = error.response?.data?.message || error.message;
      return { success: false, message: msg };
    }
  },

  register: async (userData: any) => {
    try {
      const response = await api.post('/register', userData);
      return response.data;
    } catch (error: any) {
      return error.response?.data || { success: false, message: error.message };
    }
  },

  requestOtp: async (username: string) => {
    try {
      const response = await api.post('/forgot-password/request', { username });
      return response.data;
    } catch (error: any) {
      return error.response?.data || { success: false, message: error.message };
    }
  },

  verifyOtp: async (username: string, code: string) => {
    try {
      const response = await api.post('/forgot-password/verify', { username, code });
      return response.data;
    } catch (error: any) {
      return error.response?.data || { success: false, message: error.message };
    }
  },

  resetPassword: async (username: string, code: string, newPassword: string) => {
    try {
      const response = await api.post('/forgot-password/reset', { username, code, newPassword });
      return response.data;
    } catch (error: any) {
      return error.response?.data || { success: false, message: error.message };
    }
  },
};

export const consumerService = {
  getAll: async () => {
    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('consumer')
          .select('*');
        if (error) throw error;
        return data;
      } else {
        const db = await initOfflineDB();
        const result = db.exec('SELECT * FROM consumer');
        if (result.length > 0) {
          const columns = result[0].columns;
          return result[0].values.map((row) => {
            const obj: any = {};
            columns.forEach((col, idx) => {
              obj[col] = row[idx];
            });
            return obj;
          });
        }
        return [];
      }
    } catch (error) {
      console.error('Error fetching consumers:', error);
      return [];
    }
  },

  create: async (consumer: any) => {
    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('consumer')
          .insert([consumer])
          .select();
        if (error) throw error;
        return data;
      } else {
        await addToSyncQueue('consumer', 'INSERT', consumer);
        const db = await initOfflineDB();
        db.run(`
          INSERT INTO consumer (First_Name, Last_Name, Address, Zone_ID, Classification_ID, Account_Number, Meter_Number, Status, Contact_Number, Connection_Date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
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
        ]);
        await saveOfflineDB(db);
        return [consumer];
      }
    } catch (error) {
      console.error('Error creating consumer:', error);
      throw error;
    }
  },

  update: async (id: number, consumer: any) => {
    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('consumer')
          .update(consumer)
          .eq('Consumer_ID', id)
          .select();
        if (error) throw error;
        return data;
      } else {
        await addToSyncQueue('consumer', 'UPDATE', { id, ...consumer });
        const db = await initOfflineDB();
        const fields = Object.keys(consumer).map(k => `${k} = ?`).join(', ');
        const values: any[] = [...Object.values(consumer), id];
        db.run(`UPDATE consumer SET ${fields} WHERE Consumer_ID = ?`, values);
        await saveOfflineDB(db);
        return [consumer];
      }
    } catch (error) {
      console.error('Error updating consumer:', error);
      throw error;
    }
  },

  delete: async (id: number) => {
    try {
      if (navigator.onLine) {
        const { error } = await supabase
          .from('consumer')
          .delete()
          .eq('Consumer_ID', id);
        if (error) throw error;
      } else {
        await addToSyncQueue('consumer', 'DELETE', { id });
        const db = await initOfflineDB();
        db.run('DELETE FROM consumer WHERE Consumer_ID = ?', [id]);
        await saveOfflineDB(db);
      }
    } catch (error) {
      console.error('Error deleting consumer:', error);
      throw error;
    }
  },
};

export const meterReadingService = {
  getAll: async () => {
    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('meterreadings')
          .select('*');
        if (error) throw error;
        return data;
      } else {
        const db = await initOfflineDB();
        const result = db.exec('SELECT * FROM meterreadings');
        if (result.length > 0) {
          const columns = result[0].columns;
          return result[0].values.map((row) => {
            const obj: any = {};
            columns.forEach((col, idx) => {
              obj[col] = row[idx];
            });
            return obj;
          });
        }
        return [];
      }
    } catch (error) {
      console.error('Error fetching meter readings:', error);
      return [];
    }
  },

  create: async (reading: any) => {
    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('meterreadings')
          .insert([reading])
          .select();
        if (error) throw error;
        return data;
      } else {
        await addToSyncQueue('meterreadings', 'INSERT', reading);
        const db = await initOfflineDB();
        db.run(`
          INSERT INTO meterreadings (Consumer_ID, Meter_ID, Previous_Reading, Current_Reading, Consumption, Reading_Status, Notes, Reading_Date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          reading.Consumer_ID,
          reading.Meter_ID,
          reading.Previous_Reading,
          reading.Current_Reading,
          reading.Consumption,
          reading.Reading_Status || 'Normal',
          reading.Notes,
          reading.Reading_Date,
        ]);
        await saveOfflineDB(db);
        return [reading];
      }
    } catch (error) {
      console.error('Error creating meter reading:', error);
      throw error;
    }
  },
};

export const billService = {
  getAll: async () => {
    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('bills')
          .select('*');
        if (error) throw error;
        return data;
      } else {
        const db = await initOfflineDB();
        const result = db.exec('SELECT * FROM bills');
        if (result.length > 0) {
          const columns = result[0].columns;
          return result[0].values.map((row) => {
            const obj: any = {};
            columns.forEach((col, idx) => {
              obj[col] = row[idx];
            });
            return obj;
          });
        }
        return [];
      }
    } catch (error) {
      console.error('Error fetching bills:', error);
      return [];
    }
  },

  create: async (bill: any) => {
    try {
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('bills')
          .insert([bill])
          .select();
        if (error) throw error;
        return data;
      } else {
        await addToSyncQueue('bills', 'INSERT', bill);
        const db = await initOfflineDB();
        db.run(`
          INSERT INTO bills (Consumer_ID, Reading_ID, Bill_Date, Due_Date, Total_Amount, Status)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [
          bill.Consumer_ID,
          bill.Reading_ID,
          bill.Bill_Date,
          bill.Due_Date,
          bill.Total_Amount,
          bill.Status || 'Unpaid',
        ]);
        await saveOfflineDB(db);
        return [bill];
      }
    } catch (error) {
      console.error('Error creating bill:', error);
      throw error;
    }
  },
};

export const syncService = {
  syncOfflineData: async () => {
    if (!navigator.onLine) {
      console.log('Cannot sync: offline');
      return;
    }

    try {
      const db = await initOfflineDB();
      const result = db.exec('SELECT * FROM sync_queue WHERE synced = 0');
      
      if (result.length === 0 || result[0].values.length === 0) {
        console.log('No data to sync');
        return;
      }

      for (const row of result[0].values) {
        const [id, tableName, operation, data] = row;
        const parsedData = JSON.parse(data as string);

        try {
          if (operation === 'INSERT') {
            await supabase.from(tableName as string).insert([parsedData]);
          } else if (operation === 'UPDATE') {
            const { id: recordId, ...updateData } = parsedData;
            await supabase.from(tableName as string).update(updateData).eq('id', recordId);
          } else if (operation === 'DELETE') {
            await supabase.from(tableName as string).delete().eq('id', parsedData.id);
          }

          db.run('UPDATE sync_queue SET synced = 1 WHERE id = ?', [id]);
        } catch (error) {
          console.error(`Error syncing record ${id}:`, error);
        }
      }

      await saveOfflineDB(db);
      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Error during sync:', error);
    }
  },
};

export default api;
