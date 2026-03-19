import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import './MainLayout.css';

interface MainLayoutProps {
  children: React.ReactNode;
  title?: string;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, title }) => {
  return (
    <div className="main-layout">
      <Sidebar />
      <div className="content-wrapper">
        <Header title={title} />
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
};

export default MainLayout;
