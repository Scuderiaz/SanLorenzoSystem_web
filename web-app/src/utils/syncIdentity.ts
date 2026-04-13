const DEVICE_ID_KEY = 'slrws-device-id';

const generateId = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `device-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

export const getClientDeviceId = () => {
  if (typeof localStorage === 'undefined') {
    return 'browser-unknown';
  }

  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const nextId = generateId();
  localStorage.setItem(DEVICE_ID_KEY, nextId);
  return nextId;
};

export const getSourceSiteId = () => {
  const configured = process.env.REACT_APP_SOURCE_SITE_ID?.trim();
  if (configured) {
    return configured;
  }

  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `site-${window.location.hostname}`;
  }

  return 'site-local';
};
