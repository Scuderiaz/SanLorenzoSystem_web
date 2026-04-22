import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Common/ToastContainer';
import FormInput from '../../components/Common/FormInput';
import FormSelect from '../../components/Common/FormSelect';
import Modal from '../../components/Common/Modal';
import { getErrorMessage, loadConsumerDashboardWithFallback, requestJson } from '../../services/userManagementApi';
import './ConsumerProfile.css';

// ─── Types ─────────────────────────────────────────────────────────────────
interface ConsumerProfile {
  Consumer_ID: number;
  First_Name: string;
  Middle_Name?: string;
  Last_Name: string;
  Address: string;
  Purok?: string;
  Barangay?: string;
  Municipality?: string;
  Zip_Code?: string;
  Zone_ID: number;
  Zone_Name?: string;
  Classification_ID: number;
  Classification_Name?: string;
  Account_Number: string;
  Meter_Number: string;
  Meter_Status?: string;
  Status: string;
  Contact_Number: string;
  Connection_Date: string;
  Email?: string;
}

interface Zone {
  Zone_ID: number;
  Zone_Name: string;
}

interface Classification {
  Classification_ID: number;
  Classification_Name: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────
const BARANGAYS = [
  'Daculang Bolo', 'Dagotdotan', 'Langga', 'Laniton',
  'Maisog', 'Mampurog', 'Manlimonsito', 'Matacong (Pob.)',
  'Salvacion', 'San Antonio', 'San Isidro', 'San Ramon',
].sort();

const PUROK_OPTIONS = ['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5'];

const PHONE_PATTERN = /^(09\d{9}|639\d{9}|\+639\d{9})$/;

// ─── Helpers ──────────────────────────────────────────────────────────────
const formatName = (str?: string) => {
  if (!str) return 'Consumer';
  return str.split(/[\s.]+/)
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const normalizePhoneInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const hasLeadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasLeadingPlus ? `+${digits}` : digits;
};

// ─── Main Component ────────────────────────────────────────────────────────
const ConsumerProfile: React.FC = () => {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<ConsumerProfile | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [classifications, setClassifications] = useState<Classification[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    address: '',
    purok: '',
    barangay: '',
    municipality: 'San Lorenzo Ruiz',
    zipCode: '4610',
    contactNumber: '',
    email: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load profile data
  useEffect(() => {
    if (!user?.id) return;

    const fetchProfile = async () => {
      try {
        const { data } = await loadConsumerDashboardWithFallback(user.id);
        if (data.consumer) {
          const c = data.consumer;
          setProfile({
            Consumer_ID: c.Consumer_ID,
            First_Name: c.First_Name,
            Middle_Name: c.Middle_Name,
            Last_Name: c.Last_Name,
            Address: c.Address,
            Purok: c.Purok,
            Barangay: c.Barangay,
            Municipality: c.Municipality || 'San Lorenzo Ruiz',
            Zip_Code: c.Zip_Code || '4610',
            Zone_ID: c.Zone_ID,
            Zone_Name: c.Zone_Name,
            Classification_ID: c.Classification_ID,
            Classification_Name: c.Classification_Name,
            Account_Number: c.Account_Number || c.account_number,
            Meter_Number: c.Meter_Number || c.meter_number,
            Meter_Status: c.Meter_Status,
            Status: c.Status,
            Contact_Number: c.Contact_Number || c.contact_number,
            Connection_Date: c.Connection_Date || c.connection_date,
            Email: c.Email || user.username || '',
          });
        }
      } catch (err: any) {
        showToast(getErrorMessage(err, 'Failed to load profile.'), 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user, showToast]);

  // Load zones and classifications for form
  useEffect(() => {
    const loadFormData = async () => {
      try {
        const [zonesRes, classRes] = await Promise.all([
          requestJson<Zone[]>('/zones', {}, 'Failed to load zones.'),
          requestJson<Classification[]>('/classifications', {}, 'Failed to load classifications.'),
        ]);
        setZones(zonesRes);
        setClassifications(classRes);
      } catch (err) {
        console.error('Error loading form data:', err);
      }
    };
    loadFormData();
  }, []);

  const handleOpenEdit = () => {
    if (!profile) return;
    setFormData({
      firstName: profile.First_Name || '',
      middleName: profile.Middle_Name || '',
      lastName: profile.Last_Name || '',
      address: profile.Address || '',
      purok: profile.Purok || '',
      barangay: profile.Barangay || '',
      municipality: profile.Municipality || 'San Lorenzo Ruiz',
      zipCode: profile.Zip_Code || '4610',
      contactNumber: profile.Contact_Number || '',
      email: profile.Email || '',
    });
    setErrors({});
    setIsEditModalOpen(true);
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }
    if (!formData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }
    if (!formData.address.trim()) {
      newErrors.address = 'Address is required';
    }
    if (formData.contactNumber.trim() && !PHONE_PATTERN.test(formData.contactNumber.trim())) {
      newErrors.contactNumber = 'Contact number must be a valid Philippine mobile number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!profile || !validateForm()) return;

    setIsSaving(true);
    try {
      const body = {
        First_Name: formData.firstName,
        Middle_Name: formData.middleName,
        Last_Name: formData.lastName,
        Address: formData.address,
        Purok: formData.purok,
        Barangay: formData.barangay,
        Municipality: formData.municipality,
        Zip_Code: formData.zipCode,
        Contact_Number: normalizePhoneInput(formData.contactNumber),
        Email: formData.email,
      };

      const result = await requestJson<{ success?: boolean; message?: string }>(
        `/consumers/${profile.Consumer_ID}/profile`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        },
        'Failed to update profile.'
      );

      if (result.success !== false) {
        showToast(result.message || 'Profile updated successfully', 'success');
        setIsEditModalOpen(false);
        // Refresh profile data
        setProfile(prev => prev ? { ...prev, ...body } : null);
      } else {
        showToast(result.message || 'Failed to update profile', 'error');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      showToast(getErrorMessage(error, 'Failed to update profile.'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const handleBack = () => { navigate('/consumer'); };

  if (!profile && !loading) {
    return (
      <div className="cp-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#e53935' }}>
          <i className="fas fa-exclamation-circle" style={{ fontSize: 40 }} />
          <p>Failed to load profile information.</p>
        </div>
      </div>
    );
  }

  // Show skeleton/placeholder while loading
  if (!profile) {
    return (
      <div className="cp-page">
        <div className="cp-header">
          <div className="cp-header-info">
            <div className="cp-dashboard-label">San Lorenzo Ruiz Water System</div>
            <h1 className="cp-name">My Profile</h1>
            <div className="cp-meta">
              <span className="cp-meta-item"><i className="fas fa-id-card" /> Account: <strong>...</strong></span>
              <span className="cp-status active"><i className="fas fa-circle" /> Status: ...</span>
            </div>
          </div>
          <div className="cp-header-actions">
            <button className="cp-back-btn" onClick={handleBack}><i className="fas fa-arrow-left" /> Back to Dashboard</button>
            <button className="cp-logout-btn" onClick={handleLogout}><i className="fas fa-sign-out-alt" /> Logout</button>
          </div>
        </div>
        <div className="cp-content">
          <div className="cp-card"><div className="cp-card-header"><h2 className="cp-card-title"><i className="fas fa-user" /> Personal Information</h2></div></div>
          <div className="cp-card"><div className="cp-card-header"><h2 className="cp-card-title"><i className="fas fa-map-marker-alt" /> Address Information</h2></div></div>
          <div className="cp-card cp-card-muted"><div className="cp-card-header"><h2 className="cp-card-title"><i className="fas fa-tint" /> Service Information</h2></div></div>
        </div>
      </div>
    );
  }

  return (
    <div className="cp-page">
      {/* ── Header ── */}
      <div className="cp-header">
        <div className="cp-header-info">
          <div className="cp-dashboard-label">San Lorenzo Ruiz Water System</div>
          <h1 className="cp-name">My Profile</h1>
          <div className="cp-meta">
            <span className="cp-meta-item">
              <i className="fas fa-id-card" /> Account: <strong>{profile.Account_Number}</strong>
            </span>
            <span className={`cp-status ${(profile.Status || '').toLowerCase() === 'active' ? 'active' : 'inactive'}`}>
              <i className="fas fa-circle" /> Status: {profile.Status || 'Unknown'}
            </span>
          </div>
        </div>
        <div className="cp-header-actions">
          <button className="cp-back-btn" onClick={handleBack}>
            <i className="fas fa-arrow-left" /> Back to Dashboard
          </button>
          <button className="cp-logout-btn" onClick={handleLogout}>
            <i className="fas fa-sign-out-alt" /> Logout
          </button>
        </div>
      </div>

      {/* ── Profile Content ── */}
      <div className="cp-content">
        {/* Personal Information Card */}
        <div className="cp-card">
          <div className="cp-card-header">
            <h2 className="cp-card-title">
              <i className="fas fa-user" /> Personal Information
            </h2>
            <button className="cp-edit-btn" onClick={handleOpenEdit}>
              <i className="fas fa-edit" /> Edit Profile
            </button>
          </div>
          <div className="cp-info-grid">
            <div className="cp-info-item">
              <span className="cp-info-label">Full Name</span>
              <span className="cp-info-value">
                {formatName(`${profile.First_Name} ${profile.Middle_Name || ''} ${profile.Last_Name}`)}
              </span>
            </div>
            <div className="cp-info-item">
              <span className="cp-info-label">Account Number</span>
              <span className="cp-info-value">{profile.Account_Number || 'N/A'}</span>
            </div>
            <div className="cp-info-item">
              <span className="cp-info-label">Contact Number</span>
              <span className="cp-info-value">{profile.Contact_Number || 'N/A'}</span>
            </div>
            <div className="cp-info-item">
              <span className="cp-info-label">Email</span>
              <span className="cp-info-value">{profile.Email || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Address Information Card */}
        <div className="cp-card">
          <div className="cp-card-header">
            <h2 className="cp-card-title">
              <i className="fas fa-map-marker-alt" /> Address Information
            </h2>
          </div>
          <div className="cp-info-grid">
            <div className="cp-info-item full-width">
              <span className="cp-info-label">Complete Address</span>
              <span className="cp-info-value">{profile.Address || 'N/A'}</span>
            </div>
            <div className="cp-info-item">
              <span className="cp-info-label">Purok</span>
              <span className="cp-info-value">{profile.Purok || 'N/A'}</span>
            </div>
            <div className="cp-info-item">
              <span className="cp-info-label">Barangay</span>
              <span className="cp-info-value">{profile.Barangay || 'N/A'}</span>
            </div>
            <div className="cp-info-item">
              <span className="cp-info-label">Municipality</span>
              <span className="cp-info-value">{profile.Municipality || 'San Lorenzo Ruiz'}</span>
            </div>
            <div className="cp-info-item">
              <span className="cp-info-label">Zip Code</span>
              <span className="cp-info-value">{profile.Zip_Code || '4610'}</span>
            </div>
          </div>
        </div>

        {/* Service Information Card (Read-only) */}
        <div className="cp-card cp-card-muted">
          <div className="cp-card-header">
            <h2 className="cp-card-title">
              <i className="fas fa-tint" /> Service Information
            </h2>
            <span className="cp-readonly-badge">Read Only</span>
          </div>
          <div className="cp-info-grid">
            <div className="cp-info-item">
              <span className="cp-info-label">Meter Number</span>
              <span className="cp-info-value">{profile.Meter_Number || 'N/A'}</span>
            </div>
            <div className="cp-info-item">
              <span className="cp-info-label">Meter Status</span>
              <span className="cp-info-value">{profile.Meter_Status || 'Active'}</span>
            </div>
            <div className="cp-info-item">
              <span className="cp-info-label">Zone</span>
              <span className="cp-info-value">{profile.Zone_Name || (profile.Zone_ID ? `Zone ${profile.Zone_ID}` : 'N/A')}</span>
            </div>
            <div className="cp-info-item">
              <span className="cp-info-label">Classification</span>
              <span className="cp-info-value">{profile.Classification_Name || 'Residential'}</span>
            </div>
            <div className="cp-info-item">
              <span className="cp-info-label">Connection Date</span>
              <span className="cp-info-value">{formatDate(profile.Connection_Date)}</span>
            </div>
            <div className="cp-info-item">
              <span className="cp-info-label">Connection Status</span>
              <span className={`cp-info-value status-${(profile.Status || '').toLowerCase()}`}>
                {profile.Status || 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Edit Modal ── */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Profile Information"
        size="large"
        footer={
          <div className="cp-modal-footer">
            <button
              className="cp-btn cp-btn-secondary"
              onClick={() => setIsEditModalOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              className="cp-btn cp-btn-primary"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <><i className="fas fa-spinner fa-spin" /> Saving...</>
              ) : (
                <><i className="fas fa-save" /> Save Changes</>
              )}
            </button>
          </div>
        }
      >
        <div className="cp-form-grid">
          <div className="cp-form-section">
            <h3 className="cp-form-section-title">Personal Details</h3>
            <FormInput
              label="First Name"
              value={formData.firstName}
              onChange={(v) => setFormData(prev => ({ ...prev, firstName: v }))}
              required
              error={errors.firstName}
              icon="fa-user"
            />
            <FormInput
              label="Middle Name"
              value={formData.middleName}
              onChange={(v) => setFormData(prev => ({ ...prev, middleName: v }))}
              icon="fa-user"
            />
            <FormInput
              label="Last Name"
              value={formData.lastName}
              onChange={(v) => setFormData(prev => ({ ...prev, lastName: v }))}
              required
              error={errors.lastName}
              icon="fa-user"
            />
            <FormInput
              label="Contact Number"
              value={formData.contactNumber}
              onChange={(v) => setFormData(prev => ({ ...prev, contactNumber: v }))}
              placeholder="09XXXXXXXXX or +639XXXXXXXXX"
              error={errors.contactNumber}
              icon="fa-phone"
            />
            <FormInput
              label="Email"
              type="email"
              value={formData.email}
              onChange={(v) => setFormData(prev => ({ ...prev, email: v }))}
              placeholder="your@email.com"
              icon="fa-envelope"
            />
          </div>

          <div className="cp-form-section">
            <h3 className="cp-form-section-title">Address Details</h3>
            <FormInput
              label="Complete Address"
              value={formData.address}
              onChange={(v) => setFormData(prev => ({ ...prev, address: v }))}
              required
              error={errors.address}
              icon="fa-home"
            />
            <FormSelect
              label="Purok"
              value={formData.purok}
              onChange={(v) => setFormData(prev => ({ ...prev, purok: v }))}
              options={PUROK_OPTIONS.map(p => ({ value: p, label: p }))}
              placeholder="Select Purok"
              icon="fa-map-pin"
            />
            <FormSelect
              label="Barangay"
              value={formData.barangay}
              onChange={(v) => setFormData(prev => ({ ...prev, barangay: v }))}
              options={BARANGAYS.map(b => ({ value: b, label: b }))}
              placeholder="Select Barangay"
              icon="fa-map-marker-alt"
            />
            <FormInput
              label="Municipality"
              value={formData.municipality}
              onChange={(v) => setFormData(prev => ({ ...prev, municipality: v }))}
              disabled
              icon="fa-city"
            />
            <FormInput
              label="Zip Code"
              value={formData.zipCode}
              onChange={(v) => setFormData(prev => ({ ...prev, zipCode: v }))}
              disabled
              icon="fa-mail-bulk"
            />
          </div>
        </div>

        <div className="cp-form-note">
          <i className="fas fa-info-circle" />
          <span>
            Service information (Meter Number, Zone, Classification) cannot be modified. 
            Please contact the waterworks office for changes to these fields.
          </span>
        </div>
      </Modal>
    </div>
  );
};

export default ConsumerProfile;
