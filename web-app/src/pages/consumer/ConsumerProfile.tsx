import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Common/ToastContainer';
import FormInput from '../../components/Common/FormInput';
import FormSelect from '../../components/Common/FormSelect';
import Modal from '../../components/Common/Modal';
import ProfileImageEditor from '../../components/Common/ProfileImageEditor';
import { getErrorMessage, loadConsumerDashboardWithFallback, requestJson } from '../../services/userManagementApi';
import { syncConsumerDashboardFallback } from '../../utils/consumerFallback';
import { getUserInitials } from '../../utils/profileImage';
import './ConsumerProfile.css';

interface ConsumerProfileData {
  Consumer_ID: number;
  First_Name: string;
  Middle_Name?: string | null;
  Last_Name: string;
  Address: string;
  Purok?: string | null;
  Barangay?: string | null;
  Municipality?: string | null;
  Zip_Code?: string | null;
  Zone_ID: number;
  Zone_Name?: string | null;
  Classification_ID: number;
  Classification_Name?: string | null;
  Account_Number: string;
  Meter_Number: string;
  Meter_Status?: string | null;
  Status: string;
  Contact_Number: string;
  Connection_Date: string;
  Username?: string | null;
  Profile_Picture_URL?: string | null;
  Account_Status?: string | null;
}

interface ProfileUpdateResponse {
  success?: boolean;
  queued?: boolean;
  offline?: boolean;
  message?: string;
  data?: Partial<ConsumerProfileData>;
}

const BARANGAYS = [
  'Daculang Bolo',
  'Dagotdotan',
  'Langga',
  'Laniton',
  'Maisog',
  'Mampurog',
  'Manlimonsito',
  'Matacong (Pob.)',
  'Salvacion',
  'San Antonio',
  'San Isidro',
  'San Ramon',
].sort();

const PUROK_OPTIONS = ['Purok 1', 'Purok 2', 'Purok 3', 'Purok 4', 'Purok 5'];
const PHONE_PATTERN = /^(09\d{9}|639\d{9}|\+639\d{9})$/;

const formatNamePart = (value?: string | null) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }

  return trimmed
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const formatConsumerName = (firstName?: string | null, middleName?: string | null, lastName?: string | null) => {
  const fullName = [formatNamePart(firstName), formatNamePart(middleName), formatNamePart(lastName)]
    .filter(Boolean)
    .join(' ')
    .trim();

  return fullName || 'Consumer';
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return 'N/A';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'N/A';
  }

  return parsed.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const normalizePhoneInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const hasLeadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasLeadingPlus ? `+${digits}` : digits;
};

const normalizeComparableValue = (value?: string | null) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/\([^)]*\)/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const resolveSelectValue = (value: string | null | undefined, options: string[]) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }

  const directMatch = options.find((option) => option === trimmed);
  if (directMatch) {
    return directMatch;
  }

  const normalizedInput = normalizeComparableValue(trimmed);
  const normalizedMatch = options.find((option) => normalizeComparableValue(option) === normalizedInput);
  return normalizedMatch || trimmed;
};

const buildOptionList = (value: string | null | undefined, options: string[]) => {
  const resolvedValue = resolveSelectValue(value, options);
  if (!resolvedValue) {
    return options;
  }

  return options.includes(resolvedValue) ? options : [resolvedValue, ...options];
};

const composeAddress = ({
  purok,
  barangay,
  municipality,
  zipCode,
}: {
  purok?: string | null;
  barangay?: string | null;
  municipality?: string | null;
  zipCode?: string | null;
}) => [purok, barangay, municipality, zipCode].filter(Boolean).join(', ');

const statusClassName = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '-');
  return normalized || 'unknown';
};

const ConsumerProfile: React.FC = () => {
  const { user, logout, updateUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<ConsumerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);
  const [draftProfileImage, setDraftProfileImage] = useState<string | null>(user?.profile_picture_url || null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    username: '',
    firstName: '',
    middleName: '',
    lastName: '',
    purok: '',
    barangay: '',
    municipality: 'San Lorenzo Ruiz',
    zipCode: '4610',
    contactNumber: '',
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (!isPhotoModalOpen) {
      setDraftProfileImage(profile?.Profile_Picture_URL || user?.profile_picture_url || null);
    }
  }, [isPhotoModalOpen, profile?.Profile_Picture_URL, user?.profile_picture_url]);

  const loadProfile = useCallback(async (showSpinner = true) => {
    if (!user?.id) {
      setProfile(null);
      setLoading(false);
      return;
    }

    if (showSpinner) {
      setLoading(true);
    }

    try {
      const { data } = await loadConsumerDashboardWithFallback(user.id);
      const consumer = data.consumer;

      if (!consumer) {
        setProfile(null);
        return;
      }

      setProfile({
        Consumer_ID: consumer.Consumer_ID ?? consumer.consumer_id,
        First_Name: consumer.First_Name ?? consumer.first_name ?? '',
        Middle_Name: consumer.Middle_Name ?? consumer.middle_name ?? '',
        Last_Name: consumer.Last_Name ?? consumer.last_name ?? '',
        Address: consumer.Address ?? consumer.address ?? '',
        Purok: resolveSelectValue(consumer.Purok ?? consumer.purok ?? '', PUROK_OPTIONS),
        Barangay: resolveSelectValue(consumer.Barangay ?? consumer.barangay ?? '', BARANGAYS),
        Municipality: String(consumer.Municipality ?? consumer.municipality ?? 'San Lorenzo Ruiz').trim() || 'San Lorenzo Ruiz',
        Zip_Code: String(consumer.Zip_Code ?? consumer.zip_code ?? '4610').trim() || '4610',
        Zone_ID: Number(consumer.Zone_ID ?? consumer.zone_id ?? 0),
        Zone_Name: consumer.Zone_Name ?? consumer.zone_name ?? '',
        Classification_ID: Number(consumer.Classification_ID ?? consumer.classification_id ?? 0),
        Classification_Name: consumer.Classification_Name ?? consumer.classification_name ?? '',
        Account_Number: consumer.Account_Number ?? consumer.account_number ?? '',
        Meter_Number: consumer.Meter_Number ?? consumer.meter_number ?? '',
        Meter_Status: consumer.Meter_Status ?? consumer.meter_status ?? '',
        Status: consumer.Status ?? consumer.status ?? '',
        Contact_Number: consumer.Contact_Number ?? consumer.contact_number ?? '',
        Connection_Date: consumer.Connection_Date ?? consumer.connection_date ?? '',
        Username: consumer.Username ?? consumer.username ?? user.username ?? '',
        Profile_Picture_URL: consumer.Profile_Picture_URL ?? consumer.profile_picture_url ?? user.profile_picture_url ?? null,
        Account_Status: consumer.Account_Status ?? consumer.account_status ?? consumer.Status ?? consumer.status ?? '',
      });
    } catch (error) {
      console.error('Error loading consumer profile:', error);
      showToast(getErrorMessage(error, 'Failed to load profile.'), 'error');
      setProfile(null);
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  }, [showToast, user?.id, user?.profile_picture_url, user?.username]);

  useEffect(() => {
    void loadProfile(true);
  }, [loadProfile]);

  const handleOpenEdit = () => {
    if (!profile) {
      return;
    }

    setFormData({
      username: profile.Username || user?.username || '',
      firstName: profile.First_Name || '',
      middleName: profile.Middle_Name || '',
      lastName: profile.Last_Name || '',
      purok: resolveSelectValue(profile.Purok || '', PUROK_OPTIONS),
      barangay: resolveSelectValue(profile.Barangay || '', BARANGAYS),
      municipality: String(profile.Municipality || 'San Lorenzo Ruiz').trim() || 'San Lorenzo Ruiz',
      zipCode: String(profile.Zip_Code || '4610').trim() || '4610',
      contactNumber: profile.Contact_Number || '',
      password: '',
      confirmPassword: '',
    });
    setErrors({});
    setIsEditModalOpen(true);
  };

  const handleSaveProfileImage = async () => {
    if (!user?.id) {
      showToast('Your account cannot update this profile picture.', 'error');
      return;
    }

    const removePicture = !draftProfileImage;

    setIsSavingPhoto(true);
    try {
      const result = await requestJson<{ success: boolean; message?: string; data?: { Profile_Picture_URL?: string | null } }>(
        `/users/${user.id}/profile-picture`,
        {
          method: 'PUT',
          body: JSON.stringify({
            actorAccountId: user.id,
            actorRoleId: user.role_id,
            profilePictureUrl: draftProfileImage,
            removePicture,
          }),
        },
        'Failed to update profile picture.'
      );

      const nextProfilePicture = result.data?.Profile_Picture_URL ?? (removePicture ? null : draftProfileImage);
      await syncConsumerDashboardFallback(user.id, {
        Consumer_ID: profile?.Consumer_ID,
        consumer_id: profile?.Consumer_ID,
        Profile_Picture_URL: nextProfilePicture,
        profile_picture_url: nextProfilePicture,
      });
      updateUser({ profile_picture_url: nextProfilePicture });
      setProfile((currentProfile) => currentProfile
        ? {
            ...currentProfile,
            Profile_Picture_URL: nextProfilePicture,
          }
        : currentProfile);
      showToast(result.message || (removePicture ? 'Profile picture removed successfully.' : 'Profile picture updated successfully.'), 'success');
      setIsPhotoModalOpen(false);
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to update profile picture.'), 'error');
    } finally {
      setIsSavingPhoto(false);
    }
  };

  const validateForm = () => {
    const nextErrors: Record<string, string> = {};

    if (!formData.username.trim()) {
      nextErrors.username = 'Username is required';
    }

    if (!formData.firstName.trim()) {
      nextErrors.firstName = 'First name is required';
    }

    if (!formData.lastName.trim()) {
      nextErrors.lastName = 'Last name is required';
    }

    if (formData.contactNumber.trim() && !PHONE_PATTERN.test(formData.contactNumber.trim())) {
      nextErrors.contactNumber = 'Contact number must be a valid Philippine mobile number';
    }

    if (formData.password && formData.password.length < 6) {
      nextErrors.password = 'New password must be at least 6 characters long';
    }

    if (formData.password !== formData.confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSave = async () => {
    if (!profile || !validateForm()) {
      return;
    }

    const payload = {
      Username: formData.username.trim(),
      First_Name: formData.firstName.trim(),
      Middle_Name: formData.middleName.trim(),
      Last_Name: formData.lastName.trim(),
      Purok: formData.purok,
      Barangay: formData.barangay,
      Municipality: formData.municipality,
      Zip_Code: formData.zipCode,
      Contact_Number: normalizePhoneInput(formData.contactNumber),
      Password: formData.password,
    };

    setIsSaving(true);
    try {
      const result = await requestJson<ProfileUpdateResponse>(
        `/consumers/${profile.Consumer_ID}/profile`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
        'Failed to update profile.'
      );

      if (result.success === false) {
        showToast(result.message || 'Failed to update profile.', 'error');
        return;
      }

      updateUser({
        username: payload.Username,
        fullName: formatConsumerName(payload.First_Name, payload.Middle_Name, payload.Last_Name),
      });
      const nextAddress = composeAddress(payload);
      await syncConsumerDashboardFallback(user?.id || profile.Consumer_ID, {
        Consumer_ID: profile.Consumer_ID,
        consumer_id: profile.Consumer_ID,
        Username: payload.Username,
        username: payload.Username,
        First_Name: payload.First_Name,
        first_name: payload.First_Name,
        Middle_Name: payload.Middle_Name,
        middle_name: payload.Middle_Name,
        Last_Name: payload.Last_Name,
        last_name: payload.Last_Name,
        Purok: payload.Purok,
        purok: payload.Purok,
        Barangay: payload.Barangay,
        barangay: payload.Barangay,
        Municipality: payload.Municipality,
        municipality: payload.Municipality,
        Zip_Code: payload.Zip_Code,
        zip_code: payload.Zip_Code,
        Contact_Number: payload.Contact_Number,
        contact_number: payload.Contact_Number,
        Address: nextAddress,
        address: nextAddress,
        Profile_Picture_URL: profile.Profile_Picture_URL ?? user?.profile_picture_url ?? null,
        profile_picture_url: profile.Profile_Picture_URL ?? user?.profile_picture_url ?? null,
        Account_Number: profile.Account_Number,
        account_number: profile.Account_Number,
        Status: profile.Status,
        status: profile.Status,
        Account_Status: profile.Account_Status,
        account_status: profile.Account_Status,
        Meter_Number: profile.Meter_Number,
        meter_number: profile.Meter_Number,
        Meter_Status: profile.Meter_Status,
        meter_status: profile.Meter_Status,
        Zone_ID: profile.Zone_ID,
        zone_id: profile.Zone_ID,
        Zone_Name: profile.Zone_Name,
        zone_name: profile.Zone_Name,
        Classification_ID: profile.Classification_ID,
        classification_id: profile.Classification_ID,
        Classification_Name: profile.Classification_Name,
        classification_name: profile.Classification_Name,
        Connection_Date: profile.Connection_Date,
        connection_date: profile.Connection_Date,
      });

      setProfile((currentProfile) => currentProfile
        ? {
            ...currentProfile,
            Username: payload.Username,
            First_Name: payload.First_Name,
            Middle_Name: payload.Middle_Name,
            Last_Name: payload.Last_Name,
            Purok: payload.Purok,
            Barangay: payload.Barangay,
            Municipality: payload.Municipality,
            Zip_Code: payload.Zip_Code,
            Contact_Number: payload.Contact_Number,
            Address: nextAddress,
          }
        : currentProfile);

      setIsEditModalOpen(false);
      showToast(result.message || 'Profile updated successfully.', result.queued ? 'warning' : 'success');
      await loadProfile(false);
    } catch (error) {
      console.error('Error updating consumer profile:', error);
      showToast(getErrorMessage(error, 'Failed to update profile.'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleBack = () => {
    navigate('/consumer');
  };

  if (!profile && !loading) {
    return (
      <div className="cp-page">
        <div className="cp-shell">
          <div className="cp-empty-state">
            <i className="fas fa-exclamation-circle" />
            <h2>Profile unavailable</h2>
            <p>We could not load your consumer profile right now. Please refresh and try again.</p>
            <button className="cp-btn cp-btn-primary" onClick={() => void loadProfile(true)}>
              <i className="fas fa-sync-alt" /> Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="cp-page">
        <div className="cp-shell cp-shell-loading">
          <div className="cp-loading-hero" />
          <div className="cp-loading-grid">
            <div className="cp-loading-card" />
            <div className="cp-loading-card" />
            <div className="cp-loading-card" />
            <div className="cp-loading-card" />
          </div>
        </div>
      </div>
    );
  }

  const displayName = formatConsumerName(profile.First_Name, profile.Middle_Name, profile.Last_Name);
  const profileImage = profile.Profile_Picture_URL || user?.profile_picture_url || null;
  const serviceAddress = profile.Address || composeAddress(profile) || 'No service address saved';
  const loginUsername = profile.Username || user?.username || 'N/A';
  const accountStatus = profile.Account_Status || profile.Status || 'Unknown';
  const editAddressPreview = composeAddress(formData) || 'Select your service location details';
  const purokOptions = buildOptionList(formData.purok, PUROK_OPTIONS);
  const barangayOptions = buildOptionList(formData.barangay, BARANGAYS);

  return (
    <div className="cp-page">
      <div className="cp-shell">
        <section className="cp-hero">
          <div className="cp-hero-main">
            <div className="cp-avatar-panel">
              <button
                type="button"
                className="cp-avatar-trigger"
                onClick={() => setIsPhotoModalOpen(true)}
                title="Update profile picture"
              >
                <div className="cp-avatar">
                  {profileImage ? (
                    <img src={profileImage} alt={`${displayName} profile`} className="cp-avatar-image" />
                  ) : (
                    <span>{getUserInitials(displayName || loginUsername)}</span>
                  )}
                </div>
                <span className="cp-avatar-badge" aria-hidden="true">
                  <i className="fas fa-camera" />
                </span>
              </button>
              <span className="cp-avatar-hint">Tap photo to update</span>
            </div>

            <div className="cp-hero-copy">
              <div className="cp-dashboard-label">Consumer Account Center</div>
              <h1 className="cp-name">{displayName}</h1>
              <p className="cp-subtitle">
                Review your water service details and keep your personal contact information current.
              </p>
            </div>

            <span className={`cp-status-pill cp-hero-status ${statusClassName(accountStatus)}`}>
              <i className="fas fa-circle" /> {accountStatus}
            </span>

            <div className="cp-meta">
              <span className="cp-meta-item">
                <i className="fas fa-file-invoice" /> Account No. <strong>{profile.Account_Number || 'Pending'}</strong>
              </span>
              <span className="cp-meta-item">
                <i className="fas fa-user-circle" /> Username <strong>{loginUsername}</strong>
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
        </section>

        <section className="cp-stat-grid">
          <div className="cp-stat-card">
            <span className="cp-stat-label">Zone</span>
            <strong className="cp-stat-value">{profile.Zone_Name || (profile.Zone_ID ? `Zone ${profile.Zone_ID}` : 'Not assigned')}</strong>
          </div>
          <div className="cp-stat-card">
            <span className="cp-stat-label">Classification</span>
            <strong className="cp-stat-value">{profile.Classification_Name || 'Not assigned'}</strong>
          </div>
          <div className="cp-stat-card">
            <span className="cp-stat-label">Meter Number</span>
            <strong className="cp-stat-value">{profile.Meter_Number || 'Not assigned'}</strong>
          </div>
          <div className="cp-stat-card">
            <span className="cp-stat-label">Connected Since</span>
            <strong className="cp-stat-value">{formatDate(profile.Connection_Date)}</strong>
          </div>
        </section>

        <div className="cp-content cp-content-full">
          <div className="cp-main-column">
            <section className="cp-card">
              <div className="cp-card-header">
                <div>
                  <h2 className="cp-card-title">
                    <i className="fas fa-user" /> Personal Information
                  </h2>
                  <p className="cp-card-subtitle">Details you can review and keep updated for contact purposes.</p>
                </div>
                <button className="cp-edit-btn" onClick={handleOpenEdit}>
                  <i className="fas fa-edit" /> Edit Information
                </button>
              </div>
              <div className="cp-info-grid">
                <div className="cp-info-tile">
                  <span className="cp-info-label">Full Name</span>
                  <span className="cp-info-value">{displayName}</span>
                </div>
                <div className="cp-info-tile">
                  <span className="cp-info-label">Contact Number</span>
                  <span className="cp-info-value">{profile.Contact_Number || 'Not provided'}</span>
                </div>
                <div className="cp-info-tile">
                  <span className="cp-info-label">Username</span>
                  <span className="cp-info-value">{loginUsername}</span>
                </div>
                <div className="cp-info-tile">
                  <span className="cp-info-label">Record Status</span>
                  <span className={`cp-info-value cp-status-text ${statusClassName(accountStatus)}`}>{accountStatus}</span>
                </div>
              </div>
            </section>

            <section className="cp-card">
              <div className="cp-card-header">
                <div>
                  <h2 className="cp-card-title">
                    <i className="fas fa-map-marker-alt" /> Service Address
                  </h2>
                  <p className="cp-card-subtitle">The service location currently registered to your water account.</p>
                </div>
              </div>
              <div className="cp-info-grid">
                <div className="cp-info-tile cp-info-tile-wide">
                  <span className="cp-info-label">Complete Address</span>
                  <span className="cp-info-value">{serviceAddress}</span>
                </div>
                <div className="cp-info-tile">
                  <span className="cp-info-label">Purok</span>
                  <span className="cp-info-value">{profile.Purok || 'Not set'}</span>
                </div>
                <div className="cp-info-tile">
                  <span className="cp-info-label">Barangay</span>
                  <span className="cp-info-value">{profile.Barangay || 'Not set'}</span>
                </div>
                <div className="cp-info-tile">
                  <span className="cp-info-label">Municipality</span>
                  <span className="cp-info-value">{profile.Municipality || 'San Lorenzo Ruiz'}</span>
                </div>
                <div className="cp-info-tile">
                  <span className="cp-info-label">Zip Code</span>
                  <span className="cp-info-value">{profile.Zip_Code || '4610'}</span>
                </div>
              </div>
            </section>

            <section className="cp-card cp-card-muted">
              <div className="cp-card-header">
                <div>
                  <h2 className="cp-card-title">
                    <i className="fas fa-tint" /> Service Information
                  </h2>
                  <p className="cp-card-subtitle">Billing and metering details maintained by the waterworks office.</p>
                </div>
                <span className="cp-readonly-badge">Office Managed</span>
              </div>
              <div className="cp-info-grid">
                <div className="cp-info-tile">
                  <span className="cp-info-label">Meter Number</span>
                  <span className="cp-info-value">{profile.Meter_Number || 'Not assigned'}</span>
                </div>
                <div className="cp-info-tile">
                  <span className="cp-info-label">Meter Status</span>
                  <span className="cp-info-value">{profile.Meter_Status || 'Unknown'}</span>
                </div>
                <div className="cp-info-tile">
                  <span className="cp-info-label">Zone</span>
                  <span className="cp-info-value">{profile.Zone_Name || (profile.Zone_ID ? `Zone ${profile.Zone_ID}` : 'Not assigned')}</span>
                </div>
                <div className="cp-info-tile">
                  <span className="cp-info-label">Classification</span>
                  <span className="cp-info-value">{profile.Classification_Name || 'Not assigned'}</span>
                </div>
                <div className="cp-info-tile">
                  <span className="cp-info-label">Connection Date</span>
                  <span className="cp-info-value">{formatDate(profile.Connection_Date)}</span>
                </div>
                <div className="cp-info-tile">
                  <span className="cp-info-label">Service Status</span>
                  <span className={`cp-info-value cp-status-text ${statusClassName(profile.Status)}`}>{profile.Status || 'Unknown'}</span>
                </div>
              </div>
            </section>
          </div>

        </div>

        <Modal
          isOpen={isPhotoModalOpen}
          onClose={() => setIsPhotoModalOpen(false)}
          title="Update Profile Picture"
          size="small"
          footer={(
            <div className="cp-modal-footer">
              <button
                className="cp-btn cp-btn-secondary"
                onClick={() => setIsPhotoModalOpen(false)}
                disabled={isSavingPhoto}
              >
                Cancel
              </button>
              <button
                className="cp-btn cp-btn-primary"
                onClick={handleSaveProfileImage}
                disabled={isSavingPhoto}
              >
                {isSavingPhoto ? (
                  <><i className="fas fa-spinner fa-spin" /> Saving...</>
                ) : (
                  <><i className="fas fa-save" /> Save Photo</>
                )}
              </button>
            </div>
          )}
        >
          <ProfileImageEditor
            imageUrl={draftProfileImage}
            displayName={displayName || loginUsername}
            onChange={setDraftProfileImage}
            onError={(message) => showToast(message, 'error')}
            helperText="Upload a clear square photo for your consumer profile."
          />
          <div className="cp-form-note">
            <i className="fas fa-info-circle" />
            <span>
              Your photo appears in your consumer profile and account header across the system.
            </span>
          </div>
        </Modal>

        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title="Update My Information"
          size="large"
          footer={(
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
          )}
        >
          <div className="cp-form-grid">
            <section className="cp-form-section cp-form-card cp-form-card-wide">
              <div className="cp-form-section-head">
                <h3 className="cp-form-section-title">Account Access</h3>
                <p className="cp-form-section-copy">Update your sign-in details for the consumer portal.</p>
              </div>
              <div className="cp-form-fields cp-form-fields-account">
                <div className="cp-form-field cp-form-field-wide">
                  <FormInput
                    label="Username"
                    value={formData.username}
                    onChange={(value) => setFormData((current) => ({ ...current, username: value }))}
                    required
                    error={errors.username}
                    icon="fa-user-circle"
                  />
                </div>
                <div className="cp-form-field">
                  <FormInput
                    label="New Password"
                    type="password"
                    value={formData.password}
                    onChange={(value) => setFormData((current) => ({ ...current, password: value }))}
                    placeholder="Leave blank to keep your current password"
                    error={errors.password}
                    icon="fa-lock"
                  />
                </div>
                <div className="cp-form-field">
                  <FormInput
                    label="Confirm New Password"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(value) => setFormData((current) => ({ ...current, confirmPassword: value }))}
                    placeholder="Repeat the new password"
                    error={errors.confirmPassword}
                    icon="fa-shield-alt"
                  />
                </div>
              </div>
            </section>

            <div className="cp-form-subgrid">
              <div className="cp-form-stack">
                <section className="cp-form-section cp-form-card">
                  <div className="cp-form-section-head">
                    <h3 className="cp-form-section-title">Personal Details</h3>
                    <p className="cp-form-section-copy">Keep your name and contact information up to date.</p>
                  </div>
                  <div className="cp-form-fields">
                    <div className="cp-form-field">
                      <FormInput
                        label="First Name"
                        value={formData.firstName}
                        onChange={(value) => setFormData((current) => ({ ...current, firstName: value }))}
                        required
                        error={errors.firstName}
                        icon="fa-user"
                      />
                    </div>
                    <div className="cp-form-field">
                      <FormInput
                        label="Middle Name"
                        value={formData.middleName}
                        onChange={(value) => setFormData((current) => ({ ...current, middleName: value }))}
                        icon="fa-user"
                      />
                    </div>
                    <div className="cp-form-field">
                      <FormInput
                        label="Last Name"
                        value={formData.lastName}
                        onChange={(value) => setFormData((current) => ({ ...current, lastName: value }))}
                        required
                        error={errors.lastName}
                        icon="fa-user"
                      />
                    </div>
                    <div className="cp-form-field">
                      <FormInput
                        label="Contact Number"
                        value={formData.contactNumber}
                        onChange={(value) => setFormData((current) => ({ ...current, contactNumber: value }))}
                        placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                        error={errors.contactNumber}
                        icon="fa-phone"
                      />
                    </div>
                  </div>
                </section>

                <div className="cp-form-note">
                  <i className="fas fa-info-circle" />
                  <span>
                    You can update your username, password, contact details, and service address here. Meter and account settings are handled by the waterworks office.
                  </span>
                </div>
              </div>

              <section className="cp-form-section cp-form-card">
                <div className="cp-form-section-head">
                  <h3 className="cp-form-section-title">Service Address</h3>
                  <p className="cp-form-section-copy">Review the registered location connected to your water service.</p>
                </div>
                <div className="cp-form-fields">
                  <div className="cp-form-field">
                    <FormSelect
                      label="Purok"
                      value={formData.purok}
                      onChange={(value) => setFormData((current) => ({ ...current, purok: value }))}
                      options={purokOptions.map((item) => ({ value: item, label: item }))}
                      placeholder="Select purok"
                      icon="fa-map-pin"
                    />
                  </div>
                  <div className="cp-form-field">
                    <FormSelect
                      label="Barangay"
                      value={formData.barangay}
                      onChange={(value) => setFormData((current) => ({ ...current, barangay: value }))}
                      options={barangayOptions.map((item) => ({ value: item, label: item }))}
                      placeholder="Select barangay"
                      icon="fa-map-marker-alt"
                    />
                  </div>
                  <div className="cp-form-field">
                    <FormInput
                      label="Municipality"
                      value={formData.municipality}
                      onChange={(value) => setFormData((current) => ({ ...current, municipality: value }))}
                      disabled
                      icon="fa-city"
                    />
                  </div>
                  <div className="cp-form-field">
                    <FormInput
                      label="Zip Code"
                      value={formData.zipCode}
                      onChange={(value) => setFormData((current) => ({ ...current, zipCode: value }))}
                      disabled
                      icon="fa-envelope"
                    />
                  </div>
                  <div className="cp-form-field cp-form-field-wide">
                    <div className="cp-address-preview">
                      <span className="cp-info-label">Address Preview</span>
                      <strong>{editAddressPreview}</strong>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default ConsumerProfile;
