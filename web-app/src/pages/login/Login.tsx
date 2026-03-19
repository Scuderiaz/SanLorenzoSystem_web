import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/api';
import './Login.css';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [userType, setUserType] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const roleMap: { [key: string]: string } = {
        '1': 'Admin',
        '3': 'Billing Officer',
        '4': 'Cashier',
      };

      const roleName = roleMap[userType];
      const result = await authService.login(username, password, roleName);

      if (result.success) {
        login(result.user);
        navigate('/dashboard');
      } else {
        setError(result.message || 'Invalid credentials');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-body">
      <div className="login-container">
        <div className="login-header">
          <div className="logo-placeholder">
            <i className="fas fa-tint"></i>
          </div>
          <h1>San Lorenzo Ruiz Municipal</h1>
          <h2>Water Billing and Payment Record Management System</h2>
        </div>

        {error && (
          <div className="error-message" style={{ display: 'block' }}>
            <i className="fas fa-exclamation-circle"></i> {error}
          </div>
        )}

        <div className="login-form">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="username">
                <i className="fas fa-user"></i> Username
              </label>
              <input
                type="text"
                id="username"
                name="username"
                required
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">
                <i className="fas fa-lock"></i> Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                required
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="userType">
                <i className="fas fa-users-cog"></i> Login As
              </label>
              <select
                id="userType"
                name="userType"
                required
                value={userType}
                onChange={(e) => setUserType(e.target.value)}
              >
                <option value="">Select User Type</option>
                <option value="1">Admin</option>
                <option value="3">Billing Officer</option>
                <option value="4">Treasurer/Cashier</option>
              </select>
            </div>
            <button type="submit" className="login-btn" disabled={loading}>
              <span className="btn-content">
                <i className="fas fa-sign-in-alt"></i>
                <span>{loading ? 'Logging in...' : 'Login'}</span>
              </span>
              {loading && <div className="spinner"></div>}
            </button>
          </form>
        </div>
        <div className="login-footer">
          <p>&copy; 2025 Municipality of San Lorenzo Ruiz</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
