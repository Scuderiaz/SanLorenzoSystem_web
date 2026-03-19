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

  const getRoleDashboard = () => {
    switch (user?.role_id) {
      case 1:
        return <AdminDashboard stats={stats} />;
      case 3:
        return <BillingOfficerDashboard stats={stats} />;
      case 4:
        return <CashierDashboard stats={stats} />;
      default:
        return <div>Dashboard not available for this role</div>;
    }
  };

  return (
    <MainLayout title="Dashboard">
      {getRoleDashboard()}
    </MainLayout>
  );
};

const AdminDashboard: React.FC<{ stats: DashboardStats }> = ({ stats }) => {
  return (
    <>
      <div className="action-buttons">
        <button className="btn btn-primary">
          <i className="fas fa-user-plus"></i> Manage Users
        </button>
        <button className="btn btn-primary">
          <i className="fas fa-sliders-h"></i> System Settings
        </button>
        <button className="btn btn-primary">
          <i className="fas fa-database"></i> Backup & Maintenance
        </button>
      </div>

      <div className="dashboard-cards">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Desktop Users</h2>
            <i className="fas fa-desktop"></i>
          </div>
          <div className="card-body">
            <div className="card-value">{stats.desktopUsers}</div>
            <div className="card-label">Billing & Treasurer Staff</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Mobile Users</h2>
            <i className="fas fa-mobile-alt"></i>
          </div>
          <div className="card-body">
            <div className="card-value">{stats.mobileUsers}</div>
            <div className="card-label">Meter Readers</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Total Consumers</h2>
            <i className="fas fa-users"></i>
          </div>
          <div className="card-body">
            <div className="card-value">{stats.totalConsumers}</div>
            <div className="card-label">Active Accounts</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">System Status</h2>
            <i className="fas fa-server"></i>
          </div>
          <div className="card-body">
            <div className="card-value" style={{ color: '#28a745' }}>Online</div>
            <div className="card-label">All systems operational</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Recent System Logs</h2>
        </div>
        <div className="card-body">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Event</th>
                <th>User</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                  <i className="fas fa-info-circle"></i> System logs will appear here
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

const BillingOfficerDashboard: React.FC<{ stats: DashboardStats }> = ({ stats }) => {
  return (
    <>
      <div className="action-buttons">
        <button className="btn btn-primary">
          <i className="fas fa-tachometer-alt"></i> Meter Reading
        </button>
        <button className="btn btn-primary">
          <i className="fas fa-file-invoice"></i> Generate Bills
        </button>
        <button className="btn btn-secondary">
          <i className="fas fa-chart-line"></i> Reports
        </button>
      </div>

      <div className="dashboard-cards">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Total Consumers</h2>
            <i className="fas fa-users"></i>
          </div>
          <div className="card-body">
            <div className="card-value">{stats.totalConsumers}</div>
            <div className="card-label">Active Accounts</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Pending Bills</h2>
            <i className="fas fa-file-invoice-dollar"></i>
          </div>
          <div className="card-body">
            <div className="card-value">{stats.pendingBills}</div>
            <div className="card-label">To be generated</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">This Month</h2>
            <i className="fas fa-calendar"></i>
          </div>
          <div className="card-body">
            <div className="card-value">₱0.00</div>
            <div className="card-label">Total billed</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Status</h2>
            <i className="fas fa-check-circle"></i>
          </div>
          <div className="card-body">
            <div className="card-value" style={{ color: '#28a745' }}>Active</div>
            <div className="card-label">System ready</div>
          </div>
        </div>
      </div>
    </>
  );
};

const CashierDashboard: React.FC<{ stats: DashboardStats }> = ({ stats }) => {
  return (
    <>
      <div className="action-buttons">
        <button className="btn btn-primary">
          <i className="fas fa-money-bill-wave"></i> Process Payment
        </button>
        <button className="btn btn-secondary">
          <i className="fas fa-receipt"></i> View Receipts
        </button>
        <button className="btn btn-secondary">
          <i className="fas fa-chart-line"></i> Reports
        </button>
      </div>

      <div className="dashboard-cards">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Today's Collection</h2>
            <i className="fas fa-cash-register"></i>
          </div>
          <div className="card-body">
            <div className="card-value">₱0.00</div>
            <div className="card-label">Total collected</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Transactions</h2>
            <i className="fas fa-exchange-alt"></i>
          </div>
          <div className="card-body">
            <div className="card-value">0</div>
            <div className="card-label">Today</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Pending Payments</h2>
            <i className="fas fa-hourglass-half"></i>
          </div>
          <div className="card-body">
            <div className="card-value">{stats.pendingBills}</div>
            <div className="card-label">Unpaid bills</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Status</h2>
            <i className="fas fa-check-circle"></i>
          </div>
          <div className="card-body">
            <div className="card-value" style={{ color: '#28a745' }}>Open</div>
            <div className="card-label">Ready for transactions</div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Dashboard;
