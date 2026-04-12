import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import { useToast } from '../../components/Common/ToastContainer';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage, requestJson } from '../../services/userManagementApi';
import './Maintenance.css';

interface SystemLog {
  id: number;
  timestamp: string;
  type: 'ERROR' | 'WARNING' | 'INFO';
  action: string;
  description: string;
  user: string;
}

interface BackupLog {
  id: number;
  name: string;
  timestamp: string;
  size: string;
  type: string;
  createdBy: number;
}

const Maintenance: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [dbStatus, setDbStatus] = useState('CONNECTED');
  const [primaryEndpoint, setPrimaryEndpoint] = useState('');
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [backups, setBackups] = useState<BackupLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<SystemLog[]>([]);
  const [logTypeFilter, setLogTypeFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestJson<any>('/admin/maintenance', {}, 'Failed to load maintenance data.');

      setDbStatus(result.data?.dbStatus || 'CONNECTED');
      setPrimaryEndpoint(result.data?.primaryEndpoint || '');
      setLogs(result.data?.logs || []);
      setBackups(result.data?.backups || []);
    } catch (error) {
      console.error('Error loading maintenance data:', error);
      showToast(getErrorMessage(error, 'Failed to load system logs.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!logTypeFilter) {
      setFilteredLogs(logs);
    } else {
      setFilteredLogs(logs.filter((log) => log.type === logTypeFilter));
    }
  }, [logs, logTypeFilter]);

  const handleCreateBackup = async () => {
    try {
      showToast('Executing system snapshot...', 'info');
      await requestJson(
        '/admin/maintenance/backup',
        {
          method: 'POST',
          body: JSON.stringify({ createdBy: Number(user?.id || 1) }),
        },
        'Failed to create backup.'
      );
      showToast('Backup created successfully', 'success');
      loadLogs();
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to create backup.'), 'error');
    }
  };

  const handleTestConnection = async () => {
    setDbStatus('TESTING...');
    try {
      const result = await requestJson<any>(
        '/admin/maintenance/test-connection',
        { method: 'POST' },
        'Connection test failed.'
      );
      setDbStatus(result.status || 'CONNECTED');
      showToast(result.message || 'Database connection verified', 'success');
    } catch (error) {
      setDbStatus('ERROR');
      showToast(getErrorMessage(error, 'Database connection test failed.'), 'error');
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to purge all historical events?')) {
      return;
    }

    try {
      await requestJson<{ success: boolean }>(
        '/admin/maintenance/logs',
        { method: 'DELETE' },
        'Failed to clear system logs.'
      );
      setLogs([]);
      showToast('System logs purged', 'success');
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to purge logs.'), 'error');
    }
  };

  const handleForceSync = async () => {
    try {
      await requestJson<{ success: boolean }>(
        '/admin/sync/run',
        { method: 'POST' },
        'Hybrid sync failed.'
      );
      showToast('Hybrid sync completed successfully', 'success');
      loadLogs();
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to trigger sync.'), 'error');
    }
  };

  return (
    <MainLayout title="System Maintenance & Control">
      <div className="maintenance-page">
        <div className="maintenance-card" style={{ borderRadius: '24px' }}>
          <div className="maintenance-header">
            <div className="maintenance-icon"><i className="fas fa-database"></i></div>
            <div>
              <h2 className="maintenance-title">Database Configuration</h2>
              <p className="maintenance-desc mb-0">Manage physical uplinks and cloud synchronization parameters.</p>
            </div>
          </div>

          <div className="db-config-grid mt-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '30px' }}>
            <div className="config-item">
              <label style={{ fontSize: '10px', fontWeight: 900, color: '#94a3b8', display: 'block', marginBottom: '5px' }}>UPLINK STATUS</label>
              <div style={{ fontSize: '18px', fontWeight: 800, color: dbStatus === 'CONNECTED' ? '#10b981' : dbStatus === 'ERROR' ? '#dc2626' : '#f59e0b' }}>
                <i className="fas fa-circle mr-2" style={{ fontSize: '10px' }}></i> {dbStatus}
              </div>
            </div>
            <div className="config-item">
              <label style={{ fontSize: '10px', fontWeight: 900, color: '#94a3b8', display: 'block', marginBottom: '5px' }}>PRIMARY ENDPOINT</label>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1B1B63' }}>{primaryEndpoint || 'Database endpoint unavailable'}</div>
            </div>
            <div className="config-item" style={{ display: 'flex', alignItems: 'flex-end', gap: '15px' }}>
              <button className="btn btn-primary" onClick={handleTestConnection}>
                <i className="fas fa-plug"></i> Test Connection
              </button>
              <button className="btn btn-secondary" onClick={handleForceSync}>
                <i className="fas fa-sync-alt"></i> Force Sync
              </button>
            </div>
          </div>
        </div>

        <div className="maintenance-card" style={{ borderRadius: '24px' }}>
          <div className="maintenance-header d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center gap-3">
              <div className="maintenance-icon"><i className="fas fa-history"></i></div>
              <div>
                <h2 className="maintenance-title">Protocol Audit & Backup</h2>
                <p className="maintenance-desc mb-0">Review core system events and manage archival snapshots.</p>
              </div>
            </div>
            <div className="maintenance-actions">
              <button className="btn btn-primary" onClick={handleCreateBackup}>
                <i className="fas fa-cloud-download-alt"></i> Create System Backup
              </button>
            </div>
          </div>

          <div className="mt-4">
            <div className="filter-bar mb-4 d-flex justify-content-between align-items-center">
              <select value={logTypeFilter} onChange={(e) => setLogTypeFilter(e.target.value)} className="form-control" style={{ width: '220px', borderRadius: '12px', fontWeight: 700 }}>
                <option value="">All Event Severities</option>
                <option value="ERROR">Critical Failures</option>
                <option value="WARNING">Operational Warnings</option>
                <option value="INFO">Standard Info</option>
              </select>
              <div className="d-flex gap-2">
                <button className="btn btn-secondary btn-sm" onClick={loadLogs}><i className="fas fa-sync"></i> Refresh</button>
                <button className="btn btn-secondary btn-sm" onClick={handleClearLogs} style={{ color: '#dc2626' }}><i className="fas fa-trash-alt"></i> Purge Logs</button>
              </div>
            </div>

            <DataTable
              columns={[
                { key: 'timestamp', label: 'EVENT TIME', render: (v: string) => new Date(v).toLocaleString() },
                { key: 'type', label: 'SEVERITY', render: (v: string) => <span className={`log-badge log-${v.toLowerCase()}`}>{v}</span> },
                { key: 'action', label: 'PROTOCOL' },
                { key: 'description', label: 'EVENT DETAILS' },
                { key: 'user', label: 'RESPONSIBLE ENTITY' }
              ]}
              data={filteredLogs}
              loading={loading}
              emptyMessage="Current ledger environment is clear."
            />

            {backups.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <h3 style={{ marginBottom: '12px', color: '#1B1B63' }}>Recent Backups</h3>
                <DataTable
                  columns={[
                    { key: 'name', label: 'BACKUP NAME' },
                    { key: 'timestamp', label: 'CREATED AT', render: (v: string) => new Date(v).toLocaleString() },
                    { key: 'type', label: 'TYPE' },
                    { key: 'size', label: 'SIZE' },
                  ]}
                  data={backups}
                  loading={loading}
                  emptyMessage="No backup snapshots found."
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Maintenance;
