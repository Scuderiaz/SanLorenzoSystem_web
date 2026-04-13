import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { canReachBackend } from '../utils/backendAvailability';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isOnline: boolean;
  login: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const refreshBackendStatus = async (force = true) => {
      try {
        const reachable = await canReachBackend(force);
        if (!cancelled) {
          setIsOnline(reachable);
        }
      } catch {
        if (!cancelled) {
          setIsOnline(false);
        }
      }
    };

    try {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
    } catch (error) {
      console.error('Failed to load user from session:', error);
    } finally {
      setIsLoading(false);
    }

    refreshBackendStatus(true).catch(() => setIsOnline(false));

    const handleConnectivityChange = () => {
      refreshBackendStatus(true).catch(() => setIsOnline(false));
    };

    const intervalId = window.setInterval(() => {
      refreshBackendStatus(true).catch(() => setIsOnline(false));
    }, 15000);

    window.addEventListener('online', handleConnectivityChange);
    window.addEventListener('offline', handleConnectivityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleConnectivityChange);
      window.removeEventListener('offline', handleConnectivityChange);
    };
  }, []);

  const login = (userData: User) => {
    try {
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
    } catch (error) {
      console.error('Failed to persist user session:', error);
      setUser(userData);
    }
  };

  const logout = () => {
    try {
      setUser(null);
      localStorage.removeItem('user');
    } catch (error) {
      console.error('Failed to clear user session:', error);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        isOnline,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
