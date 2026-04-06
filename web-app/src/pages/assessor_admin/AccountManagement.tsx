import React from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import Tabs, { Tab } from '../../components/Common/Tabs';
import ConcessionairesTab from './AccountManagement/ConcessionairesTab';
import UsersTab from './AccountManagement/UsersTab';
import './AccountManagement.css';

const AccountManagement: React.FC = () => {
  const tabs: Tab[] = [
    {
      id: 'concessionaires',
      label: 'Concessionaires',
      content: <ConcessionairesTab />,
    },
    {
      id: 'users',
      label: 'System Users',
      content: <UsersTab />,
    },
  ];

  return (
    <MainLayout title="Account Management">
      <div className="account-management-page">
        <div className="management-header">
          <p className="subtitle">Manage system staff and registered concessionaires in one centralized hub.</p>
        </div>
        
        <div className="card shadow-sm border-0">
          <div className="card-body p-0">
            <Tabs tabs={tabs} defaultTab="concessionaires" />
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default AccountManagement;
