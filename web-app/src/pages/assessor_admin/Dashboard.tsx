import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import { useToast } from '../../components/Common/ToastContainer';
import { getErrorMessage, requestJson } from '../../services/userManagementApi';
import './Dashboard.css';

interface DashboardStats {
  staffMembers: number;
  totalConsumers: number;
  pendingBills: number;
  pendingApplications: number;
}

interface ActivityLog {
  id: number;
  timestamp: string;
  category: string;
  operator: string;
  description: string;
}

const Dashboard: React.FC = () => {
  const { showToast } = useToast();
  const [stats, setStats] = useState<DashboardStats>({
    staffMembers: 0,
    totalConsumers: 0,
    pendingBills: 0,
    pendingApplications: 0,
  });
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDashboardStats = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestJson<any>('/admin/dashboard-summary', {}, 'Failed to load dashboard summary.');

      setStats(result.data?.stats || {
        staffMembers: 0,
        totalConsumers: 0,
        pendingBills: 0,
        pendingApplications: 0,
      });
      setLogs(result.data?.recentLogs || []);
    } catch (error) {
      console.error('Error loading admin dashboard summary:', error);
      showToast(getErrorMessage(error, 'Failed to load dashboard data.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  return (
    <MainLayout title="Admin Overview">
      <div className="dashboard-page">
        <div className="dashboard-cards">
          <div className="card card-highlight-blue">
            <div className="card-header">
              <h2 className="card-title">Staff Members</h2>
              <i className="fas fa-user-tie"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{stats.staffMembers}</div>
              <div className="card-label">Active Administrators</div>
            </div>
          </div>

          <div className="card card-highlight-green">
            <div className="card-header">
              <h2 className="card-title">Consumers</h2>
              <i className="fas fa-users"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{stats.totalConsumers}</div>
              <div className="card-label">Registered Accounts</div>
            </div>
          </div>

          <div className="card card-highlight-gold">
            <div className="card-header">
              <h2 className="card-title">Pending Bills</h2>
              <i className="fas fa-file-invoice-dollar"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{stats.pendingBills}</div>
              <div className="card-label">Outstanding bill records</div>
            </div>
          </div>

          <div className="card card-highlight-blue">
            <div className="card-header">
              <h2 className="card-title">Applications</h2>
              <i className="fas fa-file-signature"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{stats.pendingApplications}</div>
              <div className="card-label">Pending approvals</div>
            </div>
          </div>
        </div>

        <div className="card log-table-card">
          <div className="card-header">
            <h2 className="card-title">Recent Activity Logs</h2>
            <button className="btn btn-secondary" style={{ padding: '8px 12px' }} onClick={fetchDashboardStats} disabled={loading}>
              <i className="fas fa-sync-alt" style={{ fontSize: '13px' }}></i>
            </button>
          </div>
          <div className="card-body">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event Category</th>
                  <th>Operator</th>
                  <th>Activity Description</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                      <i className="fas fa-spinner fa-spin" style={{ display: 'block', fontSize: '24px', marginBottom: '12px' }}></i>
                      Loading activity logs...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                      <i className="fas fa-history" style={{ display: 'block', fontSize: '24px', marginBottom: '12px' }}></i>
                      No recent activity logs found
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.timestamp).toLocaleString()}</td>
                      <td>{log.category}</td>
                      <td>{log.operator}</td>
                      <td>{log.description}</td>
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

export default Dashboard;
