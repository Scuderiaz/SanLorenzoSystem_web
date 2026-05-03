import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../../services/api';
import './ForgotPassword.css';

const ForgotPassword: React.FC = () => {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const navigate = useNavigate();

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authService.requestOtp(username);
      if (result.success) {
        setStep(1);
      } else {
        setError(result.message || 'Failed to send OTP');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authService.verifyOtp(username, code);
      if (result.success) {
        setStep(2);
      } else {
        setError(result.message || 'Invalid OTP');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await authService.resetPassword(username, code, newPassword);
      if (result.success) {
        setStep(3);
        setSuccess('Password updated successfully!');
      } else {
        setError(result.message || 'Failed to reset password');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="forgot-pass-step">
            <h3>Reset Password</h3>
            <p>Enter your username to receive a reset code via SMS.</p>
            <form onSubmit={handleRequestOtp}>
              <div className="form-group">
                <label htmlFor="username">Username</label>
                <input
                  type="text"
                  id="username"
                  required
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Code'}
              </button>
            </form>
          </div>
        );
      case 1:
        return (
          <div className="forgot-pass-step">
            <h3>Verify OTP</h3>
            <p>Enter the 6-digit code sent to your phone.</p>
            <form onSubmit={handleVerifyOtp}>
              <div className="form-group">
                <label htmlFor="code">Verification Code</label>
                <input
                  type="text"
                  id="code"
                  required
                  maxLength={6}
                  placeholder="X X X X X X"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="otp-input"
                />
              </div>
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>
              <button type="button" className="text-btn" onClick={() => setStep(0)}>
                Back to Username
              </button>
            </form>
          </div>
        );
      case 2:
        return (
          <div className="forgot-pass-step">
            <h3>New Password</h3>
            <p>Create a strong password for your account.</p>
            <form onSubmit={handleResetPassword}>
              <div className="form-group">
                <label htmlFor="newPassword">New Password</label>
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="newPassword"
                    required
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button 
                    type="button" 
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  type={showPassword ? "text" : "password"}
                  id="confirmPassword"
                  required
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        );
      case 3:
        return (
          <div className="forgot-pass-step success-step">
            <div className="success-icon">
              <i className="fas fa-check-circle"></i>
            </div>
            <h3>Updated!</h3>
            <p>{success}</p>
            <Link to="/login" className="login-btn">Back to Login</Link>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="login-body">
      <div className="login-container forgot-pass-container">
        <div className="login-header">
          <div className="logo-placeholder" onClick={() => navigate('/')}>
            <img src="/slr-water-billing-logo.png" alt="SLR Water Billing Logo" className="slr-logo" />
          </div>
          <h1>San Lorenzo Ruiz</h1>
          <h2>Water Billing System</h2>
        </div>

        {error && (
          <div className="error-message" style={{ display: 'block' }}>
            <i className="fas fa-exclamation-circle"></i> {error}
          </div>
        )}

        {renderStep()}

        <div className="login-footer">
          {step !== 3 && <Link to="/login" className="back-link">Return to Login</Link>}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
