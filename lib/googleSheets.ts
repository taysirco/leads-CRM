import { google } from 'googleapis';
import { formatEgyptianPhone } from './phoneFormatter';

const SHEET_ID = process.env.GOOGLE_SHEET_ID as string;
const SHEET_NAME = 'leads'; // Define sheet name as a constant

if (!SHEET_ID) {
  throw new Error('GOOGLE_SHEET_ID environment variable is not set');
}

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
    valueRenderOption: 'FORMULA', // This is the key to solving the #ERROR! issue
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
    const getVal = (headerName: string) => String(row[headerMap[headerName]] || '');

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
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // For now, we only support updating the status. 
  // A more robust implementation would map all header names to their column letters.
  const statusColumn = 'L'; // Assuming 'الحالة' is in column L
  const range = `${SHEET_NAME}!${statusColumn}${rowNumber}`;

  if (updates.status) {
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[updates.status]],
        },
      });
      console.log(`Successfully updated status for row ${rowNumber} to ${updates.status}`);
    } catch (error) {
      console.error(`Failed to update status for row ${rowNumber}:`, error);
      throw new Error(`Failed to update sheet: ${error}`);
    }
  }
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

  const normalize = (str: string) => (str || '').toLowerCase().replace(/\s+/g, ' ').trim();

  // Per-Product and Per-Source Statistics
  const productStats: { [productName: string]: typeof overallStats } = {};
  const sourceStats: { [sourceName: string]: typeof overallStats } = {};

  leads.forEach((lead) => {
    const productName = normalize(lead.productName || 'منتج غير محدد');
    const sourceName = normalize(lead.source || 'مصدر غير محدد');

    // Initialize stats object if it doesn't exist
    if (!productStats[productName]) {
      productStats[productName] = { total: 0, new: 0, confirmed: 0, pending: 0, rejected: 0, noAnswer: 0, contacted: 0, shipped: 0, today: 0 };
    }
    if (!sourceStats[sourceName]) {
      sourceStats[sourceName] = { total: 0, new: 0, confirmed: 0, pending: 0, rejected: 0, noAnswer: 0, contacted: 0, shipped: 0, today: 0 };
    }

    // Increment counters for product
    productStats[productName].total++;
    if (!lead.status || lead.status === 'جديد') productStats[productName].new++;
    if (lead.status === 'تم التأكيد') productStats[productName].confirmed++;
    if (lead.status === 'في انتظار تأكيد العميل') productStats[productName].pending++;
    if (lead.status === 'رفض التأكيد') productStats[productName].rejected++;
    if (lead.status === 'لم يرد') productStats[productName].noAnswer++;
    if (lead.status === 'تم التواصل معه واتساب') productStats[productName].contacted++;
    if (lead.status === 'تم الشحن') productStats[productName].shipped++;
    if (lead.orderDate && lead.orderDate.startsWith(today)) productStats[productName].today++;

    // Increment counters for source
    sourceStats[sourceName].total++;
    if (!lead.status || lead.status === 'جديد') sourceStats[sourceName].new++;
    if (lead.status === 'تم التأكيد') sourceStats[sourceName].confirmed++;
    if (lead.status === 'في انتظار تأكيد العميل') sourceStats[sourceName].pending++;
    if (lead.status === 'رفض التأكيد') sourceStats[sourceName].rejected++;
    if (lead.status === 'لم يرد') sourceStats[sourceName].noAnswer++;
    if (lead.status === 'تم التواصل معه واتساب') sourceStats[sourceName].contacted++;
    if (lead.status === 'تم الشحن') sourceStats[sourceName].shipped++;
    if (lead.orderDate && lead.orderDate.startsWith(today)) sourceStats[sourceName].today++;
  });

  return { overall: overallStats, byProduct: productStats, bySource: sourceStats };
} 