import { loadOfflineDataset, saveOfflineDataset } from '../config/database';

type ConsumerFallbackDataset = {
  Consumer?: Record<string, unknown> | null;
  bills?: unknown[];
  payments?: unknown[];
  readings?: unknown[];
  [key: string]: unknown;
};

const firstDefined = <T,>(...values: T[]): T | undefined => values.find((value) => value !== undefined);

const asString = (value: unknown, fallback = '') => {
  if (value === null || value === undefined) {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized || fallback;
};

const composeAddress = (Consumer: Record<string, unknown>) => {
  const parts = [
    firstDefined(Consumer.Purok, Consumer.purok),
    firstDefined(Consumer.Barangay, Consumer.barangay),
    firstDefined(Consumer.Municipality, Consumer.municipality),
    firstDefined(Consumer.Zip_Code, Consumer.zip_code),
  ]
    .map((value) => asString(value))
    .filter(Boolean);

  return parts.join(', ');
};

export const syncConsumerDashboardFallback = async (
  accountId: number | string,
  consumerPatch: Record<string, unknown>
) => {
  try {
    const datasetKey = `dataset.consumerDashboard.${accountId}`;
    const cachedDataset = await loadOfflineDataset<ConsumerFallbackDataset>(datasetKey);
    const cachedConsumer = cachedDataset?.Consumer && typeof cachedDataset.Consumer === 'object'
      ? cachedDataset.Consumer
      : {};

    const mergedConsumer = {
      ...cachedConsumer,
      ...consumerPatch,
    };

    const consumerId = firstDefined(mergedConsumer.Consumer_ID, mergedConsumer.consumer_id);
    const username = asString(firstDefined(mergedConsumer.Username, mergedConsumer.username));
    const profilePicture = firstDefined(
      mergedConsumer.Profile_Picture_URL,
      mergedConsumer.profile_picture_url,
      null
    ) as string | null;
    const firstName = asString(firstDefined(mergedConsumer.First_Name, mergedConsumer.first_name));
    const middleName = asString(firstDefined(mergedConsumer.Middle_Name, mergedConsumer.middle_name));
    const lastName = asString(firstDefined(mergedConsumer.Last_Name, mergedConsumer.last_name));
    const purok = asString(firstDefined(mergedConsumer.Purok, mergedConsumer.purok));
    const barangay = asString(firstDefined(mergedConsumer.Barangay, mergedConsumer.barangay));
    const municipality = asString(
      firstDefined(mergedConsumer.Municipality, mergedConsumer.municipality),
      'San Lorenzo Ruiz'
    );
    const zipCode = asString(firstDefined(mergedConsumer.Zip_Code, mergedConsumer.zip_code), '4610');
    const contactNumber = asString(firstDefined(mergedConsumer.Contact_Number, mergedConsumer.contact_number));
    const address = asString(firstDefined(mergedConsumer.Address, mergedConsumer.address)) || composeAddress(mergedConsumer);

    await saveOfflineDataset(datasetKey, {
      ...(cachedDataset || {}),
      Consumer: {
        ...mergedConsumer,
        Consumer_ID: consumerId,
        consumer_id: consumerId,
        Username: username,
        username: username,
        Profile_Picture_URL: profilePicture,
        profile_picture_url: profilePicture,
        First_Name: firstName,
        first_name: firstName,
        Middle_Name: middleName,
        middle_name: middleName,
        Last_Name: lastName,
        last_name: lastName,
        Purok: purok,
        purok: purok,
        Barangay: barangay,
        barangay: barangay,
        Municipality: municipality,
        municipality: municipality,
        Zip_Code: zipCode,
        zip_code: zipCode,
        Contact_Number: contactNumber,
        contact_number: contactNumber,
        Address: address,
        address: address,
      },
      bills: Array.isArray(cachedDataset?.bills) ? cachedDataset.bills : [],
      payments: Array.isArray(cachedDataset?.payments) ? cachedDataset.payments : [],
      readings: Array.isArray(cachedDataset?.readings) ? cachedDataset.readings : [],
    });
  } catch (error) {
    console.error('Failed to sync Consumer fallback snapshot:', error);
  }
};


