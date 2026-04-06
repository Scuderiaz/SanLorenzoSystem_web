import React from 'react';
import { useAuth } from '../../context/AuthContext';
import './Header.css';

interface HeaderProps {
  title?: string;
}

const Header: React.FC<HeaderProps> = ({ title = 'Dashboard' }) => {
  const { user, logout, isOnline } = useAuth();

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const roleLabels: { [key: number]: string } = {
    1: 'Assessor Admin',
    2: 'Billing Officer',
    3: 'Meter Reader',
    4: 'Cashier / Treasurer',
    5: 'Consumer',
  };

  return (
    <div className="header">
      <div className="header-left">
        <h1 className="page-title">{title}</h1>
      </div>
      
      <div className="header-right">
        <div className="user-profile">
          <div className="avatar">
            {getInitials(user?.fullName || user?.username || 'A')}
          </div>
          <div className="user-info">
            <span className="user-name">{user?.fullName || user?.username || 'User'}</span>
            <span className="user-role">{roleLabels[user?.role_id!] || 'Staff'}</span>
          </div>
          <i className="fas fa-chevron-down" style={{ fontSize: '10px', color: '#94a3b8' }}></i>
        </div>
      </div>
    </div>
  );
};

export default Header;
