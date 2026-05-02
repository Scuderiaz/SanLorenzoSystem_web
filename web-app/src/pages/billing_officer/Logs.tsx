import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable from '../../components/Common/DataTable';
import { useToast } from '../../components/Common/ToastContainer';
import { formatAccountNumberForDisplay } from '../../utils/accountNumber';
import { getErrorMessage, requestJson } from '../../services/userManagementApi';

type BillingLog = {
  id: string;
  timestamp: string;
  event_type: 'Disconnection' | 'Approval' | 'Rejection';
  consumer_name: string;
  account_number: string;
  performed_by: string;
  reason: string;
  status: string;
};

const BillingLogs: React.FC = () => {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<BillingLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<'all' | 'disconnect' | 'approval'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await requestJson<{ success: boolean; data: BillingLog[] }>(
        '/billing/logs',
        { method: 'GET' },
        'Failed to load billing logs.'
      );
      setLogs(result.data || []);
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to load billing logs.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return logs.filter((log) => {
      const scopeMatch =
        scope === 'disconnect'
          ? log.event_type === 'Disconnection'
          : scope === 'approval'
            ? log.event_type === 'Approval' || log.event_type === 'Rejection'
            : true;
      if (!scopeMatch) return false;
      if (!query) return true;
      return [
        log.consumer_name,
        log.account_number,
        log.performed_by,
        log.reason,
        log.status,
        log.event_type,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [logs, scope, searchTerm]);

  return (
    <MainLayout title="Billing Logs">
      <div className="card shadow-sm border-0" style={{ borderRadius: '20px', overflow: 'hidden' }}>
        <div className="card-header bg-white" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
          <h2 className="card-title" style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#1B1B63' }}>
            Disconnection & Approval Logs
          </h2>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ minWidth: '260px' }}
            />
            <select className="form-control" value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'disconnect' | 'approval')}>
              <option value="all">All Relevant Logs</option>
              <option value="disconnect">Disconnections Only</option>
              <option value="approval">Approvals Only</option>
            </select>
            <button className="btn btn-secondary" onClick={loadLogs}>
              <i className="fas fa-sync-alt"></i> Refresh
            </button>
          </div>
        </div>
        <div className="card-body" style={{ padding: '20px' }}>
          <DataTable
            columns={[
              {
                key: 'timestamp',
                label: 'Date/Time',
                sortable: true,
                render: (value: string) => new Date(value).toLocaleString(),
              },
              {
                key: 'event_type',
                label: 'Action',
                sortable: true,
                render: (value: string) => (
                  <span className={`delinquent-tier-badge ${value === 'Disconnection' ? 'tier-urgent-disconnect' : value === 'Approval' ? 'tier-current' : 'tier-watchlist'}`}>
                    {value}
                  </span>
                ),
              },
              { key: 'consumer_name', label: 'Concessionaire', sortable: true },
              {
                key: 'account_number',
                label: 'Account No.',
                sortable: true,
                render: (value: string) => formatAccountNumberForDisplay(value),
              },
              { key: 'performed_by', label: 'Processed By', sortable: true },
              { key: 'status', label: 'Status', sortable: true },
              { key: 'reason', label: 'Reason / Remarks', sortable: true },
            ]}
            data={filteredLogs}
            loading={loading}
            emptyMessage="No billing logs found."
          />
        </div>
      </div>
    </MainLayout>
  );
};

export default BillingLogs;
