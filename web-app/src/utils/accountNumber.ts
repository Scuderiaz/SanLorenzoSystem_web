const PLACEHOLDER_ACCOUNT_PREFIX = 'PENDING-';

export const isPlaceholderAccountNumber = (value: unknown) =>
  String(value || '').trim().toUpperCase().startsWith(PLACEHOLDER_ACCOUNT_PREFIX);

export const formatAccountNumberForDisplay = (value: unknown, fallback = 'Pending for update') => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return fallback;
  }

  return isPlaceholderAccountNumber(normalized) ? fallback : normalized;
};
