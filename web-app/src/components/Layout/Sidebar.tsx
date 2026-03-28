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

const menuItems: MenuItem[] = [
  { path: '/dashboard', icon: 'fas fa-tachometer-alt', label: 'Dashboard', roles: [1, 3, 4] },
  { path: '/users', icon: 'fas fa-users', label: 'User Management', roles: [1] },
  { path: '/consumers', icon: 'fas fa-database', label: 'Master Records', roles: [1] },
  { path: '/consumers', icon: 'fas fa-users', label: 'Consumer Management', roles: [3] },
  { path: '/meter-reading', icon: 'fas fa-calendar-alt', label: 'Reading Schedule', roles: [3] },
  { path: '/generate-bills', icon: 'fas fa-file-invoice-dollar', label: 'Bills Review', roles: [3] },
  { path: '/reports', icon: 'fas fa-chart-bar', label: 'Reports', roles: [1, 3, 4] },
  { path: '/ledger', icon: 'fas fa-book', label: 'Digital Ledger', roles: [3, 4] },
  { path: '/settings', icon: 'fas fa-cogs', label: 'System Settings', roles: [1] },
  { path: '/maintenance', icon: 'fas fa-tools', label: 'System Maintenance', roles: [1] },
  { path: '/close-day', icon: 'fas fa-lock', label: 'Close Day', roles: [1] },
  { path: '/payments', icon: 'fas fa-money-bill-wave', label: 'Process Payment', roles: [4] },
  { path: '/verify-payment', icon: 'fas fa-check-circle', label: 'Verify Payment', roles: [4] },
  { path: '/view-bill', icon: 'fas fa-file-alt', label: 'View Bill', roles: [4] },
];

const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

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
              <i className={item.icon}></i> <span>{item.label}</span>
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
