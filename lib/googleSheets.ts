import { google } from 'googleapis';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { formatEgyptianPhone } from './phoneFormatter';

const SHEET_ID = process.env.GOOGLE_SHEET_ID as string;

if (!SHEET_ID) {
  throw new Error('GOOGLE_SHEET_ID environment variable is not set');
}

const doc = new GoogleSpreadsheet(SHEET_ID);

// Temporary any type for rows until proper typings are added
type GoogleSpreadsheetRow = any;

const getAuth = () => {
  let rawKey = process.env.GOOGLE_PRIVATE_KEY || '';
  if (!rawKey && process.env.GOOGLE_PRIVATE_KEY_BASE64) {
    rawKey = Buffer.from(process.env.GOOGLE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
  }
  if (!rawKey) {
    throw new Error('GOOGLE_PRIVATE_KEY or GOOGLE_PRIVATE_KEY_BASE64 must be provided');
  }
  const private_key = rawKey.replace(/\\n/g, '\n');

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
};

async function authenticate() {
  console.log("--- Authenticating with Environment Variables ---");
  console.log("Found GOOGLE_SHEET_ID:", !!process.env.GOOGLE_SHEET_ID);
  console.log("Found GOOGLE_SERVICE_ACCOUNT_EMAIL:", !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  console.log("Found GOOGLE_PRIVATE_KEY:", !!process.env.GOOGLE_PRIVATE_KEY);
  console.log("Found GOOGLE_PRIVATE_KEY_BASE64:", !!process.env.GOOGLE_PRIVATE_KEY_BASE64);
  
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    throw new Error('Service account email is not set');
  }
  
  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY || '',
  });
  await doc.loadInfo();
}

async function authenticateForUpdate() {
  let rawKey = process.env.GOOGLE_PRIVATE_KEY || '';
  if (!rawKey && process.env.GOOGLE_PRIVATE_KEY_BASE64) {
    rawKey = Buffer.from(process.env.GOOGLE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
  }
  if (!rawKey) {
    throw new Error('GOOGLE_PRIVATE_KEY or GOOGLE_PRIVATE_KEY_BASE64 must be provided');
  }
  const private_key = rawKey.replace(/\\n/g, '\n');

  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key,
  });
  await doc.loadInfo();
}

export async function getSheet(sheetName: string) {
  await authenticate();
  const sheet = doc.sheetsByTitle[sheetName];
  if (!sheet) throw new Error(`Sheet ${sheetName} not found`);
  return sheet;
}

export type LeadRow = {
  id: number;
  rowIndex: number;
  orderDate: string;
  name: string;
  phone: string;
  whatsapp: string;
  governorate: string;
  area: string;
  address: string;
  orderDetails: string;
  quantity: string;
  totalPrice: string;
  productName: string;
  status: string;
  notes: string;
  source: string;
  whatsappSent: string; // ارسال واتس اب
};

export async function fetchLeads() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'leads', // Assuming your sheet name is 'leads'
    valueRenderOption: 'FORMATTED_VALUE', // This is the key to solving the #ERROR! issue
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    return [];
  }

  const headers = rows[0];
  const headerMap = headers.reduce((map, header, index) => {
    map[header] = index;
    return map;
  }, {} as { [key: string]: number });

  const leads = rows.slice(1).map((row, index) => {
    const getVal = (headerName: string) => row[headerMap[headerName]] || '';

    return {
      id: index + 2,
      rowIndex: index,
      orderDate: getVal('تاريخ الطلب'),
      name: getVal('الاسم'),
      phone: formatEgyptianPhone(getVal('رقم الهاتف')),
      whatsapp: formatEgyptianPhone(getVal('رقم الواتس')),
      governorate: getVal('المحافظة'),
      area: getVal('المنطقة'),
      address: getVal('العنوان'),
      orderDetails: getVal('تفاصيل الطلب'),
      quantity: getVal('الكمية'),
      totalPrice: getVal('توتال السعر شامل الشحن'),
      productName: getVal('اسم المنتج'),
      status: getVal('الحالة'),
      notes: getVal('ملاحظات'),
      source: getVal('المصدر'),
      whatsappSent: getVal('ارسال واتس اب'),
    };
  });

  return leads;
}

export async function updateLead(rowNumber: number, updates: Partial<LeadRow>) {
  console.log(`updateLead: Authenticating for update...`);
  await authenticateForUpdate();
  const sheet = await getSheet('leads'); // This will use the old method, which is fine for updates
  const arrayIndex = rowNumber - 2;
  const rows = (await sheet.getRows()) as GoogleSpreadsheetRow[];
  
  console.log(`updateLead: Total rows available: ${rows.length}, trying to access index: ${arrayIndex}`);
  
  if (arrayIndex < 0 || arrayIndex >= rows.length) {
    const error = `Row ${rowNumber} not found. Valid range: 2-${rows.length + 1}`;
    console.error(error);
    throw new Error(error);
  }
  
  const row = rows[arrayIndex];
  if (!row) {
    const error = 'Row not found at index ' + arrayIndex;
    console.error(error);
    throw new Error(error);
  }
  
  console.log(`updateLead: Found row at index ${arrayIndex}, current status: ${(row as any)['الحالة']}`);
  
  // Update all possible fields
  if (updates.status !== undefined) {
    console.log(`updateLead: Changing status from "${(row as any)['الحالة']}" to "${updates.status}"`);
    (row as any)['الحالة'] = updates.status;
  }
  if (updates.notes !== undefined) (row as any)['ملاحظات'] = updates.notes;
  if (updates.name !== undefined) (row as any)['الاسم'] = updates.name;
  if (updates.phone !== undefined) (row as any)['رقم الهاتف'] = updates.phone;
  if (updates.whatsapp !== undefined) (row as any)['رقم الواتس'] = updates.whatsapp;
  if (updates.governorate !== undefined) (row as any)['المحافظة'] = updates.governorate;
  if (updates.area !== undefined) (row as any)['المنطقة'] = updates.area;
  if (updates.address !== undefined) (row as any)['العنوان'] = updates.address;
  if (updates.orderDetails !== undefined) (row as any)['تفاصيل الطلب'] = updates.orderDetails;
  if (updates.quantity !== undefined) (row as any)['الكمية'] = updates.quantity;
  if (updates.totalPrice !== undefined) (row as any)['توتال السعر شامل الشحن'] = updates.totalPrice;
  if (updates.productName !== undefined) (row as any)['اسم المنتج'] = updates.productName;
  if (updates.source !== undefined) (row as any)['المصدر'] = updates.source;
  if (updates.whatsappSent !== undefined) (row as any)['ارسال واتس اب'] = updates.whatsappSent;
  
  console.log(`updateLead: Saving row ${rowNumber} (index ${arrayIndex})`);
  await row.save();
  console.log(`updateLead: Successfully saved row ${rowNumber}`);
}

export async function getOrderStatistics() {
  const leads = await fetchLeads();
  const today = new Date().toISOString().split('T')[0];

  // Overall Statistics
  const overallStats = {
    total: leads.length,
    new: leads.filter((l: LeadRow) => !l.status || l.status === 'جديد').length,
    confirmed: leads.filter((l: LeadRow) => l.status === 'تم التأكيد').length,
    pending: leads.filter((l: LeadRow) => l.status === 'في انتظار تأكيد العميل').length,
    rejected: leads.filter((l: LeadRow) => l.status === 'رفض التأكيد').length,
    noAnswer: leads.filter((l: LeadRow) => l.status === 'لم يرد').length,
    contacted: leads.filter((l: LeadRow) => l.status === 'تم التواصل معه واتساب').length,
    shipped: leads.filter((l: LeadRow) => l.status === 'تم الشحن').length,
    today: leads.filter((l: LeadRow) => l.orderDate && l.orderDate.startsWith(today)).length,
  };

  // Per-Product Statistics
  const productStats: { [productName: string]: typeof overallStats } = {};

  leads.forEach((lead) => {
    const productName = lead.productName || 'منتج غير محدد';
    if (!productStats[productName]) {
      productStats[productName] = {
        total: 0, new: 0, confirmed: 0, pending: 0, rejected: 0, noAnswer: 0, contacted: 0, shipped: 0, today: 0,
      };
    }

    productStats[productName].total++;
    if (!lead.status || lead.status === 'جديد') productStats[productName].new++;
    if (lead.status === 'تم التأكيد') productStats[productName].confirmed++;
    if (lead.status === 'في انتظار تأكيد العميل') productStats[productName].pending++;
    if (lead.status === 'رفض التأكيد') productStats[productName].rejected++;
    if (lead.status === 'لم يرد') productStats[productName].noAnswer++;
    if (lead.status === 'تم التواصل معه واتساب') productStats[productName].contacted++;
    if (lead.status === 'تم الشحن') productStats[productName].shipped++;
    if (lead.orderDate && lead.orderDate.startsWith(today)) productStats[productName].today++;
  });

  return { overall: overallStats, byProduct: productStats };
} 