import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authService } from '../../services/api';
import { supabase } from '../../config/supabase';
import './Login.css';

const AuthCallback: React.FC = () => {
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const handleOAuthCallback = async () => {
      try {
        if (!supabase) {
          setError('Supabase is not configured. Please contact the system administrator.');
          return;
        }

        // Supabase automatically picks up the session from the URL hash fragment
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Supabase session error:', sessionError);
          setError(sessionError.message || 'Failed to retrieve Google session.');
          return;
        }

        if (!session?.access_token) {
          setError('No active session found. Please try signing in again.');
          return;
        }

        // Send the Supabase access token to our backend for account creation/lookup
        const result = await authService.loginWithGoogle(session.access_token);

        if (cancelled) return;

        if (result.success) {
          login(result.user);
          navigate('/consumer');
        } else {
          setError(result.message || 'Google sign-in failed.');
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('OAuth callback error:', err);
          setError(err.message || 'An unexpected error occurred during Google sign-in.');
        }
      }
    };

    handleOAuthCallback();

    return () => {
      cancelled = true;
    };
  }, [login, navigate]);

  return (
    <div className="login-body">
      <div className="login-container">
        <div className="login-header">
          <div className="logo-placeholder">
            <img src="/slr-water-billing-logo.png" alt="SLR Water Billing Logo" className="slr-logo" />
          </div>
          <h1>San Lorenzo Ruiz Municipal</h1>
          <h2>Water Billing and Payment Record Management System</h2>
        </div>

        {error ? (
          <div style={{ textAlign: 'center', padding: '30px 20px' }}>
            <div className="error-message" style={{ display: 'block', marginBottom: '20px' }}>
              <i className="fas fa-exclamation-circle"></i> {error}
            </div>
            <button
              className="login-btn"
              onClick={() => navigate('/login')}
              style={{ maxWidth: '260px', margin: '0 auto' }}
            >
              <span className="btn-content">
                <i className="fas fa-arrow-left"></i>
                <span>Back to Login</span>
              </span>
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
            <p style={{ color: '#64748b', fontSize: '14px' }}>
              Signing you in with Google...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;


