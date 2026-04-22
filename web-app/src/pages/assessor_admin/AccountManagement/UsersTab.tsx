import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import DataTable, { Column } from '../../../components/Common/DataTable';
import Modal from '../../../components/Common/Modal';
import FormInput from '../../../components/Common/FormInput';
import FormSelect from '../../../components/Common/FormSelect';
import ProfileImageEditor from '../../../components/Common/ProfileImageEditor';
import TableToolbar from '../../../components/Common/TableToolbar';
import { useToast } from '../../../components/Common/ToastContainer';
import { getErrorMessage, loadRolesWithFallback, loadUnifiedUsersWithFallback, requestJson } from '../../../services/userManagementApi';
import { getUserInitials } from '../../../utils/profileImage';
import '../Users.css';

interface User {
  AccountID: number;
  Username: string;
  Full_Name: string;
  Role_ID: number;
  Role_Name: string;
  Status: 'Active' | 'Pending' | 'Inactive' | 'Rejected';
  Phone_Number?: string;
  Created_At?: string | null;
  Profile_Picture_URL?: string | null;
}

interface Role {
  Role_ID: number;
  Role_Name: string;
}

const SYSTEM_ROLE_IDS = new Set([1, 2, 3, 4]);

const formatDateTime = (value?: string | null) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-PH');
};

const matchesCreatedRange = (value: string | null | undefined, filter: string) => {
  if (!filter) return true;
  if (!value) return filter === 'undated';

  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) {
    return filter === 'undated';
  }

  const now = new Date();
  const daysSinceCreated = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

  switch (filter) {
    case 'last7days':
      return daysSinceCreated <= 7;
    case 'last30days':
      return daysSinceCreated <= 30;
    case 'older':
      return daysSinceCreated > 30;
    case 'undated':
      return false;
    default:
      return true;
  }
};

const UsersTab: React.FC = () => {
  const { user: currentUser, updateUser } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createdFilter, setCreatedFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    password: '',
    roleId: '',
  });
  const [profileImageDraft, setProfileImageDraft] = useState<string | null>(null);
  const [profileImageDirty, setProfileImageDirty] = useState(false);
  const loadRoles = useCallback(async () => {
    try {
      const { data } = await loadRolesWithFallback();
      setRoles(data);
    } catch (error) {
      console.error('Error loading roles:', error);
      showToast(getErrorMessage(error, 'Failed to load roles.'), 'error');
    }
  }, [showToast]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, source } = await loadUnifiedUsersWithFallback();
      setUsers(data.filter((entry: User) => SYSTEM_ROLE_IDS.has(Number(entry.Role_ID))));
      if (source === 'supabase') {
        showToast('Users loaded using Supabase fallback.', 'warning');
      }
    } catch (error) {
      console.error('Error loading users:', error);
      showToast(getErrorMessage(error, 'Failed to load users.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadRoles();
    loadUsers();
  }, [loadRoles, loadUsers]);

  const handleApprove = async (accountId: number) => {
    if (!window.confirm('Are you sure you want to approve this registration?')) return;
    try {
      const result = await requestJson<{ success: boolean; message?: string }>('/admin/approve-user', {
        method: 'POST',
        body: JSON.stringify({ accountId, approvedBy: currentUser?.id }),
      }, 'Failed to approve account.');
      if (result.success) {
        showToast(result.message || 'Account approved successfully', 'success');
        loadUsers();
      } else {
        showToast(result.message || 'Failed to approve account', 'error');
      }
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to approve account.'), 'error');
    }
  };

  const handleReject = async (accountId: number) => {
    if (!window.confirm('Are you sure you want to reject this registration?')) return;
    try {
      const result = await requestJson<{ success: boolean; message?: string }>('/admin/reject-user', {
        method: 'POST',
        body: JSON.stringify({ accountId, approvedBy: currentUser?.id }),
      }, 'Failed to reject account.');
      if (result.success) {
        showToast(result.message || 'Application rejected and deleted successfully', 'success');
        loadUsers();
      } else {
        showToast(result.message || 'Failed to reject account', 'error');
      }
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to reject account.'), 'error');
    }
  };

  const handleDelete = async (user: User) => {
    if (user.AccountID === currentUser?.id) {
      showToast('You cannot delete your own account', 'error');
      return;
    }
    if (!window.confirm(`Delete user "${user.Username}"?`)) return;

    try {
      const result = await requestJson<{ success: boolean; message?: string }>(`/users/${user.AccountID}`, { method: 'DELETE' }, 'Failed to delete user.');
      if (result.success) {
        showToast(result.message || 'User deleted successfully', 'success');
        loadUsers();
      } else {
        showToast(result.message || 'Failed to delete user', 'error');
      }
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to delete user.'), 'error');
    }
  };

  const handleSaveUser = async () => {
    if (!formData.username || (!editingUser && !formData.password) || !formData.roleId) {
      showToast('Username, Role, and Password are required', 'error');
      return;
    }
    try {
      const body = {
        username: formData.username,
        fullName: formData.fullName,
        roleId: parseInt(formData.roleId),
        ...(formData.password && { password: formData.password }),
      };
      const result = await requestJson<{ success: boolean; message?: string; data?: { account_id?: number; accountId?: number } }>(
        editingUser ? `/users/${editingUser.AccountID}` : '/users',
        {
        method: editingUser ? 'PUT' : 'POST',
        body: JSON.stringify(body),
        },
        'Failed to save user.'
      );
      if (result.success) {
        const targetAccountId = editingUser?.AccountID || Number(result.data?.account_id || result.data?.accountId || 0);

        if (profileImageDirty && targetAccountId > 0 && canManageSelectedProfilePicture) {
          const pictureResult = await requestJson<{ data?: { Profile_Picture_URL?: string | null } }>(
            `/users/${targetAccountId}/profile-picture`,
            {
              method: 'PUT',
              body: JSON.stringify({
                actorAccountId: currentUser?.id,
                actorRoleId: currentUser?.role_id,
                profilePictureUrl: profileImageDraft,
                removePicture: !profileImageDraft,
              }),
            },
            'Failed to update profile picture.'
          );

          if (targetAccountId === currentUser?.id) {
            updateUser({
              profile_picture_url: pictureResult.data?.Profile_Picture_URL ?? (profileImageDraft || null),
            });
          }
        }

        showToast(result.message || (editingUser ? 'User updated' : 'User created'), 'success');
        setIsModalOpen(false);
        setProfileImageDirty(false);
        loadUsers();
      } else {
        showToast(result.message || 'Failed to save user', 'error');
      }
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to save user.'), 'error');
    }
  };

  const filteredUsers = users.filter(u => {
    const normalizedQuery = searchQuery.toLowerCase();
    const matchesSearch = [
      u.AccountID,
      u.Username,
      u.Full_Name,
      u.Role_Name,
      u.Status,
    ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
    const matchesRole = !roleFilter || u.Role_ID.toString() === roleFilter;
    const matchesStatus = !statusFilter || u.Status === statusFilter;
    const matchesCreated = matchesCreatedRange(u.Created_At, createdFilter);
    return matchesSearch && matchesRole && matchesStatus && matchesCreated;
  });
  const selectedRoleId = Number(formData.roleId || editingUser?.Role_ID || 0);
  const canManageSelectedProfilePicture = [1, 2, 3, 4].includes(selectedRoleId);

  const columns: Column[] = [
    {
      key: 'Profile_Picture_URL',
      label: 'Profile',
      render: (_, row: User) => (
        <div className="table-avatar" title={row.Full_Name || row.Username}>
          {row.Profile_Picture_URL ? (
            <img src={row.Profile_Picture_URL} alt={`${row.Full_Name || row.Username} profile`} className="table-avatar-image" />
          ) : (
            <span>{getUserInitials(row.Full_Name || row.Username)}</span>
          )}
        </div>
      ),
    },
    { key: 'AccountID', label: 'Account ID', sortable: true },
    { key: 'Username', label: 'Username', sortable: true },
    { key: 'Full_Name', label: 'Full Name', sortable: true },
    { key: 'Role_Name', label: 'Role', sortable: true },
    {
      key: 'Created_At',
      label: 'Created',
      sortable: true,
      render: (value: string | null) => formatDateTime(value),
    },
    {
      key: 'Status',
      label: 'Status',
      render: (_, row: User) => (
        <span className={`status-badge ${row.Status.toLowerCase()}`}>{row.Status}</span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row: User) => (
        <div className="action-buttons-inline">
          {row.Status === 'Pending' && (
            <>
              <button className="btn-icon btn-success" title="Approve" onClick={() => handleApprove(row.AccountID)}><i className="fas fa-check"></i></button>
              <button className="btn-icon btn-danger" title="Reject" onClick={() => handleReject(row.AccountID)}><i className="fas fa-times"></i></button>
            </>
          )}
          <button className="btn-icon" title="Edit" onClick={() => {
            setEditingUser(row);
            setFormData({ username: row.Username, fullName: row.Full_Name || '', roleId: row.Role_ID.toString(), password: '' });
            setProfileImageDraft(row.Profile_Picture_URL || null);
            setProfileImageDirty(false);
            setIsModalOpen(true);
          }}><i className="fas fa-edit"></i></button>
          {row.Status !== 'Pending' && (
            <button className="btn-icon btn-danger" title="Delete" onClick={() => handleDelete(row)}><i className="fas fa-trash"></i></button>
          )}
        </div>
      ),
    },
  ];

  const roleOptions = roles
    .filter((role) => SYSTEM_ROLE_IDS.has(Number(role.Role_ID)))
    .map(r => ({ value: r.Role_ID, label: r.Role_Name }));
  const userStatusOptions = [
    { value: 'Active', label: 'Active' },
    { value: 'Pending', label: 'Pending' },
    { value: 'Inactive', label: 'Inactive' },
    { value: 'Rejected', label: 'Rejected' },
  ];
  const createdDateOptions = [
    { value: 'last7days', label: 'Created Last 7 Days' },
    { value: 'last30days', label: 'Created Last 30 Days' },
    { value: 'older', label: 'Created Earlier' },
    { value: 'undated', label: 'No Created Date' },
  ];
  const hasActiveFilters = Boolean(searchQuery.trim() || roleFilter || statusFilter || createdFilter);
  const clearFilters = () => {
    setSearchQuery('');
    setRoleFilter('');
    setStatusFilter('');
    setCreatedFilter('');
  };

  return (
    <div className="users-tab">
      <TableToolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by account ID, username, full name, role, or status..."
        quickFilters={
          <>
            <FormSelect
              label=""
              value={roleFilter}
              onChange={setRoleFilter}
              options={roleOptions}
              placeholder="All Roles"
            />
            <FormSelect
              label=""
              value={statusFilter}
              onChange={setStatusFilter}
              options={userStatusOptions}
              placeholder="All Statuses"
            />
            <FormSelect
              label=""
              value={createdFilter}
              onChange={setCreatedFilter}
              options={createdDateOptions}
              placeholder="All Created Dates"
            />
          </>
        }
        actions={
          <>
            <button className="btn btn-primary" onClick={() => { setEditingUser(null); setFormData({ username: '', fullName: '', password: '', roleId: '' }); setProfileImageDraft(null); setProfileImageDirty(false); setIsModalOpen(true); }}><i className="fas fa-user-plus"></i> Add User</button>
            <button className="btn btn-secondary" onClick={loadUsers} title="Refresh"><i className="fas fa-sync-alt"></i></button>
          </>
        }
        loading={loading}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
      />

      <div className="users-card">
        <DataTable columns={columns} data={filteredUsers} loading={loading} emptyMessage="No staff accounts found." />
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingUser ? 'Edit System User' : 'Register New User'} size="medium"
        footer={<><button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSaveUser}><i className="fas fa-save"></i> Save User</button></>}>
        {canManageSelectedProfilePicture ? (
          <ProfileImageEditor
            imageUrl={profileImageDraft}
            displayName={formData.fullName || formData.username || 'User'}
            onChange={(value) => {
              setProfileImageDraft(value);
              setProfileImageDirty(true);
            }}
            onError={(message) => showToast(message, 'error')}
            helperText="Admin can upload, replace, or remove the profile picture for this staff account."
            compact
          />
        ) : (
          <p className="profile-picture-note">
            Profile picture management is currently enabled for staff accounts only.
          </p>
        )}
        <FormInput label="Username" value={formData.username} onChange={(v) => setFormData({ ...formData, username: v })} required disabled={!!editingUser} />
        <FormInput label="Full Name" value={formData.fullName} onChange={(v) => setFormData({ ...formData, fullName: v })} />
        <FormSelect label="Assigned Role" value={formData.roleId} onChange={(v) => setFormData({ ...formData, roleId: v })} options={roleOptions} required />
        <FormInput label={editingUser ? 'Reset Password (Optional)' : 'Password'} type="password" value={formData.password} onChange={(v) => setFormData({ ...formData, password: v })} required={!editingUser} />
      </Modal>
    </div>
  );
};

export default UsersTab;
