import React, { useMemo, useState } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Common/ToastContainer';
import './LegacyImport.css';

type ParsedRow = Record<string, string>;

const splitCsvLine = (line: string) => {
  const result: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      result.push(value);
      value = '';
      continue;
    }
    value += char;
  }
  result.push(value);
  return result.map((cell) => cell.trim());
};

const parseCsv = (text: string): ParsedRow[] => {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]).map((value) => value.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: ParsedRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  });
};

const LegacyImport: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const actorRoleId = Number(user?.role_id || 0);
  const canImport = actorRoleId === 1 || actorRoleId === 2;

  const [bundleRows, setBundleRows] = useState<ParsedRow[]>([]);
  const [uploadedFile, setUploadedFile] = useState('');
  const [report, setReport] = useState<any>(null);
  const [loadingValidate, setLoadingValidate] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  const counts = useMemo(() => {
    const consumers = new Set(bundleRows.map((row) => String(row.account_number || '').trim().toLowerCase()).filter(Boolean));
    const bills = bundleRows.filter((row) => String(row.bill_date || '').trim()).length;
    const payments = bundleRows.filter((row) => String(row.payment_date || '').trim() || String(row.amount_paid || '').trim()).length;
    return { rows: bundleRows.length, consumers: consumers.size, bills, payments };
  }, [bundleRows]);

  const handleFileUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      setBundleRows(rows);
      setUploadedFile(file.name);
      setReport(null);
      showToast(`Consumer bundle file loaded (${rows.length} rows).`, 'success');
    } catch (error: any) {
      showToast(error.message || 'Failed to parse Consumer Bundle CSV.', 'error');
    }
  };

  const downloadTemplate = async () => {
    if (!canImport) {
      showToast('Only Admin and Billing Officer can download templates.', 'warning');
      return;
    }
    if (!actorRoleId) {
      showToast('User session is still loading. Please try again.', 'warning');
      return;
    }

    setDownloadingTemplate(true);
    try {
      const response = await fetch(
        `${(process.env.REACT_APP_API_URL || 'http://localhost:3001/api')}/import/templates/consumer_bundle?actorRoleId=${encodeURIComponent(String(actorRoleId))}`
      );
      if (!response.ok) {
        const raw = await response.text();
        let message = 'Failed to download Consumer Bundle template.';
        try {
          const parsed = JSON.parse(raw);
          message = parsed?.message || message;
        } catch {
          if (raw) message = raw;
        }
        throw new Error(message);
      }
      const csvText = await response.text();
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'consumer-bundle-template.csv';
      link.click();
      URL.revokeObjectURL(url);
      showToast('Consumer Bundle template downloaded.', 'success');
    } catch (error: any) {
      const message = error?.message || 'Failed to download Consumer Bundle template.';
      showToast(message, 'error');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const validateImport = async () => {
    setLoadingValidate(true);
    try {
      const response = await api.post('/import/legacy/validate', {
        actorRoleId,
        datasets: {
          consumer_bundle: bundleRows,
        },
      });
      setReport(response.data?.report || null);
      if (response.data?.success) {
        showToast('Import validation passed.', 'success');
      } else {
        showToast('Import validation found issues. Review details below.', 'warning');
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Import validation failed.';
      showToast(message, 'error');
    } finally {
      setLoadingValidate(false);
    }
  };

  const applyImport = async () => {
    if (!report?.ok) {
      showToast('Please run validation and resolve errors before importing.', 'warning');
      return;
    }
    setLoadingImport(true);
    try {
      const response = await api.post('/import/legacy/apply', {
        actorRoleId,
        datasets: {
          consumer_bundle: bundleRows,
        },
      });
      showToast(response.data?.message || 'Legacy data imported successfully.', 'success');
      setReport(response.data?.report || report);
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Import failed.';
      showToast(message, 'error');
    } finally {
      setLoadingImport(false);
    }
  };

  if (!canImport) {
    return (
      <MainLayout title="Data Import">
        <div className="legacy-import-page">
          <div className="legacy-import-card">
            <h3>Access Restricted</h3>
            <p>Only Admin and Billing Officer accounts can import legacy data.</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Data Import">
      <div className="legacy-import-page">
        <div className="legacy-import-card">
          <h3>Legacy Data Import</h3>
          <p>Upload one Consumer Bundle CSV (consumer profile + bill + payment columns). Validate first, then run import.</p>

          <div className="legacy-import-grid">
            <div className="legacy-import-tile">
              <h4>Consumer Bundle</h4>
              <p>{counts.rows} rows loaded</p>
              <p className="legacy-file-name">{uploadedFile || 'No file selected'}</p>
              <div className="legacy-import-actions">
                <button type="button" onClick={downloadTemplate} disabled={downloadingTemplate}>
                  {downloadingTemplate ? 'Downloading...' : 'Download Template'}
                </button>
                <label className="legacy-upload-btn">
                  Upload CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      void handleFileUpload(file);
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="legacy-main-actions">
            <button type="button" onClick={validateImport} disabled={loadingValidate || loadingImport}>
              {loadingValidate ? 'Validating...' : 'Validate Import'}
            </button>
            <button type="button" onClick={applyImport} disabled={loadingImport || loadingValidate || !report?.ok}>
              {loadingImport ? 'Importing...' : 'Run Import'}
            </button>
          </div>

          {report && (
            <div className="legacy-report">
              <h4>Validation Report</h4>
              <p>Status: <strong>{report.ok ? 'PASS' : 'FAIL'}</strong></p>
              <p>
                Parsed: Consumers {report.counts?.consumers || 0}, Bills {report.counts?.bills || 0}, Payments {report.counts?.payments || 0}
              </p>

              {Array.isArray(report.errors) && report.errors.length > 0 && (
                <>
                  <h5>Errors</h5>
                  <ul>
                    {report.errors.map((error: string, index: number) => (
                      <li key={`error-${index}`}>{error}</li>
                    ))}
                  </ul>
                </>
              )}

              {Array.isArray(report.warnings) && report.warnings.length > 0 && (
                <>
                  <h5>Warnings</h5>
                  <ul>
                    {report.warnings.map((warning: string, index: number) => (
                      <li key={`warning-${index}`}>{warning}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default LegacyImport;
