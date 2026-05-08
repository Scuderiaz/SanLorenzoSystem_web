import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '../../services/api';
import { loadClassificationsWithFallback } from '../../services/userManagementApi';
import { convertDocumentImageFile } from '../../utils/profileImage';
import { supabase } from '../../config/supabase';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
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
  const GOOGLE_OAUTH_INTENT_KEY = 'google_oauth_intent';
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
  const [registrationName, setRegistrationName] = useState('');
  const [classifications, setClassifications] = useState<any[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ticketNumber, setTicketNumber] = useState('');
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);

  const barangays = [
    'Daculang Bolo', 'Dagotdotan', 'Langga', 'Laniton', 
    'Maisog', 'Mampurog', 'Manlimonsito', 'Matacong (Pob.)', 
    'Salvacion', 'San Antonio', 'San Isidro', 'San Ramon'
  ].sort();

  const purokCountByBarangay: Record<string, number> = {
    'Daculang Bolo': 8,
    'Dagotdotan': 7,
    'Laniton': 5,
    'Langga': 2,
    'Maisog': 3,
    'Mampurog': 6,
    'Matacong (Pob.)': 7,
    'San Isidro': 4,
    'San Ramon': 3,
  };

  const puroksByBarangay: Record<string, string[]> = Object.fromEntries(
    barangays.map((barangay) => [
      barangay,
      Array.from(
        { length: purokCountByBarangay[barangay] || 5 },
        (_, index) => `Purok ${index + 1}`
      ),
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

  const validateAccountDetails = () => {
    if (!formData.username || !formData.password || !formData.confirmPassword) {
      return 'Please fill in all account details.';
    }
    if (formData.password !== formData.confirmPassword) {
      return 'Passwords do not match.';
    }
    if (formData.password.length < 8) {
      return 'Password must be at least 8 characters long.';
    }
    return '';
  };

  const validateApplicationDetails = () => {
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

  const handleContinueToDetails = () => {
    const validationError = validateAccountDetails();
    if (validationError) {
      setError(validationError);
      return false;
    }
    setError('');
    setCurrentStep(2);
    return true;
  };

  const handleStepSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep === 1) {
      handleContinueToDetails();
      return;
    }
    void handleSubmit();
  };

  const handleSubmit = async () => {
    const accountError = validateAccountDetails();
    if (accountError) {
      setCurrentStep(1);
      setError(accountError);
      return;
    }

    const validationError = validateApplicationDetails();
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
        setRegistrationName([formData.firstName, formData.lastName].filter(Boolean).join(' '));
      } else {
        setError(result.message || 'Registration failed.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during registration.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintTicket = () => {
    const printDate = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const applicantName = registrationName || formData.username || 'Applicant';
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Registration Ticket - ${ticketNumber}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:20px;color:#111;display:flex;justify-content:center;align-items:flex-start;min-height:100vh}.ticket{border:2px solid #1B1B63;border-radius:12px;padding:40px;width:680px;background:white;box-sizing:border-box}.ticket-header{text-align:center;border-bottom:1px dashed #ccc;padding-bottom:20px;margin-bottom:20px}.ticket-logo-title{font-size:15px;font-weight:700;color:#1B1B63}.ticket-number{font-size:22px;font-weight:900;color:#1B1B63;letter-spacing:1px;margin:18px 0 6px;text-align:center}.ticket-label{font-size:11px;color:#888;text-align:center;text-transform:uppercase;letter-spacing:1px}.ticket-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px}.ticket-row span{color:#555}.ticket-row strong{color:#111}.status-badge{display:inline-block;padding:4px 14px;background:#FEF3C7;color:#92400E;border-radius:99px;font-size:12px;font-weight:700;margin:10px 0}.charges{margin-top:16px;background:#f9f9f9;border-radius:8px;padding:14px}.charges-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#888;margin-bottom:10px}.charge-row{display:flex;justify-content:space-between;font-size:13px;padding:4px 0}.charge-total{font-weight:700;border-top:1px solid #ddd;margin-top:6px;padding-top:8px}.ticket-footer{margin-top:20px;text-align:center;font-size:11px;color:#888;line-height:1.6}@media print{@page{margin:10mm}body{padding:0}}</style></head><body><div class="ticket"><div class="ticket-header"><div class="ticket-logo-title">San Lorenzo Ruiz Waterworks System</div><div style="font-size:12px;color:#555;margin-top:4px">Water Connection Application Receipt</div></div><div class="ticket-label">Ticket Number</div><div class="ticket-number">${ticketNumber}</div><div style="text-align:center;margin-bottom:20px;"><span class="status-badge">PENDING</span></div><div class="ticket-row"><span>Applicant</span><strong>${applicantName}</strong></div><div class="ticket-row"><span>Username</span><strong>${formData.username}</strong></div><div class="ticket-row"><span>Date Applied</span><strong>${printDate}</strong></div><div class="ticket-row"><span>Connection Type</span><strong>New Connection</strong></div><div class="charges"><div class="charges-title">Registration Charges</div><div class="charge-row"><span>Connection Fee</span><span>₱300.00</span></div><div class="charge-row"><span>Membership Fee</span><span>₱50.00</span></div><div class="charge-row"><span>Meter Full Deposit</span><span>₱1,500.00</span></div><div class="charge-row charge-total"><span>Total Amount</span><strong>₱1,850.00</strong></div></div><div class="ticket-footer">Please bring this ticket to the Municipal Office.<br>Present this reference number during your visit.<br><br>San Lorenzo Ruiz, Camarines Norte â€” Water Billing System</div></div></body></html>`;
    const win = window.open('', '_blank', 'width=800,height=900');
    if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 500); }
  };

  const handleDownloadTicket = async () => {
    const printDate = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const applicantName = registrationName || formData.username || 'Applicant';

    // Create a temporary container for the ticket
    const container = document.createElement('div');
    container.innerHTML = `
      <div id="ticket-pdf" style="
        width: 680px;
        background: white;
        padding: 40px;
        font-family: Arial, sans-serif;
        color: #111;
        border: 2px solid #1B1B63;
        border-radius: 12px;
        box-sizing: border-box;
        margin: 0 auto;
      ">
        <div style="text-align: center; border-bottom: 1px dashed #ccc; padding-bottom: 20px; margin-bottom: 20px;">
          <div style="font-size: 15px; font-weight: 700; color: #1B1B63;">San Lorenzo Ruiz Waterworks System</div>
          <div style="font-size: 12px; color: #555; margin-top: 4px;">Water Connection Application Receipt</div>
        </div>
        <div style="font-size: 11px; color: #888; text-align: center; text-transform: uppercase; letter-spacing: 1px;">Ticket Number</div>
        <div style="font-size: 22px; font-weight: 900; color: #1B1B63; letter-spacing: 1px; margin: 18px 0 6px; text-align: center;">${ticketNumber}</div>
        <div style="text-align: center; margin-bottom: 20px;">
          <span style="display: inline-block; padding: 4px 12px; background: #FEF3C7; color: #92400E; border-radius: 99px; font-size: 12px; font-weight: 700;">PENDING REVIEW</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px;">
          <span style="color: #555;">Applicant</span>
          <strong style="color: #111;">${applicantName}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px;">
          <span style="color: #555;">Username</span>
          <strong style="color: #111;">${formData.username}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px;">
          <span style="color: #555;">Date Applied</span>
          <strong style="color: #111;">${printDate}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px;">
          <span style="color: #555;">Connection Type</span>
          <strong style="color: #111;">New Connection</strong>
        </div>
        <div style="margin-top: 16px; background: #f9f9f9; border-radius: 8px; padding: 14px;">
          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 10px;">Registration Charges</div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0;">
            <span>Connection Fee</span>
            <span>₱300.00</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0;">
            <span>Membership Fee</span>
            <span>₱50.00</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0;">
            <span>Meter Full Deposit</span>
            <span>₱1,500.00</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; font-weight: 700; border-top: 1px solid #ddd; margin-top: 6px; padding-top: 8px;">
            <span>Total Amount</span>
            <strong>₱1,850.00</strong>
          </div>
        </div>
        <div style="margin-top: 20px; text-align: center; font-size: 11px; color: #888; line-height: 1.6;">
          Please bring this ticket to the Municipal Office.<br>
          Present this reference number during your visit.<br><br>
          San Lorenzo Ruiz, Camarines Norte â€” Water Billing System
        </div>
      </div>
    `;
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    try {
      const ticketElement = container.querySelector('#ticket-pdf') as HTMLElement;
      const canvas = await html2canvas(ticketElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      // Convert canvas pixels to mm (72 DPI: 1mm = 2.83px, canvas is at scale 2)
      const imgWidthMm = (canvas.width / 2) * 0.264583;
      const imgHeightMm = (canvas.height / 2) * 0.264583;
      // Fit to page width with minimal margins (5mm each side)
      const maxWidth = pdfWidth - 10; // 5mm margin each side
      const maxHeight = pdfHeight - 10; // 5mm margin top/bottom
      // Scale to fill width, but don't exceed page height
      const scale = Math.min(maxWidth / imgWidthMm, maxHeight / imgHeightMm);
      const finalWidth = imgWidthMm * scale;
      const finalHeight = imgHeightMm * scale;
      const imgX = (pdfWidth - finalWidth) / 2;
      const imgY = (pdfHeight - finalHeight) / 2;

      pdf.addImage(imgData, 'PNG', imgX, imgY, finalWidth, finalHeight);
      pdf.save(`Registration-Ticket-${ticketNumber}.pdf`);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      // Fallback to print if download fails
      handlePrintTicket();
    } finally {
      document.body.removeChild(container);
    }
  };

  const handleGoogleSignUp = async () => {
    setError('');

    if (!supabase) {
      setError('Google sign-in is not available. Supabase is not configured.');
      return;
    }

    try {
      sessionStorage.setItem(GOOGLE_OAUTH_INTENT_KEY, 'signup');
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?intent=signup`,
        },
      });

      if (oauthError) {
        sessionStorage.removeItem(GOOGLE_OAUTH_INTENT_KEY);
        setError(oauthError.message || 'Failed to start Google sign-in.');
      }
    } catch (err: any) {
      sessionStorage.removeItem(GOOGLE_OAUTH_INTENT_KEY);
      setError(err.message || 'An error occurred starting Google sign-in.');
    }
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
      <div className={`signup-card ${!ticketNumber && currentStep === 2 ? 'signup-card-wide' : ''}`}>
        {ticketNumber ? (
          <div className="signup-success">
            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
              <i className="fas fa-check-circle" style={{ fontSize: '48px', color: '#16a34a' }} />
            </div>
            <h3>Application Submitted!</h3>
            <p>Your application has been received. Please present the ticket number below at the Municipal Office to proceed with your water connection.</p>
            <div className="signup-ticket">{ticketNumber}</div>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '8px 0 20px' }}>
              <i className="fas fa-info-circle" /> You can use the concessionaire dashboard after submitting registration.
            </p>
            <div className="signup-actions" style={{ justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <button type="button" className="signup-download-btn" onClick={handleDownloadTicket}>
                <i className="fas fa-download" /> Download PDF
              </button>
              <button type="button" className="signup-secondary-btn" onClick={handlePrintTicket}>
                <i className="fas fa-print" /> Print
              </button>
              <button type="button" className="signup-primary" onClick={() => navigate('/login')}>
                <i className="fas fa-sign-in-alt" /> Log In to Dashboard
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleStepSubmit} className={`signup-form ${currentStep === 2 ? 'signup-form-step-two' : ''}`}>
            <div className="signup-scrollable-form">
              <div className={`signup-header ${currentStep === 1 ? 'signup-header-step-one' : 'signup-header-step-two'}`}>
                <div className="signup-logo" onClick={() => navigate('/')}>
                  <img src="/images/SLR logo 1.png" alt="San Lorenzo Ruiz Logo" />
                </div>
                <div className="signup-header-text">
                  <h1>San Lorenzo Ruiz Waterworks System</h1>
                  <h2>Water Billing and Payment Record Management System</h2>
                </div>
              </div>

              {error && (
                <div className="signup-error">
                  <i className="fas fa-exclamation-circle"></i> {error}
                </div>
              )}

              {currentStep === 1 && (
              <div className="signup-field">
                <label htmlFor="username"><i className="fas fa-user"></i> Username</label>
                <input
                  id="username"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  required
                  placeholder="Enter username"
                />
              </div>
              )}

              {currentStep === 1 && (
              <div className="signup-field">
                <label htmlFor="password"><i className="fas fa-lock"></i> Password</label>
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
              )}

              {currentStep === 1 && (
              <div className="signup-field">
                <label htmlFor="confirmPassword"><i className="fas fa-lock"></i> Confirm Password</label>
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
              )}

              {currentStep === 2 && (
              <>
              <div className="signup-section">
                <div className="signup-section-title">Consumer Details</div>
              </div>
              <div className="signup-form-grid">
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
              </div>

              <div className="signup-section" style={{ marginTop: '8px' }}>
                <div className="signup-section-title">Address</div>
              </div>
              <div className="signup-form-grid">
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

                <div className="signup-field signup-field-span-2">
                  <label htmlFor="address">Full Address</label>
                  <input id="address" name="address" value={formData.address} readOnly className="readonly" />
                </div>
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
              </>
              )}
            </div>

            <div className="signup-actions">
              {currentStep === 2 && (
                <button type="button" className="signup-secondary-btn signup-back-btn" onClick={() => setCurrentStep(1)} disabled={loading}>
                  <i className="fas fa-arrow-left" /> Back
                </button>
              )}
              <button
                type="submit"
                className="signup-primary"
                disabled={loading || (currentStep === 2 && !formData.sedulaImage)}
                title={currentStep === 2 && !formData.sedulaImage ? 'Upload a sedula image to continue.' : undefined}
              >
                {loading ? 'Submitting...' : currentStep === 1 ? 'Sign Up' : 'Submit Registration'}
              </button>
            </div>

            {currentStep === 1 && (
              <div className="signup-social">
                <div className="signup-divider">
                  <span className="divider-line"></span>
                  <span className="divider-text">or</span>
                  <span className="divider-line"></span>
                </div>

                <button type="button" className="signup-google-btn" onClick={handleGoogleSignUp}>
                  <span className="google-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                      <path fill="#EA4335" d="M24 9.5c3.35 0 6.36 1.15 8.73 3.41l6.46-6.46C35.27 2.71 30.05 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.52 5.84C12.08 13.33 17.55 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.58-.14-3.09-.41-4.55H24v8.61h12.94c-.56 3.02-2.25 5.58-4.8 7.31l7.39 5.73c4.32-3.99 6.45-9.87 6.45-17.1z"/>
                      <path fill="#FBBC05" d="M10.08 28.94A14.5 14.5 0 0 1 9.3 24c0-1.71.3-3.36.78-4.94l-7.52-5.84A23.92 23.92 0 0 0 0 24c0 3.88.93 7.56 2.56 10.78l7.52-5.84z"/>
                      <path fill="#34A853" d="M24 48c6.05 0 11.27-1.99 15.04-5.39l-7.39-5.73c-2.05 1.38-4.69 2.19-7.65 2.19-6.45 0-11.92-3.83-13.92-9.56l-7.52 5.84C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                  </span>
                  <span>Continue with Google</span>
                </button>
              </div>
            )}
          </form>
        )}

        {!ticketNumber && (
          <div className="signup-footer">
            <span>Already have an account? </span>
            <Link to="/login">Login</Link>
          </div>
        )}

        <div className="signup-copyright">
          © 2026 Municipality of San Lorenzo Ruiz
        </div>
      </div>
    </div>
  );
};

export default SignUp;



