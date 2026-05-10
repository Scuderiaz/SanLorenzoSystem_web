import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable, { Column } from '../../components/Common/DataTable';
import Modal from '../../components/Common/Modal';
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
  email: string;
  source?: string;
  category?: string;
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
  const [barangayFilter, setBarangayFilter] = useState('');
  const [search, setSearch] = useState('');
  const [replyTarget, setReplyTarget] = useState<PublicConcern | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PublicConcern | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [viewTarget, setViewTarget] = useState<PublicConcern | null>(null);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Record<number, boolean>>({});
  const [hiddenConcernIds, setHiddenConcernIds] = useState<Record<number, boolean>>({});
  const canReply = [1, 2].includes(Number(user?.role_id || 0));
  const canDelete = [1, 2].includes(Number(user?.role_id || 0));

  const loadConcerns = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (statusFilter) queryParams.set('status', statusFilter);
      if (barangayFilter) queryParams.set('barangay', barangayFilter);
      if (search.trim()) queryParams.set('q', search.trim());

      const result = await requestJson<{ success: boolean; data: PublicConcern[] }>(
        `/public-contact-messages${queryParams.toString() ? `?${queryParams.toString()}` : ''}`,
        { method: 'GET' },
        'Failed to load public concerns.'
      );

      const loadedRows = (result.data || []).map((row) => ({
        ...row,
        full_name: String(row.full_name || '').trim() || 'Unknown sender',
        barangay: String(row.barangay || '').trim() || 'Not specified',
        contact_number: String(row.contact_number || '').trim() || 'Not provided',
        email: String(row.email || '').trim() || 'Not provided',
      }));
      const inboxRows = loadedRows.filter((row) => {
        return !hiddenConcernIds[row.message_id];
      });
      setRows(inboxRows);
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to load public concerns.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [barangayFilter, hiddenConcernIds, search, showToast, statusFilter]);

  const handleDelete = useCallback(async (messageId: number) => {
    try {
      setIsDeleting(true);
      await requestJson<{ success: boolean; message?: string }>(
        `/public-contact-messages/${messageId}`,
        {
          method: 'DELETE',
          headers: {
            'x-actor-account-id': String(user?.id || ''),
            'x-actor-role-id': String(user?.role_id || ''),
          },
        },
        'Failed to delete concern.'
      );
      showToast('Concern deleted successfully.', 'success');
      setDeleteTarget(null);
      await loadConcerns();
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to delete concern.'), 'error');
    } finally {
      setIsDeleting(false);
    }
  }, [loadConcerns, showToast, user?.id, user?.role_id]);

  useEffect(() => {
    loadConcerns();
  }, [loadConcerns]);

  const submitReply = useCallback(async () => {
    if (!replyTarget) {
      return;
    }
    const normalizedReply = replyMessage.trim();
    if (!normalizedReply) {
      showToast('Reply message is required.', 'error');
      return;
    }

    setIsSendingReply(true);
    try {
      const nextStatus: ConcernStatus = 'Resolved';
      await requestJson<{ success: boolean; message: string; data: PublicConcern }>(
        `/public-contact-messages/${replyTarget.message_id}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: nextStatus,
            remarks: normalizedReply,
            reviewedBy: user?.id || null,
          }),
        },
        'Failed to send reply.'
      );

      showToast(`Reply sent for concern #${replyTarget.message_id}.`, 'success');
      setReplyTarget(null);
      setReplyMessage('');
      await loadConcerns();
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to send reply.'), 'error');
    } finally {
      setIsSendingReply(false);
    }
  }, [loadConcerns, replyMessage, replyTarget, showToast, user?.id]);

  const columns: Column[] = useMemo(() => ([
    {
      key: 'created_at',
      label: 'Submitted',
      sortable: true,
      render: (value: string) => new Date(value).toLocaleString(),
      getSortValue: (row: PublicConcern) => new Date(row.created_at || 0).getTime(),
    },
    { key: 'full_name', label: 'Full Name', sortable: true },
    { key: 'source', label: 'Source', sortable: true, filterType: 'select', filterLabel: 'Source' },
    { key: 'barangay', label: 'Barangay', sortable: true, filterType: 'select', filterLabel: 'Barangay' },
    { key: 'contact_number', label: 'Contact #', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'subject', label: 'Subject', sortable: true, filterType: 'select', filterLabel: 'Subject' },
    {
      key: 'message',
      label: 'Message',
      sortable: false,
      render: (value: string, row: PublicConcern) => {
        const text = String(value || '');
        const isExpanded = Boolean(expandedMessageIds[row.message_id]);
        const canExpand = text.length > 80;
        return (
          <div className="public-concern-message-cell">
            <div className={`public-concern-message ${isExpanded ? 'expanded' : 'collapsed'}`}>{text}</div>
            {canExpand && (
              <button
                type="button"
                className="public-concern-expand-btn"
                onClick={() =>
                  setExpandedMessageIds((current) => ({
                    ...current,
                    [row.message_id]: !isExpanded,
                  }))
                }
              >
                {isExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        );
      },
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
      label: 'Actions',
      sortable: false,
      filterable: false,
      render: (_: unknown, row: PublicConcern) => (
        <div className="public-concern-actions-cell">
          {row.remarks ? (
            <div className="public-concern-reply-preview" title={row.remarks}>
              {row.remarks}
            </div>
          ) : (
            <div className="public-concern-reply-empty">No reply yet</div>
          )}
          <div className="action-buttons-inline">
            {canReply && String(row.status || '').toLowerCase() !== 'resolved' && (
              <button
                type="button"
                className="btn btn-primary public-concern-reply-btn"
                onClick={() => {
                  setReplyTarget(row);
                  setReplyMessage('');
                }}
              >
                Reply
              </button>
            )}
            {String(row.status || '').toLowerCase() === 'resolved' && (
              <button
                type="button"
                className="btn btn-secondary public-concern-view-btn"
                onClick={() => setViewTarget(row)}
              >
                <i className="fas fa-eye" /> View
              </button>
            )}
            {canDelete && (
                <button
                  type="button"
                  className="btn-icon btn-danger"
                  title="Delete"
                  onClick={() => setDeleteTarget(row)}
                >
                  <i className="fas fa-trash"></i>
                </button>
            )}
          </div>
        </div>
      ),
    },
  ]), [canDelete, canReply, expandedMessageIds]);

  const barangayOptions = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((row) => String(row.barangay || '').trim())
            .filter(Boolean)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [rows]
  );

  return (
    <MainLayout title="Public Concerns">
      <div className="public-concerns-page">
        <div className="card public-concerns-header-card">
          <div>
            <h2 className="public-concerns-title">Public Concerns Inbox</h2>
            <p className="public-concerns-subtitle">
              Review public-form and consumer-app concern submissions and send replies.
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
            <select
              className="form-control"
              value={barangayFilter}
              onChange={(event) => setBarangayFilter(event.target.value)}
            >
              <option value="">All Barangays</option>
              {barangayOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
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

      <Modal
        isOpen={Boolean(replyTarget)}
        onClose={() => {
          if (!isSendingReply) {
            setReplyTarget(null);
            setReplyMessage('');
          }
        }}
        title={replyTarget ? `Reply to ${replyTarget.full_name}` : 'Reply'}
        size="medium"
        className="public-concern-reply-dialog"
        footer={(
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isSendingReply}
              onClick={() => {
                setReplyTarget(null);
                setReplyMessage('');
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isSendingReply || !replyMessage.trim()}
              onClick={() => void submitReply()}
            >
              {isSendingReply ? 'Sending...' : 'Send Reply'}
            </button>
          </>
        )}
      >
        <div className="public-concern-reply-modal">
          {replyTarget && (
            <>
              <div className="reply-section">
                <label>Subject</label>
                <p className="reply-subject">{replyTarget.subject}</p>
              </div>
              <div className="reply-section">
                <label>Original Message</label>
                <p className="reply-original-message">{replyTarget.message}</p>
              </div>
              <div className="reply-section">
                <label>Reply Message</label>
                <textarea
                  id="public-concern-reply-message"
                  value={replyMessage}
                  onChange={(event) => setReplyMessage(event.target.value)}
                  rows={5}
                  placeholder="Type your reply here..."
                  disabled={isSendingReply}
                />
              </div>
              <div className="reply-meta">
                <span><strong>From:</strong> {replyTarget.full_name}</span>
                <span><strong>Contact:</strong> {replyTarget.contact_number}</span>
                <span><strong>Barangay:</strong> {replyTarget.barangay}</span>
                <span><strong>Status:</strong> <span className={`public-concern-status status-${String(replyTarget.status).toLowerCase().replace(/\s+/g, '-')}`}>{replyTarget.status}</span></span>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => {
          if (!isDeleting) {
            setDeleteTarget(null);
          }
        }}
        title="Delete Public Concern"
        size="small"
        footer={(
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isDeleting}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={isDeleting || !deleteTarget}
              onClick={() => deleteTarget && handleDelete(deleteTarget.message_id)}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </>
        )}
      >
        {deleteTarget && (
          <p style={{ margin: 0 }}>
            Delete concern from <strong>{deleteTarget.full_name}</strong> about <strong>{deleteTarget.subject}</strong>? This action cannot be undone.
          </p>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(viewTarget)}
        onClose={() => setViewTarget(null)}
        title={viewTarget ? `Concern from ${viewTarget.full_name}` : 'View Concern'}
        size="medium"
        className="public-concern-view-dialog"
        footer={(
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setViewTarget(null)}
          >
            Close
          </button>
        )}
      >
        {viewTarget && (
          <div className="public-concern-view-modal">
            <div className="view-section">
              <label>Subject</label>
              <p className="view-subject">{viewTarget.subject}</p>
            </div>
            <div className="view-section">
              <label>Original Message</label>
              <p className="view-message">{viewTarget.message}</p>
            </div>
            <div className="view-section">
              <label>Reply</label>
              <p className="view-reply">{viewTarget.remarks || 'No reply available.'}</p>
            </div>
            <div className="view-meta">
              <span><strong>From:</strong> {viewTarget.full_name}</span>
              <span><strong>Contact:</strong> {viewTarget.contact_number}</span>
              <span><strong>Barangay:</strong> {viewTarget.barangay}</span>
              <span><strong>Status:</strong> <span className={`public-concern-status status-${String(viewTarget.status).toLowerCase().replace(/\s+/g, '-')}`}>{viewTarget.status}</span></span>
            </div>
          </div>
        )}
      </Modal>
    </MainLayout>
  );
};

export default PublicConcerns;
