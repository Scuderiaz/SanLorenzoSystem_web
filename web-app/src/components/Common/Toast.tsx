import React, { useEffect } from 'react';
import './Toast.css';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  durationMs?: number;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose, durationMs = 3000 }) => {
  useEffect(() => {
    const timerId = window.setTimeout(() => {
      onClose();
    }, durationMs);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [durationMs, onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return 'fa-check-circle';
      case 'error':
        return 'fa-exclamation-circle';
      case 'warning':
        return 'fa-exclamation-triangle';
      case 'info':
      default:
        return 'fa-info-circle';
    }
  };

  return (
    <div className={`toast toast-${type}`} role="status" aria-live="polite">
      <i className={`fas ${getIcon()}`}></i>
      <span>{message}</span>
      <button className="toast-close" type="button" onClick={onClose} aria-label="Dismiss notification">
        &times;
      </button>
    </div>
  );
};

export default Toast;
