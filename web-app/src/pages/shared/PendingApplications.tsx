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
import { convertDocumentImageFile } from '../../utils/profileImage';
import '../assessor_admin/Users.css';
import './PendingApplications.css';

interface PendingApplication {
  Ticket_ID: number;
  Ticket_Number: string;
  Application_Status: string;
  Application_Date: string;
  Connection_Type: string;
  Requirements_Submitted: string;
  Remarks?: string | null;
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

const isImageDataUrl = (value?: string | null) => /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(String(value || '').trim());
const statusToneClass = (value?: string | null) => String(value || 'unknown').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

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
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);
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

  const handleSedulaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const imageDataUrl = await convertDocumentImageFile(file);
      setFormData((current) => ({
        ...current,
        requirementsSubmitted: imageDataUrl,
      }));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to prepare the selected sedula image.', 'error');
    }
  };

  const openConfirmAction = (type: ConfirmActionState['type'], application: PendingApplication) => {
    setConfirmAction({ type, application });
    setRejectionReason('');
  };

  const closeConfirmAction = (force = false) => {
    if (actionSubmitting && !force) {
      return;
    }
    setConfirmAction(null);
    setRejectionReason('');
  };

  const handleApprove = async (accountId: number) => {
    try {
      const result = await requestJson<{ success: boolean; message?: string }>('/admin/approve-user', {
        method: 'POST',
        body: JSON.stringify({ accountId, approvedBy: user?.id }),
      }, 'Failed to approve application.');
      if (result.success) {
        showToast(result.message || 'Application approved successfully', 'success');
        closeConfirmAction(true);
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

  const handleReject = async (accountId: number, reason: string) => {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      showToast('A rejection reason is required before rejecting an application.', 'error');
      return;
    }

    try {
      const result = await requestJson<{ success: boolean; message?: string }>('/admin/reject-user', {
        method: 'POST',
        body: JSON.stringify({ accountId, approvedBy: user?.id, remarks: normalizedReason }),
      }, 'Failed to reject application.');
      if (result.success) {
        showToast(result.message || 'Application rejected successfully', 'success');
        closeConfirmAction(true);
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
        ? application.Application_Status !== 'Rejected'
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
        application.Remarks,
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
              <button className="btn-icon btn-success" title="Approve" onClick={(event) => { event.stopPropagation(); openConfirmAction('approve', row); }}>
                <i className="fas fa-check"></i>
              </button>
              <button className="btn-icon btn-danger" title="Reject" onClick={(event) => { event.stopPropagation(); openConfirmAction('reject', row); }}>
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
    : 'Reject this application and mark its status as Rejected. The rejection reason will be saved with the application record.';

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

  const requirementPreviewImage = isImageDataUrl(formData.requirementsSubmitted) ? formData.requirementsSubmitted : '';
  const selectedRequirementImage = isImageDataUrl(selectedApplication?.Requirements_Submitted) ? selectedApplication?.Requirements_Submitted : '';

  const handleConfirmAction = async () => {
    if (!confirmAction) {
      return;
    }

    setActionSubmitting(true);
    try {
      if (confirmAction.type === 'approve') {
        await handleApprove(confirmAction.application.Account_ID);
      } else {
        await handleReject(confirmAction.application.Account_ID, rejectionReason);
      }
    } finally {
      setActionSubmitting(false);
    }
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
              <option value="Rejected">Rejected</option>
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
              emptyMessage="No applications found."
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
                    <button className="btn btn-danger" onClick={() => openConfirmAction('reject', selectedApplication)}>
                      <i className="fas fa-times"></i> Reject
                    </button>
                    <button className="btn btn-primary" onClick={() => openConfirmAction('approve', selectedApplication)}>
                      <i className="fas fa-check"></i> Approve
                    </button>
                  </>
                )}
              </>
            ) : undefined
          }
        >
          {selectedApplication && (
            <div className="pending-app-details">
              <div className="pending-app-details-hero">
                <div className="pending-app-details-copy">
                  <p className="pending-app-details-eyebrow">Consumer Application</p>
                  <h3 className="pending-app-details-title">{selectedApplication.Consumer_Name || 'Pending Application'}</h3>
                  <p className="pending-app-details-subtitle">
                    Review the submitted account, address, and service details before approving or updating this request.
                  </p>
                </div>
                <span className={`pending-app-status-chip pending-app-status-chip-${statusToneClass(selectedApplication.Application_Status)}`}>
                  {selectedApplication.Application_Status || 'Unknown'}
                </span>
              </div>

              {selectedApplication.Remarks && (
                <div className="pending-app-rejection-note">
                  <i className="fas fa-comment-alt"></i>
                  <div>
                    <strong>Saved Rejection Reason</strong>
                    <p>{selectedApplication.Remarks}</p>
                  </div>
                </div>
              )}

              <div className="pending-app-details-meta">
                <div className="pending-app-meta-row">
                  <span className="pending-app-meta-label">Ticket Number</span>
                  <span className="pending-app-meta-value">{selectedApplication.Ticket_Number}</span>
                </div>
                <div className="pending-app-meta-row">
                  <span className="pending-app-meta-label">Connection Type</span>
                  <span className="pending-app-meta-value">{selectedApplication.Connection_Type || 'N/A'}</span>
                </div>
                <div className="pending-app-meta-row">
                  <span className="pending-app-meta-label">Applied On</span>
                  <span className="pending-app-meta-value">
                    {selectedApplication.Application_Date ? new Date(selectedApplication.Application_Date).toLocaleString() : 'N/A'}
                  </span>
                </div>
                {selectedApplication.Remarks && (
                  <div className="pending-app-meta-row pending-app-meta-row-remarks">
                    <span className="pending-app-meta-label">Rejection Reason</span>
                    <span className="pending-app-meta-value">{selectedApplication.Remarks}</span>
                  </div>
                )}
              </div>

              <div className="pending-app-panels">
                <section className="pending-app-panel">
                  <div className="pending-app-panel-head">
                    <h4 className="pending-app-panel-title">
                      <i className="fas fa-user-circle"></i> Applicant Snapshot
                    </h4>
                    <p className="pending-app-panel-copy">Submitted identity and contact details for this request.</p>
                  </div>
                  <div className="pending-app-info-list">
                    <div className="pending-app-info-row">
                      <span className="pending-app-info-label">Applicant</span>
                      <span className="pending-app-info-value">{selectedApplication.Consumer_Name || 'N/A'}</span>
                    </div>
                    {canViewUsername && (
                      <div className="pending-app-info-row">
                        <span className="pending-app-info-label">Username</span>
                        <span className="pending-app-info-value">{selectedApplication.Username || 'N/A'}</span>
                      </div>
                    )}
                    <div className="pending-app-info-row">
                      <span className="pending-app-info-label">Contact Number</span>
                      <span className="pending-app-info-value">{selectedApplication.Contact_Number || 'N/A'}</span>
                    </div>
                    <div className="pending-app-info-row">
                      <span className="pending-app-info-label">Classification</span>
                      <span className="pending-app-info-value">{selectedApplication.Classification_Name || 'N/A'}</span>
                    </div>
                  </div>
                </section>

                <section className="pending-app-panel">
                  <div className="pending-app-panel-head">
                    <h4 className="pending-app-panel-title">
                      <i className="fas fa-map-marked-alt"></i> Service & Account
                    </h4>
                    <p className="pending-app-panel-copy">Zone, status, and account details prepared for approval.</p>
                  </div>
                  <div className="pending-app-info-list">
                    <div className="pending-app-info-row">
                      <span className="pending-app-info-label">Zone</span>
                      <span className="pending-app-info-value">{formatZoneLabel(selectedApplication.Zone_Name, selectedApplication.Zone_ID)}</span>
                    </div>
                    <div className="pending-app-info-row">
                      <span className="pending-app-info-label">Official Account No.</span>
                      <span className="pending-app-info-value">{accountNumberDisplay(selectedApplication)}</span>
                    </div>
                    <div className="pending-app-info-row pending-app-info-row-highlight">
                      <span className="pending-app-info-label">Service Address</span>
                      <span className="pending-app-info-value">{selectedApplication.Address || 'N/A'}</span>
                    </div>
                  </div>
                </section>
              </div>

              <div className="pending-app-detail-document">
                <div className="pending-app-document-top">
                  <div className="pending-app-document-meta">
                    <h4 className="pending-app-document-title">Sedula</h4>
                    <p className="pending-app-document-copy">View the uploaded supporting document submitted with this application.</p>
                  </div>
                </div>
                <div className="pending-app-document-preview">
                  {selectedRequirementImage ? (
                    <img
                      src={selectedRequirementImage}
                      alt="Sedula"
                      className="pending-app-detail-image"
                    />
                  ) : (
                    <div className="pending-app-document-empty">
                      <i className="fas fa-file-image"></i>
                      <span className="pending-app-detail-value">{selectedApplication.Requirements_Submitted || 'No sedula uploaded.'}</span>
                    </div>
                  )}
                </div>
              </div>
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
          <div className="pending-app-edit">
            <section className="pending-app-section">
              <div className="pending-app-section-head">
                <h3 className="pending-app-section-title">Applicant Details</h3>
                <p className="pending-app-section-copy">Review the pending concessionaire information before approval.</p>
              </div>
              <div className="pending-app-grid">
                {canViewUsername && (
                  <FormInput label="Username" value={formData.username} onChange={(value) => setFormData({ ...formData, username: value })} required />
                )}
                <FormInput label="First Name" value={formData.firstName} onChange={(value) => setFormData({ ...formData, firstName: value })} required />
                <FormInput label="Middle Name" value={formData.middleName} onChange={(value) => setFormData({ ...formData, middleName: value })} />
                <FormInput label="Last Name" value={formData.lastName} onChange={(value) => setFormData({ ...formData, lastName: value })} required />
                <FormInput label="Contact Number" value={formData.contactNumber} onChange={(value) => setFormData({ ...formData, contactNumber: normalizePhoneInput(value) })} />
                <FormInput label="Connection Type" value={formData.connectionType} onChange={(value) => setFormData({ ...formData, connectionType: value })} />
              </div>
            </section>

            <section className="pending-app-section">
              <div className="pending-app-section-head">
                <h3 className="pending-app-section-title">Service Address</h3>
                <p className="pending-app-section-copy">Keep the pending service location and classification details organized.</p>
              </div>
              <div className="pending-app-grid">
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
                <div className="pending-app-field-span-2">
                  <FormInput
                    label="Account Number"
                    value={formData.accountNumber}
                    onChange={(value) => setFormData({ ...formData, accountNumber: value })}
                    placeholder="This stays hidden until the application is approved"
                  />
                </div>
              </div>
            </section>

            <section className="pending-app-section">
              <div className="pending-app-section-head">
                <h3 className="pending-app-section-title">Sedula Image</h3>
                <p className="pending-app-section-copy">The concessionaire should now upload a clear image of the sedula for verification.</p>
              </div>
              <div className="pending-app-document-card">
                <div className="pending-app-document-top">
                  <div className="pending-app-document-meta">
                    <h4 className="pending-app-document-title">Uploaded Sedula</h4>
                    <p className="pending-app-document-copy">Accepted formats: PNG, JPG, WEBP, or GIF. Use a clear photo or scan of the document.</p>
                  </div>
                  <div className="pending-app-document-actions">
                    <input
                      id="pending-sedula-upload"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="pending-app-hidden-input"
                      onChange={handleSedulaUpload}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        const input = document.getElementById('pending-sedula-upload') as HTMLInputElement | null;
                        input?.click();
                      }}
                    >
                      <i className="fas fa-upload"></i> Upload Sedula
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setFormData((current) => ({ ...current, requirementsSubmitted: '' }))}
                      disabled={!formData.requirementsSubmitted}
                    >
                      <i className="fas fa-trash-alt"></i> Remove
                    </button>
                  </div>
                </div>

                <div className="pending-app-document-preview">
                  {requirementPreviewImage ? (
                    <img src={requirementPreviewImage} alt="Sedula preview" />
                  ) : (
                    <div className="pending-app-document-empty">
                      <i className="fas fa-file-image"></i>
                      <span>No sedula image uploaded yet.</span>
                    </div>
                  )}
                </div>

                {formData.requirementsSubmitted && !requirementPreviewImage && (
                  <div className="pending-app-document-legacy">
                    Existing legacy requirement value: <strong>{formData.requirementsSubmitted}</strong>. Uploading a new image will replace it.
                  </div>
                )}
              </div>
            </section>
          </div>
        </Modal>

        <Modal
          isOpen={Boolean(confirmAction)}
          onClose={closeConfirmAction}
          title={confirmAction?.type === 'approve' ? 'Approve Application' : 'Reject Application'}
          size="small"
          footer={
            confirmAction ? (
              <>
                <button className="btn btn-secondary" onClick={closeConfirmAction} disabled={actionSubmitting}>
                  Cancel
                </button>
                <button
                  className={`btn ${confirmAction.type === 'approve' ? 'btn-primary' : 'btn-danger'}`}
                  onClick={handleConfirmAction}
                  disabled={actionSubmitting || (confirmAction.type === 'reject' && !rejectionReason.trim())}
                >
                  {actionSubmitting ? 'Saving...' : confirmAction.type === 'approve' ? 'Approve' : 'Reject'}
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
              {confirmAction.type === 'reject' && (
                <div className="pending-app-reject-form">
                  <label className="pending-app-reject-label" htmlFor="pending-app-rejection-reason">
                    Rejection Reason
                  </label>
                  <textarea
                    id="pending-app-rejection-reason"
                    className="application-textarea pending-app-reject-textarea"
                    value={rejectionReason}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    placeholder="Explain why this application is being rejected."
                    rows={4}
                  />
                  <p className="pending-app-reject-hint">A reason is required and will stay attached to the rejected application.</p>
                </div>
              )}
            </div>
          )}
        </Modal>
      </div>
    </MainLayout>
  );
};

export default PendingApplications;
