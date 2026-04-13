import axios from 'axios';
import { initOfflineDB, saveOfflineDB, addToSyncQueue } from '../config/database';
import { supabase, isSupabaseConfigured } from '../config/supabase';
import { appendClientDiagnostic } from '../utils/clientDiagnostics';
import { canReachBackend } from '../utils/backendAvailability';

const isNetworkError = (error: any) => {
  return error.code === 'ERR_NETWORK' || !error.response || error.response.status >= 500;
};

const generatePendingAccountNumber = () => {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);
  const suffix = Math.floor(Math.random() * 900) + 100;
  return `PENDING-${timestamp}-${suffix}`;
};

const ensurePendingRegistrationAccountNumber = (userData: any) => ({
  ...userData,
  accountNumber: String(userData?.accountNumber || '').trim() || generatePendingAccountNumber(),
});

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const syncEndpointMap: Record<string, string> = {
  consumer: '/consumers',
  meterreadings: '/meter-readings',
  bills: '/bills',
  payment: '/payments',
};

export const authService = {
  login: async (username: string, password: string) => {
    try {
      const response = await api.post('/login', { username, password });
      appendClientDiagnostic('auth.login', 'Backend login request succeeded.', {
        username,
        online: navigator.onLine,
      });
      return response.data;
    } catch (error: any) {
      if (isNetworkError(error)) {
        appendClientDiagnostic('auth.login', 'Backend login request failed; checking offline cache.', {
          username,
          online: navigator.onLine,
          error: error.message,
        });

        try {
          const db = await initOfflineDB();
          const result = db.exec(`
            SELECT a.AccountID, a.Username, a.Full_Name, a.Role_ID, r.Role_Name
            FROM accounts a
            JOIN roles r ON a.Role_ID = r.Role_ID
            WHERE a.Username = ? AND a.Password = ?
          `, [username, password]);

          if (result.length > 0 && result[0].values.length > 0) {
            const [id, uname, fullName, roleId, roleName] = result[0].values[0];
            appendClientDiagnostic('auth.login', 'Offline cache login succeeded.', {
              username,
              online: navigator.onLine,
            });
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

          appendClientDiagnostic('auth.login', 'Offline cache login failed: no cached match found.', {
            username,
            online: navigator.onLine,
          });
          return {
            success: false,
            message: 'Offline login failed: no cached account matched this username and password. Connect to the local server once, then try again offline.',
          };
        } catch (offlineError: any) {
          appendClientDiagnostic('auth.login', 'Offline cache lookup failed.', {
            username,
            online: navigator.onLine,
            error: offlineError.message,
          });
          return {
            success: false,
            message: 'Login failed: the server could not be reached and the offline cache could not be opened.',
          };
        }
      }

      const msg = error.response?.data?.message || error.message;
      appendClientDiagnostic('auth.login', 'Backend login request returned an application error.', {
        username,
        online: navigator.onLine,
        error: msg,
      });
      return { success: false, message: msg };
    }
  },

  register: async (userData: any) => {
    const payload = ensurePendingRegistrationAccountNumber(userData);

    try {
      const response = await api.post('/register', payload);
      return response.data;
    } catch (error: any) {
      if (isNetworkError(error)) {
        return {
          success: false,
          message: 'Registration requires the backend service. Please try again when the server connection is available.',
        };
      }
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
      if (await canReachBackend()) {
        try {
          const response = await api.get('/consumers');
          return response.data?.data || response.data || [];
        } catch (apiError: any) {
          if (isNetworkError(apiError) && isSupabaseConfigured && supabase) {
            console.warn('Network error, attempting Supabase fallback for consumers.getAll');
            const { data, error: sbError } = await supabase
              .from('consumer')
              .select('*, zone(zone_name), classification(classification_name)')
              .order('consumer_id', { ascending: false });
            
            if (sbError) throw sbError;
            
            return (data || []).map((c: any) => ({
              Consumer_ID: c.consumer_id,
              First_Name: c.first_name,
              Middle_Name: c.middle_name,
              Last_Name: c.last_name,
              Address: c.address,
              Zone_ID: c.zone_id,
              Classification_ID: c.classification_id,
              Account_Number: c.account_number,
              Status: c.status,
              Contact_Number: c.contact_number,
              Connection_Date: c.connection_date,
              Zone_Name: c.zone?.zone_name,
              Classification_Name: c.classification?.classification_name
            }));
          }
          throw apiError;
        }
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
      if (await canReachBackend()) {
        const response = await api.post('/consumers', consumer);
        return response.data?.data || response.data;
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
      if (await canReachBackend()) {
        const response = await api.put(`/consumers/${id}`, consumer);
        return response.data?.data || response.data;
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
      if (await canReachBackend()) {
        await api.delete(`/consumers/${id}`);
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
      if (await canReachBackend()) {
        try {
          const response = await api.get('/meter-readings');
          return response.data || [];
        } catch (apiError: any) {
          if (isNetworkError(apiError) && isSupabaseConfigured && supabase) {
            console.warn('Network error, attempting Supabase fallback for meterreadings.getAll');
            const { data, error: sbError } = await supabase
              .from('meterreadings')
              .select('*')
              .order('reading_id', { ascending: false });
            if (sbError) throw sbError;
            return data || [];
          }
          throw apiError;
        }
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
      if (await canReachBackend()) {
        const response = await api.post('/meter-readings', reading);
        return response.data;
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
      if (await canReachBackend()) {
        try {
          const response = await api.get('/bills');
          return response.data || [];
        } catch (apiError: any) {
          if (isNetworkError(apiError) && isSupabaseConfigured && supabase) {
            console.warn('Network error, attempting Supabase fallback for bills.getAll');
            const { data, error: sbError } = await supabase
              .from('bills')
              .select('*')
              .order('bill_id', { ascending: false });
            if (sbError) throw sbError;
            return data || [];
          }
          throw apiError;
        }
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
      if (await canReachBackend()) {
        const response = await api.post('/bills', bill);
        return response.data;
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
    if (!(await canReachBackend())) {
      console.log('Cannot sync: backend unavailable');
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
          const endpoint = syncEndpointMap[tableName as string];
          if (!endpoint) {
            throw new Error(`No sync endpoint configured for table ${tableName}`);
          }

          if (operation === 'INSERT') {
            await api.post(endpoint, parsedData);
          } else if (operation === 'UPDATE') {
            const { id: recordId, ...updateData } = parsedData;
            await api.put(`${endpoint}/${recordId}`, updateData);
          } else if (operation === 'DELETE') {
            await api.delete(`${endpoint}/${parsedData.id}`);
          }

          db.run('UPDATE sync_queue SET synced = 1 WHERE id = ?', [id]);
        } catch (error) {
          console.error(`Error syncing record ${id}:`, error);
        }
      }

      try {
        await api.post('/admin/sync/run');
      } catch (error) {
        console.error('Error triggering backend hybrid sync after offline sync:', error);
      }

      await saveOfflineDB(db);
      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Error during sync:', error);
    }
  },
};

export default api;
