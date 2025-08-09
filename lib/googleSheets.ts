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
  assignee?: string; // المسؤول (Q/R column)
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

  const headers = rows[0].map((h: string) => (h || '').trim());
  const headerMap: { [key: string]: number } = headers.reduce((map: { [key: string]: number }, header, index) => {
    map[header.toLowerCase()] = index; // Use lowercase for case-insensitive matching
    return map;
  }, {});
  
  const fieldToHeaderMap: { [K in keyof Omit<LeadRow, 'id' | 'rowIndex'>]-?: string[] } = {
    orderDate: ['تاريخ الطلب'],
    name: ['الاسم', 'اسم العميل'],
    phone: ['رقم الهاتف', 'الهاتف'],
    whatsapp: ['رقم الواتس', 'واتساب'],
    governorate: ['المحافظة'],
    area: ['المنطقة'],
    address: ['العنوان'],
    orderDetails: ['تفاصيل الطلب', 'التفاصيل'],
    quantity: ['الكمية'],
    totalPrice: ['توتال السعر شامل الشحن', 'السعر الاجمالي', 'السعر'],
    productName: ['اسم المنتج', 'المنتج'],
    status: ['الحالة'],
    notes: ['ملاحظات'],
    source: ['المصدر'],
    whatsappSent: ['ارسال واتس اب'],
    assignee: ['المسؤول', 'assigned_to'],
  } as any;

  const leads = rows.slice(1).map((row, index) => {
    const getVal = (possibleHeaders: string[]) => {
      for (const header of possibleHeaders) {
        const headerIndex = headerMap[header.toLowerCase()];
        if (headerIndex !== undefined) {
          return String(row[headerIndex] || '');
        }
      }
      return '';
    };

    return {
      id: index + 2,
      rowIndex: index + 2, // Sheet rows are 1-indexed, and we skip the header
      orderDate: getVal(fieldToHeaderMap.orderDate),
      name: getVal(fieldToHeaderMap.name),
      phone: formatEgyptianPhone(getVal(fieldToHeaderMap.phone)),
      whatsapp: formatEgyptianPhone(getVal(fieldToHeaderMap.whatsapp)),
      governorate: getVal(fieldToHeaderMap.governorate),
      area: getVal(fieldToHeaderMap.area),
      address: getVal(fieldToHeaderMap.address),
      orderDetails: getVal(fieldToHeaderMap.orderDetails),
      quantity: getVal(fieldToHeaderMap.quantity),
      totalPrice: getVal(fieldToHeaderMap.totalPrice),
      productName: getVal(fieldToHeaderMap.productName),
      status: getVal(fieldToHeaderMap.status),
      notes: getVal(fieldToHeaderMap.notes),
      source: getVal(fieldToHeaderMap.source),
      whatsappSent: getVal(fieldToHeaderMap.whatsappSent),
      assignee: getVal(fieldToHeaderMap.assignee),
    } as LeadRow;
  });

  return leads;
}

export async function updateLead(rowNumber: number, updates: Partial<LeadRow>) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const headersResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!1:1`,
  });

  const headers = headersResponse.data.values?.[0];
  if (!headers) {
    throw new Error('Could not retrieve headers from the sheet.');
  }
  
  const headerMap: { [key: string]: number } = headers.reduce((map: { [key: string]: number }, header, index) => {
    map[header.toLowerCase()] = index; // Use lowercase for case-insensitive matching
    return map;
  }, {});

  const fieldToHeaderMap: { [K in keyof Omit<LeadRow, 'id' | 'rowIndex'>]-?: string[] } = {
    orderDate: ['تاريخ الطلب'],
    name: ['الاسم', 'اسم العميل'],
    phone: ['رقم الهاتف', 'الهاتف'],
    whatsapp: ['رقم الواتس', 'واتساب'],
    governorate: ['المحافظة'],
    area: ['المنطقة'],
    address: ['العنوان'],
    orderDetails: ['تفاصيل الطلب', 'التفاصيل'],
    quantity: ['الكمية'],
    totalPrice: ['توتال السعر شامل الشحن', 'السعر الاجمالي', 'السعر'],
    productName: ['اسم المنتج', 'المنتج'],
    status: ['الحالة'],
    notes: ['ملاحظات'],
    source: ['المصدر'],
    whatsappSent: ['ارسال واتس اب'],
    assignee: ['المسؤول', 'assigned_to'],
  } as any;

  const data = (Object.entries(updates) as [keyof LeadRow, any][]).map(([key, value]) => {
    if (key === 'id' || key === 'rowIndex') return null;

    const possibleHeaders = fieldToHeaderMap[key as keyof Omit<LeadRow, 'id' | 'rowIndex'>];
    if (!possibleHeaders) return null;

    let columnIndex: number | undefined;
    for (const header of possibleHeaders) {
        const headerIndex = headerMap[header.toLowerCase()];
        if (headerIndex !== undefined) {
            columnIndex = headerIndex;
            break;
        }
    }
    
    if (columnIndex === undefined) return null;
    
    const columnLetter = String.fromCharCode('A'.charCodeAt(0) + columnIndex);
    
    return {
      range: `${SHEET_NAME}!${columnLetter}${rowNumber}`,
      values: [[value]],
    };
  }).filter(Boolean) as { range: string; values: any[][]; }[];

  if (data.length === 0) {
    console.log('No valid fields to update for row', rowNumber);
    return;
  }

  try {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: data,
      },
    });
    console.log(`Successfully updated row ${rowNumber} with`, updates);
  } catch (error) {
    console.error(`Failed to update row ${rowNumber}:`, error);
    throw new Error(`Failed to update sheet: ${error}`);
  }
}

export async function updateLeadsBatch(rows: Array<{ rowNumber: number; assignee: string }>) {
  if (!rows || rows.length === 0) return;

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  // جلب رؤوس الأعمدة للحصول على رقم عمود "المسؤول"
  const headersResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!1:1`,
  });
  const headers = headersResponse.data.values?.[0] || [];
  const headerMap: { [key: string]: number } = headers.reduce((map: { [key: string]: number }, header, index) => {
    map[(header || '').toLowerCase()] = index;
    return map;
  }, {});

  const possibleHeadersForAssignee = ['المسؤول', 'assigned_to'];
  let assigneeColIndex: number | undefined;
  for (const h of possibleHeadersForAssignee) {
    const idx = headerMap[h.toLowerCase()];
    if (idx !== undefined) { assigneeColIndex = idx; break; }
  }
  if (assigneeColIndex === undefined) {
    throw new Error('لم يتم العثور على عمود "المسؤول" في الشيت');
  }
  const assigneeColumnLetter = String.fromCharCode('A'.charCodeAt(0) + assigneeColIndex);

  const data = rows.map(r => ({
    range: `${SHEET_NAME}!${assigneeColumnLetter}${r.rowNumber}`,
    values: [[r.assignee]],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });
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
  const assigneeStats: { [assignee: string]: typeof overallStats } = {};
  const assigneeProductStats: { [assignee: string]: { [productName: string]: typeof overallStats } } = {};

  leads.forEach((lead) => {
    const productName = normalize(lead.productName || 'منتج غير محدد');
    const sourceName = normalize(lead.source || 'مصدر غير محدد');
    const assigneeName = normalize(lead.assignee || 'غير معين');

    // Initialize stats object if it doesn't exist
    if (!productStats[productName]) {
      productStats[productName] = { total: 0, new: 0, confirmed: 0, pending: 0, rejected: 0, noAnswer: 0, contacted: 0, shipped: 0, today: 0 };
    }
    if (!sourceStats[sourceName]) {
      sourceStats[sourceName] = { total: 0, new: 0, confirmed: 0, pending: 0, rejected: 0, noAnswer: 0, contacted: 0, shipped: 0, today: 0 };
    }
    if (!assigneeStats[assigneeName]) {
      assigneeStats[assigneeName] = { total: 0, new: 0, confirmed: 0, pending: 0, rejected: 0, noAnswer: 0, contacted: 0, shipped: 0, today: 0 };
    }
    if (!assigneeProductStats[assigneeName]) {
      assigneeProductStats[assigneeName] = {};
    }
    if (!assigneeProductStats[assigneeName][productName]) {
      assigneeProductStats[assigneeName][productName] = { total: 0, new: 0, confirmed: 0, pending: 0, rejected: 0, noAnswer: 0, contacted: 0, shipped: 0, today: 0 };
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

    // Increment counters for assignee
    assigneeStats[assigneeName].total++;
    if (!lead.status || lead.status === 'جديد') assigneeStats[assigneeName].new++;
    if (lead.status === 'تم التأكيد') assigneeStats[assigneeName].confirmed++;
    if (lead.status === 'في انتظار تأكيد العميل') assigneeStats[assigneeName].pending++;
    if (lead.status === 'رفض التأكيد') assigneeStats[assigneeName].rejected++;
    if (lead.status === 'لم يرد') assigneeStats[assigneeName].noAnswer++;
    if (lead.status === 'تم التواصل معه واتساب') assigneeStats[assigneeName].contacted++;
    if (lead.status === 'تم الشحن') assigneeStats[assigneeName].shipped++;
    if (lead.orderDate && lead.orderDate.startsWith(today)) assigneeStats[assigneeName].today++;

    // Assignee by product
    assigneeProductStats[assigneeName][productName].total++;
    if (!lead.status || lead.status === 'جديد') assigneeProductStats[assigneeName][productName].new++;
    if (lead.status === 'تم التأكيد') assigneeProductStats[assigneeName][productName].confirmed++;
    if (lead.status === 'في انتظار تأكيد العميل') assigneeProductStats[assigneeName][productName].pending++;
    if (lead.status === 'رفض التأكيد') assigneeProductStats[assigneeName][productName].rejected++;
    if (lead.status === 'لم يرد') assigneeProductStats[assigneeName][productName].noAnswer++;
    if (lead.status === 'تم التواصل معه واتساب') assigneeProductStats[assigneeName][productName].contacted++;
    if (lead.status === 'تم الشحن') assigneeProductStats[assigneeName][productName].shipped++;
    if (lead.orderDate && lead.orderDate.startsWith(today)) assigneeProductStats[assigneeName][productName].today++;
  });

  return { overall: overallStats, byProduct: productStats, bySource: sourceStats, byAssignee: assigneeStats, byAssigneeByProduct: assigneeProductStats };
} 