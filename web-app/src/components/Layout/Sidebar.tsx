import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Sidebar.css';

interface MenuItem {
  path: string;
  icon: string;
  label: string;
  roles: number[];
}

// Role IDs: 1=Admin, 2=Billing Officer, 3=Meter Reader, 4=Treasurer, 5=Consumer
const menuItems: MenuItem[] = [
  // --- Admin (Role 1) ---
  { path: '/dashboard',     icon: 'fas fa-tachometer-alt',      label: 'Dashboard',          roles: [1, 2, 3, 4] },
  { path: '/accounts',      icon: 'fas fa-address-book',        label: 'Account Management', roles: [1] },
  { path: '/applications',  icon: 'fas fa-file-signature',      label: 'Applications',       roles: [1, 2] },
  { path: '/reports',       icon: 'fas fa-chart-bar',           label: 'Reports',             roles: [1] },
  { path: '/ledger',        icon: 'fas fa-book',                label: 'Delinquents & Ledger',roles: [1] },
  { path: '/settings',      icon: 'fas fa-cogs',                label: 'System Settings',     roles: [1] },
  { path: '/maintenance',   icon: 'fas fa-tools',               label: 'System Maintenance',  roles: [1] },
  { path: '/public-concerns', icon: 'fas fa-inbox',             label: 'Public Concerns',      roles: [1, 2] },
  { path: '/data-import',     icon: 'fas fa-file-upload',       label: 'Data Import',          roles: [1, 2] },
  { path: '/pipeline-map',  icon: 'fas fa-map-marked-alt',      label: 'Pipeline Map',        roles: [1] },
  // --- Billing Officer (Role 2) ---
  { path: '/consumers',     icon: 'fas fa-users',               label: 'Concessionaire Management', roles: [2] },
  { path: '/meter-reading', icon: 'fas fa-calendar-alt',        label: 'Reader & Zone Setup', roles: [1, 2] },
  { path: '/generate-bills',icon: 'fas fa-file-invoice-dollar', label: 'Bills Registry',      roles: [2] },
  { path: '/reports',       icon: 'fas fa-chart-bar',           label: 'Billing Reports',     roles: [2] },
  { path: '/ledger',        icon: 'fas fa-book',                label: 'Account Ledger',      roles: [2] },
  { path: '/billing-logs',  icon: 'fas fa-clipboard-list',      label: 'Billing Logs',        roles: [2] },
  // --- Meter Reader (Role 3) ---
  { path: '/consumers',     icon: 'fas fa-users',               label: 'Concessionaire Management', roles: [3] },
  { path: '/generate-bills',icon: 'fas fa-file-invoice-dollar', label: 'Bills Review',        roles: [3] },
  // --- Treasurer (Role 4) ---
  { path: '/payments',      icon: 'fas fa-money-bill-wave',     label: 'Process Payment',     roles: [4] },
  { path: '/ledger',        icon: 'fas fa-book',                label: 'Digital Ledger',      roles: [4] },
  { path: '/reports',       icon: 'fas fa-chart-bar',           label: 'Report',              roles: [4] },
];

const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [pendingCount, setPendingCount] = React.useState(0);
  const [pendingConcernCount, setPendingConcernCount] = React.useState(0);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  const loadPendingCount = React.useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/applications/pending`);
      const result = await response.json();
      if (result.success) {
        setPendingCount((result.data || []).length);
      }
    } catch (error) {
      console.error('Error loading pending count:', error);
    }
  }, [API_URL]);

  const loadPendingConcernCount = React.useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/public-contact-messages?status=Pending`);
      const result = await response.json();
      if (result.success) {
        setPendingConcernCount((result.data || []).length);
      }
    } catch (error) {
      console.error('Error loading pending public concern count:', error);
    }
  }, [API_URL]);

  React.useEffect(() => {
    if (user?.role_id === 1 || user?.role_id === 2) {
      void loadPendingCount();
      void loadPendingConcernCount();
      const interval = setInterval(() => {
        void loadPendingCount();
        void loadPendingConcernCount();
      }, 30000); // Check every 30s
      return () => clearInterval(interval);
    }
  }, [user, loadPendingCount, loadPendingConcernCount]);

  const filteredMenuItems = menuItems.filter(item => 
    user && item.roles.includes(user.role_id)
  );

  const logoSrc = user?.role_id === 4
    ? "/images/Waterworks System Payment Logo 1.svg"
    : "/images/Waterworks System Office Logo 1.svg";

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <img 
          src={logoSrc} 
          alt="San Lorenzo Ruiz Logo" 
          className="sidebar-logo" 
        />
      </div>
      <ul className="menu">
        {filteredMenuItems.map((item) => (
          <li 
            key={item.path} 
            className={`menu-item ${location.pathname === item.path ? 'active' : ''}`}
          >
            <Link to={item.path}>
              <div className="menu-icon-wrapper">
                <i className={item.icon}></i>
                {item.path === '/applications' && pendingCount > 0 && (
                  <span className="notification-dot"></span>
                )}
                {item.path === '/public-concerns' && pendingConcernCount > 0 && (
                  <span className="notification-dot"></span>
                )}
              </div>
              <span>{item.label}</span>
            </Link>
          </li>
        ))}
        <li className="menu-item logout">
          <button type="button" onClick={logout}>
            <i className="fas fa-sign-out-alt"></i> <span>Logout</span>
          </button>
        </li>
      </ul>
    </div>
  );
};

export default Sidebar;



