import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../../services/api';
import { loadClassificationsWithFallback } from '../../services/userManagementApi';
import './ForgotPassword.css'; // Reusing some styles

const PHONE_PATTERN = /^(09\d{9}|639\d{9}|\+639\d{9})$/;

const normalizePhoneInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const hasLeadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasLeadingPlus ? `+${digits}` : digits;
};

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
    purok: '',
    barangay: '',
    municipality: 'San Lorenzo Ruiz',
    zipCode: '4610',
    classificationId: ''
  });
  const [classifications, setClassifications] = useState<any[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');

  const barangays = [
    'Daculang Bolo', 'Dagotdotan', 'Langga', 'Laniton', 
    'Maisog', 'Mampurog', 'Manlimonsito', 'Matacong (Pob.)', 
    'Salvacion', 'San Antonio', 'San Isidro', 'San Ramon'
  ].sort();

  const puroksByBarangay: Record<string, string[]> = Object.fromEntries(
    barangays.map((barangay) => [
      barangay,
      ['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5'],
    ])
  );

  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await loadClassificationsWithFallback();
        setClassifications(result.data || []);
      } catch (err) {
        console.error('Error fetching classifications:', err);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const composedAddress = [formData.purok, formData.barangay, formData.municipality, formData.zipCode]
      .filter(Boolean)
      .join(', ');

    if (formData.address !== composedAddress) {
      setFormData((current) => ({ ...current, address: composedAddress }));
    }
  }, [formData.purok, formData.barangay, formData.municipality, formData.zipCode, formData.address]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: name === 'phone' ? normalizePhoneInput(value) : value,
    });
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
        setStep(5);
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
            <div className="form-group">
              <label>First Name</label>
              <input name="firstName" value={formData.firstName} onChange={handleChange} required />
            </div>

            <div className="form-group">
              <label>Middle Name</label>
              <input name="middleName" value={formData.middleName} onChange={handleChange} />
            </div>

            <div className="form-group">
              <label>Last Name</label>
              <input name="lastName" value={formData.lastName} onChange={handleChange} required />
            </div>

            <div className="form-group">
              <label>Phone Number</label>
              <input name="phone" value={formData.phone} onChange={handleChange} required placeholder="09xxxxxxxxx" inputMode="numeric" />
            </div>
            
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button type="button" className="login-btn" style={{ backgroundColor: '#ccc' }} onClick={() => setStep(0)}>Back</button>
              <button type="button" className="login-btn" onClick={() => {
                if (!formData.firstName || !formData.lastName || !formData.phone) {
                  setError('Please fill in required fields.');
                  return;
                }
                if (!PHONE_PATTERN.test(formData.phone.trim())) {
                  setError('Phone number must be a valid Philippine mobile number.');
                  return;
                }
                setError('');
                setStep(2);
              }}>NEXT</button>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="forgot-pass-step">
            <h3>Select Address</h3>

            <div className="form-group">
              <label>Municipality</label>
              <input
                name="municipality"
                value={formData.municipality}
                readOnly
                style={{ color: '#5f6368', background: '#f8f9fa' }}
              />
            </div>

            <div className="form-group">
              <label>Postal Code</label>
              <input
                name="zipCode"
                value={formData.zipCode}
                readOnly
                style={{ color: '#5f6368', background: '#f8f9fa' }}
              />
            </div>

            <div className="form-group">
              <label>Barangay</label>
              <select
                name="barangay"
                value={formData.barangay}
                onChange={(e) => setFormData({ ...formData, barangay: e.target.value, purok: '' })}
                required
              >
                <option value="">Select Barangay</option>
                {barangays.map((barangay) => (
                  <option key={barangay} value={barangay}>
                    {barangay}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Purok</label>
              <select
                name="purok"
                value={formData.purok}
                onChange={handleChange}
                required
                disabled={!formData.barangay}
              >
                <option value="">{formData.barangay ? 'Select Purok' : 'Select Barangay First'}</option>
                {(puroksByBarangay[formData.barangay] || []).map((purok) => (
                  <option key={purok} value={purok}>
                    {purok}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Full Address</label>
              <input
                name="address"
                value={formData.address}
                readOnly
                style={{ color: '#5f6368', background: '#f8f9fa' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button type="button" className="login-btn" style={{ backgroundColor: '#ccc' }} onClick={() => setStep(1)}>Back</button>
              <button type="button" className="login-btn" onClick={() => {
                if (!formData.barangay || !formData.purok) {
                  setError('Please select barangay and purok.');
                  return;
                }
                setError('');
                setStep(3);
              }}>NEXT</button>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="forgot-pass-step">
            <h3>Classification</h3>
            <p className="step-desc">Choose your water usage classification.</p>
            <div className="classification-grid">
              {classificationOptions.map((classification) => (
                <div 
                  key={classification.id} 
                  className={`classification-card ${String(formData.classificationId) === String(classification.id) ? 'selected' : ''}`}
                  onClick={() => setFormData({ ...formData, classificationId: String(classification.id) })}
                >
                  <div className="class-icon">
                    <i className={
                      classification.name.toLowerCase().includes('res') ? 'fas fa-home' : 
                      classification.name.toLowerCase().includes('comm') ? 'fas fa-store' : 
                      'fas fa-university'
                    }></i>
                  </div>
                  <div className="class-info">
                    <span className="class-name">{classification.name}</span>
                  </div>
                  {String(formData.classificationId) === String(classification.id) && <i className="fas fa-check-circle select-check"></i>}
                </div>
              ))}
            </div>
            
            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
              <button type="button" className="login-btn" style={{ backgroundColor: '#ccc' }} onClick={() => setStep(2)}>Back</button>
              <button type="button" className="login-btn" onClick={() => {
                if (!formData.classificationId) {
                  setError('Please select classification.');
                  return;
                }
                setError('');
                setStep(4);
              }}>NEXT</button>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="forgot-pass-step">
            <h3>Submission Requirements</h3>
            <ul className="requirements-list">
              <li className="requirement-highlight"><i className="fas fa-check"></i> Sedula</li>
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
              <button type="button" className="login-btn" style={{ backgroundColor: '#ccc' }} onClick={() => setStep(3)}>Back</button>
              <button type="button" className="login-btn" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Submitting...' : 'Submit Registration'}
              </button>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="forgot-pass-step success-step success-final">
            <div className="success-icon slide-up">
              <i className="fas fa-ticket-alt"></i>
            </div>
            <h3 className="fade-in">Ticket Generated!</h3>
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
          <div className="logo-placeholder" onClick={() => navigate('/')}>
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
          {step !== 5 && <Link to="/login" className="back-link">Already have an account? Login</Link>}
        </div>
      </div>
    </div>
  );
};

export default SignUp;
