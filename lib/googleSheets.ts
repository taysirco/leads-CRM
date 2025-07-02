import { GoogleSpreadsheet } from 'google-spreadsheet';
import { formatEgyptianPhone } from './phoneFormatter';

const SHEET_ID = process.env.GOOGLE_SHEET_ID as string;

if (!SHEET_ID) {
  throw new Error('GOOGLE_SHEET_ID environment variable is not set');
}

const doc = new GoogleSpreadsheet(SHEET_ID);

// Temporary any type for rows until proper typings are added
type GoogleSpreadsheetRow = any;

async function authenticate() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    throw new Error('Service account email is not set');
  }
  
  let rawKey = process.env.GOOGLE_PRIVATE_KEY || '';
  
  if (!rawKey && process.env.GOOGLE_PRIVATE_KEY_BASE64) {
    console.log("Found GOOGLE_PRIVATE_KEY_BASE64, decoding...");
    const decodedKey = Buffer.from(process.env.GOOGLE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
    rawKey = decodedKey;
  }

  if (!rawKey) {
    throw new Error('GOOGLE_PRIVATE_KEY or GOOGLE_PRIVATE_KEY_BASE64 must be provided');
  }

  // Final check and replacement for escaped newlines, just in case
  const private_key = rawKey.replace(/\\n/g, '\n');

  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: private_key,
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
  const sheet = await getSheet('leads');
  const rows = (await sheet.getRows()) as GoogleSpreadsheetRow[];
  const debugInfo: { row: number, phone: any, phoneType: string, whatsapp: any, whatsappType: string }[] = [];
  const problematicNumbers = ['1118920324', '1017986564', '1127289000'];

  const leads = rows.map((r: any, index: number) => {
    const rawPhone = r['رقم الهاتف'];
    const rawWhatsapp = r['رقم الواتس'];

    // Check if the raw value (as string) is one of the problematic numbers
    if (problematicNumbers.includes(String(rawPhone)) || problematicNumbers.includes(String(rawWhatsapp))) {
      debugInfo.push({
        row: index + 2,
        phone: rawPhone,
        phoneType: typeof rawPhone,
        whatsapp: rawWhatsapp,
        whatsappType: typeof rawWhatsapp
      });
    }

    const formattedPhone = formatEgyptianPhone(rawPhone || '');
    const formattedWhatsapp = formatEgyptianPhone(rawWhatsapp || '');

    return {
      id: index + 2,
      rowIndex: index,
      orderDate: r['تاريخ الطلب'] ?? '',
      name: r['الاسم'] ?? '',
      phone: formattedPhone,
      whatsapp: formattedWhatsapp,
      governorate: r['المحافظة'] ?? '',
      area: r['المنطقة'] ?? '',
      address: r['العنوان'] ?? '',
      orderDetails: r['تفاصيل الطلب'] ?? '',
      quantity: r['الكمية'] ?? '',
      totalPrice: r['توتال السعر شامل الشحن'] ?? '',
      productName: r['اسم المنتج'] ?? '',
      status: r['الحالة'] ?? '',
      notes: r['ملاحظات'] ?? '',
      source: r['المصدر'] ?? '',
      whatsappSent: r['ارسال واتس اب'] ?? '',
    };
  });

  return { leads, debugInfo };
}

export async function updateLead(rowNumber: number, updates: Partial<LeadRow>) {
  console.log(`updateLead: Updating row ${rowNumber} with:`, updates);
  
  const sheet = await getSheet('leads');
  // Convert display row number back to array index
  const arrayIndex = rowNumber - 2; // Row 2 = index 0, Row 3 = index 1, etc.
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
  const { leads } = await fetchLeads();
  const today = new Date().toISOString().split('T')[0];
  
  const stats = {
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
  
  return stats;
} 