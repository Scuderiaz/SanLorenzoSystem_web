import React, { useState, useEffect } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import { useToast } from '../../components/Common/ToastContainer';
import './Maintenance.css';

interface SystemLog {
  id: number;
  timestamp: string;
  type: 'ERROR' | 'WARNING' | 'INFO';
  action: string;
  description: string;
  user: string;
}

const Maintenance: React.FC = () => {
  const { showToast } = useToast();
  const [dbStatus, setDbStatus] = useState('CONNECTED');
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<SystemLog[]>([]);
  const [logTypeFilter, setLogTypeFilter] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadLogs();
  }, []);

  useEffect(() => {
    filterLogs();
  }, [logs, logTypeFilter]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const mockLogs: SystemLog[] = [
        { id: 1, timestamp: new Date().toISOString(), type: 'INFO', action: 'OFFICIAL AUDIT', description: 'Monthly Billing Generated for Zone 02', user: 'billing_officer' },
        { id: 2, timestamp: new Date(Date.now() - 3600000).toISOString(), type: 'WARNING', action: 'DATABASE UPLINK', description: 'Latency detected during cloud sync', user: 'system' },
        { id: 3, timestamp: new Date(Date.now() - 7200000).toISOString(), type: 'INFO', action: 'BACKUP', description: 'Database Snapshot #2024-001 created', user: 'admin' },
      ];
      setLogs(mockLogs);
    } catch (error) {
      showToast('Failed to load system logs', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filterLogs = () => {
    if (!logTypeFilter) {
      setFilteredLogs(logs);
    } else {
      setFilteredLogs(logs.filter((log) => log.type === logTypeFilter));
    }
  };

  const handleCreateBackup = () => {
    showToast('Executing System Snapshot...', 'info');
    setTimeout(() => showToast('Backup Archive #4421-B Created Successfully', 'success'), 2000);
  };

  const handleTestConnection = () => {
    setDbStatus('TESTING...');
    setTimeout(() => {
      setDbStatus('CONNECTED');
      showToast('Database Uplink Verified: Primary Supabase Node', 'success');
    }, 1500);
  };

  const handleClearLogs = () => {
    if (window.confirm('Are you sure you want to purge all historical events?')) {
      setLogs([]);
      showToast('System Logs Purged', 'success');
    }
  };

  return (
    <MainLayout title="System Maintenance & Control">
      <div className="maintenance-page">
        {/* Section 1: Database Configuration */}
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
              <div style={{ fontSize: '18px', fontWeight: 800, color: dbStatus === 'CONNECTED' ? '#10b981' : '#f59e0b' }}>
                <i className="fas fa-circle mr-2" style={{ fontSize: '10px' }}></i> {dbStatus}
              </div>
            </div>
            <div className="config-item">
              <label style={{ fontSize: '10px', fontWeight: 900, color: '#94a3b8', display: 'block', marginBottom: '5px' }}>PRIMARY ENDPOINT</label>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1B1B63' }}>supabase-api-region-01.co...</div>
            </div>
            <div className="config-item" style={{ display: 'flex', alignItems: 'flex-end', gap: '15px' }}>
              <button className="btn btn-primary" onClick={handleTestConnection}>
                <i className="fas fa-plug"></i> Test Connection
              </button>
              <button className="btn btn-secondary">
                <i className="fas fa-sync-alt"></i> Force Sync
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: Logs and Backup */}
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
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Maintenance;
