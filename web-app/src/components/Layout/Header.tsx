import React from 'react';
import { useAuth } from '../../context/AuthContext';
import './Header.css';

interface HeaderProps {
  title?: string;
}

const Header: React.FC<HeaderProps> = ({ title = 'Dashboard' }) => {
  const { user, logout, isOnline } = useAuth();

  return (
    <div className="header">
      <h1 className="page-title">{title}</h1>
      <div className="header-right">
        <div className="user-actions">
          <div className="online-status">
            <span className={`status-indicator ${isOnline ? 'online' : 'offline'}`}></span>
            <span className="status-text">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
          <span className="user-greeting">
            Welcome, {user?.fullName || user?.username || 'User'}
          </span>
          <a href="#" onClick={(e) => { e.preventDefault(); logout(); }} className="logout-btn">
            <i className="fas fa-sign-out-alt"></i> Logout
          </a>
        </div>
      </div>
    </div>
  );
};

export default Header;
