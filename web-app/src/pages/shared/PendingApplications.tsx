import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import DataTable, { Column } from '../../components/Common/DataTable';
import Modal from '../../components/Common/Modal';
import { useToast } from '../../components/Common/ToastContainer';
import FormInput from '../../components/Common/FormInput';
import FormSelect from '../../components/Common/FormSelect';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage, loadApplicationsWithFallback, loadClassificationsWithFallback, loadZonesWithFallback, requestJson } from '../../services/userManagementApi';
import { formatAccountNumberForDisplay, isPlaceholderAccountNumber } from '../../utils/accountNumber';
import '../assessor_admin/Users.css';

interface PendingApplication {
  Ticket_ID: number;
  Ticket_Number: string;
  Application_Status: string;
  Application_Date: string;
  Connection_Type: string;
  Requirements_Submitted: string;
  Account_ID: number;
  Username: string;
  Account_Status: string;
  Consumer_ID: number | null;
  Consumer_Name: string | null;
  Contact_Number: string | null;
  Address: string | null;
  Purok: string | null;
  Barangay: string | null;
  Municipality: string | null;
  Zip_Code: string | null;
  Account_Number: string | null;
  Consumer_Status: string | null;
  Zone_ID: number | null;
  Zone_Name: string | null;
  Classification_ID: number | null;
  Classification_Name: string | null;
}

interface OptionRow {
  id: number;
  name: string;
}

interface ConfirmActionState {
  type: 'approve' | 'reject';
  application: PendingApplication;
}

const PHONE_PATTERN = /^(09\d{9}|639\d{9}|\+639\d{9})$/;

const normalizePhoneInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const hasLeadingPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasLeadingPlus ? `+${digits}` : digits;
};

const formatZoneLabel = (zoneName?: string | null, zoneId?: number | string | null) =>
  zoneName || (zoneId ? `Zone ${zoneId}` : 'Not Assigned');

const PendingApplications: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canViewUsername = user?.role_id === 1;
  const [applications, setApplications] = useState<PendingApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [zoneFilter, setZoneFilter] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('');
  const [selectedApplication, setSelectedApplication] = useState<PendingApplication | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [returnToDetailsAfterEdit, setReturnToDetailsAfterEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);
  const [zones, setZones] = useState<OptionRow[]>([]);
  const [classifications, setClassifications] = useState<OptionRow[]>([]);
  const [formData, setFormData] = useState({
    username: '',
    firstName: '',
    middleName: '',
    lastName: '',
    contactNumber: '',
    purok: '',
    barangay: '',
    municipality: 'San Lorenzo Ruiz',
    zipCode: '4610',
    zoneId: '',
    classificationId: '',
    accountNumber: '',
    connectionType: '',
    requirementsSubmitted: '',
  });

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const { data, source } = await loadApplicationsWithFallback();
      setApplications(data || []);
      if (source === 'supabase') {
        showToast('Applications loaded using Supabase fallback.', 'warning');
      }
    } catch (error) {
      console.error('Error loading applications:', error);
      showToast(getErrorMessage(error, 'Failed to load applications.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadLookups = useCallback(async () => {
    try {
      const [{ data: zonesData }, { data: classificationsData }] = await Promise.all([
        loadZonesWithFallback(),
        loadClassificationsWithFallback(),
      ]);

      if (Array.isArray(zonesData)) {
        setZones(zonesData.map((zone: any) => ({
          id: zone.Zone_ID ?? zone.zone_id,
          name: formatZoneLabel(zone.Zone_Name ?? zone.zone_name, zone.Zone_ID ?? zone.zone_id),
        })));
      }

      if (Array.isArray(classificationsData)) {
        setClassifications(classificationsData.map((classification: any) => ({
          id: classification.Classification_ID ?? classification.classification_id,
          name: classification.Classification_Name ?? classification.classification_name,
        })));
      }
    } catch (error) {
      console.error('Error loading lookup data:', error);
      showToast(getErrorMessage(error, 'Failed to load application lookups.'), 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadApplications();
    loadLookups();
  }, [loadApplications, loadLookups]);

  const openEdit = (application: PendingApplication, options?: { returnToDetails?: boolean }) => {
    const [firstName = '', middleName = '', ...remainingName] = String(application.Consumer_Name || '').split(' ');
    setSelectedApplication(application);
    setReturnToDetailsAfterEdit(Boolean(options?.returnToDetails));
    setFormData({
      username: application.Username || '',
      firstName,
      middleName,
      lastName: remainingName.join(' '),
      contactNumber: application.Contact_Number || '',
      purok: application.Purok || '',
      barangay: application.Barangay || '',
      municipality: application.Municipality || 'San Lorenzo Ruiz',
      zipCode: application.Zip_Code || '4610',
      zoneId: application.Zone_ID ? String(application.Zone_ID) : '',
      classificationId: application.Classification_ID ? String(application.Classification_ID) : '',
      accountNumber: application.Account_Number || '',
      connectionType: application.Connection_Type || 'New Connection',
      requirementsSubmitted: application.Requirements_Submitted || '',
    });
    setIsEditOpen(true);
  };

  const handleApprove = async (accountId: number) => {
    try {
      const result = await requestJson<{ success: boolean; message?: string }>('/admin/approve-user', {
        method: 'POST',
        body: JSON.stringify({ accountId, approvedBy: user?.id }),
      }, 'Failed to approve application.');
      if (result.success) {
        showToast(result.message || 'Application approved successfully', 'success');
        setSelectedApplication(null);
        loadApplications();
      } else {
        showToast(result.message || 'Failed to approve application', 'error');
      }
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to approve application.'), 'error');
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedApplication) return;
    if (!formData.username || !formData.firstName || !formData.lastName || !formData.zoneId || !formData.classificationId) {
      showToast('Please complete the required application fields.', 'error');
      return;
    }

    if (formData.contactNumber.trim() && !PHONE_PATTERN.test(formData.contactNumber.trim())) {
      showToast('Contact number must be a valid Philippine mobile number.', 'error');
      return;
    }

    setSaving(true);
    try {
      const result = await requestJson<{ success: boolean; message?: string }>(`/update-application/${selectedApplication.Account_ID}`, {
        method: 'POST',
        body: JSON.stringify(formData),
      }, 'Failed to update application.');
      if (result.success) {
        showToast(result.message || 'Application updated successfully', 'success');
        setIsEditOpen(false);
        setReturnToDetailsAfterEdit(false);
        setSelectedApplication(null);
        loadApplications();
      } else {
        showToast(result.message || 'Failed to update application', 'error');
      }
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to update application.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (accountId: number) => {
    try {
      const result = await requestJson<{ success: boolean; message?: string }>('/admin/reject-user', {
        method: 'POST',
        body: JSON.stringify({ accountId, approvedBy: user?.id }),
      }, 'Failed to reject application.');
      if (result.success) {
        showToast(result.message || 'Application rejected and deleted successfully', 'success');
        setSelectedApplication(null);
        loadApplications();
      } else {
        showToast(result.message || 'Failed to reject application', 'error');
      }
    } catch (error) {
      showToast(getErrorMessage(error, 'Failed to reject application.'), 'error');
    }
  };

  const filteredApplications = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return applications.filter((application) => {
      const matchesStatus = statusFilter === 'active'
        ? true
        : statusFilter === 'all' || application.Application_Status === statusFilter;
      const matchesZone = !zoneFilter || String(application.Zone_ID || '') === zoneFilter;
      const matchesClassification = !classificationFilter || String(application.Classification_ID || '') === classificationFilter;
      const matchesSearch = !query || [
        application.Ticket_Number,
        application.Consumer_Name,
        application.Address,
        application.Barangay,
        application.Purok,
        application.Classification_Name,
        ...(canViewUsername ? [application.Username] : []),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      return matchesStatus && matchesZone && matchesClassification && matchesSearch;
    });
  }, [applications, canViewUsername, classificationFilter, searchQuery, statusFilter, zoneFilter]);

  const columns: Column[] = [
    { key: 'Ticket_Number', label: 'Ticket No.', sortable: true },
    { key: 'Consumer_Name', label: 'Applicant', sortable: true },
    {
      key: 'Application_Status',
      label: 'Application Status',
      sortable: true,
      render: (value: string) => <span className={`status-pill status-${String(value || 'unknown').toLowerCase()}`}>{value}</span>,
    },
    { key: 'Classification_Name', label: 'Classification', sortable: true },
    {
      key: 'Zone_Name',
      label: 'Zone',
      render: (_, row: PendingApplication) => formatZoneLabel(row.Zone_Name, row.Zone_ID),
    },
    { key: 'Application_Date', label: 'Applied On', sortable: true, render: (value: string) => value ? new Date(value).toLocaleString() : 'N/A' },
    {
      key: 'actions',
      label: 'Actions',
          render: (_, row: PendingApplication) => (
        <div className="action-buttons-inline">
          <button className="btn-icon" title="View Details" onClick={(event) => { event.stopPropagation(); setSelectedApplication(row); }}>
            <i className="fas fa-eye"></i>
          </button>
          <button className="btn-icon" title="Edit Application" onClick={(event) => { event.stopPropagation(); openEdit(row, { returnToDetails: false }); }}>
            <i className="fas fa-edit"></i>
          </button>
          {row.Application_Status === 'Pending' && (
            <>
              <button className="btn-icon btn-success" title="Approve" onClick={(event) => { event.stopPropagation(); setConfirmAction({ type: 'approve', application: row }); }}>
                <i className="fas fa-check"></i>
              </button>
              <button className="btn-icon btn-danger" title="Reject" onClick={(event) => { event.stopPropagation(); setConfirmAction({ type: 'reject', application: row }); }}>
                <i className="fas fa-times"></i>
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  if (canViewUsername) {
    columns.splice(2, 0, { key: 'Username', label: 'Username', sortable: true });
  }

  const confirmActionMessage = confirmAction?.type === 'approve'
    ? 'Approve this consumer application and move it forward for activation?'
    : 'Reject this application and permanently delete the pending account and ticket?';

  const accountNumberDisplay = (application: PendingApplication | null) => {
    if (!application) {
      return 'To be updated upon approval';
    }

    if (application.Application_Status !== 'Approved' && application.Account_Status !== 'Active') {
      return 'To be updated upon approval';
    }

    if (!application.Account_Number || isPlaceholderAccountNumber(application.Account_Number)) {
      return 'Pending for update';
    }

    return formatAccountNumberForDisplay(application.Account_Number, 'To be updated upon approval');
  };

  return (
    <MainLayout title="Applications">
      <div className="users-page">
        <div className="filter-bar applications-toolbar">
          <div className="search-box">
            <i className="fas fa-search"></i>
            <input
              type="text"
              placeholder={`Search by ticket, applicant, ${canViewUsername ? 'username, ' : ''}or address...`}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
          <div className="applications-toolbar-actions">
          <div className="filters">
            <select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)}>
              <option value="">All Zones</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>{zone.name}</option>
              ))}
            </select>
            <select value={classificationFilter} onChange={(event) => setClassificationFilter(event.target.value)}>
              <option value="">All Classifications</option>
              {classifications.map((classification) => (
                <option key={classification.id} value={classification.id}>{classification.name}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="active">Working Applications</option>
              <option value="all">All Application Status</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              </select>
            </div>
            <div className="main-actions">
              <button className="btn btn-secondary" onClick={loadApplications} title="Refresh Applications">
                <i className="fas fa-sync-alt"></i>
              </button>
            </div>
          </div>
        </div>

        <div className="users-card">
          <div className="card-header">
            <h3 className="card-title">Consumer Applications</h3>
          </div>
          <div className="card-body">
            <DataTable
              columns={columns}
              data={filteredApplications}
              loading={loading}
              onRowClick={(row) => setSelectedApplication(row)}
              emptyMessage="No pending applications found."
            />
          </div>
        </div>

        <Modal
          isOpen={Boolean(selectedApplication) && !isEditOpen}
          onClose={() => setSelectedApplication(null)}
          title="Application Details"
          size="medium"
          closeOnOverlayClick={true}
          footer={
            selectedApplication ? (
              <>
                <button className="btn btn-secondary" onClick={() => setSelectedApplication(null)}>Close</button>
                <button className="btn btn-secondary" onClick={() => openEdit(selectedApplication, { returnToDetails: true })}>
                  <i className="fas fa-edit"></i> Edit
                </button>
                {selectedApplication.Application_Status === 'Pending' && (
                  <>
                    <button className="btn btn-danger" onClick={() => setConfirmAction({ type: 'reject', application: selectedApplication })}>
                      <i className="fas fa-times"></i> Reject
                    </button>
                    <button className="btn btn-primary" onClick={() => setConfirmAction({ type: 'approve', application: selectedApplication })}>
                      <i className="fas fa-check"></i> Approve
                    </button>
                  </>
                )}
              </>
            ) : undefined
          }
        >
          {selectedApplication && (
            <div className="application-detail-grid">
              <p><strong>Ticket Number:</strong> {selectedApplication.Ticket_Number}</p>
              <p><strong>Application Status:</strong> {selectedApplication.Application_Status}</p>
              <p><strong>Applicant:</strong> {selectedApplication.Consumer_Name || 'N/A'}</p>
              {canViewUsername && <p><strong>Username:</strong> {selectedApplication.Username || 'N/A'}</p>}
              <p><strong>Classification:</strong> {selectedApplication.Classification_Name || 'N/A'}</p>
              <p><strong>Zone:</strong> {formatZoneLabel(selectedApplication.Zone_Name, selectedApplication.Zone_ID)}</p>
              <p><strong>Contact Number:</strong> {selectedApplication.Contact_Number || 'N/A'}</p>
              <p><strong>Connection Type:</strong> {selectedApplication.Connection_Type || 'N/A'}</p>
              <p><strong>Requirements:</strong> {selectedApplication.Requirements_Submitted || 'N/A'}</p>
              <p><strong>Official Account No.:</strong> {accountNumberDisplay(selectedApplication)}</p>
              <p><strong>Applied On:</strong> {selectedApplication.Application_Date ? new Date(selectedApplication.Application_Date).toLocaleString() : 'N/A'}</p>
              <p><strong>Address:</strong> {selectedApplication.Address || 'N/A'}</p>
            </div>
          )}
        </Modal>

        <Modal
          isOpen={isEditOpen}
          onClose={() => {
            setIsEditOpen(false);
            if (!returnToDetailsAfterEdit) {
              setSelectedApplication(null);
            }
            setReturnToDetailsAfterEdit(false);
          }}
          title="Edit Pending Application"
          size="large"
          footer={
            <>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setIsEditOpen(false);
                  if (!returnToDetailsAfterEdit) {
                    setSelectedApplication(null);
                  }
                  setReturnToDetailsAfterEdit(false);
                }}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>
                <i className="fas fa-save"></i> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          }
        >
          <div className="application-edit-grid">
            {canViewUsername && (
              <FormInput label="Username" value={formData.username} onChange={(value) => setFormData({ ...formData, username: value })} required />
            )}
            <FormInput label="First Name" value={formData.firstName} onChange={(value) => setFormData({ ...formData, firstName: value })} required />
            <FormInput label="Middle Name" value={formData.middleName} onChange={(value) => setFormData({ ...formData, middleName: value })} />
            <FormInput label="Last Name" value={formData.lastName} onChange={(value) => setFormData({ ...formData, lastName: value })} required />
            <FormInput label="Contact Number" value={formData.contactNumber} onChange={(value) => setFormData({ ...formData, contactNumber: normalizePhoneInput(value) })} />
            <FormInput label="Purok" value={formData.purok} onChange={(value) => setFormData({ ...formData, purok: value })} />
            <FormInput label="Barangay" value={formData.barangay} onChange={(value) => setFormData({ ...formData, barangay: value })} />
            <FormInput label="Municipality" value={formData.municipality} onChange={(value) => setFormData({ ...formData, municipality: value })} />
            <FormInput label="ZIP Code" value={formData.zipCode} onChange={(value) => setFormData({ ...formData, zipCode: value })} />
            <FormSelect
              label="Zone"
              value={formData.zoneId}
              onChange={(value) => setFormData({ ...formData, zoneId: value })}
              options={zones.map((zone) => ({ value: zone.id, label: zone.name }))}
              required
            />
            <FormSelect
              label="Classification"
              value={formData.classificationId}
              onChange={(value) => setFormData({ ...formData, classificationId: value })}
              options={classifications.map((classification) => ({ value: classification.id, label: classification.name }))}
              required
            />
            <FormInput
              label="Account Number"
              value={formData.accountNumber}
              onChange={(value) => setFormData({ ...formData, accountNumber: value })}
              placeholder="This stays hidden until the application is approved"
            />
            <FormInput label="Connection Type" value={formData.connectionType} onChange={(value) => setFormData({ ...formData, connectionType: value })} />
          </div>
          <div className="application-notes-block">
            <label className="form-label">Requirements Submitted</label>
            <textarea
              className="application-textarea"
              value={formData.requirementsSubmitted}
              onChange={(event) => setFormData({ ...formData, requirementsSubmitted: event.target.value })}
              rows={4}
            />
          </div>
        </Modal>

        <Modal
          isOpen={Boolean(confirmAction)}
          onClose={() => setConfirmAction(null)}
          title={confirmAction?.type === 'approve' ? 'Approve Application' : 'Reject Application'}
          size="small"
          footer={
            confirmAction ? (
              <>
                <button className="btn btn-secondary" onClick={() => setConfirmAction(null)}>
                  Cancel
                </button>
                <button
                  className={`btn ${confirmAction.type === 'approve' ? 'btn-primary' : 'btn-danger'}`}
                  onClick={async () => {
                    const pendingAction = confirmAction;
                    setConfirmAction(null);
                    if (pendingAction.type === 'approve') {
                      await handleApprove(pendingAction.application.Account_ID);
                    } else {
                      await handleReject(pendingAction.application.Account_ID);
                    }
                  }}
                >
                  {confirmAction.type === 'approve' ? 'Approve' : 'Reject'}
                </button>
              </>
            ) : undefined
          }
        >
          {confirmAction && (
            <div>
              <p><strong>Applicant:</strong> {confirmAction.application.Consumer_Name || 'N/A'}</p>
              <p><strong>Ticket Number:</strong> {confirmAction.application.Ticket_Number}</p>
              <p>{confirmActionMessage}</p>
            </div>
          )}
        </Modal>
      </div>
    </MainLayout>
  );
};

export default PendingApplications;
