import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/api';
import './Login.css';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await authService.login(username, password);

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
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  required
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button 
                  type="button" 
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
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
          <p>&copy; {new Date().getFullYear()} Municipality of San Lorenzo Ruiz</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
