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
  const GOOGLE_OAUTH_INTENT_KEY = 'google_oauth_intent';

  useEffect(() => {
    let cancelled = false;
    const defaultGoogleErrorMessage = 'Unable to complete Google sign-in right now. Please try again.';

    const toUserFriendlyError = (value: unknown) => {
      const raw = String(value || '').trim();
      const lowered = raw.toLowerCase();
      if (!raw) return defaultGoogleErrorMessage;
      if (lowered.includes('already exists')) {
        return 'An account with this email already exists. Please log in instead.';
      }
      if (
        lowered.includes('null value') ||
        lowered.includes('violates') ||
        lowered.includes('relation') ||
        lowered.includes('column') ||
        lowered.includes('constraint')
      ) {
        return defaultGoogleErrorMessage;
      }
      if (lowered.includes('invalid or expired google token')) {
        return 'Your Google session expired. Please sign in again.';
      }
      if (lowered.includes('failed to fetch') || lowered.includes('network')) {
        return 'Network issue detected while signing in. Please check your connection and try again.';
      }
      return raw.length > 180 ? defaultGoogleErrorMessage : raw;
    };

    const readAccessTokenFromHash = () => {
      const hash = String(window.location.hash || '');
      if (!hash.startsWith('#')) return '';
      const params = new URLSearchParams(hash.slice(1));
      return String(params.get('access_token') || '').trim();
    };

    const getRedirectPathByRole = (roleId: number) => {
      if (roleId === 5) return '/consumer';
      return '/dashboard';
    };

    const getGoogleIntent = (): 'login' | 'signup' | 'auto' => {
      const url = new URL(window.location.href);
      const rawIntent = String(url.searchParams.get('intent') || '').trim().toLowerCase();
      if (rawIntent === 'login' || rawIntent === 'signup') {
        return rawIntent;
      }
      const storedIntent = String(sessionStorage.getItem(GOOGLE_OAUTH_INTENT_KEY) || '').trim().toLowerCase();
      if (storedIntent === 'login' || storedIntent === 'signup') {
        return storedIntent;
      }
      return 'auto';
    };

    const handleOAuthCallback = async () => {
      try {
        if (!supabase) {
          setError('Supabase is not configured. Please contact the system administrator.');
          return;
        }

        const url = new URL(window.location.href);
        const authCode = String(url.searchParams.get('code') || '').trim();
        let accessToken = readAccessTokenFromHash();

        // PKCE callback flow: exchange code for session
        if (!accessToken && authCode) {
          const { data: exchanged, error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode);
          if (exchangeError) {
            setError(toUserFriendlyError(exchangeError.message));
            return;
          }
          accessToken = String(exchanged?.session?.access_token || '').trim();
        }

        // Implicit flow fallback: read current session
        if (!accessToken) {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            console.error('Supabase session error:', sessionError);
            setError(toUserFriendlyError(sessionError.message));
            return;
          }
          accessToken = String(session?.access_token || '').trim();
        }

        if (!accessToken) {
          setError('No active session found. Please try signing in again.');
          return;
        }

        const oauthIntent = getGoogleIntent();
        const result = await authService.loginWithGoogle(accessToken, oauthIntent);

        if (cancelled) return;

        if (result.success) {
          login(result.user);
          navigate(getRedirectPathByRole(Number(result.user?.role_id || 5)));
        } else {
          setError(toUserFriendlyError(result.message || 'Google sign-in failed.'));
          await supabase.auth.signOut().catch(() => {});
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('OAuth callback error:', err);
          setError(toUserFriendlyError(err?.message));
          await supabase?.auth?.signOut?.().catch(() => {});
        }
      } finally {
        sessionStorage.removeItem(GOOGLE_OAUTH_INTENT_KEY);
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
            <img src="/images/SLR logo 1.png" alt="San Lorenzo Ruiz Logo" className="slr-logo" />
          </div>
          <h1>San Lorenzo Ruiz Waterworks System</h1>
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


