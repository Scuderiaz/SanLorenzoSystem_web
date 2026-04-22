import React, { useId, useRef } from 'react';
import { convertProfileImageFile, getUserInitials } from '../../utils/profileImage';
import './ProfileImageEditor.css';

interface ProfileImageEditorProps {
  imageUrl: string | null;
  displayName: string;
  onChange: (nextImageUrl: string | null) => void;
  onError: (message: string) => void;
  label?: string;
  helperText?: string;
  disabled?: boolean;
  compact?: boolean;
}

const ProfileImageEditor: React.FC<ProfileImageEditorProps> = ({
  imageUrl,
  displayName,
  onChange,
  onError,
  label = 'Profile Picture',
  helperText = 'Upload a square photo for the profile badge.',
  disabled = false,
  compact = false,
}) => {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const normalizedImage = await convertProfileImageFile(file);
      onChange(normalizedImage);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to prepare the selected image.');
    }
  };

  return (
    <div className={`profile-image-editor ${compact ? 'profile-image-editor-compact' : ''}`}>
      <div className="profile-image-editor-header">
        <label className="profile-image-editor-label" htmlFor={inputId}>{label}</label>
        <span className="profile-image-editor-help">{helperText}</span>
      </div>

      <div className="profile-image-editor-body">
        <div className="profile-image-preview" aria-label={`${displayName} profile picture preview`}>
          {imageUrl ? (
            <img src={imageUrl} alt={`${displayName} profile`} className="profile-image-preview-photo" />
          ) : (
            <div className="profile-image-preview-fallback">{getUserInitials(displayName)}</div>
          )}
        </div>

        <div className="profile-image-editor-actions">
          <input
            id={inputId}
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="profile-image-file-input"
            onChange={handleFileChange}
            disabled={disabled}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            <i className="fas fa-upload"></i> Upload Photo
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onChange(null)}
            disabled={disabled || !imageUrl}
          >
            <i className="fas fa-trash-alt"></i> Remove
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileImageEditor;
