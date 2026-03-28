import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable, { Column } from '../../components/Common/DataTable';
import Modal from '../../components/Common/Modal';
import FormInput from '../../components/Common/FormInput';
import FormSelect from '../../components/Common/FormSelect';
import { useToast } from '../../components/Common/ToastContainer';
import './Users.css';

interface User {
  AccountID: number;
  Username: string;
  Full_Name: string;
  Role_ID: number;
  Role_Name: string;
  Status: 'Active' | 'Pending' | 'Inactive';
  Phone_Number?: string;
}

interface Role {
  Role_ID: number;
  Role_Name: string;
}

const Users: React.FC = () => {
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

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

  useEffect(() => {
    loadRoles();
    loadUsers();
  }, []);

  const loadRoles = async () => {
    try {
      const response = await fetch(`${API_URL}/roles`);
      const result = await response.json();
      if (result.success) setRoles(result.data);
    } catch (error) {
      console.error('Error loading roles:', error);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/users/unified`);
      const result = await response.json();
      if (result.success) {
        setUsers(result.data);
      } else {
        showToast(result.message || 'Failed to load users', 'error');
      }
    } catch (error) {
      console.error('Error loading users:', error);
      showToast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (accountId: number) => {
    if (!window.confirm('Are you sure you want to approve this consumer registration?')) return;
    try {
      const res = await fetch(`${API_URL}/admin/approve-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      const result = await res.json();
      if (result.success) {
        showToast('Account approved successfully', 'success');
        loadUsers();
      } else {
        showToast(result.message || 'Failed to approve account', 'error');
      }
    } catch (error) {
      showToast('Error approving account', 'error');
    }
  };

  const handleReject = async (accountId: number) => {
    if (!window.confirm('Are you sure you want to reject this registration? This will delete the account.')) return;
    try {
      const res = await fetch(`${API_URL}/admin/reject-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      const result = await res.json();
      if (result.success) {
        showToast('Account rejected and deleted', 'success');
        loadUsers();
      } else {
        showToast(result.message || 'Failed to reject account', 'error');
      }
    } catch (error) {
      showToast('Error rejecting account', 'error');
    }
  };

  const handleDelete = async (user: User) => {
    if (user.AccountID === currentUser?.id) {
      showToast('You cannot delete your own account', 'error');
      return;
    }
    if (!window.confirm(`Delete user "${user.Username}"?`)) return;

    try {
      const response = await fetch(`${API_URL}/users/${user.AccountID}`, { method: 'DELETE' });
      const result = await response.json();
      if (result.success) {
        showToast('User deleted successfully', 'success');
        loadUsers();
      } else {
        showToast(result.message || 'Failed to delete user', 'error');
      }
    } catch (error) {
      showToast('Failed to delete user', 'error');
    }
  };

  const handleSaveUser = async () => {
    if (!formData.username || (!editingUser && !formData.password) || !formData.roleId) {
      showToast('Username, Role, and Password are required', 'error');
      return;
    }
    try {
      const url = editingUser ? `${API_URL}/users/${editingUser.AccountID}` : `${API_URL}/users`;
      const method = editingUser ? 'PUT' : 'POST';
      const body = {
        username: formData.username,
        fullName: formData.fullName,
        roleId: parseInt(formData.roleId),
        ...(formData.password && { password: formData.password }),
      };
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (result.success) {
        showToast(editingUser ? 'User updated' : 'User created', 'success');
        setIsModalOpen(false);
        loadUsers();
      } else {
        showToast(result.message, 'error');
      }
    } catch (error) {
      showToast('Failed to save user', 'error');
    }
  };

  // Filter Logic
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
        <span className={`status-badge ${row.Status.toLowerCase()}`}>
          {row.Status}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row: User) => (
        <div className="action-buttons-inline">
          {row.Status === 'Pending' && (
            <>
              <button className="btn-icon btn-success" title="Approve Registration" onClick={() => handleApprove(row.AccountID)}>
                <i className="fas fa-check"></i>
              </button>
              <button className="btn-icon btn-danger" title="Reject Registration" onClick={() => handleReject(row.AccountID)}>
                <i className="fas fa-times"></i>
              </button>
            </>
          )}
          <button className="btn-icon" title="Edit User" onClick={() => {
            setEditingUser(row);
            setFormData({ username: row.Username, fullName: row.Full_Name || '', roleId: row.Role_ID.toString(), password: '' });
            setIsModalOpen(true);
          }}>
            <i className="fas fa-edit"></i>
          </button>
          {row.Status !== 'Pending' && (
            <button className="btn-icon btn-danger" title="Delete User" onClick={() => handleDelete(row)}>
              <i className="fas fa-trash"></i>
            </button>
          )}
        </div>
      ),
    },
  ];

  const roleOptions = roles.map(r => ({ value: r.Role_ID, label: r.Role_Name }));

  return (
    <MainLayout title="User Management">
      <div className="users-page">
        {/* Filter Bar */}
        <div className="filter-bar">
          <div className="search-box">
            <i className="fas fa-search"></i>
            <input 
              type="text" 
              placeholder="Search by name or username..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="filters">
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">Role: All</option>
              {roles.map(r => <option key={r.Role_ID} value={r.Role_ID}>{r.Role_Name}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Status: All</option>
              <option value="Active">Active</option>
              <option value="Pending">Pending</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          <div className="main-actions">
            <button className="btn btn-primary" onClick={() => {
              setEditingUser(null);
              setFormData({ username: '', fullName: '', password: '', roleId: '' });
              setIsModalOpen(true);
            }}>
              <i className="fas fa-user-plus"></i> Add User
            </button>
            <button className="btn btn-secondary" onClick={loadUsers} title="Refresh Data">
              <i className="fas fa-sync-alt"></i>
            </button>
          </div>
        </div>

        <div className="users-card">
          <div className="card-body">
            <DataTable
              columns={columns}
              data={filteredUsers}
              loading={loading}
              emptyMessage="No matching users found."
            />
          </div>
        </div>

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingUser ? 'Edit User' : 'Add New User'}
          size="medium"
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveUser}>
                <i className="fas fa-save"></i> Save
              </button>
            </>
          }
        >
          <FormInput
            label="Username"
            value={formData.username}
            onChange={(v) => setFormData({ ...formData, username: v })}
            required
            disabled={!!editingUser}
          />
          <FormInput
            label="Full Name"
            value={formData.fullName}
            onChange={(v) => setFormData({ ...formData, fullName: v })}
          />
          <FormSelect
            label="Role"
            value={formData.roleId}
            onChange={(v) => setFormData({ ...formData, roleId: v })}
            options={roleOptions}
            required
          />
          <FormInput
            label={editingUser ? 'New Password (Optional)' : 'Password'}
            type="password"
            value={formData.password}
            onChange={(v) => setFormData({ ...formData, password: v })}
            required={!editingUser}
          />
        </Modal>
      </div>
    </MainLayout>
  );
};

export default Users;
