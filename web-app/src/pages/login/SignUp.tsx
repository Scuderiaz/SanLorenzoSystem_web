import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api, { authService } from '../../services/api';
import './ForgotPassword.css'; // Reusing some styles

const SignUp: React.FC = () => {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    phone: '',
    firstName: '',
    middleName: '',
    lastName: '',
    address: '',
    classificationId: ''
  });
  const [zones, setZones] = useState<any[]>([]);
  const [classifications, setClassifications] = useState<any[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const classRes = await api.get('/classifications');
        setClassifications(classRes.data.data || []);
      } catch (err) {
        console.error('Error fetching classifications:', err);
      }
    };
    fetchData();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleNext = () => {
    if (step === 0) {
      if (!formData.username || !formData.password || !formData.confirmPassword) {
        setError('Please fill in all account details.');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }
    setError('');
    setStep(step + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await authService.register(formData);
      if (result.success) {
        setTicketNumber(result.ticketNumber);
        setStep(3);
      } else {
        setError(result.message || 'Registration failed.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during registration.');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    const classificationOptions = classifications.map((classification) => ({
      id: classification.Classification_ID ?? classification.classification_id,
      name: classification.Classification_Name ?? classification.classification_name,
    }));

    switch (step) {
      case 0:
        return (
          <div className="forgot-pass-step">
            <h3>Create Account</h3>
            <div className="form-group">
              <label>Username</label>
              <input name="username" value={formData.username} onChange={handleChange} required placeholder="Enter username" />
            </div>
            <div className="form-group">
              <label>Password</label>
              <div className="password-input-wrapper">
                <input 
                  type={showPassword ? "text" : "password"} 
                  name="password" 
                  value={formData.password} 
                  onChange={handleChange} 
                  required 
                  placeholder="Enter password" 
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
              <label>Confirm Password</label>
              <input 
                type={showPassword ? "text" : "password"} 
                name="confirmPassword" 
                value={formData.confirmPassword} 
                onChange={handleChange} 
                required 
                placeholder="Confirm password" 
              />
            </div>
            <button type="button" className="login-btn" onClick={handleNext}>NEXT</button>
          </div>
        );
      case 1:
        return (
          <div className="forgot-pass-step">
            <h3>Consumer Details</h3>
            <div className="form-row">
              <div className="form-group flex-1">
                <label>First Name</label>
                <input name="firstName" value={formData.firstName} onChange={handleChange} required />
              </div>
              <div className="form-group flex-1">
                <label>Middle Name</label>
                <input name="middleName" value={formData.middleName} onChange={handleChange} />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group flex-1">
                <label>Last Name</label>
                <input name="lastName" value={formData.lastName} onChange={handleChange} required />
              </div>
              <div className="form-group flex-1">
                <label>Phone Number</label>
                <input name="phone" value={formData.phone} onChange={handleChange} required placeholder="09xxxxxxxxx" />
              </div>
            </div>

            <div className="form-group">
              <label>Address</label>
              <input name="address" value={formData.address} onChange={handleChange} required />
            </div>

            <div className="form-group">
              <label>Classification</label>
              <select name="classificationId" value={formData.classificationId} onChange={handleChange} required>
                <option value="">Select Classification</option>
                {classificationOptions.map((classification) => (
                  <option key={classification.id} value={classification.id}>
                    {classification.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button type="button" className="login-btn" style={{ backgroundColor: '#ccc' }} onClick={() => setStep(0)}>Back</button>
              <button type="button" className="login-btn" onClick={handleNext}>NEXT</button>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="forgot-pass-step">
            <h3>Submission Requirements</h3>
            <ul className="requirements-list">
              <li><i className="fas fa-check"></i> Sedula</li>
            </ul>
            <div className="charges-panel">
              <h4>Registration Charges</h4>
              <div className="charge-item"><span>Connection Fee</span><span>₱300.00</span></div>
              <div className="charge-item"><span>Membership Fee</span><span>₱50.00</span></div>
              <div className="charge-item"><span>Meter Full Deposit</span><span>₱1,500.00</span></div>
              <div className="charge-total"><span>Total Amount</span><span>₱1,850.00</span></div>
            </div>
            <p className="small-text">You will need to present these to the municipal office and settle the charges to complete your registration.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="login-btn" style={{ backgroundColor: '#ccc' }} onClick={() => setStep(1)}>Back</button>
              <button type="button" className="login-btn" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Submitting...' : 'Submit Registration'}
              </button>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="forgot-pass-step success-step">
            <div className="success-icon">
              <i className="fas fa-ticket-alt"></i>
            </div>
            <h3>Ticket Generated!</h3>
            <p>Your registration ticket number is:</p>
            <div className="ticket-box">{ticketNumber}</div>
            <p className="important-msg">Please save this ticket number for your reference.</p>
            <button type="button" className="login-btn" onClick={() => navigate('/login')}>Back to Login</button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="login-body">
      <div className="login-container signup-container">
        <div className="login-header">
          <div className="logo-placeholder">
            <img src="/slr-logo.svg" alt="San Lorenzo Ruiz Logo" className="slr-logo" />
          </div>
          <h1>Consumer Sign-Up</h1>
          <h2>San Lorenzo Ruiz Water System</h2>
        </div>

        {error && (
          <div className="error-message" style={{ display: 'block' }}>
            <i className="fas fa-exclamation-circle"></i> {error}
          </div>
        )}

        {renderStep()}

        <div className="login-footer">
          {step !== 3 && <Link to="/login" className="back-link">Already have an account? Login</Link>}
        </div>
      </div>
    </div>
  );
};

export default SignUp;
