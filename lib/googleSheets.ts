import { google } from 'googleapis';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { formatEgyptianPhone } from './phoneFormatter';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { startOfDay, endOfDay, subDays } from 'date-fns';

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

// A single, robust authentication function
async function ensureAuthenticated() {
  // Check if we are already authenticated
  if (doc.authMode === 'JWT') {
    // If the token is expired, the library will automatically refresh it.
    // We can add a check here if needed, but for now, we'll trust the library.
    return;
  }
  
  console.log("--- Ensuring Authentication: Performing Full Auth ---");
  
  let rawKey = process.env.GOOGLE_PRIVATE_KEY || '';
  if (!rawKey && process.env.GOOGLE_PRIVATE_KEY_BASE64) {
    console.log("Found GOOGLE_PRIVATE_KEY_BASE64, decoding...");
    rawKey = Buffer.from(process.env.GOOGLE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !rawKey) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY (or BASE64) must be provided');
  }
  
  const private_key = rawKey.replace(/\\n/g, '\n');

  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key,
  });
  
  // No need to call loadInfo() here as getRows() or other operations will trigger it.
}

export async function getSheet(sheetName: string) {
  await ensureAuthenticated();
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
  console.log(`updateLead: Authenticating for row ${rowNumber}...`);
  try {
    await ensureAuthenticated();
    const sheet = doc.sheetsByTitle['leads'];
    if (!sheet) {
      throw new Error("Sheet 'leads' not found. Ensure the sheet name is correct.");
    }
    
    // google-spreadsheet uses 0-based indexing for rows, and headers are the first row.
    // So data rows start at index 0, which corresponds to row 2 in the sheet.
    const arrayIndex = rowNumber - 2;

    console.log(`updateLead: Fetching rows for sheet '${sheet.title}'...`);
    const rows = await sheet.getRows();
    console.log(`updateLead: Total rows fetched: ${rows.length}, attempting to access index: ${arrayIndex}`);

    if (arrayIndex < 0 || arrayIndex >= rows.length) {
      const errorMsg = `Row ${rowNumber} (index ${arrayIndex}) is out of bounds. Total rows: ${rows.length}.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    const row = rows[arrayIndex];
    if (!row) {
      const errorMsg = `Row object not found at index ${arrayIndex}.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log(`updateLead: Found row at index ${arrayIndex}. Current status: '${(row as any).get('الحالة')}'`);

    // Dynamically map updates to sheet headers
    const headerMapping: { [key in keyof LeadRow]?: string } = {
      status: 'الحالة',
      notes: 'ملاحظات',
      name: 'الاسم',
      phone: 'رقم الهاتف',
      whatsapp: 'رقم الواتس',
      governorate: 'المحافظة',
      area: 'المنطقة',
      address: 'العنوان',
      orderDetails: 'تفاصيل الطلب',
      quantity: 'الكمية',
      totalPrice: 'توتال السعر شامل الشحن',
      productName: 'اسم المنتج',
      source: 'المصدر',
      whatsappSent: 'ارسال واتس اب',
    };

    let hasChanges = false;
    for (const key in updates) {
      const typedKey = key as keyof LeadRow;
      const headerName = headerMapping[typedKey];
      
      if (headerName && updates[typedKey] !== undefined) {
        console.log(`updateLead: Setting column '${headerName}' to '${updates[typedKey]}'`);
        row.set(headerName, updates[typedKey]!);
        hasChanges = true;
      }
    }
    
    if (hasChanges) {
      console.log(`updateLead: Saving changes for row ${rowNumber} (index ${arrayIndex})...`);
      await row.save();
      console.log(`updateLead: Successfully saved row ${rowNumber}.`);
    } else {
      console.log(`updateLead: No changes to save for row ${rowNumber}.`);
    }

  } catch (error: any) {
    // Log the detailed error from Google Sheets API
    console.error(`--- DETAILED ERROR for updateLead on row ${rowNumber} ---`);
    console.error(`Error Message: ${error.message}`);
    if (error.response) {
      console.error("Google API Response Status:", error.response.status);
      console.error("Google API Response Data:", JSON.stringify(error.response.data, null, 2));
    }
    console.error("Full Error Object:", JSON.stringify(error, null, 2));
    console.error(`----------------------------------------------------`);
    
    // Re-throw a more user-friendly error
    throw new Error(`Failed to update row ${rowNumber}. Check server logs for details. Original error: ${error.message}`);
  }
}

export async function getOrderStatistics() {
  const leads = await fetchLeads();
  const timeZone = 'Africa/Cairo';

  // --- Helper function to parse dates correctly ---
  const parseDateInCairo = (dateStr: string): Date => {
    // Assuming dateStr is 'YYYY-MM-DD HH:MM:SS' or 'YYYY-MM-DD'
    // We treat it as a wall-clock time in Cairo and convert to a UTC Date object
    return fromZonedTime(dateStr.split(' ')[0], timeZone);
  };

  const nowInCairo = toZonedTime(new Date(), timeZone);

  // --- Time-based boundaries using Cairo Timezone ---
  const todayStart = startOfDay(nowInCairo);
  const todayEnd = endOfDay(nowInCairo);
  const yesterdayStart = startOfDay(subDays(nowInCairo, 1));
  const yesterdayEnd = endOfDay(subDays(nowInCairo, 1));
  const weekStart = startOfDay(subDays(nowInCairo, 6)); // Last 7 days including today
  const monthStart = startOfDay(subDays(nowInCairo, 29)); // Last 30 days including today
  const lastMonthStart = startOfDay(subDays(nowInCairo, 59));
  const lastMonthEnd = endOfDay(subDays(nowInCairo, 30));
  
  const getPrice = (priceStr: string | null | undefined): number => {
    if (!priceStr) return 0;
    return parseFloat(priceStr.replace(/[^\d.]/g, '')) || 0;
  };

  const leadsWithParsedDates = leads.map(l => ({
    ...l,
    orderDateObj: l.orderDate ? parseDateInCairo(l.orderDate) : new Date(0),
    totalPriceNum: getPrice(l.totalPrice),
    normalizedProductName: (l.productName || 'منتج غير محدد').trim()
  }));

  // --- Overall Statistics ---
  const overallStats = {
    total: leads.length,
    new: leads.filter(l => !l.status || l.status === 'جديد').length,
    confirmed: leads.filter(l => l.status === 'تم التأكيد').length,
    pending: leads.filter(l => l.status === 'في انتظار تأكيد العميل').length,
    rejected: leads.filter(l => l.status === 'رفض التأكيد').length,
    noAnswer: leads.filter(l => l.status === 'لم يرد').length,
    contacted: leads.filter(l => l.status === 'تم التواصل معه واتساب').length,
    shipped: leads.filter(l => l.status === 'تم الشحن').length,
    
    // Time-based counts (Cairo Timezone)
    today: leadsWithParsedDates.filter(l => l.orderDateObj >= todayStart && l.orderDateObj <= todayEnd).length,
    yesterday: leadsWithParsedDates.filter(l => l.orderDateObj >= yesterdayStart && l.orderDateObj <= yesterdayEnd).length,
    last7days: leadsWithParsedDates.filter(l => l.orderDateObj >= weekStart && l.orderDateObj <= todayEnd).length,
    last30days: leadsWithParsedDates.filter(l => l.orderDateObj >= monthStart && l.orderDateObj <= todayEnd).length,
  };

  // --- Financial Statistics ---
  const confirmedLeads = leadsWithParsedDates.filter(l => l.status === 'تم التأكيد' || l.status === 'تم الشحن');
  const shippedLeads = leadsWithParsedDates.filter(l => l.status === 'تم الشحن');

  const totalRevenue = shippedLeads.reduce((sum, l) => sum + l.totalPriceNum, 0);
  const averageOrderValue = shippedLeads.length > 0 ? totalRevenue / shippedLeads.length : 0;
  
  const thisMonthRevenue = leadsWithParsedDates
    .filter(l => (l.status === 'تم الشحن') && l.orderDateObj >= monthStart && l.orderDateObj <= todayEnd)
    .reduce((sum, l) => sum + l.totalPriceNum, 0);
  
  const lastMonthRevenue = leadsWithParsedDates
    .filter(l => (l.status === 'تم الشحن') && l.orderDateObj >= lastMonthStart && l.orderDateObj <= lastMonthEnd)
    .reduce((sum, l) => sum + l.totalPriceNum, 0);

  const revenueGrowth = lastMonthRevenue > 0
    ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
    : thisMonthRevenue > 0 ? 100 : 0;

  // --- Conversion Rates ---
  const totalLeadsForConversion = leads.length - overallStats.shipped - overallStats.confirmed;
  const confirmationRate = totalLeadsForConversion > 0
    ? (overallStats.confirmed / totalLeadsForConversion) * 100
    : 0;

  // --- Per-Product Statistics ---
  const productStats: { 
    [productName: string]: { 
      originalName: string;
      total: number; 
      confirmed: number;
      shipped: number;
      rejected: number;
      revenue: number;
    } 
  } = {};

  leadsWithParsedDates.forEach((lead) => {
    const productName = lead.normalizedProductName;
    if (!productStats[productName]) {
      productStats[productName] = {
        originalName: lead.productName || 'منتج غير محدد',
        total: 0, confirmed: 0, shipped: 0, rejected: 0, revenue: 0
      };
    }
    const stats = productStats[productName];
    stats.total++;
    if (lead.status === 'تم التأكيد') stats.confirmed++;
    if (lead.status === 'تم الشحن') {
      stats.shipped++;
      stats.revenue += lead.totalPriceNum;
    }
    if (lead.status === 'رفض التأكيد') stats.rejected++;
  });

  return { 
    overall: overallStats, 
    financials: {
      totalRevenue,
      averageOrderValue,
      thisMonthRevenue,
      lastMonthRevenue,
      revenueGrowth
    },
    conversion: {
      confirmationRate
    },
    byProduct: Object.values(productStats).sort((a,b) => b.revenue - a.revenue) 
  };
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