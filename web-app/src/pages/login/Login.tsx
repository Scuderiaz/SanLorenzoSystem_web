import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/api';
import { supabase } from '../../config/supabase';
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
        // Route based on role — consumers go to their own dashboard
        if (result.user.role_id === 5) {
          navigate('/consumer');
        } else {
          navigate('/dashboard');
        }
      } else {
        setError(result.message || 'Invalid credentials');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');

    if (!supabase) {
      setError('Google sign-in is not available.');
      return;
    }

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (oauthError) {
        setError(oauthError.message || 'Failed to start Google sign-in.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred starting Google sign-in.');
    }
  };

  return (
    <div className="login-body">
      <div className="login-container">
        <div className="login-header">
          <div className="logo-placeholder" onClick={() => navigate('/')}>
            <img src="/slr-logo.svg" alt="San Lorenzo Ruiz Logo" className="slr-logo" />
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
              <div className="forgot-password-link">
                <Link to="/forgot-password">Forgot Password?</Link>
              </div>
            </div>
            <button type="submit" className="login-btn" disabled={loading}>
              <span className="btn-content">
                <i className="fas fa-sign-in-alt"></i>
                <span>{loading ? 'Logging in...' : 'Login'}</span>
              </span>
              {loading && <div className="spinner"></div>}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '16px 0' }}>
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
              <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 500 }}>or</span>
              <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }}></div>
            </div>

            <button
              type="button"
              className="login-btn"
              onClick={handleGoogleLogin}
              style={{
                background: '#fff',
                color: '#3c4043',
                border: '1px solid #dadce0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path fill="#EA4335" d="M24 9.5c3.35 0 6.36 1.15 8.73 3.41l6.46-6.46C35.27 2.71 30.05 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.52 5.84C12.08 13.33 17.55 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.58-.14-3.09-.41-4.55H24v8.61h12.94c-.56 3.02-2.25 5.58-4.8 7.31l7.39 5.73c4.32-3.99 6.45-9.87 6.45-17.1z"/>
                <path fill="#FBBC05" d="M10.08 28.94A14.5 14.5 0 0 1 9.3 24c0-1.71.3-3.36.78-4.94l-7.52-5.84A23.92 23.92 0 0 0 0 24c0 3.88.93 7.56 2.56 10.78l7.52-5.84z"/>
                <path fill="#34A853" d="M24 48c6.05 0 11.27-1.99 15.04-5.39l-7.39-5.73c-2.05 1.38-4.69 2.19-7.65 2.19-6.45 0-11.92-3.83-13.92-9.56l-7.52 5.84C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              <span>Continue with Google</span>
            </button>
          </form>
        </div>
        <div className="login-footer">
          <p>Don't have an account? <Link to="/signup">Sign Up</Link></p>
          <p>&copy; {new Date().getFullYear()} Municipality of San Lorenzo Ruiz</p>
        </div>
      </div>
    </div>
  );
};

export default Login;


