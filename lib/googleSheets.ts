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

  try {
    // Method 1: Try with UNFORMATTED_VALUE to get raw data
    let response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'leads',
      valueRenderOption: 'UNFORMATTED_VALUE', // Get raw values without formula evaluation
    });

    let rows = response.data.values;
    
    // Method 2: If we still have errors, try batchGet with multiple render options
    if (!rows || rows.length === 0 || rows.some(row => row.some((cell: any) => String(cell).includes('#ERROR!')))) {
      console.log('Found #ERROR! values, trying alternative method...');
      
      const batchResponse = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: SHEET_ID,
        ranges: ['leads'],
        valueRenderOption: 'FORMULA', // Get the actual formula/text entered
      });
      
      if (batchResponse.data.valueRanges && batchResponse.data.valueRanges[0].values) {
        rows = batchResponse.data.valueRanges[0].values;
      }
    }

    if (!rows || rows.length === 0) {
      return [];
    }

    const headers = rows[0];
    const headerMap = headers.reduce((map, header, index) => {
      map[header] = index;
      return map;
    }, {} as { [key: string]: number });

    const leads = rows.slice(1).map((row, index) => {
      const getVal = (headerName: string) => {
        const rawValue = row[headerMap[headerName]] || '';
        
        // Clean up the value - remove any formula indicators
        let cleanValue = String(rawValue);
        
        // If the value starts with = or ' (common formula indicators), remove them
        if (cleanValue.startsWith('=')) {
          // Extract the content after the = sign
          cleanValue = cleanValue.substring(1);
          // If it's a formula error, try to extract the original value
          if (cleanValue.includes('ERROR') || cleanValue.includes('REF') || cleanValue.includes('VALUE')) {
            // Try to extract quoted text or numbers
            const quotedMatch = cleanValue.match(/"([^"]+)"/);
            const numberMatch = cleanValue.match(/\d+/g);
            if (quotedMatch && quotedMatch[1]) {
              cleanValue = quotedMatch[1];
            } else if (numberMatch && numberMatch.length > 0) {
              cleanValue = numberMatch.join('');
            } else {
              cleanValue = '';
            }
          }
        } else if (cleanValue.startsWith("'")) {
          // Remove leading apostrophe (used to force text in sheets)
          cleanValue = cleanValue.substring(1);
        }
        
        // Remove any #ERROR! or similar Excel/Sheets errors
        if (cleanValue.includes('#ERROR!') || cleanValue.includes('#REF!') || cleanValue.includes('#VALUE!') || cleanValue.includes('#NAME?')) {
          // Try to extract any numbers from the string
          const numbers = cleanValue.match(/\d+/g);
          if (numbers && numbers.length > 0) {
            cleanValue = numbers.join('');
          } else {
            cleanValue = '';
          }
        }
        
        return cleanValue.trim();
      };

      // Special handling for phone numbers
      const getPhoneVal = (headerName: string) => {
        const rawValue = row[headerMap[headerName]] || '';
        let phoneValue = getVal(headerName);
        
        // Log for debugging WhatsApp issues
        if (headerName === 'رقم الواتس' && (rawValue || phoneValue)) {
          console.log(`Row ${index + 2}: WhatsApp processing - Raw: "${rawValue}", Cleaned: "${phoneValue}"`);
        }
        
        // Additional cleanup for phone numbers
        // First, try to detect if it's a formula that Google Sheets couldn't parse
        if (phoneValue.includes('(') || phoneValue.includes(')') || phoneValue.includes('-')) {
          // Extract all digit sequences
          const digitSequences = phoneValue.match(/\d+/g);
          if (digitSequences) {
            phoneValue = digitSequences.join('');
          }
        }
        
        // Remove any non-numeric characters except + at the beginning
        phoneValue = phoneValue.replace(/[^\d+]/g, '');
        
        // If it starts with +, keep it; otherwise remove all non-digits
        if (phoneValue.startsWith('+')) {
          phoneValue = '+' + phoneValue.substring(1).replace(/\D/g, '');
        } else {
          phoneValue = phoneValue.replace(/\D/g, '');
        }
        
        // Log problematic phone numbers for debugging
        if (!phoneValue && rawValue !== '') {
          console.log(`Warning: Could not parse phone number from: "${rawValue}" for column "${headerName}"`);
        }
        
        // Additional logging for WhatsApp
        if (headerName === 'رقم الواتس') {
          console.log(`Row ${index + 2}: WhatsApp final result: "${phoneValue}"`);
        }
        
        return phoneValue;
      };

      return {
        id: index + 2,
        rowIndex: index,
        orderDate: getVal('تاريخ الطلب'),
        name: getVal('الاسم'),
        phone: formatEgyptianPhone(getPhoneVal('رقم الهاتف')),
        whatsapp: formatEgyptianPhone(getPhoneVal('رقم الواتس')),
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
  } catch (error) {
    console.error('Error fetching leads:', error);
    throw error;
  }
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

/**
 * دالة لتشخيص وإصلاح مشاكل الأرقام في Google Sheets
 * يمكن استخدامها لتحديد الصفوف التي تحتوي على أخطاء #ERROR!
 */
export async function diagnosePhoneErrors() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    // Get all values including formulas
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SHEET_ID,
      ranges: ['leads'],
      valueRenderOption: 'FORMULA',
    });

    const unformattedResponse = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SHEET_ID,
      ranges: ['leads'],
      valueRenderOption: 'UNFORMATTED_VALUE',
    });

    const formattedResponse = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SHEET_ID,
      ranges: ['leads'],
      valueRenderOption: 'FORMATTED_VALUE',
    });

    if (!response.data.valueRanges || !formattedResponse.data.valueRanges || !unformattedResponse.data.valueRanges) {
      return { errors: [], phoneStats: {}, whatsappStats: {}, summary: {} };
    }

    const formulaRows = response.data.valueRanges[0].values || [];
    const formattedRows = formattedResponse.data.valueRanges[0].values || [];
    const unformattedRows = unformattedResponse.data.valueRanges[0].values || [];
    
    if (formulaRows.length === 0 || formattedRows.length === 0) {
      return { errors: [], phoneStats: {}, whatsappStats: {}, summary: {} };
    }

    const headers = formulaRows[0];
    const phoneIndex = headers.indexOf('رقم الهاتف');
    const whatsappIndex = headers.indexOf('رقم الواتس');
    
    console.log('Headers found:', headers);
    console.log('Phone column index:', phoneIndex);
    console.log('WhatsApp column index:', whatsappIndex);
    
    const errors: any[] = [];
    const phoneStats = { total: 0, empty: 0, hasError: 0, valid: 0, problematic: [] as any[] };
    const whatsappStats = { total: 0, empty: 0, hasError: 0, valid: 0, problematic: [] as any[] };

    for (let i = 1; i < Math.max(formattedRows.length, unformattedRows.length); i++) {
      const formattedRow = formattedRows[i] || [];
      const formulaRow = formulaRows[i] || [];
      const unformattedRow = unformattedRows[i] || [];
      
      // Check phone number
      if (phoneIndex !== -1) {
        phoneStats.total++;
        const formattedPhone = formattedRow[phoneIndex] || '';
        const formulaPhone = formulaRow[phoneIndex] || '';
        const unformattedPhone = unformattedRow[phoneIndex] || '';
        
        if (!formattedPhone && !formulaPhone && !unformattedPhone) {
          phoneStats.empty++;
        } else if (String(formattedPhone).includes('#ERROR!') || String(formattedPhone).includes('#') || 
                   String(unformattedPhone).includes('#ERROR!') || String(unformattedPhone).includes('#')) {
          phoneStats.hasError++;
          const suggestion = extractPhoneFromFormula(formulaPhone || unformattedPhone);
          errors.push({
            row: i + 1,
            column: 'رقم الهاتف',
            formattedValue: formattedPhone,
            unformattedValue: unformattedPhone,
            formula: formulaPhone,
            suggestion,
            type: 'error'
          });
          phoneStats.problematic.push({
            row: i + 1,
            formatted: formattedPhone,
            unformatted: unformattedPhone,
            formula: formulaPhone,
            suggestion
          });
        } else {
          // Check if phone appears to be problematic but not showing error
          const processedPhone = formatEgyptianPhone(unformattedPhone || formattedPhone);
          if (!processedPhone && (formattedPhone || unformattedPhone)) {
            phoneStats.problematic.push({
              row: i + 1,
              formatted: formattedPhone,
              unformatted: unformattedPhone,
              formula: formulaPhone,
              processed: processedPhone,
              issue: 'Cannot format'
            });
          } else {
            phoneStats.valid++;
          }
        }
      }
      
      // Check WhatsApp number
      if (whatsappIndex !== -1) {
        whatsappStats.total++;
        const formattedWhatsapp = formattedRow[whatsappIndex] || '';
        const formulaWhatsapp = formulaRow[whatsappIndex] || '';
        const unformattedWhatsapp = unformattedRow[whatsappIndex] || '';
        
        if (!formattedWhatsapp && !formulaWhatsapp && !unformattedWhatsapp) {
          whatsappStats.empty++;
        } else if (String(formattedWhatsapp).includes('#ERROR!') || String(formattedWhatsapp).includes('#') ||
                   String(unformattedWhatsapp).includes('#ERROR!') || String(unformattedWhatsapp).includes('#')) {
          whatsappStats.hasError++;
          const suggestion = extractPhoneFromFormula(formulaWhatsapp || unformattedWhatsapp);
          errors.push({
            row: i + 1,
            column: 'رقم الواتس',
            formattedValue: formattedWhatsapp,
            unformattedValue: unformattedWhatsapp,
            formula: formulaWhatsapp,
            suggestion,
            type: 'error'
          });
          whatsappStats.problematic.push({
            row: i + 1,
            formatted: formattedWhatsapp,
            unformatted: unformattedWhatsapp,
            formula: formulaWhatsapp,
            suggestion
          });
        } else {
          // Check if whatsapp appears to be problematic but not showing error
          const processedWhatsapp = formatEgyptianPhone(unformattedWhatsapp || formattedWhatsapp);
          if (!processedWhatsapp && (formattedWhatsapp || unformattedWhatsapp)) {
            whatsappStats.problematic.push({
              row: i + 1,
              formatted: formattedWhatsapp,
              unformatted: unformattedWhatsapp,
              formula: formulaWhatsapp,
              processed: processedWhatsapp,
              issue: 'Cannot format'
            });
          } else {
            whatsappStats.valid++;
          }
        }
      }
    }

    const summary = {
      totalRows: Math.max(formattedRows.length - 1, 0),
      phoneColumn: phoneIndex !== -1 ? 'موجود' : 'غير موجود',
      whatsappColumn: whatsappIndex !== -1 ? 'موجود' : 'غير موجود',
      totalErrors: errors.length,
      phoneIssues: phoneStats.hasError + phoneStats.problematic.length,
      whatsappIssues: whatsappStats.hasError + whatsappStats.problematic.length
    };

    return { errors, phoneStats, whatsappStats, summary };
  } catch (error) {
    console.error('Error in diagnosePhoneErrors:', error);
    throw error;
  }
}

/**
 * استخراج رقم الهاتف من صيغة أو نص
 */
function extractPhoneFromFormula(formula: string): string {
  // Remove = sign if present
  let cleaned = String(formula);
  if (cleaned.startsWith('=')) {
    cleaned = cleaned.substring(1);
  }
  
  // Extract all digit sequences
  const digitSequences = cleaned.match(/\d+/g);
  if (digitSequences && digitSequences.length > 0) {
    // Join all digits
    const allDigits = digitSequences.join('');
    
    // If it looks like a phone number, return it
    if (allDigits.length >= 10 && allDigits.length <= 15) {
      return allDigits;
    }
  }
  
  return '';
} 