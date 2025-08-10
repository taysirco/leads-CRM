import { google } from 'googleapis';
import { formatEgyptianPhone } from './phoneFormatter';

const SHEET_ID = process.env.GOOGLE_SHEET_ID as string;
const SHEET_NAME = 'leads'; // Define sheet name as a constant
const STOCK_SHEET_NAME = 'stock'; // Define stock sheet name

if (!SHEET_ID) {
  throw new Error('GOOGLE_SHEET_ID environment variable is not set');
}

// نظام Cache محسن لتقليل طلبات API
interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class GoogleSheetsCache {
  private static cache = new Map<string, CacheEntry>();
  private static readonly DEFAULT_TTL = 30000; // 30 seconds
  
  static set(key: string, data: any, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }
  
  static get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  static clear(): void {
    this.cache.clear();
  }
  
  static invalidate(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

// Rate limiting للتحكم في طلبات API
class APIRateLimit {
  private static lastCall = 0;
  private static readonly MIN_INTERVAL = 1000; // 1 second between calls
  
  static async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;
    
    if (timeSinceLastCall < this.MIN_INTERVAL) {
      const waitTime = this.MIN_INTERVAL - timeSinceLastCall;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastCall = Date.now();
  }
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

// مدير الصفحات المحسن
class SheetManager {
  private static sheetInfoCache: { [key: string]: any } = {};
  private static lastSheetInfoFetch = 0;
  private static readonly SHEET_INFO_TTL = 300000; // 5 minutes
  
  static async getSheetInfo(forceRefresh = false): Promise<any> {
    const cacheKey = `sheet_info_${SHEET_ID}`;
    const cached = GoogleSheetsCache.get(cacheKey);
    
    if (cached && !forceRefresh) {
      console.log('📊 استخدام معلومات الشيت المحفوظة');
      return cached;
    }
    
    try {
      await APIRateLimit.waitIfNeeded();
      
      const auth = getAuth();
      const sheets = google.sheets({ version: 'v4', auth });
      
      console.log('📊 جلب معلومات الشيت من Google...');
      const response = await sheets.spreadsheets.get({
        spreadsheetId: SHEET_ID,
      });
      
      const sheetInfo = response.data;
      GoogleSheetsCache.set(cacheKey, sheetInfo, this.SHEET_INFO_TTL);
      
      return sheetInfo;
    } catch (error) {
      console.error('❌ خطأ في جلب معلومات الشيت:', error);
      throw error;
    }
  }
  
  static async sheetExists(sheetName: string): Promise<boolean> {
    try {
      const sheetInfo = await this.getSheetInfo();
      const sheets = sheetInfo.sheets || [];
      
      return sheets.some((sheet: any) => sheet.properties?.title === sheetName);
    } catch (error) {
      console.error(`❌ خطأ في فحص وجود الشيت ${sheetName}:`, error);
      return false;
    }
  }
}

// دالة محسنة لضمان وجود شيت المخزون
async function ensureStockSheetExists(): Promise<void> {
  try {
    console.log('🔍 فحص وجود شيت المخزون...');
    
    // فحص وجود الشيت أولاً
    const stockSheetExists = await SheetManager.sheetExists(STOCK_SHEET_NAME);
    
    if (stockSheetExists) {
      console.log('✅ شيت المخزون موجود بالفعل');
      return;
    }
    
    console.log('🔨 إنشاء شيت المخزون...');
    await APIRateLimit.waitIfNeeded();
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // إنشاء الشيتات المطلوبة
    const requests = [];
    
    // شيت المخزون الأساسي
    requests.push({
      addSheet: {
        properties: {
          title: STOCK_SHEET_NAME,
          gridProperties: {
            rowCount: 1000,
            columnCount: 10
          }
        }
      }
    });

    // شيت حركات المخزون
    requests.push({
      addSheet: {
        properties: {
          title: 'stock_movements',
          gridProperties: {
            rowCount: 1000,
            columnCount: 10
          }
        }
      }
    });

    // شيت المرتجعات اليومية
    requests.push({
      addSheet: {
        properties: {
          title: 'daily_returns',
          gridProperties: {
            rowCount: 1000,
            columnCount: 10
          }
        }
      }
    });

    // إنشاء الشيتات
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests }
    });

    // إضافة العناوين للشيت الأساسي
    await APIRateLimit.waitIfNeeded();
    
    const stockHeaders = [
      ['ID', 'اسم المنتج', 'الكمية الأولية', 'الكمية الحالية', 'آخر تحديث', 'المتردفات', 'الحد الأدنى']
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${STOCK_SHEET_NAME}!A1:G1`,
      valueInputOption: 'RAW',
      requestBody: { values: stockHeaders }
    });

    // إضافة العناوين لشيت الحركات
    await APIRateLimit.waitIfNeeded();
    
    const movementHeaders = [
      ['ID', 'نوع الحركة', 'اسم المنتج', 'الكمية', 'التاريخ', 'ملاحظات']
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'stock_movements!A1:F1',
      valueInputOption: 'RAW',
      requestBody: { values: movementHeaders }
    });

    // إضافة العناوين لشيت المرتجعات
    await APIRateLimit.waitIfNeeded();
    
    const returnHeaders = [
      ['ID', 'اسم المنتج', 'الكمية', 'نوع المرتجع', 'التاريخ', 'ملاحظات']
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: 'daily_returns!A1:F1',
      valueInputOption: 'RAW',
      requestBody: { values: returnHeaders }
    });

    // مسح الكاش لإجبار تحديث معلومات الشيت
    GoogleSheetsCache.invalidate('sheet_info');
    
    console.log('✅ تم إنشاء شيتات المخزون بنجاح');
    
  } catch (error: any) {
    // إذا كان الخطأ أن الشيت موجود بالفعل، فهذا عادي
    if (error.message?.includes('already exists')) {
      console.log('✅ شيت المخزون موجود بالفعل');
      return;
    }
    
    console.error('❌ خطأ في ضمان وجود شيت المخزون:', error);
    throw error;
  }
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
  assignee?: string; // المسؤول (Q/R column)
};

// إضافة types للمخزون
export type StockItem = {
  id: number;
  rowIndex: number;
  productName: string;
  initialQuantity: number;
  currentQuantity: number;
  lastUpdate: string;
  synonyms?: string; // المتردفات مفصولة بفاصلة
  minThreshold?: number; // الحد الأدنى للتنبيه (افتراضي 10)
};

export type StockMovement = {
  id: number;
  date: string;
  productName: string;
  type: 'sale' | 'return' | 'damage' | 'loss' | 'initial' | 'adjustment';
  quantity: number;
  reason?: string;
  orderId?: number;
  notes?: string;
};

export type DailyReturn = {
  id: number;
  date: string;
  productName: string;
  quantity: number;
  reason: 'damaged_shipping' | 'lost' | 'customer_damage' | 'other';
  notes?: string;
  orderId?: number;
};

// خريطة أعمدة المخزون
const stockFieldToHeaderMap: { [K in keyof Required<StockItem>]: string[] } = {
  id: ['رقم', 'ID'],
  rowIndex: ['صف', 'Row'],
  productName: ['اسم المنتج', 'Product Name'],
  initialQuantity: ['الكمية الأولية', 'Initial Quantity'],
  currentQuantity: ['الكمية الحالية', 'Current Quantity'],
  lastUpdate: ['آخر تحديث', 'Last Update'],
  synonyms: ['المتردفات', 'Synonyms'],
  minThreshold: ['الحد الأدنى', 'Min Threshold']
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

// =================== إدارة المخزون ===================

// دالة للحصول على التاريخ الحالي بتوقيت مصر
const getCurrentEgyptianDate = () => {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Africa/Cairo' }).split(' ')[0];
};

// دالة لجلب بيانات المخزون مع تحسينات التزامن
export async function fetchStock(forceFresh = false): Promise<{ stockItems: StockItem[] }> {
  const cacheKey = `stock_items_${forceFresh ? Date.now() : 'cached'}`;
  
  // فحص الكاش أولاً
  if (!forceFresh) {
    const cached = GoogleSheetsCache.get('stock_items');
    if (cached) {
      console.log('📦 استخدام بيانات المخزون المحفوظة');
      return cached;
    }
  }

  try {
    console.log(`📊 طلب جلب المنتجات (force: ${forceFresh})`);
    
    // ضمان وجود شيت المخزون بطريقة آمنة
    await ensureStockSheetExists();
    
    await APIRateLimit.waitIfNeeded();
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    console.log('📊 جلب بيانات المخزون من Google Sheets...');
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${STOCK_SHEET_NAME}!A:G`,
    });

    const rows = response.data.values || [];
    console.log(`📊 تم جلب ${rows.length} صف من شيت المخزون`);

    // تخطي الصف الأول (العناوين)
    const dataRows = rows.slice(1);
    
    const stockItems: StockItem[] = [];
    
    dataRows.forEach((row, index) => {
      const rowIndex = index + 2; // +2 لأن الصف الأول عناوين والفهرس يبدأ من 1
      
      // التحقق من وجود بيانات صالحة
      if (!row || row.length === 0 || !row[1] || row[1].toString().trim() === '') {
        return; // تخطي الصفوف الفارغة
      }

      const stockItem: StockItem = {
        id: parseInt(row[0]) || stockItems.length + 1,
        rowIndex,
        productName: row[1]?.toString().trim() || '',
        initialQuantity: parseInt(row[2]) || 0,
        currentQuantity: parseInt(row[3]) || parseInt(row[2]) || 0,
        lastUpdate: row[4]?.toString() || getCurrentEgyptianDate(),
        synonyms: row[5]?.toString() || '',
        minThreshold: parseInt(row[6]) || 10
      };

      // التحقق من صحة اسم المنتج
      if (stockItem.productName && stockItem.productName.length > 0) {
        stockItems.push(stockItem);
        console.log(`✅ تم تحليل المنتج: ${stockItem.productName} (الكمية: ${stockItem.currentQuantity})`);
      } else {
        console.log(`⚠️ تم تجاهل صف ${rowIndex} - اسم منتج غير صحيح`);
      }
    });

    console.log(`📦 تم معالجة ${stockItems.length} منتج بنجاح`);
    
    const result = { stockItems };
    
    // حفظ في الكاش
    GoogleSheetsCache.set('stock_items', result, 60000); // Cache for 1 minute
    
    return result;
    
  } catch (error) {
    console.error('❌ خطأ في جلب بيانات المخزون:', error);
    
    // في حالة الخطأ، حاول إرجاع البيانات المحفوظة
    const fallback = GoogleSheetsCache.get('stock_items');
    if (fallback) {
      console.log('🔄 استخدام البيانات المحفوظة كحل بديل');
      return fallback;
    }
    
    throw error;
  }
}

// دالة محسنة للبحث عن المنتج بالمتردفات
export function findProductBySynonyms(productName: string, stockItems: StockItem[]): StockItem | null {
  if (!productName || !stockItems || stockItems.length === 0) {
    return null;
  }

  const normalizedSearchName = productName.toLowerCase().trim()
    .replace(/[إأآا]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');

  for (const item of stockItems) {
    // البحث في الاسم الأساسي
    const normalizedItemName = item.productName.toLowerCase().trim()
      .replace(/[إأآا]/g, 'ا')
      .replace(/[ىي]/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ');

    if (normalizedItemName === normalizedSearchName || 
        normalizedItemName.includes(normalizedSearchName) || 
        normalizedSearchName.includes(normalizedItemName)) {
      return item;
    }

    // البحث في المتردفات
    if (item.synonyms) {
      const synonyms = item.synonyms.split(',').map(s => s.trim());
      for (const synonym of synonyms) {
        const normalizedSynonym = synonym.toLowerCase().trim()
          .replace(/[إأآا]/g, 'ا')
          .replace(/[ىي]/g, 'ي')
          .replace(/ة/g, 'ه')
          .replace(/\s+/g, ' ');

        if (normalizedSynonym === normalizedSearchName || 
            normalizedSynonym.includes(normalizedSearchName) || 
            normalizedSearchName.includes(normalizedSynonym)) {
          return item;
        }
      }
    }
  }

  return null;
}

// دالة لإضافة أو تحديث منتج في المخزون
export async function addOrUpdateStockItem(stockItem: Partial<StockItem>): Promise<void> {
  await ensureStockSheetExists();
  
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const stockItems = await fetchStock(true); // استخدام force refresh
    const existingItem = stockItems.stockItems.find(item => 
      item.productName.toLowerCase() === stockItem.productName?.toLowerCase()
    );

    const currentDate = getCurrentEgyptianDate();
    
    if (existingItem) {
      // تحديث العنصر الموجود
      const rowIndex = existingItem.rowIndex;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${STOCK_SHEET_NAME}!A${rowIndex}:H${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            existingItem.id,
            stockItem.productName || existingItem.productName,
            stockItem.initialQuantity ?? existingItem.initialQuantity,
            stockItem.currentQuantity ?? existingItem.currentQuantity,
            currentDate,
            stockItem.synonyms ?? existingItem.synonyms,
            stockItem.minThreshold ?? existingItem.minThreshold,
            existingItem.lastUpdate // تاريخ الإنشاء الأصلي
          ]]
        }
      });
      
      console.log(`✅ تم تحديث المنتج: ${stockItem.productName}`);
    } else {
      // إضافة عنصر جديد - إصلاح خطأ حساب newId
      const newId = stockItems.stockItems.length > 0 ? Math.max(...stockItems.stockItems.map(item => item.id)) + 1 : 1;
      
      const newRow = [
        newId,
        stockItem.productName || '',
        stockItem.initialQuantity || 0,
        (stockItem.currentQuantity ?? stockItem.initialQuantity) || 0,
        currentDate,
        stockItem.synonyms || '',
        stockItem.minThreshold || 10,
        currentDate
      ];
      
      console.log(`📦 إضافة منتج جديد بـ ID: ${newId}، البيانات:`, newRow);
      
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${STOCK_SHEET_NAME}!A:H`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [newRow]
        }
      });
      
      console.log(`✅ تم إضافة المنتج الجديد: ${stockItem.productName} بنجاح`);
    }

    // تسجيل حركة المخزون
    await addStockMovement({
      productName: stockItem.productName || '',
      type: existingItem ? 'adjustment' : 'initial',
      quantity: stockItem.currentQuantity || 0,
      reason: existingItem ? 'تحديث المخزون' : 'إضافة منتج جديد',
    });

    console.log(`🔄 تم تسجيل حركة المخزون لـ: ${stockItem.productName}`);

  } catch (error) {
    console.error('❌ خطأ في إضافة/تحديث منتج المخزون:', error);
    throw error;
  }
}

// دالة لخصم المخزون عند الشحن
export async function deductStock(productName: string, quantity: number, orderId?: number): Promise<{ success: boolean; message: string; availableQuantity?: number }> {
  try {
    const stockItems = await fetchStock(true); // استخدام force refresh
    const stockItem = findProductBySynonyms(productName, stockItems.stockItems);

    if (!stockItem) {
      return {
        success: false,
        message: `المنتج "${productName}" غير موجود في المخزون`
      };
    }

    if (stockItem.currentQuantity < quantity) {
      return {
        success: false,
        message: `المخزون غير كافي. المتوفر: ${stockItem.currentQuantity}، المطلوب: ${quantity}`,
        availableQuantity: stockItem.currentQuantity
      };
    }

    // تحديث الكمية
    const newQuantity = stockItem.currentQuantity - quantity;
    await addOrUpdateStockItem({
      ...stockItem,
      currentQuantity: newQuantity
    });

    // تسجيل حركة البيع
    await addStockMovement({
      productName: stockItem.productName,
      type: 'sale',
      quantity: -quantity,
      orderId,
      reason: 'شحن طلب'
    });

    return {
      success: true,
      message: `تم خصم ${quantity} من ${stockItem.productName}. المتبقي: ${newQuantity}`
    };

  } catch (error) {
    console.error('Error deducting stock:', error);
    return {
      success: false,
      message: 'حدث خطأ أثناء خصم المخزون'
    };
  }
}

// دالة لإضافة حركة المخزون (للتتبع)
export async function addStockMovement(movement: Partial<StockMovement>): Promise<void> {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // التأكد من وجود شيت stock_movements
    const movementsSheetName = 'stock_movements';
    try {
      await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${movementsSheetName}!A1:H1`,
      });
    } catch {
      // إنشاء الشيت إذا لم يكن موجود
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: movementsSheetName,
              }
            }
          }]
        }
      });

      // إضافة العناوين
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${movementsSheetName}!A1:H1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            'رقم',
            'التاريخ',
            'المنتج',
            'النوع',
            'الكمية',
            'السبب',
            'رقم الطلب',
            'ملاحظات'
          ]]
        }
      });
    }

    // الحصول على ID جديد
    const existingMovements = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${movementsSheetName}!A:A`,
    });
    
    const newId = existingMovements.data.values?.length || 1;
    const currentDateTime = new Date().toLocaleString('sv-SE', { timeZone: 'Africa/Cairo' });

    // إضافة الحركة
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${movementsSheetName}!A:H`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          newId,
          currentDateTime,
          movement.productName || '',
          movement.type || 'adjustment',
          movement.quantity || 0,
          movement.reason || '',
          movement.orderId || '',
          movement.notes || ''
        ]]
      }
    });

  } catch (error) {
    console.error('Error adding stock movement:', error);
    // لا نرمي الخطأ لأن هذا للتتبع فقط
  }
}

// دالة للحصول على تنبيهات نفاد المخزون
export async function getStockAlerts(): Promise<StockItem[]> {
  try {
    const stockItems = await fetchStock(true); // استخدام force refresh
    return stockItems.stockItems.filter(item => 
      item.currentQuantity <= (item.minThreshold || 10)
    );
  } catch (error) {
    console.error('Error getting stock alerts:', error);
    return [];
  }
}

// دالة لإضافة مرتجعات يومية
export async function addDailyReturn(returnItem: Partial<DailyReturn>): Promise<void> {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const returnsSheetName = 'daily_returns';
    
    // التأكد من وجود شيت المرتجعات
    try {
      await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${returnsSheetName}!A1:G1`,
      });
    } catch {
      // إنشاء الشيت
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: returnsSheetName,
              }
            }
          }]
        }
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${returnsSheetName}!A1:G1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            'رقم',
            'التاريخ',
            'المنتج',
            'الكمية',
            'السبب',
            'رقم الطلب',
            'ملاحظات'
          ]]
        }
      });
    }

    // إضافة المرتجع
    const existingReturns = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${returnsSheetName}!A:A`,
    });
    
    const newId = existingReturns.data.values?.length || 1;
    const currentDate = getCurrentEgyptianDate();

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${returnsSheetName}!A:G`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          newId,
          currentDate,
          returnItem.productName || '',
          returnItem.quantity || 0,
          returnItem.reason || 'other',
          returnItem.orderId || '',
          returnItem.notes || ''
        ]]
      }
    });

    // تحديث المخزون (إضافة الكمية المرتجعة)
    const stockItems = await fetchStock(true); // استخدام force refresh
    const stockItem = findProductBySynonyms(returnItem.productName || '', stockItems.stockItems);
    
    if (stockItem) {
      await addOrUpdateStockItem({
        ...stockItem,
        currentQuantity: stockItem.currentQuantity + (returnItem.quantity || 0)
      });

      // تسجيل حركة المرتجع
      await addStockMovement({
        productName: stockItem.productName,
        type: 'return',
        quantity: returnItem.quantity || 0,
        orderId: returnItem.orderId,
        reason: `مرتجع: ${returnItem.reason}`,
        notes: returnItem.notes
      });
    }

  } catch (error) {
    console.error('Error adding daily return:', error);
    throw error;
  }
}

// دالة للحصول على تقارير المخزون
export async function getStockReports() {
  try {
    const stockItems = await fetchStock(true); // استخدام force refresh
    const alerts = await getStockAlerts();
    
    // إحصائيات عامة
    const totalProducts = stockItems.stockItems.length;
    const totalStockValue = stockItems.stockItems.reduce((sum, item) => sum + item.currentQuantity, 0);
    const lowStockCount = alerts.length;
    const outOfStockCount = stockItems.stockItems.filter(item => item.currentQuantity <= 0).length;

    // تقرير المنتجات حسب الحالة
    const byStatus = {
      inStock: stockItems.stockItems.filter(item => item.currentQuantity > (item.minThreshold || 10)).length,
      lowStock: stockItems.stockItems.filter(item => 
        item.currentQuantity > 0 && item.currentQuantity <= (item.minThreshold || 10)
      ).length,
      outOfStock: outOfStockCount
    };

    return {
      summary: {
        totalProducts,
        totalStockValue,
        lowStockCount,
        outOfStockCount
      },
      byStatus,
      stockItems: stockItems.stockItems,
      alerts,
      lastUpdate: getCurrentEgyptianDate()
    };

  } catch (error) {
    console.error('Error getting stock reports:', error);
    throw error;
  }
} 

// دالة اختبار الاتصال والكتابة في Google Sheets للمخزون
export async function testStockSheetConnection(): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    console.log('🔍 بدء اختبار الاتصال مع Google Sheets للمخزون...');
    
    // 1. إنشاء الشيت إذا لم يكن موجود
    await ensureStockSheetExists();
    console.log('✅ تم التأكد من وجود stock sheet');
    
    // 2. اختبار القراءة
    const stockItems = await fetchStock(true); // استخدام force refresh
    console.log('✅ تم جلب بيانات المخزون:', stockItems.stockItems.length, 'منتج');
    
    // 3. اختبار إضافة منتج تجريبي
    const testProduct = {
      productName: `منتج تجريبي ${Date.now()}`,
      initialQuantity: 100,
      currentQuantity: 100,
      synonyms: 'تجريبي، اختبار',
      minThreshold: 10
    };
    
    await addOrUpdateStockItem(testProduct);
    console.log('✅ تم إضافة منتج تجريبي بنجاح');
    
    // 4. التحقق من الإضافة
    const updatedItems = await fetchStock(true); // استخدام force refresh
    const addedProduct = updatedItems.stockItems.find(item => item.productName === testProduct.productName);
    
    if (addedProduct) {
      console.log('✅ تم العثور على المنتج التجريبي في الشيت');
      return {
        success: true,
        message: 'اختبار التزامن مع Google Sheets نجح بشكل كامل',
        data: {
          totalProducts: updatedItems.stockItems.length,
          testProduct: addedProduct,
          allProducts: updatedItems.stockItems
        }
      };
    } else {
      console.log('❌ لم يتم العثور على المنتج التجريبي');
      return {
        success: false,
        message: 'فشل في العثور على المنتج بعد الإضافة',
        data: { totalProducts: updatedItems.stockItems.length }
      };
    }
    
  } catch (error) {
    console.error('❌ خطأ في اختبار Google Sheets:', error);
    return {
      success: false,
      message: `خطأ في الاتصال: ${error}`,
      data: null
    };
  }
} 

// دالة تشخيص شاملة لـ Google Sheets
export async function diagnoseGoogleSheets(): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    console.log('🔍 بدء تشخيص شامل لـ Google Sheets...');
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // 1. فحص معرف الشيت
    console.log(`📋 معرف الشيت: ${SHEET_ID}`);
    
    // 2. جلب معلومات الشيت العامة
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID
    });
    
    console.log(`📊 اسم الملف: ${spreadsheet.data.properties?.title}`);
    console.log(`🗂️ عدد الشيتات: ${spreadsheet.data.sheets?.length}`);
    
    // 3. قائمة جميع الشيتات
    const sheetNames = spreadsheet.data.sheets?.map(sheet => sheet.properties?.title) || [];
    console.log('📑 أسماء الشيتات الموجودة:', sheetNames);
    
    // 4. فحص وجود stock sheet
    const stockSheetExists = sheetNames.includes(STOCK_SHEET_NAME);
    console.log(`📦 وجود شيت ${STOCK_SHEET_NAME}: ${stockSheetExists}`);
    
    if (!stockSheetExists) {
      console.log('❌ شيت المخزون غير موجود، سيتم إنشاؤه...');
      await ensureStockSheetExists();
      console.log('✅ تم إنشاء شيت المخزون');
    }
    
    // 5. فحص محتويات شيت المخزون
    console.log(`🔍 فحص محتويات شيت ${STOCK_SHEET_NAME}...`);
    
    const stockData = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${STOCK_SHEET_NAME}!A:H`,
      valueRenderOption: 'UNFORMATTED_VALUE'
    });
    
    const values = stockData.data.values || [];
    console.log(`📊 عدد الصفوف في شيت المخزون: ${values.length}`);
    
    // طباعة كل البيانات للفحص
    values.forEach((row, index) => {
      console.log(`صف ${index + 1}:`, row);
    });
    
    // 6. فحص العناوين
    if (values.length > 0) {
      const headers = values[0];
      console.log('📝 عناوين الأعمدة:', headers);
      
      const expectedHeaders = ['رقم', 'اسم المنتج', 'الكمية الأولية', 'الكمية الحالية', 'آخر تحديث', 'المتردفات', 'الحد الأدنى', 'تاريخ الإنشاء'];
      const headersMatch = expectedHeaders.every((expected, index) => 
        headers[index] && headers[index].toString().includes(expected.substring(0, 3))
      );
      
      console.log('✅ مطابقة العناوين:', headersMatch);
    }
    
    // 7. معالجة البيانات وعدها
    let productCount = 0;
    const products = [];
    
    if (values.length > 1) {
      for (let i = 1; i < values.length; i++) {
        const row = values[i];
        if (row && row.length > 1 && row[1]) { // التأكد من وجود اسم المنتج
          productCount++;
          products.push({
            id: row[0],
            name: row[1],
            initialQty: row[2],
            currentQty: row[3],
            lastUpdate: row[4]
          });
        }
      }
    }
    
    console.log(`📦 عدد المنتجات الفعلي: ${productCount}`);
    console.log('🛍️ قائمة المنتجات:', products);
    
    return {
      success: true,
      message: `تم تشخيص Google Sheets بنجاح. وُجد ${productCount} منتج في شيت ${STOCK_SHEET_NAME}`,
      data: {
        spreadsheetTitle: spreadsheet.data.properties?.title,
        sheetNames,
        stockSheetExists,
        totalRows: values.length,
        headers: values.length > 0 ? values[0] : [],
        productCount,
        products,
        rawData: values
      }
    };
    
  } catch (error) {
    console.error('❌ خطأ في تشخيص Google Sheets:', error);
    return {
      success: false,
      message: `خطأ في التشخيص: ${error}`,
      data: { error: error }
    };
  }
} 