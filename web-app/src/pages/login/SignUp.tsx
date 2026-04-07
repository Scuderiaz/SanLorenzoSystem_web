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
    purok: '',
    barangay: '',
    municipality: 'San Lorenzo Ruiz',
    zipCode: '',
    classificationId: ''
  });
  const [zones, setZones] = useState<any[]>([]);
  const [classifications, setClassifications] = useState<any[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [addrStep, setAddrStep] = useState<'barangay' | 'purok'>('barangay');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerStep, setPickerStep] = useState<'city' | 'barangay'>('city');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isPickerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => { document.body.style.overflow = 'auto'; };
  }, [isPickerOpen]);

  const barangays = [
    'Daculang Bolo', 'Dagotdotan', 'Langga', 'Laniton', 
    'Maisog', 'Mampurog', 'Manlimonsito', 'Matacong (Pob.)', 
    'Salvacion', 'San Antonio', 'San Isidro', 'San Ramon'
  ].sort();

  const puroks = [1, 2, 3, 4, 5, 6, 7];

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
            
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button type="button" className="login-btn" style={{ backgroundColor: '#ccc' }} onClick={() => setStep(0)}>Back</button>
              <button type="button" className="login-btn" onClick={() => {
                if (!formData.firstName || !formData.lastName || !formData.phone) {
                  setError('Please fill in required fields.');
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
          <>
            <div className="forgot-pass-step">
              <h3>Select Address</h3>
              <div className="shopee-path" onClick={() => { setIsPickerOpen(true); setPickerStep('city'); }} style={{ cursor: 'pointer', border: '1px solid #e0e0e0', padding: '15px', borderRadius: '8px', background: 'white', minHeight: '60px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: '11px', color: '#9e9e9e', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Region, Province, Municipality, Barangay
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '15px', fontWeight: '500', color: formData.barangay ? '#212121' : '#bdbdbd' }}>
                    {formData.barangay 
                      ? `Region 5, Camarines Norte, San Lorenzo Ruiz, ${formData.barangay}` 
                      : 'Select Address'}
                  </div>
                  <i className="fas fa-chevron-right" style={{ color: '#bdbdbd' }}></i>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '20px' }}>
                <label style={{ fontSize: '12px', color: '#9e9e9e' }}>Postal Code</label>
                <input name="zipCode" value={formData.zipCode} onChange={handleChange} required placeholder="Enter Postal Code" style={{ border: 'none', borderBottom: '1px solid #eee', padding: '10px 0', fontSize: '16px', width: '100%', outline: 'none' }} />
              </div>

              <div className="form-group" style={{ marginTop: '20px' }}>
                <label style={{ fontSize: '12px', color: '#9e9e9e' }}>Detailed Address</label>
                <input name="address" value={formData.address} onChange={handleChange} required placeholder="Street Name, Purok, Building, House No." style={{ border: 'none', borderBottom: '1px solid #eee', padding: '10px 0', fontSize: '16px', width: '100%', outline: 'none' }} />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
                <button type="button" className="login-btn" style={{ backgroundColor: '#ccc' }} onClick={() => setStep(1)}>Back</button>
                <button type="button" className="login-btn" onClick={() => {
                  if (!formData.barangay || !formData.address) {
                    setError('Please select barangay and complete address.');
                    return;
                  }
                  setError('');
                  setStep(3);
                }}>NEXT</button>
              </div>
            </div>
          </>
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
          {step !== 5 && <Link to="/login" className="back-link">Already have an account? Login</Link>}
        </div>
      </div>

      {isPickerOpen && (
        <div className="shopee-overlay" onClick={() => setIsPickerOpen(false)}>
          <div className="shopee-panel slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="shopee-header">
              <button type="button" className="close-btn" onClick={() => setIsPickerOpen(false)}>
                <i className="fas fa-arrow-left"></i>
              </button>
              {pickerStep === 'barangay' && (
                <div className="search-box">
                  <i className="fas fa-search"></i>
                  <input 
                    placeholder="Search Barangay" 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div className="shopee-body">
              {pickerStep === 'city' ? (
                <div className="picker-section">
                  <div className="category-label">Municipality</div>
                  <div className="city-list">
                    {['San Lorenzo Ruiz'].filter(c => c.toLowerCase().includes(searchTerm.toLowerCase())).map(c => (
                      <div key={c} className="picker-item" onClick={() => { setPickerStep('barangay'); setSearchTerm(''); }}>
                        <span className="alphabet">S</span>
                        <span className="item-name">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="picker-section">
                  <div className="category-label">Barangay (San Lorenzo Ruiz)</div>
                  <div className="barangay-list">
                    {barangays.filter(b => b.toLowerCase().includes(searchTerm.toLowerCase())).map(b => (
                      <div key={b} className="picker-item" onClick={() => { 
                        setFormData({ 
                          ...formData, 
                          barangay: b,
                          zipCode: '4601'
                        }); 
                        setIsPickerOpen(false); 
                        setSearchTerm('');
                      }}>
                        <span className="alphabet">{b[0]}</span>
                        <span className="item-name">{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SignUp;
