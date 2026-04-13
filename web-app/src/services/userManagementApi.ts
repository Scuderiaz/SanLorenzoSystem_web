import { supabase, isSupabaseConfigured } from '../config/supabase';
import { addToSyncQueue, loadOfflineDataset, saveOfflineDataset } from '../config/database';
import { canReachBackend } from '../utils/backendAvailability';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

type RequestError = Error & {
  status?: number;
  responseBody?: any;
};

type LoadResult<T> = {
  data: T;
  source: 'api' | 'supabase' | 'offline';
};

export type ConsumerDashboardData = {
  consumer: Record<string, any> | null;
  bills: Record<string, any>[];
  payments: Record<string, any>[];
  readings: Record<string, any>[];
};

const defaultSystemSettings = {
  systemName: 'San Lorenzo Ruiz Water Billing System',
  currency: 'PHP',
  lateFee: 10,
  dueDateDays: 15,
};

const OFFLINE_REQUEST_QUEUE = '__request__';

const createRequestError = (message: string, status?: number, responseBody?: any): RequestError => {
  const error = new Error(message) as RequestError;
  error.status = status;
  error.responseBody = responseBody;
  return error;
};

const isNetworkStyleMessage = (value: unknown) =>
  /failed to fetch|networkerror|load failed|fetch failed/i.test(String(value || ''));

const buildOfflineAwareMessage = (fallbackMessage: string) => {
  const browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (browserOffline) {
    return `${fallbackMessage} Offline mode is active and no cached data is available yet.`;
  }
  return fallbackMessage;
};

const toDisplayErrorMessage = (value: unknown, fallbackMessage: string) => {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (value && typeof value === 'object') {
    const payload = value as Record<string, any>;
    const nestedMessage = payload.message || payload.error;
    if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
      return nestedMessage;
    }
  }

  return fallbackMessage;
};

const parseResponseBody = async (response: Response) => {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const normalizeRequestMethod = (options: RequestInit) => String(options.method || 'GET').toUpperCase();

const extractQueueableBody = (body: BodyInit | null | undefined) => {
  if (typeof body !== 'string') {
    return body ?? null;
  }

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
};

const queueOfflineRequest = async (path: string, options: RequestInit) => {
  const method = normalizeRequestMethod(options);
  return addToSyncQueue(OFFLINE_REQUEST_QUEUE, method, {
    path,
    method,
    body: extractQueueableBody(options.body),
  });
};

const createQueuedWriteResponse = <T>(method: string, path: string, queueMeta?: { operationId?: string; createdByDevice?: string; sourceSiteId?: string }) => ({
  success: true,
  queued: true,
  offline: true,
  method,
  path,
  operation_id: queueMeta?.operationId || null,
  created_by_device: queueMeta?.createdByDevice || null,
  source_site_id: queueMeta?.sourceSiteId || null,
  message: 'Saved offline. This action will sync when the backend becomes available.',
}) as T;

const shouldAttemptSupabaseFallback = (error: unknown) => {
  const status = Number((error as RequestError)?.status || 0);
  const message = String((error as RequestError)?.message || '');
  return !status || status >= 500 || /failed to fetch|networkerror|load failed/i.test(message);
};

const toArray = <T = any>(value: unknown): T[] => (Array.isArray(value) ? value : []);

const toNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toDateTime = (value: unknown) => {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const persistOfflineSnapshot = async <T>(datasetKey: string | undefined, data: T) => {
  if (!datasetKey) {
    return;
  }

  try {
    await saveOfflineDataset(datasetKey, data);
  } catch (error) {
    console.warn(`Failed to persist offline snapshot for ${datasetKey}:`, error);
  }
};

const loadOfflineSnapshot = async <T>(datasetKey: string | undefined): Promise<T | null> => {
  if (!datasetKey) {
    return null;
  }

  try {
    return await loadOfflineDataset<T>(datasetKey);
  } catch (error) {
    console.warn(`Failed to read offline snapshot for ${datasetKey}:`, error);
    return null;
  }
};

const buildConsumerName = (...parts: Array<unknown>) => parts.filter(Boolean).map(String).join(' ').replace(/\s+/g, ' ').trim();
const isDeletedApplicationRecord = (row: Record<string, any> | null | undefined) =>
  normalizeStatus(row?.Application_Status) === 'rejected' || normalizeStatus(row?.Account_Status) === 'rejected';

const normalizeStatus = (value: unknown) => String(value || '').trim().toLowerCase();

const getCurrentDateKey = () => new Date().toISOString().slice(0, 10);

const isSameDate = (value: unknown, dateKey: string) => {
  if (!value) {
    return false;
  }

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.toISOString().slice(0, 10) === dateKey;
};

const mapConsumersFromSupabase = (consumers: any[], zones: any[], classifications: any[], meters: any[]) => {
  const zoneMap = new Map((zones || []).map((row) => [row.zone_id, row.zone_name]));
  const classificationMap = new Map((classifications || []).map((row) => [row.classification_id, row.classification_name]));
  const meterMap = new Map<number, any>();

  for (const meter of meters || []) {
    if (!meterMap.has(meter.consumer_id)) {
      meterMap.set(meter.consumer_id, meter);
    }
  }

  return (consumers || []).map((consumer) => {
    const meter = meterMap.get(consumer.consumer_id) || null;
    return {
      Consumer_ID: consumer.consumer_id,
      First_Name: consumer.first_name,
      Middle_Name: consumer.middle_name,
      Last_Name: consumer.last_name,
      Consumer_Name: buildConsumerName(consumer.first_name, consumer.middle_name, consumer.last_name) || null,
      Address: consumer.address,
      Purok: consumer.purok,
      Barangay: consumer.barangay,
      Municipality: consumer.municipality,
      Zip_Code: consumer.zip_code,
      Zone_ID: consumer.zone_id,
      Zone_Name: zoneMap.get(consumer.zone_id) || null,
      Classification_ID: consumer.classification_id,
      Classification_Name: classificationMap.get(consumer.classification_id) || null,
      Account_Number: consumer.account_number,
      Status: consumer.status,
      Contact_Number: consumer.contact_number,
      Connection_Date: consumer.connection_date,
      Login_ID: consumer.login_id ?? null,
      Meter_ID: meter?.meter_id || null,
      Meter_Number: meter?.meter_serial_number || null,
      Meter_Status: meter?.meter_status || null,
    };
  });
};

const mapBillsFromSupabase = (bills: any[], consumers: any[], classifications: any[], readings: any[]) => {
  const consumerMap = new Map((consumers || []).map((row) => [row.consumer_id, row]));
  const classificationMap = new Map((classifications || []).map((row) => [row.classification_id, row.classification_name]));
  const readingMap = new Map((readings || []).map((row) => [row.reading_id, row]));

  return (bills || []).map((bill) => {
    const consumer = consumerMap.get(bill.consumer_id) || null;
    const reading = readingMap.get(bill.reading_id) || null;
    return {
      Bill_ID: bill.bill_id,
      Consumer_ID: bill.consumer_id,
      Reading_ID: bill.reading_id ?? null,
      Bill_Date: bill.bill_date,
      Due_Date: bill.due_date,
      Total_Amount: toNumber(bill.total_amount),
      Amount_Due: toNumber(bill.amount_due, toNumber(bill.total_amount)),
      Water_Charge: toNumber(bill.water_charge),
      Basic_Charge: toNumber(bill.class_cost, toNumber(bill.water_charge, toNumber(bill.total_amount))),
      Environmental_Fee: toNumber(bill.meter_maintenance_fee),
      Meter_Fee: toNumber(bill.meter_maintenance_fee),
      Connection_Fee: toNumber(bill.connection_fee),
      Previous_Balance: toNumber(bill.previous_balance),
      Previous_Penalty: toNumber(bill.previous_penalty),
      Penalties: toNumber(bill.penalty),
      Penalty: toNumber(bill.penalty),
      Total_After_Due_Date: toNumber(bill.total_after_due_date, toNumber(bill.total_amount)),
      Status: bill.status || 'Unpaid',
      Billing_Month: bill.billing_month,
      Date_Covered_From: bill.date_covered_from,
      Date_Covered_To: bill.date_covered_to,
      Consumer_Name: buildConsumerName(consumer?.first_name, consumer?.middle_name, consumer?.last_name) || null,
      Address: consumer?.address || null,
      Account_Number: consumer?.account_number || null,
      Classification: classificationMap.get(consumer?.classification_id) || null,
      Current_Reading: reading?.current_reading ?? null,
      Previous_Reading: reading?.previous_reading ?? null,
      Consumption: reading?.consumption ?? null,
    };
  });
};

const mapPaymentsFromSupabase = (payments: any[], consumers: any[], bills: any[]) => {
  const consumerMap = new Map((consumers || []).map((row) => [row.consumer_id, row]));
  const billMap = new Map((bills || []).map((row) => [row.bill_id, row]));

  return (payments || []).map((payment) => {
    const consumer = consumerMap.get(payment.consumer_id) || null;
    const bill = billMap.get(payment.bill_id) || null;
    return {
      Payment_ID: payment.payment_id,
      Bill_ID: payment.bill_id ?? null,
      Consumer_ID: payment.consumer_id,
      Amount_Paid: toNumber(payment.amount_paid),
      Payment_Date: payment.payment_date,
      Payment_Method: payment.payment_method || 'Cash',
      Reference_No: payment.reference_number || null,
      Reference_Number: payment.reference_number || null,
      OR_Number: payment.or_number || null,
      Status: payment.status || 'Pending',
      Consumer_Name: buildConsumerName(consumer?.first_name, consumer?.middle_name, consumer?.last_name) || 'Unknown Consumer',
      Account_Number: consumer?.account_number || 'N/A',
      Bill_Amount: toNumber(bill?.total_amount),
      Billing_Month: bill?.billing_month || null,
    };
  });
};

const mapMeterReadingsFromSupabase = (readings: any[], consumers: any[]) => {
  const consumerMap = new Map((consumers || []).map((row) => [row.consumer_id, row]));

  return (readings || []).map((reading) => {
    const consumer = consumerMap.get(reading.consumer_id) || null;
    return {
      Reading_ID: reading.reading_id,
      Consumer_ID: reading.consumer_id,
      Meter_ID: reading.meter_id ?? null,
      Previous_Reading: toNumber(reading.previous_reading),
      Current_Reading: toNumber(reading.current_reading),
      Consumption: toNumber(reading.consumption),
      Reading_Status: reading.reading_status || 'Recorded',
      Notes: reading.notes || null,
      Reading_Date: reading.reading_date || reading.created_at || null,
      Consumer_Name: buildConsumerName(consumer?.first_name, consumer?.middle_name, consumer?.last_name) || null,
    };
  });
};

const loadConsumersFromSupabase = async () => {
  const [
    { data: consumers, error: consumerError },
    { data: zones, error: zoneError },
    { data: classifications, error: classificationError },
    { data: meters, error: meterError },
  ] = await Promise.all([
    supabase!.from('consumer').select('*').order('consumer_id', { ascending: false }),
    supabase!.from('zone').select('zone_id, zone_name'),
    supabase!.from('classification').select('classification_id, classification_name'),
    supabase!.from('meter').select('meter_id, consumer_id, meter_serial_number, meter_status').order('meter_id', { ascending: false }),
  ]);

  if (consumerError) throw consumerError;
  if (zoneError) throw zoneError;
  if (classificationError) throw classificationError;
  if (meterError) throw meterError;

  return mapConsumersFromSupabase(consumers || [], zones || [], classifications || [], meters || []);
};

const loadBillsFromSupabase = async () => {
  const [
    { data: bills, error: billError },
    { data: consumers, error: consumerError },
    { data: classifications, error: classificationError },
    { data: readings, error: readingError },
  ] = await Promise.all([
    supabase!.from('bills').select('*').order('bill_date', { ascending: false }),
    supabase!.from('consumer').select('consumer_id, first_name, middle_name, last_name, address, account_number, classification_id'),
    supabase!.from('classification').select('classification_id, classification_name'),
    supabase!.from('meterreadings').select('reading_id, previous_reading, current_reading, consumption'),
  ]);

  if (billError) throw billError;
  if (consumerError) throw consumerError;
  if (classificationError) throw classificationError;
  if (readingError) throw readingError;

  return mapBillsFromSupabase(bills || [], consumers || [], classifications || [], readings || []);
};

const loadPaymentsFromSupabase = async () => {
  const [
    { data: payments, error: paymentError },
    { data: consumers, error: consumerError },
    { data: bills, error: billError },
  ] = await Promise.all([
    supabase!.from('payment').select('*').order('payment_date', { ascending: false }),
    supabase!.from('consumer').select('consumer_id, first_name, middle_name, last_name, account_number'),
    supabase!.from('bills').select('bill_id, total_amount, billing_month'),
  ]);

  if (paymentError) throw paymentError;
  if (consumerError) throw consumerError;
  if (billError) throw billError;

  return mapPaymentsFromSupabase(payments || [], consumers || [], bills || []);
};

const loadMeterReadingsFromSupabase = async () => {
  const [
    { data: readings, error: readingsError },
    { data: consumers, error: consumerError },
  ] = await Promise.all([
    supabase!.from('meterreadings').select('*').order('reading_id', { ascending: false }),
    supabase!.from('consumer').select('consumer_id, first_name, middle_name, last_name'),
  ]);

  if (readingsError) throw readingsError;
  if (consumerError) throw consumerError;

  return mapMeterReadingsFromSupabase(readings || [], consumers || []);
};

const loadConsumerDashboardFromSupabase = async (accountId: number | string): Promise<ConsumerDashboardData> => {
  const { data: consumer, error: consumerError } = await supabase!
    .from('consumer')
    .select('*')
    .eq('login_id', accountId)
    .maybeSingle();

  if (consumerError) throw consumerError;
  if (!consumer) {
    throw createRequestError('Consumer not found', 404);
  }

  const consumerId = consumer.consumer_id;
  const [
    { data: bills, error: billsError },
    { data: payments, error: paymentsError },
    { data: readings, error: readingsError },
    { data: meters, error: metersError },
  ] = await Promise.all([
    supabase!.from('bills').select('*').eq('consumer_id', consumerId).order('bill_date', { ascending: false }),
    supabase!.from('payment').select('*').eq('consumer_id', consumerId).order('payment_date', { ascending: false }),
    supabase!.from('meterreadings').select('*').eq('consumer_id', consumerId).order('reading_date', { ascending: false }).limit(6),
    supabase!.from('meter').select('meter_serial_number').eq('consumer_id', consumerId).order('meter_id', { ascending: false }).limit(1),
  ]);

  if (billsError) throw billsError;
  if (paymentsError) throw paymentsError;
  if (readingsError) throw readingsError;
  if (metersError) throw metersError;

  return {
    consumer: {
      ...consumer,
      Consumer_ID: consumer.consumer_id,
      First_Name: consumer.first_name,
      Middle_Name: consumer.middle_name,
      Last_Name: consumer.last_name,
      Status: consumer.status,
      Account_Number: consumer.account_number || null,
      Meter_Number: meters?.[0]?.meter_serial_number || null,
    },
    bills: (bills || []).map((bill) => ({
      ...bill,
      Bill_ID: bill.bill_id,
      Bill_Date: bill.bill_date,
      Due_Date: bill.due_date,
      Total_Amount: toNumber(bill.total_amount),
      Status: bill.status || 'Unpaid',
    })),
    payments: (payments || []).map((payment) => ({
      ...payment,
      Payment_ID: payment.payment_id,
      Amount_Paid: toNumber(payment.amount_paid),
      Payment_Date: payment.payment_date,
      Reference_Number: payment.reference_number,
      Reference_No: payment.reference_number,
      OR_Number: payment.or_number,
    })),
    readings: (readings || []).map((reading) => ({
      Reading_Date: reading.reading_date || reading.created_at || reading.created_date,
      Consumption: toNumber(reading.consumption),
    })).reverse(),
  };
};

const loadApplicationsFromSupabase = async () => {
  const [
    { data: tickets, error: ticketError },
    { data: accounts, error: accountError },
    { data: consumers, error: consumerError },
    { data: zones, error: zoneError },
    { data: classifications, error: classificationError },
  ] = await Promise.all([
    supabase!.from('connection_ticket').select('ticket_id, ticket_number, status, application_date, connection_type, requirements_submitted, account_id, consumer_id').order('application_date', { ascending: false }),
    supabase!.from('accounts').select('account_id, username, account_status, created_at'),
    supabase!.from('consumer').select('consumer_id, first_name, middle_name, last_name, contact_number, address, purok, barangay, municipality, zip_code, account_number, status, zone_id, classification_id, login_id, connection_date'),
    supabase!.from('zone').select('zone_id, zone_name'),
    supabase!.from('classification').select('classification_id, classification_name'),
  ]);

  if (ticketError) throw ticketError;
  if (accountError) throw accountError;
  if (consumerError) throw consumerError;
  if (zoneError) throw zoneError;
  if (classificationError) throw classificationError;

  const accountMap = new Map((accounts || []).map((row) => [row.account_id, row]));
  const consumerMap = new Map((consumers || []).map((row) => [row.consumer_id, row]));
  const consumerByLoginId = new Map((consumers || []).map((row) => [row.login_id, row]));
  const zoneMap = new Map((zones || []).map((row) => [row.zone_id, row.zone_name]));
  const classificationMap = new Map((classifications || []).map((row) => [row.classification_id, row.classification_name]));

  const rows = (tickets || []).map((ticket) => {
    const account = accountMap.get(ticket.account_id) || null;
    const consumer = consumerMap.get(ticket.consumer_id) || consumerByLoginId.get(ticket.account_id) || null;

    return {
      Ticket_ID: ticket.ticket_id,
      Ticket_Number: ticket.ticket_number,
      Application_Status: ticket.status,
      Application_Date: ticket.application_date,
      Connection_Type: ticket.connection_type,
      Requirements_Submitted: ticket.requirements_submitted,
      Account_ID: account?.account_id ?? ticket.account_id,
      Username: account?.username ?? null,
      Account_Status: account?.account_status ?? null,
      Consumer_ID: consumer?.consumer_id ?? ticket.consumer_id ?? null,
      Consumer_Name: consumer ? buildConsumerName(consumer.first_name, consumer.middle_name, consumer.last_name) : null,
      Contact_Number: consumer?.contact_number ?? null,
      Address: consumer?.address ?? null,
      Purok: consumer?.purok ?? null,
      Barangay: consumer?.barangay ?? null,
      Municipality: consumer?.municipality ?? null,
      Zip_Code: consumer?.zip_code ?? null,
      Account_Number: consumer?.account_number ?? null,
      Consumer_Status: consumer?.status ?? null,
      Zone_ID: consumer?.zone_id ?? null,
      Zone_Name: zoneMap.get(consumer?.zone_id) || null,
      Classification_ID: consumer?.classification_id ?? null,
      Classification_Name: classificationMap.get(consumer?.classification_id) || null,
    };
  });

  const ticketAccountIds = new Set((tickets || []).map((ticket) => Number(ticket.account_id)).filter((value) => Number.isInteger(value) && value > 0));
  const orphanRows = (consumers || [])
    .filter((consumer) => {
      const loginId = Number(consumer.login_id);
      if (!Number.isInteger(loginId) || loginId <= 0 || ticketAccountIds.has(loginId)) {
        return false;
      }

      const account = accountMap.get(loginId);
      return normalizeStatus(account?.account_status) === 'pending' || normalizeStatus(consumer.status) === 'pending';
    })
    .map((consumer) => {
      const account = accountMap.get(consumer.login_id) || null;
      return {
        Ticket_ID: null,
        Ticket_Number: consumer.account_number || `PENDING-STAFF-${consumer.consumer_id}`,
        Application_Status: 'Pending',
        Application_Date: consumer.connection_date || account?.created_at || null,
        Connection_Type: 'Added by Staff',
        Requirements_Submitted: null,
        Account_ID: account?.account_id ?? consumer.login_id,
        Username: account?.username ?? null,
        Account_Status: account?.account_status ?? consumer.status ?? 'Pending',
        Consumer_ID: consumer.consumer_id,
        Consumer_Name: buildConsumerName(consumer.first_name, consumer.middle_name, consumer.last_name),
        Contact_Number: consumer.contact_number ?? null,
        Address: consumer.address ?? null,
        Purok: consumer.purok ?? null,
        Barangay: consumer.barangay ?? null,
        Municipality: consumer.municipality ?? null,
        Zip_Code: consumer.zip_code ?? null,
        Account_Number: consumer.account_number ?? null,
        Consumer_Status: consumer.status ?? null,
        Zone_ID: consumer.zone_id ?? null,
        Zone_Name: zoneMap.get(consumer.zone_id) || null,
        Classification_ID: consumer.classification_id ?? null,
        Classification_Name: classificationMap.get(consumer.classification_id) || null,
      };
    });

  return [...rows, ...orphanRows]
    .filter((row) => !isDeletedApplicationRecord(row))
    .sort((left, right) => toDateTime(right.Application_Date) - toDateTime(left.Application_Date));
};

const loadLatestWaterRateFromSupabase = async () => {
  const { data, error } = await supabase!
    .from('waterrates')
    .select('*')
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
};

const buildAccountLookupFallback = async (query: string) => {
  const [consumers, bills, payments] = await Promise.all([
    loadConsumersFromSupabase(),
    loadBillsFromSupabase(),
    loadPaymentsFromSupabase(),
  ]);

  const normalizedQuery = query.trim().toLowerCase();
  const consumer = consumers.find((row) =>
    String(row.Account_Number || '').toLowerCase() === normalizedQuery ||
    String(row.Account_Number || '').toLowerCase().includes(normalizedQuery) ||
    buildConsumerName(row.First_Name, row.Middle_Name, row.Last_Name).toLowerCase().includes(normalizedQuery)
  ) || null;

  if (!consumer) {
    return null;
  }

  const consumerBills = bills
    .filter((row) => Number(row.Consumer_ID) === Number(consumer.Consumer_ID))
    .slice()
    .sort((left, right) => toDateTime(right.Bill_Date || right.Due_Date) - toDateTime(left.Bill_Date || left.Due_Date));

  const consumerPayments = payments
    .filter((row) => Number(row.Consumer_ID) === Number(consumer.Consumer_ID))
    .slice()
    .sort((left, right) => toDateTime(right.Payment_Date) - toDateTime(left.Payment_Date));

  const currentBill = consumerBills.find((row) => normalizeStatus(row.Status) !== 'paid') || consumerBills[0] || null;
  if (!currentBill) {
    return {
      consumer: {
        Consumer_ID: consumer.Consumer_ID,
        Consumer_Name: buildConsumerName(consumer.First_Name, consumer.Middle_Name, consumer.Last_Name),
        Address: consumer.Address,
        Account_Number: consumer.Account_Number,
        Classification: consumer.Classification_Name || null,
        Connection_Date: consumer.Connection_Date || null,
        Meter_Number: consumer.Meter_Number || null,
        Zone_Name: consumer.Zone_Name || null,
      },
      currentBill: null,
      summary: {
        currentBillAmount: 0,
        previousBalance: 0,
        overduePenalty: 0,
        totalDue: 0,
        dueDate: null,
        billingMonth: null,
        lateFeePercentage: Number(defaultSystemSettings.lateFee || 0),
        isOverdue: false,
      },
      bills: consumerBills,
      payments: consumerPayments,
      ledger: [],
    };
  }

  const currentBillAmount = toNumber(currentBill.Amount_Due, toNumber(currentBill.Total_Amount));
  const dueDate = currentBill.Due_Date ? new Date(String(currentBill.Due_Date)) : null;
  const isOverdue = Boolean(dueDate && !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < Date.now() && normalizeStatus(currentBill.Status) !== 'paid');
  const lateFeePercentage = Number(defaultSystemSettings.lateFee || 0);
  const overduePenalty = toNumber(
    currentBill.Penalty,
    isOverdue ? Number((currentBillAmount * lateFeePercentage) / 100) : 0
  );
  const previousBalance = consumerBills
    .filter((row) => row.Bill_ID !== currentBill.Bill_ID)
    .filter((row) => normalizeStatus(row.Status) !== 'paid')
    .reduce((sum, row) => sum + toNumber(row.Total_Amount), 0);
  const totalDue = currentBillAmount + previousBalance + overduePenalty;

  return {
    consumer: {
      Consumer_ID: consumer.Consumer_ID,
      Consumer_Name: buildConsumerName(consumer.First_Name, consumer.Middle_Name, consumer.Last_Name),
      Address: consumer.Address,
      Account_Number: consumer.Account_Number,
      Classification: consumer.Classification_Name || null,
      Connection_Date: consumer.Connection_Date || null,
      Meter_Number: consumer.Meter_Number || null,
      Zone_Name: consumer.Zone_Name || null,
    },
    currentBill: {
      ...currentBill,
      Penalty: overduePenalty,
      Penalties: overduePenalty,
      Late_Fee_Percentage: lateFeePercentage,
      Is_Overdue: isOverdue,
      Total_After_Due_Date: currentBillAmount + overduePenalty,
    },
    summary: {
      currentBillAmount,
      previousBalance,
      overduePenalty,
      totalDue,
      dueDate: currentBill.Due_Date || null,
      billingMonth: currentBill.Billing_Month || null,
      lateFeePercentage,
      isOverdue,
    },
    bills: consumerBills,
    payments: consumerPayments,
    ledger: [],
  };
};

export const getErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (error && typeof error === 'object') {
    const requestError = error as RequestError;
    if (isNetworkStyleMessage(requestError.message)) {
      return buildOfflineAwareMessage(fallbackMessage);
    }
    if (typeof requestError.message === 'string' && requestError.message.trim()) {
      return requestError.message;
    }

    const responseMessage = toDisplayErrorMessage(requestError.responseBody, '');
    if (isNetworkStyleMessage(responseMessage)) {
      return buildOfflineAwareMessage(fallbackMessage);
    }
    if (responseMessage) {
      return responseMessage;
    }
  }

  return fallbackMessage;
};

export const requestJson = async <T = any>(path: string, options: RequestInit = {}, fallbackMessage = 'Request failed.'): Promise<T> => {
  const method = normalizeRequestMethod(options);
  const isWriteRequest = method !== 'GET' && method !== 'HEAD';

  if (isWriteRequest && !(await canReachBackend())) {
    const queueMeta = await queueOfflineRequest(path, options);
    return createQueuedWriteResponse<T>(method, path, queueMeta || undefined);
  }

  try {
    const headers = options.body
      ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
      : options.headers;

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });

    const payload = await parseResponseBody(response);
    const isFailedEnvelope = Boolean(payload && typeof payload === 'object' && 'success' in payload && payload.success === false);
    if (!response.ok || isFailedEnvelope) {
      throw createRequestError(toDisplayErrorMessage(payload, fallbackMessage), response.status, payload);
    }

    return payload as T;
  } catch (error) {
    if (isWriteRequest && shouldAttemptSupabaseFallback(error) && !(await canReachBackend())) {
      const queueMeta = await queueOfflineRequest(path, options);
      return createQueuedWriteResponse<T>(method, path, queueMeta || undefined);
    }

    if ((error as RequestError)?.status) {
      throw error;
    }

    throw createRequestError(buildOfflineAwareMessage(fallbackMessage));
  }
};

export const requestJsonWithOfflineSnapshot = async <T>(
  path: string,
  offlineDatasetKey: string,
  fallbackMessage = 'Request failed.',
  extractApiData: (payload: any) => T = (payload) => payload as T
): Promise<LoadResult<T>> => {
  try {
    const payload = await requestJson(path, {}, fallbackMessage);
    const data = extractApiData(payload);
    await persistOfflineSnapshot(offlineDatasetKey, data);
    return {
      data,
      source: 'api',
    };
  } catch (error) {
    const offlineData = await loadOfflineSnapshot<T>(offlineDatasetKey);
    if (offlineData !== null) {
      return {
        data: offlineData,
        source: 'offline',
      };
    }

    throw createRequestError(getErrorMessage(error, fallbackMessage), (error as RequestError)?.status, (error as RequestError)?.responseBody);
  }
};

const requestWithSupabaseFallback = async <T>(
  path: string,
  fallbackLoader: (() => Promise<T>) | null,
  extractApiData: (payload: any) => T,
  fallbackMessage: string,
  offlineDatasetKey?: string
): Promise<LoadResult<T>> => {
  try {
    const payload = await requestJson(path, {}, fallbackMessage);
    const data = extractApiData(payload);
    await persistOfflineSnapshot(offlineDatasetKey, data);
    return {
      data,
      source: 'api',
    };
  } catch (error) {
    const shouldFallback = shouldAttemptSupabaseFallback(error);
    const isBrowserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

    if (isBrowserOffline) {
      const offlineData = await loadOfflineSnapshot<T>(offlineDatasetKey);
      if (offlineData !== null) {
        return {
          data: offlineData,
          source: 'offline',
        };
      }
    }

    if (!fallbackLoader || !isSupabaseConfigured || !supabase || !shouldAttemptSupabaseFallback(error)) {
      const offlineData = shouldFallback ? await loadOfflineSnapshot<T>(offlineDatasetKey) : null;
      if (offlineData !== null) {
        return {
          data: offlineData,
          source: 'offline',
        };
      }

      throw createRequestError(getErrorMessage(error, fallbackMessage), (error as RequestError)?.status, (error as RequestError)?.responseBody);
    }

    try {
      const data = await fallbackLoader();
      await persistOfflineSnapshot(offlineDatasetKey, data);
      return {
        data,
        source: 'supabase',
      };
    } catch (fallbackError) {
      const offlineData = await loadOfflineSnapshot<T>(offlineDatasetKey);
      if (offlineData !== null) {
        return {
          data: offlineData,
          source: 'offline',
        };
      }

      throw createRequestError(getErrorMessage(fallbackError, fallbackMessage));
    }
  }
};

export const loadRolesWithFallback = async () => requestWithSupabaseFallback(
  '/roles',
  async () => {
    const { data, error } = await supabase!.from('roles').select('role_id, role_name').order('role_id');
    if (error) throw error;
    return (data || []).map((role) => ({
      Role_ID: role.role_id,
      Role_Name: role.role_name,
    }));
  },
  (payload) => payload?.data || [],
  'Failed to load roles.',
  'dataset.roles'
);

export const loadZonesWithFallback = async () => requestWithSupabaseFallback(
  '/zones',
  async () => {
    const { data, error } = await supabase!.from('zone').select('zone_id, zone_name').order('zone_id');
    if (error) throw error;
    return (data || []).map((zone) => ({
      Zone_ID: zone.zone_id,
      Zone_Name: zone.zone_name,
    }));
  },
  (payload) => payload?.data || [],
  'Failed to load zones.',
  'dataset.zones'
);

export const loadClassificationsWithFallback = async () => requestWithSupabaseFallback(
  '/classifications',
  async () => {
    const { data, error } = await supabase!.from('classification').select('classification_id, classification_name').order('classification_id');
    if (error) throw error;
    return (data || []).map((classification) => ({
      Classification_ID: classification.classification_id,
      Classification_Name: classification.classification_name,
    }));
  },
  (payload) => payload?.data || [],
  'Failed to load classifications.',
  'dataset.classifications'
);

export const loadConsumersWithFallback = async () => requestWithSupabaseFallback(
  '/consumers',
  loadConsumersFromSupabase,
  (payload) => (Array.isArray(payload) ? payload : payload?.data || []),
  'Failed to load consumers.',
  'dataset.consumers'
);

export const loadBillsWithFallback = async () => requestWithSupabaseFallback(
  '/bills',
  loadBillsFromSupabase,
  (payload) => (Array.isArray(payload) ? payload : payload?.data || []),
  'Failed to load bills.',
  'dataset.bills'
);

export const loadPaymentsWithFallback = async () => requestWithSupabaseFallback(
  '/payments',
  loadPaymentsFromSupabase,
  (payload) => (Array.isArray(payload) ? payload : payload?.data || []),
  'Failed to load payments.',
  'dataset.payments'
);

export const loadMeterReadingsWithFallback = async () => requestWithSupabaseFallback(
  '/meter-readings',
  loadMeterReadingsFromSupabase,
  (payload) => (Array.isArray(payload) ? payload : payload?.data || []),
  'Failed to load meter readings.',
  'dataset.meterReadings'
);

export const loadConsumerDashboardWithFallback = async (accountId: number | string) => requestWithSupabaseFallback(
  `/consumer-dashboard/${accountId}`,
  async () => loadConsumerDashboardFromSupabase(accountId),
  (payload) => ({
    consumer: payload?.consumer || null,
    bills: toArray(payload?.bills),
    payments: toArray(payload?.payments),
    readings: toArray(payload?.readings),
  }),
  'Failed to load consumer dashboard.',
  `dataset.consumerDashboard.${accountId}`
);

export const loadUnifiedUsersWithFallback = async () => requestWithSupabaseFallback(
  '/users/unified',
  async () => {
    const [{ data: accounts, error: accountError }, { data: roles, error: roleError }] = await Promise.all([
      supabase!.from('accounts').select('account_id, username, role_id, account_status').order('account_id', { ascending: false }),
      supabase!.from('roles').select('role_id, role_name'),
    ]);

    if (accountError) throw accountError;
    if (roleError) throw roleError;

    const roleMap = new Map((roles || []).map((role) => [role.role_id, role.role_name]));
    return (accounts || []).map((account) => ({
      AccountID: account.account_id,
      Username: account.username,
      Full_Name: account.username || 'N/A',
      Role_ID: account.role_id,
      Role_Name: roleMap.get(account.role_id) || null,
      Status: account.account_status,
    }));
  },
  (payload) => payload?.data || [],
  'Failed to load users.',
  'dataset.unifiedUsers'
);

export const loadApplicationsWithFallback = async () => requestWithSupabaseFallback(
  '/applications',
  loadApplicationsFromSupabase,
  (payload) => payload?.data || [],
  'Failed to load applications.',
  'dataset.applications'
);

export const loadPendingApplicationsWithFallback = async () => requestWithSupabaseFallback(
  '/applications/pending',
  async () => {
    const rows = await loadApplicationsFromSupabase();
    return rows.filter((row) => normalizeStatus(row.Application_Status) === 'pending');
  },
  (payload) => payload?.data || [],
  'Failed to load pending applications.',
  'dataset.pendingApplications'
);

export const loadLatestWaterRateWithFallback = async () => requestWithSupabaseFallback(
  '/water-rates/latest',
  loadLatestWaterRateFromSupabase,
  (payload) => payload?.data || null,
  'Failed to load the latest water rate.',
  'dataset.latestWaterRate'
);

export const loadAdminSettingsWithFallback = async () => requestWithSupabaseFallback(
  '/admin/settings',
  async () => {
    const [{ data: settingsRow, error: settingsError }, waterRates] = await Promise.all([
      supabase!
        .from('admin_settings')
        .select('settings_id, system_name, currency, due_date_days, late_fee, modified_by, modified_date')
        .eq('settings_id', 1)
        .maybeSingle(),
      loadLatestWaterRateFromSupabase(),
    ]);

    if (settingsError && settingsError.code !== 'PGRST116') {
      throw settingsError;
    }

    return {
      systemSettings: settingsRow
        ? {
            systemName: settingsRow.system_name || defaultSystemSettings.systemName,
            currency: settingsRow.currency || defaultSystemSettings.currency,
            dueDateDays: String(settingsRow.due_date_days ?? defaultSystemSettings.dueDateDays),
            lateFee: String(settingsRow.late_fee ?? defaultSystemSettings.lateFee),
            modifiedBy: settingsRow.modified_by ?? null,
          }
        : { ...defaultSystemSettings },
      waterRates,
    };
  },
  (payload) => payload?.data || { systemSettings: { ...defaultSystemSettings }, waterRates: null },
  'Failed to load admin settings.',
  'dataset.adminSettings'
);

export const loadTreasurerDashboardSummaryWithFallback = async (dateKey = getCurrentDateKey()) => requestWithSupabaseFallback(
  `/treasurer/dashboard-summary?date=${encodeURIComponent(dateKey)}`,
  async () => {
    const payments = await loadPaymentsFromSupabase();
    const todaysPayments = payments.filter((payment) => isSameDate(payment.Payment_Date, dateKey));
    const recentPayments = payments
      .slice()
      .sort((left, right) => toDateTime(right.Payment_Date) - toDateTime(left.Payment_Date))
      .slice(0, 10)
      .map((payment) => ({
        Receipt_No: payment.OR_Number || payment.Reference_No || `PAY-${payment.Payment_ID || 'N/A'}`,
        Account_Number: payment.Account_Number || 'N/A',
        Consumer_Name: payment.Consumer_Name || 'Unknown Consumer',
        Amount: toNumber(payment.Amount_Paid),
        Payment_Method: payment.Payment_Method || 'Cash',
        Date_Time: payment.Payment_Date || '',
        Validation_Status: payment.Status || 'Pending',
      }));

    return {
      todaysCollections: todaysPayments.reduce((sum, payment) => sum + toNumber(payment.Amount_Paid), 0),
      paymentsToday: todaysPayments.length,
      pendingValidation: payments.filter((payment) => normalizeStatus(payment.Status) === 'pending').length,
      recentPayments,
    };
  },
  (payload) => payload?.data || { todaysCollections: 0, paymentsToday: 0, pendingValidation: 0, recentPayments: [] },
  'Failed to load treasurer dashboard.',
  `dataset.treasurerDashboard.${dateKey}`
);

export const loadAccountLookupWithFallback = async (query: string) => requestWithSupabaseFallback(
  `/treasurer/account-lookup?q=${encodeURIComponent(query)}`,
  async () => buildAccountLookupFallback(query),
  (payload) => payload?.data || null,
  'Account lookup failed.',
  `dataset.accountLookup.${query.trim().toLowerCase()}`
);

export const getFallbackSourceLabel = (sources: Array<'api' | 'supabase' | 'offline'>) => {
  const uniqueSources = new Set(sources);
  if (uniqueSources.has('offline')) {
    return 'offline';
  }
  return uniqueSources.has('supabase') ? 'supabase' : 'api';
};

export const ensureArrayData = <T = any>(value: unknown) => toArray<T>(value);
