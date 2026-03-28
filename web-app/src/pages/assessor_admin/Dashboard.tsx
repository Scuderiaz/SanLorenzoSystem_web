import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import MainLayout from '../../components/Layout/MainLayout';
import './Dashboard.css';

interface DashboardStats {
  desktopUsers: number;
  mobileUsers: number;
  totalConsumers: number;
  pendingBills: number;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    desktopUsers: 0,
    mobileUsers: 0,
    totalConsumers: 0,
    pendingBills: 0,
  });

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    setStats({
      desktopUsers: 3,
      mobileUsers: 5,
      totalConsumers: 150,
      pendingBills: 45,
    });
  };



  return (
    <MainLayout title="Admin Overview">
      <div className="dashboard-page">
        <div className="action-buttons">
          <button className="btn btn-primary">
            <i className="fas fa-user-shield"></i> System Security
          </button>
          <button className="btn btn-secondary">
            <i className="fas fa-file-export"></i> Global Reports
          </button>
        </div>

        <div className="dashboard-cards">
          <div className="card card-highlight-blue">
            <div className="card-header">
              <h2 className="card-title">Staff Members</h2>
              <i className="fas fa-user-tie"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{stats.desktopUsers}</div>
              <div className="card-label">Active Administrators</div>
            </div>
          </div>

          <div className="card card-highlight-gold">
            <div className="card-header">
              <h2 className="card-title">IoT Devices</h2>
              <i className="fas fa-microchip"></i>
            </div>
            <div className="card-body">
              <div className="card-value">{stats.mobileUsers}</div>
              <div className="card-label">Active Meter Readers</div>
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

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Status</h2>
              <i className="fas fa-check-double"></i>
            </div>
            <div className="card-body">
              <div className="card-value" style={{ color: '#10b981' }}>Online</div>
              <div className="card-label">System fully operational</div>
            </div>
          </div>
        </div>

        <div className="card log-table-card">
          <div className="card-header">
            <h2 className="card-title">Recent Activity Logs</h2>
            <button className="btn btn-secondary" style={{ padding: '8px 12px' }}>
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
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                    <i className="fas fa-history" style={{ display: 'block', fontSize: '24px', marginBottom: '12px' }}></i>
                    No recent activity logs found
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Dashboard;
