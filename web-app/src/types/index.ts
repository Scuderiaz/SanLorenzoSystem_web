export interface User {
  id: number;
  username: string;
  fullName: string;
  email?: string | null;
  profile_picture_url?: string | null;
  role_id: number;
  role_name: string;
}

export interface Consumer {
  Consumer_ID: number;
  First_Name: string;
  Last_Name: string;
  Address: string;
  Zone_ID: number;
  Classification_ID: number;
  Login_ID: number;
  Account_Number: string;
  Meter_Number: string;
  Status: string;
  Contact_Number: string;
  Connection_Date: string;
}

export interface MeterReading {
  Reading_ID: number;
  Route_ID: number;
  Consumer_ID: number;
  Meter_ID: number;
  Meter_Reader_ID: number;
  Created_Date: string;
  Reading_Status: 'Normal' | 'Locked' | 'Malfunction' | 'Estimated';
  Previous_Reading: number;
  Current_Reading: number;
  Consumption: number;
  Notes: string;
  Status: string;
  Reading_Date: string;
}

export interface Bill {
  Bill_ID: number;
  Consumer_ID: number;
  Reading_ID: number;
  Bill_Date: string;
  Due_Date: string;
  Total_Amount: number;
  Status: 'Paid' | 'Unpaid' | 'Overdue';
}

export interface Payment {
  Payment_ID: number;
  Bill_ID: number;
  Consumer_ID: number;
  Amount_Paid: number;
  Payment_Date: string;
  Payment_Method: string;
  Reference_Number: string;
}

export interface Zone {
  Zone_ID: number;
  Zone_Name: string;
}

export interface Classification {
  Classification_ID: number;
  Classification_Name: string;
}

export interface Role {
  Role_ID: number;
  Role_Name: string;
}
