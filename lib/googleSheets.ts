import { google } from 'googleapis';
import { formatEgyptianPhone } from './phoneFormatter';

const SHEET_ID = process.env.GOOGLE_SHEET_ID as string;
const SHEET_NAME = 'leads'; // Define sheet name as a constant
const STOCK_SHEET_NAME = 'stock'; // Define stock sheet name

if (!SHEET_ID) {
  throw new Error('GOOGLE_SHEET_ID environment variable is not set');
}

// تعريفات الأنواع المطلوبة
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

export interface StockMovement {
  id?: number;
  productName: string;
  type: 'sale' | 'return' | 'damage' | 'loss' | 'initial' | 'adjustment' | 'add_stock';
  quantity: number; // موجب للإضافة، سالب للخصم
  reason?: string;
  supplier?: string;
  cost?: number;
  notes?: string;
  date?: string; // ISO date string
  timestamp?: string; // بالتوقيت المصري
  orderId?: number;
}

export type DailyReturn = {
  id: number;
  date: string;
  productName: string;
  quantity: number;
  reason: 'damaged_shipping' | 'lost' | 'customer_damage' | 'other';
  notes?: string;
  orderId?: number;
};

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

// دالة محسنة للحصول على التوقيت المصري الدقيق
function getEgyptDateTime(): string {
  const now = new Date();
  
  // تحويل دقيق للتوقيت المصري
  const egyptTime = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(now);

  const year = egyptTime.find(part => part.type === 'year')?.value || '';
  const month = egyptTime.find(part => part.type === 'month')?.value || '';
  const day = egyptTime.find(part => part.type === 'day')?.value || '';
  const hour = egyptTime.find(part => part.type === 'hour')?.value || '';
  const minute = egyptTime.find(part => part.type === 'minute')?.value || '';
  const second = egyptTime.find(part => part.type === 'second')?.value || '';

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

// دالة محسنة للحصول على التاريخ المصري فقط
function getEgyptDate(): string {
  const now = new Date();
  const egyptTime = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  
  return egyptTime; // سيكون بصيغة YYYY-MM-DD
}

// دالة محسنة للحصول على الوقت المصري فقط
function getEgyptTime(): string {
  const now = new Date();
  const egyptTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(now);
  
  return egyptTime;
}

// دالة محسنة للحصول على التوقيت المصري
const getCurrentEgyptianDate = () => {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Africa/Cairo' }).split(' ')[0];
};

// دالة للتأكد من وجود ورقة المخزون
async function ensureStockSheetExists(): Promise<void> {
  try {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
    
    // محاولة الوصول للورقة
    try {
      await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${STOCK_SHEET_NAME}!A1:A1`,
      });
      console.log('✅ ورقة المخزون موجودة');
    } catch (error: any) {
      if (error.message?.includes('Unable to parse range') || 
          error.message?.includes('Sheet not found')) {
        console.log('📦 إنشاء ورقة المخزون...');
        await createStockSheet();
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('❌ خطأ في التحقق من ورقة المخزون:', error);
    throw error;
  }
}

// دالة لإنشاء ورقة المخزون
async function createStockSheet(): Promise<void> {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // إنشاء الورقة
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: STOCK_SHEET_NAME,
              gridProperties: {
                columnCount: 8,
                rowCount: 1000
              }
            }
          }
        }]
      }
    });

    // إضافة العناوين
    const headers = [
      'رقم',
      'اسم المنتج', 
      'الكمية الأولية',
      'الكمية الحالية',
      'آخر تحديث',
      'المتردفات',
      'الحد الأدنى',
      'تاريخ الإنشاء'
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${STOCK_SHEET_NAME}!A1:H1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers]
      }
    });

    console.log('✅ تم إنشاء ورقة المخزون بنجاح');
  } catch (error) {
    console.error('❌ خطأ في إنشاء ورقة المخزون:', error);
    throw error;
  }
}

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

// دالة محسنة للتأكد من وجود ورقة حركات المخزون
async function ensureStockMovementsSheetExists() {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    
    if (!spreadsheetId) {
      throw new Error('معرف Google Sheet غير موجود');
    }

    // محاولة الوصول للورقة
    try {
      await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'stock_movements!A1:A1',
      });
      console.log('✅ ورقة stock_movements موجودة');
    } catch (error: any) {
      if (error.message?.includes('Unable to parse range') || 
          error.message?.includes('Sheet not found')) {
        console.log('📋 إنشاء ورقة stock_movements...');
        await createStockMovementsSheetEnhanced();
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('❌ خطأ في التحقق من ورقة stock_movements:', error);
    throw error;
  }
}

// دالة محسنة لإنشاء ورقة حركات المخزون
async function createStockMovementsSheetEnhanced() {
  try {
    console.log('📋 إنشاء ورقة stock_movements محسنة...');
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    
    if (!spreadsheetId) {
      throw new Error('معرف Google Sheet غير موجود');
    }

    // إنشاء الورقة الجديدة
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: 'stock_movements',
              gridProperties: {
                columnCount: 12,  // زيادة عدد الأعمدة
                rowCount: 5000,   // زيادة عدد الصفوف
                frozenRowCount: 1  // تجميد الصف الأول
              }
            }
          }
        }]
      }
    });

    // العناوين المحسنة
    const headers = [
      'ID',                    // A
      'التاريخ',               // B
      'الوقت',                 // C
      'التاريخ والوقت كاملاً',   // D
      'اسم المنتج',            // E
      'نوع العملية',           // F
      'الكمية',                // G
      'السبب',                 // H
      'المورد',                // I
      'التكلفة',               // J
      'ملاحظات',               // K
      'رقم الطلب'              // L
    ];

    // إدراج العناوين
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'stock_movements!A1:L1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers]
      }
    });

    // تنسيق العناوين
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          repeatCell: {
            range: {
              sheetId: await getSheetId(spreadsheetId, 'stock_movements'),
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 12
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.2, green: 0.4, blue: 0.8 },
                textFormat: { 
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                  bold: true 
                },
                horizontalAlignment: 'CENTER'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
          }
        }]
      }
    });

    console.log('✅ تم إنشاء ورقة stock_movements محسنة بنجاح');
    
  } catch (error) {
    console.error('❌ خطأ في إنشاء ورقة stock_movements:', error);
    throw error;
  }
}

// دالة مساعدة للحصول على ID الورقة
async function getSheetId(spreadsheetId: string, sheetName: string): Promise<number> {
  try {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.get({
      spreadsheetId
    });
    
    const sheet = response.data.sheets?.find(s => s.properties?.title === sheetName);
    return sheet?.properties?.sheetId || 0;
  } catch (error) {
    console.error('❌ خطأ في الحصول على ID الورقة:', error);
    return 0;
  }
}

// دالة محسنة لجلب حركات المخزون مع ترتيب ذكي
export async function getStockMovements(): Promise<StockMovement[]> {
  try {
    console.log('📋 جلب حركات المخزون من Google Sheets...');
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    
    if (!spreadsheetId) {
      throw new Error('معرف Google Sheet غير موجود');
    }

    // التأكد من وجود الورقة
    await ensureStockMovementsSheetExists();

    // جلب البيانات من ورقة stock_movements المحسنة
    const range = 'stock_movements!A:L'; // A-L للأعمدة الجديدة
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
  });

  const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      console.log('📋 لا توجد حركات مخزون مسجلة');
    return [];
  }

    // تحويل البيانات إلى كائنات منطقية
    const movements: StockMovement[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0] || !row[1] || !row[4]) continue; // تخطي الصفوف غير الكاملة

      const movement: StockMovement = {
        id: parseInt(row[0]) || i,
        date: row[1] || '', // التاريخ
        timestamp: row[3] || row[2] || '', // التوقيت الكامل أو الوقت فقط
        productName: row[4] || '',
        type: (row[5] as any) || 'adjustment',
        quantity: parseInt(row[6]) || 0,
        reason: row[7] || 'غير محدد',
        supplier: row[8] || '',
        cost: parseFloat(row[9]) || 0,
        notes: row[10] || '',
        orderId: parseInt(row[11]) || undefined
      };

      movements.push(movement);
    }

    console.log(`📋 تم جلب ${movements.length} حركة مخزون بنجاح`);
    
    // ترتيب ذكي: الأحدث أولاً، مع الاهتمام بالوقت الدقيق
    const sortedMovements = movements.sort((a, b) => {
      const dateA = new Date(a.timestamp || a.date || '');
      const dateB = new Date(b.timestamp || b.date || '');
      
      // الأحدث أولاً
      const timeDiff = dateB.getTime() - dateA.getTime();
      if (timeDiff !== 0) return timeDiff;
      
      // إذا كان التاريخ نفسه، رتب حسب ID (الأحدث أولاً)
      return (b.id || 0) - (a.id || 0);
    });
    
    console.log(`📊 تم ترتيب ${sortedMovements.length} حركة حسب التوقيت المصري الدقيق`);
    return sortedMovements;
      
  } catch (error: any) {
    console.error('❌ خطأ في جلب حركات المخزون:', error);
    
    // في حالة عدم وجود الورقة، أنشئها وأرجع مصفوفة فارغة
    if (error.message?.includes('Unable to parse range') || 
        error.message?.includes('Sheet not found')) {
      await createStockMovementsSheetEnhanced();
      return [];
    }
    
    throw error;
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

// دالة شاملة ومحسنة لإضافة حركة المخزون بطريقة احترافية
export async function addStockMovement(movement: Partial<StockMovement>) {
  try {
    const movementId = Date.now(); // ID فريد مبني على الوقت
    
    console.log(`📊 [${movementId}] إضافة حركة مخزون:`, {
      product: movement.productName,
      type: movement.type,
      quantity: movement.quantity,
      reason: movement.reason
    });
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    
    if (!spreadsheetId) {
      throw new Error('معرف Google Sheet غير موجود');
    }

    // التأكد من وجود ورقة stock_movements
    await ensureStockMovementsSheetExists();

    // جلب آخر ID من الورقة لضمان الترقيم المتسلسل
    const lastIdResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'stock_movements!A:A',
    });
    
    const existingRows = lastIdResponse.data.values || [['ID']];
    const lastRowIndex = existingRows.length;
    const newSequentialId = lastRowIndex; // ID متسلسل
    
    // الحصول على التوقيت المصري الدقيق
    const egyptianDate = getEgyptDate();
    const egyptianTime = getEgyptTime();
    const fullEgyptianDateTime = getEgyptDateTime();
    
    // إعداد البيانات مع التحقق من صحتها
    const productName = (movement.productName || '').trim();
    const movementType = movement.type || 'adjustment';
    const quantity = movement.quantity || 0;
    const reason = (movement.reason || 'غير محدد').trim();
    const supplier = (movement.supplier || '').trim();
    const cost = parseFloat(String(movement.cost || 0));
    const notes = (movement.notes || '').trim();
    const orderId = movement.orderId || '';
    
    // تسجيل تفصيلي للعملية
    const operationDetails = {
      sequentialId: newSequentialId,
      date: egyptianDate,
      time: egyptianTime,
      fullDateTime: fullEgyptianDateTime,
      product: productName,
      operation: movementType,
      quantity: quantity,
      reason: reason,
      impact: quantity > 0 ? 'إضافة' : quantity < 0 ? 'خصم' : 'تعديل',
      supplier: supplier || 'غير محدد',
      cost: cost,
      notes: notes || 'لا توجد ملاحظات',
      orderId: orderId || 'غير مرتبط'
    };
    
    console.log(`📋 [${movementId}] تفاصيل العملية:`, operationDetails);
    
    // إعداد صف البيانات للإدراج
    const rowData = [
      newSequentialId,                    // A: ID متسلسل
      egyptianDate,                       // B: التاريخ (YYYY-MM-DD)
      egyptianTime,                       // C: الوقت (HH:MM:SS)
      fullEgyptianDateTime,               // D: التاريخ والوقت كاملاً
      productName,                        // E: اسم المنتج
      movementType,                       // F: نوع العملية
      quantity,                           // G: الكمية (موجب أو سالب)
      reason,                             // H: السبب
      supplier,                           // I: المورد
      cost,                               // J: التكلفة
      notes,                              // K: ملاحظات
      orderId                             // L: رقم الطلب
    ];

    // إدراج البيانات في الورقة
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'stock_movements!A:L',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [rowData]
      }
    });

    console.log(`✅ [${movementId}] تم تسجيل حركة المخزون رقم ${newSequentialId} بنجاح`);
    console.log(`🕐 التوقيت المسجل: ${fullEgyptianDateTime} (توقيت القاهرة)`);
    console.log(`📊 التأثير: ${operationDetails.impact} ${Math.abs(quantity)} من ${productName}`);
    
    return {
      success: true,
      movementId: newSequentialId,
      timestamp: fullEgyptianDateTime,
      details: operationDetails
    };
    
  } catch (error) {
    console.error('❌ خطأ في إضافة حركة المخزون:', error);
    throw new Error(`فشل في تسجيل حركة المخزون: ${error}`);
  }
} 

// دالة لإنشاء ورقة حركات المخزون
async function createStockMovementsSheet() {
  try {
    console.log('📋 إنشاء ورقة stock_movements...');
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    
    if (!spreadsheetId) {
      throw new Error('معرف Google Sheet غير موجود');
    }

    // إنشاء الورقة الجديدة
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: 'stock_movements',
              gridProperties: {
                columnCount: 11,
                rowCount: 1000
              }
            }
          }
        }]
      }
    });

    // إضافة العناوين
    const headers = [
      'ID',
      'التاريخ',
      'التوقيت المصري',
      'اسم المنتج',
      'نوع العملية',
      'الكمية',
      'السبب',
      'المورد',
      'التكلفة',
      'ملاحظات',
      'رقم الطلب'
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'stock_movements!A1:K1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers]
      }
    });

    console.log('✅ تم إنشاء ورقة stock_movements بنجاح');
    
  } catch (error) {
    console.error('❌ خطأ في إنشاء ورقة stock_movements:', error);
    throw error;
  }
}

// دالة لجلب الطلبات (leads)
export async function fetchLeads() {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'leads',
    valueRenderOption: 'FORMULA',
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((h: string) => (h || '').trim());
  const headerMap: { [key: string]: number } = headers.reduce((map: { [key: string]: number }, header, index) => {
    map[header.toLowerCase()] = index;
    return map;
  }, {});

  return rows.slice(1).map((row, index) => {
    const rowIndex = index + 2;
    
    // دالة مساعدة لتنظيف أرقام الهاتف والواتساب
    const cleanPhoneNumber = (phoneStr: string): string => {
      if (!phoneStr) return '';
      // إزالة المسافات والأحرف غير المرغوب فيها
      return phoneStr.toString().trim().replace(/\s+/g, '');
    };
    
    const phone = cleanPhoneNumber(row[headerMap['رقم الهاتف']] || '');
    const whatsapp = cleanPhoneNumber(row[headerMap['رقم الواتساب']] || '');
    
    return {
      id: rowIndex,
      rowIndex,
      orderDate: row[headerMap['تاريخ الطلب']] || '',
      name: row[headerMap['الاسم']] || '',
      phone: phone,
      whatsapp: whatsapp,
      governorate: row[headerMap['المحافظة']] || '',
      area: row[headerMap['المنطقة']] || '',
      address: row[headerMap['العنوان']] || '',
      orderDetails: row[headerMap['تفاصيل الطلب']] || '',
      quantity: row[headerMap['الكمية']] || '',
      totalPrice: row[headerMap['إجمالي السعر']] || '',
      productName: row[headerMap['اسم المنتج']] || '',
      status: row[headerMap['الحالة']] || '',
      notes: row[headerMap['ملاحظات']] || '',
      source: row[headerMap['المصدر']] || '',
      whatsappSent: row[headerMap['ارسال واتس اب']] || '',
      assignee: row[headerMap['المسؤول']] || ''
    };
  });
}

// دالة لتحديث طلب واحد
export async function updateLead(rowNumber: number, updates: Partial<LeadRow>) {
  console.log(`🔄 تحديث الليد ${rowNumber} بالبيانات:`, JSON.stringify(updates, null, 2));
  
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const headers = ['تاريخ الطلب', 'الاسم', 'رقم الهاتف', 'رقم الواتساب', 'المحافظة', 'المنطقة', 'العنوان', 'تفاصيل الطلب', 'الكمية', 'إجمالي السعر', 'اسم المنتج', 'الحالة', 'ملاحظات', 'المصدر', 'ارسال واتس اب', 'المسؤول'];
  
  const currentData = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `leads!A${rowNumber}:${String.fromCharCode(64 + headers.length)}${rowNumber}`,
  });

  const currentRow = currentData.data.values?.[0] || [];
  const updatedRow = [...currentRow];

  console.log(`📋 البيانات الحالية للصف ${rowNumber}:`, currentRow);

  // تحديث جميع الحقول المطلوبة
  if (updates.orderDate !== undefined) {
    updatedRow[0] = updates.orderDate; // تاريخ الطلب
  }
  if (updates.name !== undefined) {
    updatedRow[1] = updates.name; // الاسم
  }
  if (updates.phone !== undefined) {
    updatedRow[2] = updates.phone; // رقم الهاتف
  }
  if (updates.whatsapp !== undefined) {
    updatedRow[3] = updates.whatsapp; // رقم الواتساب
  }
  if (updates.governorate !== undefined) {
    updatedRow[4] = updates.governorate; // المحافظة
  }
  if (updates.area !== undefined) {
    updatedRow[5] = updates.area; // المنطقة
  }
  if (updates.address !== undefined) {
    updatedRow[6] = updates.address; // العنوان
  }
  if (updates.orderDetails !== undefined) {
    updatedRow[7] = updates.orderDetails; // تفاصيل الطلب
  }
  if (updates.quantity !== undefined) {
    updatedRow[8] = updates.quantity; // الكمية
  }
  if (updates.totalPrice !== undefined) {
    updatedRow[9] = updates.totalPrice; // إجمالي السعر
  }
  if (updates.productName !== undefined) {
    updatedRow[10] = updates.productName; // اسم المنتج
  }
  if (updates.status !== undefined) {
    updatedRow[11] = updates.status; // الحالة
  }
  if (updates.notes !== undefined) {
    updatedRow[12] = updates.notes; // الملاحظات
  }
  if (updates.source !== undefined) {
    updatedRow[13] = updates.source; // المصدر
  }
  if (updates.whatsappSent !== undefined) {
    updatedRow[14] = updates.whatsappSent; // ارسال واتس اب
  }
  if (updates.assignee !== undefined) {
    updatedRow[15] = updates.assignee; // المسؤول
  }

  console.log(`✏️ البيانات الجديدة للصف ${rowNumber}:`, updatedRow);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `leads!A${rowNumber}:${String.fromCharCode(64 + headers.length)}${rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [updatedRow]
    }
  });

  console.log(`✅ تم تحديث الليد ${rowNumber} بنجاح`);
}

// دالة لتحديث عدة طلبات
export async function updateLeadsBatch(updates: Array<{ rowNumber: number; updates: Partial<LeadRow> }>) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const requests = updates.map(({ rowNumber, updates: leadUpdates }) => {
    const values = [];
    
    // إعداد القيم للتحديث
    if (leadUpdates.assignee !== undefined) {
      values.push({
        range: `leads!Q${rowNumber}`, // عمود المسؤول
        values: [[leadUpdates.assignee]]
      });
    }
    
    return values;
  }).flat();

  if (requests.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: requests
      }
    });
  }
}

// دالة للحصول على إحصائيات الطلبات
export async function getOrderStatistics() {
  try {
    const leads = await fetchLeads();
    
    // الإحصائيات العامة
    const overall = {
      total: leads.length,
      confirmed: leads.filter(lead => ['تم التأكيد', 'تم الشحن'].includes(lead.status)).length,
      pending: leads.filter(lead => ['جديد', 'لم يرد', 'في انتظار تأكيد العميل', 'تم التواصل معه واتساب'].includes(lead.status)).length,
      rejected: leads.filter(lead => lead.status === 'رفض التأكيد').length,
      shipped: leads.filter(lead => lead.status === 'تم الشحن').length,
      new: leads.filter(lead => lead.status === 'جديد').length,
      noAnswer: leads.filter(lead => lead.status === 'لم يرد').length,
      contacted: leads.filter(lead => lead.status === 'تم التواصل معه واتساب').length
    };

    // الإحصائيات حسب المنتج
    const productStats: Record<string, any> = {};
    leads.forEach(lead => {
      const product = lead.productName || 'غير محدد';
      if (!productStats[product]) {
        productStats[product] = {
          total: 0,
          confirmed: 0, // فقط "تم التأكيد"
          pending: 0,
          rejected: 0,
          shipped: 0, // فقط "تم الشحن"
          new: 0,
          noAnswer: 0,
          contacted: 0
        };
      }
      
      productStats[product].total++;
      
      // حساب دقيق بدون تداخل
      if (lead.status === 'تم التأكيد') {
        productStats[product].confirmed++;
      } else if (lead.status === 'تم الشحن') {
        productStats[product].shipped++;
      } else if (['جديد', 'لم يرد', 'في انتظار تأكيد العميل', 'تم التواصل معه واتساب'].includes(lead.status)) {
        productStats[product].pending++;
      } else if (lead.status === 'رفض التأكيد') {
        productStats[product].rejected++;
      }
      
      // تفصيل حالات الانتظار
      if (lead.status === 'جديد') {
        productStats[product].new++;
      } else if (lead.status === 'لم يرد') {
        productStats[product].noAnswer++;
      } else if (lead.status === 'تم التواصل معه واتساب') {
        productStats[product].contacted++;
      }
    });

    // الإحصائيات حسب المصدر
    const sourceStats: Record<string, any> = {};
    leads.forEach(lead => {
      const source = lead.source || 'غير محدد';
      if (!sourceStats[source]) {
        sourceStats[source] = {
          total: 0,
          confirmed: 0, // فقط "تم التأكيد"
          pending: 0,
          rejected: 0,
          shipped: 0, // فقط "تم الشحن"
          new: 0,
          noAnswer: 0,
          contacted: 0
        };
      }
      
      sourceStats[source].total++;
      
      // حساب دقيق بدون تداخل
      if (lead.status === 'تم التأكيد') {
        sourceStats[source].confirmed++;
      } else if (lead.status === 'تم الشحن') {
        sourceStats[source].shipped++;
      } else if (['جديد', 'لم يرد', 'في انتظار تأكيد العميل', 'تم التواصل معه واتساب'].includes(lead.status)) {
        sourceStats[source].pending++;
      } else if (lead.status === 'رفض التأكيد') {
        sourceStats[source].rejected++;
      }
      
      // تفصيل حالات الانتظار
      if (lead.status === 'جديد') {
        sourceStats[source].new++;
      } else if (lead.status === 'لم يرد') {
        sourceStats[source].noAnswer++;
      } else if (lead.status === 'تم التواصل معه واتساب') {
        sourceStats[source].contacted++;
      }
    });

    // الإحصائيات حسب الموظف
    const assigneeStats: Record<string, any> = {};
    leads.forEach(lead => {
      const assignee = lead.assignee || 'غير معين';
      if (!assigneeStats[assignee]) {
        assigneeStats[assignee] = {
          total: 0,
          confirmed: 0, // فقط "تم التأكيد" (بدون الشحن)
          pending: 0,
          rejected: 0,
          shipped: 0, // فقط "تم الشحن"
          new: 0,
          noAnswer: 0,
          contacted: 0,
          today: 0
        };
      }
      
      assigneeStats[assignee].total++;
      
      // حساب دقيق بدون تداخل
      if (lead.status === 'تم التأكيد') {
        assigneeStats[assignee].confirmed++; // فقط التأكيد
      } else if (lead.status === 'تم الشحن') {
        assigneeStats[assignee].shipped++; // فقط الشحن
      } else if (['جديد', 'لم يرد', 'في انتظار تأكيد العميل', 'تم التواصل معه واتساب'].includes(lead.status)) {
        assigneeStats[assignee].pending++;
      } else if (lead.status === 'رفض التأكيد') {
        assigneeStats[assignee].rejected++;
      }
      
      // تفصيل حالات الانتظار
      if (lead.status === 'جديد') {
        assigneeStats[assignee].new++;
      } else if (lead.status === 'لم يرد') {
        assigneeStats[assignee].noAnswer++;
      } else if (lead.status === 'تم التواصل معه واتساب') {
        assigneeStats[assignee].contacted++;
      }
      
      // إحصائيات اليوم (تقريبية)
      const today = new Date().toISOString().split('T')[0];
      if (lead.orderDate && typeof lead.orderDate === 'string' && lead.orderDate.includes(today)) {
        assigneeStats[assignee].today++;
      }
    });

    // الإحصائيات حسب الموظف والمنتج
    const assigneeByProductStats: Record<string, Record<string, any>> = {};
    leads.forEach(lead => {
      const assignee = lead.assignee || 'غير معين';
      const product = lead.productName || 'غير محدد';
      
      if (!assigneeByProductStats[assignee]) {
        assigneeByProductStats[assignee] = {};
      }
      
      if (!assigneeByProductStats[assignee][product]) {
        assigneeByProductStats[assignee][product] = {
          total: 0,
          confirmed: 0, // فقط "تم التأكيد"
          pending: 0,
          rejected: 0,
          shipped: 0 // فقط "تم الشحن"
        };
      }
      
      assigneeByProductStats[assignee][product].total++;
      
      // حساب دقيق بدون تداخل
      if (lead.status === 'تم التأكيد') {
        assigneeByProductStats[assignee][product].confirmed++;
      } else if (lead.status === 'تم الشحن') {
        assigneeByProductStats[assignee][product].shipped++;
      } else if (['جديد', 'لم يرد', 'في انتظار تأكيد العميل', 'تم التواصل معه واتساب'].includes(lead.status)) {
        assigneeByProductStats[assignee][product].pending++;
      } else if (lead.status === 'رفض التأكيد') {
        assigneeByProductStats[assignee][product].rejected++;
      }
    });

    return {
      overall,
      byProduct: productStats,
      bySource: sourceStats,
      byAssignee: assigneeStats,
      byAssigneeByProduct: assigneeByProductStats
    };

  } catch (error) {
    console.error('Error getting order statistics:', error);
    throw error;
  }
} 