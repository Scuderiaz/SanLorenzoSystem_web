import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../../services/api';
import { loadClassificationsWithFallback } from '../../services/userManagementApi';
import { convertDocumentImageFile } from '../../utils/profileImage';
import './SignUp.css';

const PHONE_PATTERN = /^(09\d{9}|639\d{9}|\+639\d{9})$/;

const normalizePhoneInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const hasLeadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasLeadingPlus ? `+${digits}` : digits;
};

const SignUp: React.FC = () => {
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
    classificationId: '',
    sedulaImage: '',
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

  const classificationOptions = useMemo(
    () =>
      classifications.map((classification) => ({
        id: classification.Classification_ID ?? classification.classification_id,
        name: classification.Classification_Name ?? classification.classification_name,
      })),
    [classifications]
  );

  const validateForm = () => {
    if (!formData.username || !formData.password || !formData.confirmPassword) {
      return 'Please fill in all account details.';
    }
    if (formData.password !== formData.confirmPassword) {
      return 'Passwords do not match.';
    }
    if (!formData.firstName || !formData.lastName || !formData.phone) {
      return 'Please fill in required fields.';
    }
    if (!PHONE_PATTERN.test(formData.phone.trim())) {
      return 'Phone number must be a valid Philippine mobile number.';
    }
    if (!formData.barangay || !formData.purok) {
      return 'Please select barangay and purok.';
    }
    if (!formData.classificationId) {
      return 'Please select classification.';
    }
    if (!formData.sedulaImage) {
      return 'Please upload a sedula image before submitting.';
    }
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await authService.register(formData);
      if (result.success) {
        setTicketNumber(result.ticketNumber);
      } else {
        setError(result.message || 'Registration failed.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during registration.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = () => {
    setError('');
    window.alert('Google sign-up is frontend-only for now.');
  };

  const handleSedulaChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const imageDataUrl = await convertDocumentImageFile(file);
      setFormData((current) => ({
        ...current,
        sedulaImage: imageDataUrl,
      }));
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to prepare the selected sedula image.');
    }
  };

  return (
    <div className="signup-page">
      <div className="signup-card">
        <div className="signup-header">
          <div className="signup-logo" onClick={() => navigate('/')}
          >
            <img src="/slr-logo.svg" alt="San Lorenzo Ruiz Logo" />
          </div>
          <h1>Consumer Sign-Up</h1>
          <h2>San Lorenzo Ruiz Water System</h2>
        </div>

        <div className="signup-subheader">
          <p>Register using your email details or continue with Google.</p>
          <button type="button" className="signup-google" onClick={handleGoogleSignUp}>
            <span className="google-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path fill="#EA4335" d="M24 9.5c3.35 0 6.36 1.15 8.73 3.41l6.46-6.46C35.27 2.71 30.05 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.52 5.84C12.08 13.33 17.55 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.58-.14-3.09-.41-4.55H24v8.61h12.94c-.56 3.02-2.25 5.58-4.8 7.31l7.39 5.73c4.32-3.99 6.45-9.87 6.45-17.1z"/>
                <path fill="#FBBC05" d="M10.08 28.94A14.5 14.5 0 0 1 9.3 24c0-1.71.3-3.36.78-4.94l-7.52-5.84A23.92 23.92 0 0 0 0 24c0 3.88.93 7.56 2.56 10.78l7.52-5.84z"/>
                <path fill="#34A853" d="M24 48c6.05 0 11.27-1.99 15.04-5.39l-7.39-5.73c-2.05 1.38-4.69 2.19-7.65 2.19-6.45 0-11.92-3.83-13.92-9.56l-7.52 5.84C6.51 42.62 14.62 48 24 48z"/>
              </svg>
            </span>
            <span className="signup-google-label">Continue with Google</span>
          </button>
        </div>

        {error && (
          <div className="signup-error">
            <i className="fas fa-exclamation-circle"></i> {error}
          </div>
        )}

        {ticketNumber ? (
          <div className="signup-success">
            <h3>Ticket Generated!</h3>
            <p>Your registration ticket number is:</p>
            <div className="signup-ticket">{ticketNumber}</div>
            <p>Please save this ticket number for your reference.</p>
            <div className="signup-actions" style={{ justifyContent: 'center' }}>
              <button type="button" className="signup-primary" onClick={() => navigate('/login')}>
                Back to Login
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="signup-form">
            <div className="signup-section">
              <div className="signup-section-title">Account Details</div>
            </div>

            <div className="signup-field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                placeholder="Enter username"
              />
            </div>

            <div className="signup-field">
              <label htmlFor="phone">Phone Number</label>
              <input
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                required
                placeholder="09xxxxxxxxx"
                inputMode="numeric"
              />
            </div>

            <div className="signup-field">
              <label htmlFor="password">Password</label>
              <div className="signup-password">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
            </div>

            <div className="signup-field">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                placeholder="Confirm password"
              />
            </div>

            <div className="signup-section">
              <div className="signup-section-title">Consumer Details</div>
            </div>

            <div className="signup-field">
              <label htmlFor="firstName">First Name</label>
              <input id="firstName" name="firstName" value={formData.firstName} onChange={handleChange} required />
            </div>

            <div className="signup-field">
              <label htmlFor="middleName">Middle Name</label>
              <input id="middleName" name="middleName" value={formData.middleName} onChange={handleChange} />
            </div>

            <div className="signup-field">
              <label htmlFor="lastName">Last Name</label>
              <input id="lastName" name="lastName" value={formData.lastName} onChange={handleChange} required />
            </div>

            <div className="signup-field">
              <label htmlFor="classification">Classification</label>
              <input
                id="classification"
                value={classificationOptions.find((option) => String(option.id) === String(formData.classificationId))?.name || ''}
                placeholder="Select classification below"
                readOnly
                className="readonly"
              />
            </div>

            <div className="signup-section">
              <div className="signup-section-title">Address</div>
            </div>

            <div className="signup-field">
              <label htmlFor="municipality">Municipality</label>
              <input
                id="municipality"
                name="municipality"
                value={formData.municipality}
                readOnly
                className="readonly"
              />
            </div>

            <div className="signup-field">
              <label htmlFor="zipCode">Postal Code</label>
              <input
                id="zipCode"
                name="zipCode"
                value={formData.zipCode}
                readOnly
                className="readonly"
              />
            </div>

            <div className="signup-field">
              <label htmlFor="barangay">Barangay</label>
              <select
                id="barangay"
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

            <div className="signup-field">
              <label htmlFor="purok">Purok</label>
              <select
                id="purok"
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

            <div className="signup-field">
              <label htmlFor="address">Full Address</label>
              <input id="address" name="address" value={formData.address} readOnly className="readonly" />
            </div>

            <div className="signup-section">
              <div className="signup-section-title">Classification</div>
            </div>

            <div className="signup-classifications">
              {classificationOptions.map((classification) => {
                const selected = String(formData.classificationId) === String(classification.id);
                const iconClass = classification.name.toLowerCase().includes('res')
                  ? 'fas fa-home'
                  : classification.name.toLowerCase().includes('comm')
                    ? 'fas fa-store'
                    : 'fas fa-university';

                return (
                  <div
                    key={classification.id}
                    className={`signup-class-card ${selected ? 'selected' : ''}`}
                    onClick={() => setFormData({ ...formData, classificationId: String(classification.id) })}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        setFormData({ ...formData, classificationId: String(classification.id) });
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="signup-class-icon">
                        <i className={iconClass}></i>
                      </div>
                      <div className="signup-class-name">{classification.name}</div>
                    </div>
                    {selected && <i className="fas fa-check-circle" style={{ color: '#1a73e8' }} />}
                  </div>
                );
              })}
            </div>

            <div className="signup-section">
              <div className="signup-section-title">Submission Requirements</div>
            </div>

            <div className="signup-upload">
              <div className="signup-upload-head">
                <div>
                  <p className="signup-upload-title">Upload Sedula Image</p>
                  <p className="signup-upload-copy">Submit a clear photo or scan of the sedula. This will be attached to your pending application.</p>
                </div>
                <div className="signup-upload-actions">
                  <input
                    id="signup-sedula-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    style={{ display: 'none' }}
                    onChange={handleSedulaChange}
                  />
                  <button
                    type="button"
                    className="signup-secondary-btn"
                    onClick={() => document.getElementById('signup-sedula-upload')?.click()}
                  >
                    <i className="fas fa-upload"></i> Upload
                  </button>
                  <button
                    type="button"
                    className="signup-secondary-btn"
                    onClick={() => setFormData((current) => ({ ...current, sedulaImage: '' }))}
                    disabled={!formData.sedulaImage}
                  >
                    <i className="fas fa-trash-alt"></i> Remove
                  </button>
                </div>
              </div>

              <div className="signup-upload-preview">
                {formData.sedulaImage ? (
                  <img src={formData.sedulaImage} alt="Sedula preview" />
                ) : (
                  <div className="signup-upload-empty">
                    <i className="fas fa-file-image"></i> No sedula image uploaded yet.
                  </div>
                )}
              </div>
            </div>

            <div className="signup-charges">
              <h4>Registration Charges</h4>
              <div className="signup-charge-row"><span>Connection Fee</span><span>₱300.00</span></div>
              <div className="signup-charge-row"><span>Membership Fee</span><span>₱50.00</span></div>
              <div className="signup-charge-row"><span>Meter Full Deposit</span><span>₱1,500.00</span></div>
              <div className="signup-charge-row signup-charge-total"><span>Total Amount</span><span>₱1,850.00</span></div>
              <p style={{ margin: '10px 0 0', color: '#5f6368', fontSize: 13 }}>
                You will need to present these to the municipal office and settle the charges to complete your registration.
              </p>
            </div>

            <div className="signup-actions">
              <button type="submit" className="signup-primary" disabled={loading}>
                <i className="fas fa-paper-plane" />
                {loading ? 'Submitting...' : 'Submit Registration'}
              </button>
            </div>
          </form>
        )}

        <div className="signup-footer">
          <span>Already have an account? </span>
          <Link to="/login">Login</Link>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
