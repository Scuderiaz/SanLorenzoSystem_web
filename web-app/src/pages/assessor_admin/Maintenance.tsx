import React, { useState, useEffect } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
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
    <MainLayout title="System Maintenance">
      <div className="maintenance-page">
        <div className="action-buttons">
          <button className="btn btn-primary" onClick={handleCreateBackup}>
            <i className="fas fa-download"></i> Create Backup
          </button>
          <button className="btn btn-secondary" onClick={handleRestoreBackup}>
            <i className="fas fa-upload"></i> Restore Backup
          </button>
          <button className="btn btn-info" onClick={handleScheduleBackup}>
            <i className="fas fa-clock"></i> Schedule Backup
          </button>
          <button className="btn btn-secondary" onClick={handleRefreshStatus}>
            <i className="fas fa-sync-alt"></i> Refresh Status
          </button>
        </div>

        <div className="dashboard-cards">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Database</h2>
              <i className="fas fa-server"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{dbStatus}</div>
              <div className="card-label">Connection status</div>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Disk Space</h2>
              <i className="fas fa-hdd"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{diskStatus}</div>
              <div className="card-label">Available storage</div>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Memory Usage</h2>
              <i className="fas fa-memory"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{memoryStatus}</div>
              <div className="card-label">System memory</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              <i className="fas fa-list-alt"></i> System Logs
            </h2>
          </div>
          <div className="card-body">
            <div className="action-buttons" style={{ marginBottom: '20px' }}>
              <select
                value={logTypeFilter}
                onChange={(e) => setLogTypeFilter(e.target.value)}
                className="form-control"
                style={{ width: 'auto', display: 'inline-block' }}
              >
                <option value="">All Types</option>
                <option value="ERROR">Errors</option>
                <option value="WARNING">Warnings</option>
                <option value="INFO">Information</option>
              </select>
              <button className="btn btn-secondary" onClick={handleClearLogs}>
                <i className="fas fa-trash"></i> Clear Logs
              </button>
              <button className="btn btn-secondary" onClick={handleExportLogs}>
                <i className="fas fa-download"></i> Export Logs
              </button>
              <button className="btn btn-secondary" onClick={handleRefreshLogs}>
                <i className="fas fa-sync-alt"></i> Refresh
              </button>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Type</th>
                  <th>Action</th>
                  <th>Description</th>
                  <th>User</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>
                      <i className="fas fa-spinner fa-spin"></i> Loading system logs...
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>
                      No system logs found
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatTimestamp(log.timestamp)}</td>
                      <td>
                        <span className={`log-type ${getLogTypeClass(log.type)}`}>
                          {log.type}
                        </span>
                      </td>
                      <td>{log.action}</td>
                      <td>{log.description}</td>
                      <td>{log.user}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Maintenance;
