import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable, { Column } from '../../components/Common/DataTable';
import { useToast } from '../../components/Common/ToastContainer';
import { getErrorMessage, requestJsonWithOfflineSnapshot } from '../../services/userManagementApi';
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
      const result = await requestJsonWithOfflineSnapshot<any>(
        '/admin/dashboard-summary',
        'dataset.adminDashboardSummary',
        'Failed to load dashboard summary.',
        (payload) => payload?.data || {}
      );

      setStats(result.data?.stats || {
        staffMembers: 0,
        totalConsumers: 0,
        pendingBills: 0,
        pendingApplications: 0,
      });
      setLogs(result.data?.recentLogs || []);
      if (result.source === 'offline') {
        showToast('Admin dashboard loaded from the offline snapshot.', 'warning');
      }
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

  const logColumns: Column[] = [
    {
      key: 'timestamp',
      label: 'Timestamp',
      sortable: true,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    {
      key: 'category',
      label: 'Event Category',
      sortable: true,
      filterType: 'select',
      filterLabel: 'Event Category',
    },
    { key: 'operator', label: 'Operator', sortable: true },
    { key: 'description', label: 'Activity Description', sortable: true },
  ];

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
            <DataTable
              columns={logColumns}
              data={logs}
              loading={loading}
              emptyMessage="No recent activity logs found"
              enableFiltering
              filterPlaceholder="Search logs by operator, category, or description..."
            />
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Dashboard;
