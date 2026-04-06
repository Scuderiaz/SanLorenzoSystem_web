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
  { path: '/reports',       icon: 'fas fa-chart-bar',           label: 'Reports',             roles: [1] },
  { path: '/settings',      icon: 'fas fa-cogs',                label: 'System Settings',     roles: [1] },
  { path: '/maintenance',   icon: 'fas fa-tools',               label: 'System Maintenance',  roles: [1] },
  { path: '/close-day',     icon: 'fas fa-lock',                label: 'Close Day',           roles: [1] },
  // --- Billing Officer (Role 2) ---
  { path: '/consumers',     icon: 'fas fa-users',               label: 'Consumer Management', roles: [2] },
  { path: '/generate-bills',icon: 'fas fa-file-invoice-dollar', label: 'Generate Bills',      roles: [2] },
  { path: '/reports',       icon: 'fas fa-chart-bar',           label: 'Reports',             roles: [2] },
  { path: '/ledger',        icon: 'fas fa-book',                label: 'Digital Ledger',      roles: [2] },
  // --- Meter Reader (Role 3) ---
  { path: '/consumers',     icon: 'fas fa-users',               label: 'Consumer Management', roles: [3] },
  { path: '/meter-reading', icon: 'fas fa-calendar-alt',        label: 'Reading Schedule',    roles: [3] },
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

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  React.useEffect(() => {
    if (user?.role_id === 1) {
      loadPendingCount();
      const interval = setInterval(loadPendingCount, 30000); // Check every 30s
      return () => clearInterval(interval);
    }
  }, [user]);

  const loadPendingCount = async () => {
    try {
      const response = await fetch(`${API_URL}/users/unified`);
      const result = await response.json();
      if (result.success) {
        const pending = result.data.filter((u: any) => u.Status === 'Pending').length;
        setPendingCount(pending);
      }
    } catch (error) {
      console.error('Error loading pending count:', error);
    }
  };

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
                {item.path === '/accounts' && pendingCount > 0 && (
                  <span className="notification-dot"></span>
                )}
              </div>
              <span>{item.label}</span>
            </Link>
          </li>
        ))}
        <li className="menu-item logout">
          <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}>
            <i className="fas fa-sign-out-alt"></i> <span>Logout</span>
          </a>
        </li>
      </ul>
    </div>
  );
};

export default Sidebar;
