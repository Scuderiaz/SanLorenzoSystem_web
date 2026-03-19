import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable, { Column } from '../../components/Common/DataTable';
import Tabs, { Tab } from '../../components/Common/Tabs';
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
  Password?: string;
}

interface Role {
  Role_ID: number;
  Role_Name: string;
}

const Users: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [desktopUsers, setDesktopUsers] = useState<User[]>([]);
  const [mobileUsers, setMobileUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
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
    loadUsers('desktop');
    loadUsers('mobile');
  }, []);

  const loadRoles = async () => {
    try {
      const response = await fetch(`${API_URL}/roles`);
      const result = await response.json();
      if (result.success) {
        setRoles(result.data);
      }
    } catch (error) {
      console.error('Error loading roles:', error);
    }
  };

  const loadUsers = async (type: 'desktop' | 'mobile') => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/users/type/${type}`);
      const result = await response.json();
      
      if (result.success) {
        if (type === 'desktop') {
          setDesktopUsers(result.data);
        } else {
          setMobileUsers(result.data);
        }
      } else {
        showToast(result.message || 'Failed to load users', 'error');
      }
    } catch (error) {
      console.error(`Error loading ${type} users:`, error);
      showToast(`Failed to load ${type} users`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      fullName: '',
      password: '',
      roleId: '',
    });
    setIsModalOpen(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.Username,
      fullName: user.Full_Name || '',
      password: '',
      roleId: user.Role_ID.toString(),
    });
    setIsModalOpen(true);
  };

  const handleDeleteUser = async (user: User) => {
    if (!window.confirm(`Are you sure you want to delete user "${user.Username}"?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/users/${user.AccountID}`, {
        method: 'DELETE',
      });
      const result = await response.json();

      if (result.success) {
        showToast('User deleted successfully', 'success');
        loadUsers('desktop');
        loadUsers('mobile');
      } else {
        showToast(result.message || 'Failed to delete user', 'error');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      showToast('Failed to delete user', 'error');
    }
  };

  const handleSaveUser = async () => {
    if (!formData.username || !formData.roleId) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    if (!editingUser && !formData.password) {
      showToast('Password is required for new users', 'error');
      return;
    }

    try {
      const url = editingUser
        ? `${API_URL}/users/${editingUser.AccountID}`
        : `${API_URL}/users`;
      
      const method = editingUser ? 'PUT' : 'POST';
      
      const body: any = {
        username: formData.username,
        fullName: formData.fullName,
        roleId: parseInt(formData.roleId),
      };

      if (formData.password) {
        body.password = formData.password;
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (result.success) {
        showToast(
          editingUser ? 'User updated successfully' : 'User created successfully',
          'success'
        );
        setIsModalOpen(false);
        loadUsers('desktop');
        loadUsers('mobile');
      } else {
        showToast(result.message || 'Failed to save user', 'error');
      }
    } catch (error) {
      console.error('Error saving user:', error);
      showToast('Failed to save user', 'error');
    }
  };

  const desktopColumns: Column[] = [
    { key: 'Username', label: 'Username', sortable: true },
    { key: 'Full_Name', label: 'Full Name', sortable: true },
    { key: 'Role_Name', label: 'Role', sortable: true },
    {
      key: 'Status',
      label: 'Status',
      render: () => <span className="status-active">Active</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row: User) => (
        <div className="action-buttons-inline">
          <button
            className="btn-icon"
            title="Edit User"
            onClick={() => handleEditUser(row)}
          >
            <i className="fas fa-edit"></i>
          </button>
          <button
            className="btn-icon btn-danger"
            title="Delete User"
            onClick={() => handleDeleteUser(row)}
          >
            <i className="fas fa-trash"></i>
          </button>
        </div>
      ),
    },
  ];

  const mobileColumns: Column[] = [
    { key: 'Username', label: 'Username', sortable: true },
    { key: 'Full_Name', label: 'Full Name', sortable: true },
    { key: 'Role_Name', label: 'User Type', sortable: true },
    {
      key: 'Status',
      label: 'Status',
      render: () => <span className="status-active">Active</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row: User) => (
        <div className="action-buttons-inline">
          <button
            className="btn-icon"
            title="Edit User"
            onClick={() => handleEditUser(row)}
          >
            <i className="fas fa-edit"></i>
          </button>
          <button
            className="btn-icon btn-danger"
            title="Delete User"
            onClick={() => handleDeleteUser(row)}
          >
            <i className="fas fa-trash"></i>
          </button>
        </div>
      ),
    },
  ];

  const tabs: Tab[] = [
    {
      id: 'desktop',
      label: 'Desktop Users',
      content: (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Desktop System Users</h2>
          </div>
          <div className="card-body">
            <DataTable
              columns={desktopColumns}
              data={desktopUsers}
              loading={loading}
              emptyMessage="No desktop users found"
            />
          </div>
        </div>
      ),
    },
    {
      id: 'mobile',
      label: 'Mobile Users',
      content: (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Mobile App Users</h2>
          </div>
          <div className="card-body">
            <DataTable
              columns={mobileColumns}
              data={mobileUsers}
              loading={loading}
              emptyMessage="No mobile users found"
            />
          </div>
        </div>
      ),
    },
  ];

  const roleOptions = roles.map((role) => ({
    value: role.Role_ID,
    label: role.Role_Name,
  }));

  return (
    <MainLayout title="Manage Users">
      <div className="users-page">
        <div className="action-buttons">
          <button className="btn btn-primary" onClick={handleAddUser}>
            <i className="fas fa-user-plus"></i> Add New User
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              loadUsers('desktop');
              loadUsers('mobile');
              showToast('User list refreshed', 'success');
            }}
          >
            <i className="fas fa-sync-alt"></i> Refresh
          </button>
        </div>

        <Tabs tabs={tabs} defaultTab="desktop" />

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingUser ? 'Edit User' : 'Add New User'}
          size="medium"
          footer={
            <>
              <button
                className="btn btn-secondary"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveUser}>
                <i className="fas fa-save"></i> Save
              </button>
            </>
          }
        >
          <FormInput
            label="Username"
            value={formData.username}
            onChange={(value) => setFormData({ ...formData, username: value })}
            required
            icon="fa-user"
            disabled={!!editingUser}
          />
          <FormInput
            label="Full Name"
            value={formData.fullName}
            onChange={(value) => setFormData({ ...formData, fullName: value })}
            icon="fa-id-card"
          />
          <FormSelect
            label="Role"
            value={formData.roleId}
            onChange={(value) => setFormData({ ...formData, roleId: value })}
            options={roleOptions}
            required
            icon="fa-user-tag"
          />
          <FormInput
            label={editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
            type="password"
            value={formData.password}
            onChange={(value) => setFormData({ ...formData, password: value })}
            required={!editingUser}
            icon="fa-lock"
          />
        </Modal>
      </div>
    </MainLayout>
  );
};

export default Users;
