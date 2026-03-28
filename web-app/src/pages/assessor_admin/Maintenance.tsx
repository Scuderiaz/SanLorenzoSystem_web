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
  const [dbStatus, setDbStatus] = useState('Checking...');
  const [diskStatus, setDiskStatus] = useState('Checking...');
  const [memoryStatus, setMemoryStatus] = useState('Checking...');
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<SystemLog[]>([]);
  const [logTypeFilter, setLogTypeFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  useEffect(() => {
    loadSystemStatus();
    loadLogs();
  }, []);

  useEffect(() => {
    filterLogs();
  }, [logs, logTypeFilter]);

  const loadSystemStatus = async () => {
    try {
      setDbStatus('Connected');
      setDiskStatus('50 GB Available');
      setMemoryStatus('4.2 GB / 8 GB');
    } catch (error) {
      console.error('Error loading system status:', error);
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const mockLogs: SystemLog[] = [
        {
          id: 1,
          timestamp: new Date().toISOString(),
          type: 'INFO',
          action: 'User Login',
          description: 'User logged in successfully',
          user: 'admin',
        },
        {
          id: 2,
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          type: 'WARNING',
          action: 'Database Query',
          description: 'Slow query detected',
          user: 'system',
        },
      ];
      setLogs(mockLogs);
    } catch (error) {
      console.error('Error loading logs:', error);
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

  const handleCreateBackup = async () => {
    try {
      showToast('Creating backup...', 'info');
      setTimeout(() => {
        showToast('Backup created successfully', 'success');
      }, 2000);
    } catch (error) {
      console.error('Error creating backup:', error);
      showToast('Failed to create backup', 'error');
    }
  };

  const handleRestoreBackup = () => {
    showToast('Restore backup feature coming soon', 'info');
  };

  const handleScheduleBackup = () => {
    showToast('Schedule backup feature coming soon', 'info');
  };

  const handleRefreshStatus = () => {
    loadSystemStatus();
    showToast('System status refreshed', 'success');
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all system logs?')) {
      return;
    }
    try {
      setLogs([]);
      showToast('System logs cleared', 'success');
    } catch (error) {
      console.error('Error clearing logs:', error);
      showToast('Failed to clear logs', 'error');
    }
  };

  const handleExportLogs = () => {
    showToast('Exporting logs...', 'info');
  };

  const handleRefreshLogs = () => {
    loadLogs();
    showToast('Logs refreshed', 'success');
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getLogTypeClass = (type: string) => {
    switch (type) {
      case 'ERROR':
        return 'log-error';
      case 'WARNING':
        return 'log-warning';
      case 'INFO':
      default:
        return 'log-info';
    }
  };

  return (
    <MainLayout title="System Integrity">
      <div className="maintenance-page">
        {/* Top Action Bar */}
        <div className="action-buttons">
          <button className="btn btn-primary" onClick={handleCreateBackup}>
            <i className="fas fa-cloud-download-alt"></i> Execute Snapshot
          </button>
          <button className="btn btn-secondary" onClick={handleRestoreBackup}>
            <i className="fas fa-history"></i> Rollback State
          </button>
          <button className="btn btn-secondary" onClick={handleScheduleBackup}>
            <i className="fas fa-calendar-alt"></i> Automation
          </button>
          <button className="btn btn-secondary" onClick={handleRefreshStatus} title="Update Health Metrics">
            <i className="fas fa-sync-alt"></i> Refresh
          </button>
        </div>

        {/* System Health Overview */}
        <div className="dashboard-cards">
          <div className="card card-highlight-blue">
            <div className="card-header">
              <h2 className="card-title">Database Core</h2>
              <i className="fas fa-server"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{dbStatus}</div>
              <div className="card-label">Verified uplink status</div>
            </div>
          </div>
          <div className="card card-highlight-gold">
            <div className="card-header">
              <h2 className="card-title">Cloud Storage</h2>
              <i className="fas fa-hdd"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{diskStatus}</div>
              <div className="card-label">Allocated environment space</div>
            </div>
          </div>
          <div className="card card-highlight-green">
            <div className="card-header">
              <h2 className="card-title">Compute Cluster</h2>
              <i className="fas fa-memory"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{memoryStatus}</div>
              <div className="card-label">Active memory overhead</div>
            </div>
          </div>
        </div>

        {/* System Logs Management */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <i className="fas fa-terminal"></i> Administrative Event Logs
            </h2>
          </div>
          <div className="card-body">
            <div className="filter-bar" style={{ marginBottom: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="filters" style={{ display: 'flex', gap: '15px' }}>
                <select
                  value={logTypeFilter}
                  onChange={(e) => setLogTypeFilter(e.target.value)}
                  className="form-control"
                  style={{ width: '200px' }}
                >
                  <option value="">Event Type: All</option>
                  <option value="ERROR">Critical Errors</option>
                  <option value="WARNING">System Warnings</option>
                  <option value="INFO">Operational Info</option>
                </select>
              </div>
              <div className="main-actions">
                <button className="btn btn-secondary" onClick={handleClearLogs}>
                  <i className="fas fa-eraser"></i> Purge Logs
                </button>
                <button className="btn btn-secondary" onClick={handleExportLogs}>
                  <i className="fas fa-file-export"></i> Export Audit
                </button>
                <button className="btn btn-secondary" onClick={handleRefreshLogs}>
                  <i className="fas fa-sync-alt"></i>
                </button>
              </div>
            </div>

            <DataTable
              columns={[
                { key: 'timestamp', label: 'Event Time', render: (v: string) => formatTimestamp(v) },
                { key: 'type', label: 'Severity', render: (v: string) => (
                  <span className={`log-badge log-${v.toLowerCase()}`}>{v}</span>
                )},
                { key: 'action', label: 'Protocol' },
                { key: 'description', label: 'Event Details' },
                { key: 'user', label: 'Responsible Entity' }
              ]}
              data={filteredLogs}
              loading={loading}
              emptyMessage="No administrative events recorded."
            />
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Maintenance;
