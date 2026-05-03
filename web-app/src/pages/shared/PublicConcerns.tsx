import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable, { Column } from '../../components/Common/DataTable';
import { useToast } from '../../components/Common/ToastContainer';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage, requestJson } from '../../services/userManagementApi';
import './PublicConcerns.css';

type ConcernStatus = 'Pending' | 'In Progress' | 'Resolved' | 'Closed';

type PublicConcern = {
  message_id: number;
  full_name: string;
  barangay: string;
  contact_number: string;
  subject: string;
  message: string;
  status: ConcernStatus;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: number | null;
  remarks: string | null;
};

const statusOptions: ConcernStatus[] = ['Pending', 'In Progress', 'Resolved', 'Closed'];

const PublicConcerns: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState<PublicConcern[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [draftStatusById, setDraftStatusById] = useState<Record<number, ConcernStatus>>({});
  const [draftRemarksById, setDraftRemarksById] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const loadConcerns = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (statusFilter) queryParams.set('status', statusFilter);
      if (search.trim()) queryParams.set('q', search.trim());

      const result = await requestJson<{ success: boolean; data: PublicConcern[] }>(
        `/public-contact-messages${queryParams.toString() ? `?${queryParams.toString()}` : ''}`,
        { method: 'GET' },
        'Failed to load public concerns.'
      );

      const loadedRows = result.data || [];
      setRows(loadedRows);
      setDraftStatusById((current) => {
        const next = { ...current };
        loadedRows.forEach((entry) => {
          if (!next[entry.message_id]) {
            next[entry.message_id] = entry.status;
          }
        });
        return next;
      });
      setDraftRemarksById((current) => {
        const next = { ...current };
        loadedRows.forEach((entry) => {
          if (next[entry.message_id] === undefined) {
            next[entry.message_id] = entry.remarks || '';
          }
        });
        return next;
      });
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to load public concerns.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search, showToast, statusFilter]);

  useEffect(() => {
    loadConcerns();
  }, [loadConcerns]);

  const saveStatus = useCallback(async (row: PublicConcern) => {
    const messageId = row.message_id;
    const nextStatus = draftStatusById[messageId] || row.status;
    const remarks = (draftRemarksById[messageId] || '').trim();

    setSavingId(messageId);
    try {
      await requestJson<{ success: boolean; message: string; data: PublicConcern }>(
        `/public-contact-messages/${messageId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: nextStatus,
            remarks: remarks || null,
            reviewedBy: user?.id || null,
          }),
        },
        'Failed to update public concern status.'
      );

      showToast(`Concern #${messageId} updated to ${nextStatus}.`, 'success');
      await loadConcerns();
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to update public concern status.'), 'error');
    } finally {
      setSavingId(null);
    }
  }, [draftRemarksById, draftStatusById, loadConcerns, showToast, user?.id]);

  const columns: Column[] = useMemo(() => ([
    {
      key: 'created_at',
      label: 'Submitted',
      sortable: true,
      render: (value: string) => new Date(value).toLocaleString(),
      getSortValue: (row: PublicConcern) => new Date(row.created_at || 0).getTime(),
    },
    { key: 'full_name', label: 'Full Name', sortable: true },
    { key: 'barangay', label: 'Barangay', sortable: true, filterType: 'select', filterLabel: 'Barangay' },
    { key: 'contact_number', label: 'Contact #', sortable: true },
    { key: 'subject', label: 'Subject', sortable: true, filterType: 'select', filterLabel: 'Subject' },
    {
      key: 'message',
      label: 'Message',
      sortable: false,
      render: (value: string) => <div className="public-concern-message">{value}</div>,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      filterType: 'select',
      filterLabel: 'Status',
      render: (value: ConcernStatus) => <span className={`public-concern-status status-${String(value).toLowerCase().replace(/\s+/g, '-')}`}>{value}</span>,
    },
    {
      key: 'actions',
      label: 'Action',
      sortable: false,
      filterable: false,
      render: (_: unknown, row: PublicConcern) => {
        const rowDraftStatus = draftStatusById[row.message_id] || row.status;
        const rowDraftRemarks = draftRemarksById[row.message_id] || '';
        const isSaving = savingId === row.message_id;
        return (
          <div className="public-concern-action-cell">
            <select
              className="public-concern-select"
              value={rowDraftStatus}
              disabled={isSaving}
              onChange={(event) =>
                setDraftStatusById((current) => ({
                  ...current,
                  [row.message_id]: event.target.value as ConcernStatus,
                }))
              }
            >
              {statusOptions.map((statusOption) => (
                <option key={statusOption} value={statusOption}>{statusOption}</option>
              ))}
            </select>
            <input
              className="public-concern-remarks"
              type="text"
              value={rowDraftRemarks}
              disabled={isSaving}
              placeholder="Remarks (optional)"
              onChange={(event) =>
                setDraftRemarksById((current) => ({
                  ...current,
                  [row.message_id]: event.target.value,
                }))
              }
            />
            <button
              type="button"
              className="btn btn-primary public-concern-save"
              disabled={isSaving}
              onClick={() => saveStatus(row)}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        );
      },
    },
  ]), [draftRemarksById, draftStatusById, saveStatus, savingId]);

  return (
    <MainLayout title="Public Concerns">
      <div className="public-concerns-page">
        <div className="card public-concerns-header-card">
          <div>
            <h2 className="public-concerns-title">Public Concerns Inbox</h2>
            <p className="public-concerns-subtitle">
              Manage website concern submissions and update workflow status.
            </p>
          </div>
          <div className="public-concerns-actions">
            <input
              type="text"
              className="form-control"
              placeholder="Search by name, barangay, subject..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="form-control"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All Statuses</option>
              {statusOptions.map((statusOption) => (
                <option key={statusOption} value={statusOption}>{statusOption}</option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary" onClick={loadConcerns}>
              <i className="fas fa-sync-alt"></i> Refresh
            </button>
          </div>
        </div>

        <div className="card public-concerns-table-card">
          <div className="card-body">
            <DataTable
              columns={columns}
              data={rows}
              loading={loading}
              enableFiltering
              filterPlaceholder="Quick search concerns..."
              emptyMessage="No public concerns found."
            />
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default PublicConcerns;
