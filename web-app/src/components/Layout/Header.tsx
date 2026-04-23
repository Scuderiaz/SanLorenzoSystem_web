import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Modal from '../Common/Modal';
import ProfileImageEditor from '../Common/ProfileImageEditor';
import { useToast } from '../Common/ToastContainer';
import { requestJson } from '../../services/userManagementApi';
import { syncConsumerDashboardFallback } from '../../utils/consumerFallback';
import { getUserInitials } from '../../utils/profileImage';
import './Header.css';

interface HeaderProps {
  title?: string;
}

const Header: React.FC<HeaderProps> = ({ title = 'Dashboard' }) => {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [draftProfileImage, setDraftProfileImage] = useState<string | null>(user?.profile_picture_url || null);
  const [isSavingProfileImage, setIsSavingProfileImage] = useState(false);

  const roleLabels: { [key: number]: string } = {
    1: 'Assessor Admin',
    2: 'Billing Officer',
    3: 'Meter Reader',
    4: 'Cashier / Treasurer',
    5: 'Consumer',
  };

  useEffect(() => {
    if (!isProfileModalOpen) {
      setDraftProfileImage(user?.profile_picture_url || null);
    }
  }, [isProfileModalOpen, user?.profile_picture_url]);

  const canManageOwnProfilePicture = [1, 2, 3, 4, 5].includes(Number(user?.role_id || 0));

  const handleSaveProfileImage = async () => {
    if (!user?.id || !canManageOwnProfilePicture) {
      showToast('Your account cannot update this profile picture.', 'error');
      return;
    }

    const removePicture = !draftProfileImage;

    setIsSavingProfileImage(true);
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
      if (Number(user.role_id) === 5) {
        await syncConsumerDashboardFallback(user.id, {
          Profile_Picture_URL: nextProfilePicture,
          profile_picture_url: nextProfilePicture,
        });
      }
      updateUser({ profile_picture_url: nextProfilePicture });
      showToast(result.message || (removePicture ? 'Profile picture removed successfully.' : 'Profile picture updated successfully.'), 'success');
      setIsProfileModalOpen(false);
    } catch (error: any) {
      showToast(error.message || 'Failed to update profile picture.', 'error');
    } finally {
      setIsSavingProfileImage(false);
    }
  };

  return (
    <>
      <div className="header">
        <div className="header-left">
          <h1 className="page-title">{title}</h1>
        </div>
        
        <div className="header-right">
          <button
            type="button"
            className={`user-profile ${canManageOwnProfilePicture ? 'user-profile-clickable' : ''}`}
            onClick={() => canManageOwnProfilePicture && setIsProfileModalOpen(true)}
            title={canManageOwnProfilePicture ? 'Update profile picture' : undefined}
          >
            <div className="avatar">
              {user?.profile_picture_url ? (
                <img src={user.profile_picture_url} alt={`${user.fullName || user.username || 'User'} profile`} className="avatar-image" />
              ) : (
                getUserInitials(user?.fullName || user?.username || 'A')
              )}
            </div>
            <div className="user-info">
              <span className="user-name">{user?.fullName || user?.username || 'User'}</span>
              <span className="user-role">{roleLabels[user?.role_id!] || 'Staff'}</span>
            </div>
          </button>
        </div>
      </div>

      <Modal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        title="Update Profile Picture"
        size="small"
        footer={(
          <>
            <button className="btn btn-secondary" onClick={() => setIsProfileModalOpen(false)} disabled={isSavingProfileImage}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSaveProfileImage} disabled={isSavingProfileImage}>
              <i className="fas fa-save"></i> {isSavingProfileImage ? 'Saving...' : 'Save Photo'}
            </button>
          </>
        )}
      >
        <ProfileImageEditor
          imageUrl={draftProfileImage}
          displayName={user?.fullName || user?.username || 'User'}
          onChange={setDraftProfileImage}
          onError={(message) => showToast(message, 'error')}
          helperText="Upload a clear square photo for your account profile."
        />
        <p className="profile-modal-note">
          This photo will appear in the header badge and other account views that use your profile.
        </p>
      </Modal>
    </>
  );
};

export default Header;
