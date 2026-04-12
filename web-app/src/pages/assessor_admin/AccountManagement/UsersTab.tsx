import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import DataTable, { Column } from '../../../components/Common/DataTable';
import Modal from '../../../components/Common/Modal';
import FormInput from '../../../components/Common/FormInput';
import FormSelect from '../../../components/Common/FormSelect';
import { useToast } from '../../../components/Common/ToastContainer';
import { getErrorMessage, loadRolesWithFallback, loadUnifiedUsersWithFallback, requestJson } from '../../../services/userManagementApi';
import '../Users.css';

interface User {
  AccountID: number;
  Username: string;
  Full_Name: string;
  Role_ID: number;
  Role_Name: string;
  Status: 'Active' | 'Pending' | 'Inactive' | 'Rejected';
  Phone_Number?: string;
}

interface Role {
  Role_ID: number;
  Role_Name: string;
}

const UsersTab: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
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
  useEffect(() => {
    loadRoles();
    loadUsers();
  }, []);

  const loadRoles = async () => {
    try {
      const { data } = await loadRolesWithFallback();
      setRoles(data);
    } catch (error) {
      console.error('Error loading roles:', error);
      showToast(getErrorMessage(error, 'Failed to load roles.'), 'error');
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data, source } = await loadUnifiedUsersWithFallback();
      setUsers(data);
      if (source === 'supabase') {
        showToast('Users loaded using Supabase fallback.', 'warning');
      }
    } catch (error) {
      console.error('Error loading users:', error);
      showToast(getErrorMessage(error, 'Failed to load users.'), 'error');
    } finally {
      setLoading(false);
    }
  };

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
      const result = await requestJson<{ success: boolean; message?: string }>(
        editingUser ? `/users/${editingUser.AccountID}` : '/users',
        {
        method: editingUser ? 'PUT' : 'POST',
        body: JSON.stringify(body),
        },
        'Failed to save user.'
      );
      if (result.success) {
        showToast(result.message || (editingUser ? 'User updated' : 'User created'), 'success');
        setIsModalOpen(false);
        loadUsers();
      } else {
        showToast(result.message || 'Failed to save user', 'error');
      }
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to save user.'), 'error');
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.Username.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         u.Full_Name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.Role_ID.toString() === roleFilter;
    const matchesStatus = statusFilter === 'all' || u.Status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const columns: Column[] = [
    { key: 'Username', label: 'Username', sortable: true },
    { key: 'Full_Name', label: 'Full Name', sortable: true },
    { key: 'Role_Name', label: 'Role', sortable: true },
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
            setIsModalOpen(true);
          }}><i className="fas fa-edit"></i></button>
          {row.Status !== 'Pending' && (
            <button className="btn-icon btn-danger" title="Delete" onClick={() => handleDelete(row)}><i className="fas fa-trash"></i></button>
          )}
        </div>
      ),
    },
  ];

  const roleOptions = roles.map(r => ({ value: r.Role_ID, label: r.Role_Name }));

  return (
    <div className="users-tab">
      <div className="filter-bar" style={{ marginBottom: '20px' }}>
        <div className="search-box">
          <i className="fas fa-search"></i>
          <input type="text" placeholder="Search staff by name or username..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <div className="filters">
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All Roles</option>
            {roles.map(r => <option key={r.Role_ID} value={r.Role_ID}>{r.Role_Name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="Active">Active</option>
            <option value="Pending">Pending</option>
            <option value="Inactive">Inactive</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
        <div className="main-actions">
          <button className="btn btn-primary" onClick={() => { setEditingUser(null); setFormData({ username: '', fullName: '', password: '', roleId: '' }); setIsModalOpen(true); }}><i className="fas fa-user-plus"></i> Add User</button>
          <button className="btn btn-secondary" onClick={loadUsers} title="Refresh"><i className="fas fa-sync-alt"></i></button>
        </div>
      </div>

      <div className="users-card">
        <DataTable columns={columns} data={filteredUsers} loading={loading} emptyMessage="No staff accounts found." />
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingUser ? 'Edit System User' : 'Register New User'} size="medium"
        footer={<><button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSaveUser}><i className="fas fa-save"></i> Save User</button></>}>
        <FormInput label="Username" value={formData.username} onChange={(v) => setFormData({ ...formData, username: v })} required disabled={!!editingUser} />
        <FormInput label="Full Name" value={formData.fullName} onChange={(v) => setFormData({ ...formData, fullName: v })} />
        <FormSelect label="Assigned Role" value={formData.roleId} onChange={(v) => setFormData({ ...formData, roleId: v })} options={roleOptions} required />
        <FormInput label={editingUser ? 'Reset Password (Optional)' : 'Password'} type="password" value={formData.password} onChange={(v) => setFormData({ ...formData, password: v })} required={!editingUser} />
      </Modal>
    </div>
  );
};

export default UsersTab;
