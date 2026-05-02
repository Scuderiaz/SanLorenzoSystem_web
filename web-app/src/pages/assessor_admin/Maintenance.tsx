import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import { useToast } from '../../components/Common/ToastContainer';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage, requestJson, requestJsonWithOfflineSnapshot } from '../../services/userManagementApi';
import './Maintenance.css';

interface SystemLog {
  id: number;
  timestamp: string;
  type: 'ERROR' | 'WARNING' | 'INFO';
  action: string;
  description: string;
  user: string;
}

const toFriendlyLog = (log: SystemLog): SystemLog => {
  const raw = String(log.description || '').trim();
  const normalized = raw.toLowerCase();

  if (normalized.includes('consumers.disconnect') || normalized.includes('marked disconnected')) {
    const reasonMatch = raw.match(/Reason:\s*(.*?)(?:\. Overdue:|$)/i);
    const accountMatch = raw.match(/\((.*?)\)\s*marked/i);
    const consumerMatch = raw.match(/\]\s*(.*?)\s*\((.*?)\)\s*marked/i);
    const consumerName = consumerMatch?.[1] || 'A concessionaire';
    const accountNumber = accountMatch?.[1] || 'N/A';
    const reason = reasonMatch?.[1]?.trim() || 'No reason recorded';
    return {
      ...log,
      action: 'Disconnection',
      description: `${consumerName} (${accountNumber}) was disconnected. Reason: ${reason}.`,
    };
  }

  if (normalized.includes('approved successfully') || normalized.includes('application approved') || normalized.includes('approve-user')) {
    return {
      ...log,
      action: 'Application Approval',
      description: 'A consumer application was approved and moved forward for activation.',
    };
  }

  if (normalized.includes('rejected') && normalized.includes('application')) {
    return {
      ...log,
      action: 'Application Rejection',
      description: 'A consumer application was rejected with a provided review remark.',
    };
  }

  if (normalized.includes('consumer.reconnectionrequest') || normalized.includes('reconnection request')) {
    return {
      ...log,
      action: 'Reconnection Request',
      description: 'A disconnected consumer submitted a reconnection request for review.',
    };
  }

  if (normalized.includes('admin-settings') || normalized.includes('system configuration updated')) {
    return {
      ...log,
      action: 'System Settings',
      description: 'System settings were updated.',
    };
  }

  if (normalized.includes('backup') && normalized.includes('created')) {
    return {
      ...log,
      action: 'Backup',
      description: 'A system backup was created.',
    };
  }

  if (normalized.includes('[request]')) {
    return {
      ...log,
      action: 'User Request',
      description: 'A user request was processed by the system.',
    };
  }

  if (normalized.includes('sync cycle complete')) {
    return {
      ...log,
      action: 'Data Synchronization',
      description: 'System data synchronization completed successfully.',
    };
  }

  if (normalized.includes('preparing sync for table')) {
    const match = raw.match(/preparing sync for table\s+([a-z0-9_]+)/i);
    const tableName = (match?.[1] || 'records').replace(/_/g, ' ');
    return {
      ...log,
      action: 'Data Synchronization',
      description: `Synchronization started for ${tableName}.`,
    };
  }

  if (normalized.includes('no rows to sync')) {
    const match = raw.match(/table\s+([a-z0-9_]+):\s*no rows to sync/i);
    const tableName = (match?.[1] || 'records').replace(/_/g, ' ');
    return {
      ...log,
      action: 'Data Synchronization',
      description: `No pending updates found for ${tableName}.`,
    };
  }

  if (normalized.includes('synced') && normalized.includes('table')) {
    const match = raw.match(/table\s+([a-z0-9_]+):\s*synced\s*([0-9]+)\s*row/i);
    const tableName = (match?.[1] || 'records').replace(/_/g, ' ');
    const rowCount = match?.[2] || '0';
    return {
      ...log,
      action: 'Data Synchronization',
      description: `${tableName} synchronized (${rowCount} updated record${rowCount === '1' ? '' : 's'}).`,
    };
  }

  return {
    ...log,
    action: log.action || 'System Activity',
    description: raw || 'A system process was completed.',
  };
};

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
  const [loading, setLoading] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestJsonWithOfflineSnapshot<any>(
        '/admin/maintenance',
        'dataset.adminMaintenance',
        'Failed to load maintenance data.',
        (payload) => payload?.data || {}
      );

      setDbStatus(result.data?.dbStatus || 'CONNECTED');
      setPrimaryEndpoint(result.data?.primaryEndpoint || '');
      const friendlyLogs = (result.data?.logs || []).map((log: SystemLog) => toFriendlyLog(log));
      setLogs(friendlyLogs);
      setBackups(result.data?.backups || []);
      if (result.source === 'offline') {
        showToast('Maintenance data loaded from the offline snapshot.', 'warning');
      }
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
            <DataTable
              columns={[
                { key: 'timestamp', label: 'EVENT TIME', sortable: true, render: (v: string) => new Date(v).toLocaleString() },
                {
                  key: 'type',
                  label: 'SEVERITY',
                  sortable: true,
                  filterType: 'select',
                  filterLabel: 'Severity',
                  render: (v: string) => <span className={`log-badge log-${v.toLowerCase()}`}>{v}</span>,
                },
                { key: 'action', label: 'PROCESS', sortable: true },
                { key: 'description', label: 'ACTIVITY SUMMARY', sortable: true },
                { key: 'user', label: 'PERFORMED BY', sortable: true }
              ]}
              data={logs}
              loading={loading}
              emptyMessage="Current ledger environment is clear."
              enableFiltering
              filterPlaceholder="Search logs by process, summary, or user..."
              filterActions={(
                <>
                  <button className="btn btn-secondary btn-sm" onClick={loadLogs}><i className="fas fa-sync"></i> Refresh</button>
                  <button className="btn btn-secondary btn-sm" onClick={handleClearLogs} style={{ color: '#dc2626' }}><i className="fas fa-trash-alt"></i> Purge Logs</button>
                </>
              )}
            />

            {backups.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <h3 style={{ marginBottom: '12px', color: '#1B1B63' }}>Recent Backups</h3>
                <DataTable
                  columns={[
                    { key: 'name', label: 'BACKUP NAME', sortable: true },
                    { key: 'timestamp', label: 'CREATED AT', sortable: true, render: (v: string) => new Date(v).toLocaleString() },
                    { key: 'type', label: 'TYPE', sortable: true, filterType: 'select', filterLabel: 'Backup Type' },
                    { key: 'size', label: 'SIZE', sortable: true },
                  ]}
                  data={backups}
                  loading={loading}
                  emptyMessage="No backup snapshots found."
                  enableFiltering
                  filterPlaceholder="Search backups by name, type, or size..."
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
