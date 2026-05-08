import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Toast, { ToastType } from './Toast';

interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);
const DEFAULT_TOAST_DURATION = 3000;
const MAX_VISIBLE_TOASTS = 4;

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextIdRef = useRef(1);
  const timersRef = useRef<Map<number, number>>(new Map());

  const clearToastTimer = useCallback((id: number) => {
    const timerId = timersRef.current.get(id);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      timersRef.current.delete(id);
    }
  }, []);

  const removeToast = useCallback((id: number) => {
    clearToastTimer(id);
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, [clearToastTimer]);

  const scheduleToastRemoval = useCallback((id: number, duration: number) => {
    clearToastTimer(id);

    const timerId = window.setTimeout(() => {
      timersRef.current.delete(id);
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, duration);

    timersRef.current.set(id, timerId);
  }, [clearToastTimer]);

  const showToast = useCallback((message: string, type: ToastType) => {
    const normalizedMessage = message.trim();
    const duration = DEFAULT_TOAST_DURATION;
    let toastIdToSchedule: number | null = null;
    let staleToastIds: number[] = [];

    setToasts((prev) => {
      const existingToast = prev.find(
        (toast) => toast.type === type && toast.message === normalizedMessage
      );

      if (existingToast) {
        toastIdToSchedule = existingToast.id;
        return prev;
      }

      const nextToast: ToastMessage = {
        id: nextIdRef.current++,
        message: normalizedMessage,
        type,
      };

      toastIdToSchedule = nextToast.id;

      const nextToasts = [...prev, nextToast];
      if (nextToasts.length <= MAX_VISIBLE_TOASTS) {
        return nextToasts;
      }

      staleToastIds = nextToasts
        .slice(0, nextToasts.length - MAX_VISIBLE_TOASTS)
        .map((toast) => toast.id);

      return nextToasts.slice(-MAX_VISIBLE_TOASTS);
    });

    staleToastIds.forEach(clearToastTimer);

    if (toastIdToSchedule !== null) {
      scheduleToastRemoval(toastIdToSchedule, duration);
    }
  }, [clearToastTimer, scheduleToastRemoval]);

  useEffect(() => {
    const timers = timersRef.current;

    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 3000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '10px',
          pointerEvents: 'none',
          maxWidth: 'calc(100vw - 20px)',
        }}
      >
        {toasts.map((toast) => (
          <div key={toast.id} style={{ pointerEvents: 'auto' }}>
            <Toast
              message={toast.message}
              type={toast.type}
              onClose={() => removeToast(toast.id)}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
