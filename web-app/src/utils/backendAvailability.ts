const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const HEALTH_URL = API_URL.replace(/\/api\/?$/, '') + '/health';
const CACHE_TTL_MS = 5000;
const REQUEST_TIMEOUT_MS = 1500;

let lastCheckedAt = 0;
let lastReachable = false;
let inflightCheck: Promise<boolean> | null = null;

export const getBackendHealthUrl = () => HEALTH_URL;

export const canReachBackend = async (force = false): Promise<boolean> => {
  const now = Date.now();
  if (!force && now - lastCheckedAt < CACHE_TTL_MS) {
    return lastReachable;
  }

  if (inflightCheck) {
    return inflightCheck;
  }

  inflightCheck = (async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(HEALTH_URL, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      lastReachable = response.ok;
    } catch {
      lastReachable = false;
    } finally {
      window.clearTimeout(timeoutId);
      lastCheckedAt = Date.now();
      inflightCheck = null;
    }

    return lastReachable;
  })();

  return inflightCheck;
};
