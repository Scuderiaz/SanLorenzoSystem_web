const CLIENT_DIAGNOSTIC_LOG_KEY = 'slrws-client-diagnostics';
const MAX_DIAGNOSTIC_ENTRIES = 200;

type ClientDiagnosticEntry = {
  timestamp: string;
  module: string;
  message: string;
  context?: Record<string, unknown>;
};

export const appendClientDiagnostic = (
  moduleName: string,
  message: string,
  context: Record<string, unknown> = {}
) => {
  if (typeof window === 'undefined') {
    return;
  }

  const entry: ClientDiagnosticEntry = {
    timestamp: new Date().toISOString(),
    module: moduleName,
    message,
    context,
  };

  try {
    const existingRaw = window.localStorage.getItem(CLIENT_DIAGNOSTIC_LOG_KEY);
    const existing = existingRaw ? JSON.parse(existingRaw) : [];
    const normalizedEntries = Array.isArray(existing) ? existing : [];
    normalizedEntries.push(entry);
    window.localStorage.setItem(
      CLIENT_DIAGNOSTIC_LOG_KEY,
      JSON.stringify(normalizedEntries.slice(-MAX_DIAGNOSTIC_ENTRIES))
    );
  } catch (error) {
    console.warn('Failed to write client diagnostic log:', error);
  }
};

export const clientDiagnosticLogKey = CLIENT_DIAGNOSTIC_LOG_KEY;
