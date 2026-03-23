import { google } from 'googleapis';
import { formatEgyptianPhone, convertArabicNumerals } from './phoneFormatter';

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
  assignee?: string; // المسؤول (Q column - الفهرس 16)
  bostaTrackingNumber?: string; // رقم تتبع بوسطة (S column - الفهرس 18)
  bostaState?: string; // حالة بوسطة (T column - الفهرس 19)
  lastBostaUpdate?: string; // آخر تحديث بوسطة (U column - الفهرس 20)
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
  bostaSku?: string; // كود SKU في مخازن بوسطة
};

export interface StockMovement {
  id?: number;
  productName: string;
  type: 'sale' | 'return' | 'damage' | 'loss' | 'initial' | 'adjustment' | 'add_stock';
  quantity: number; // موجب للإضافة، سالب للخصم
  quantityBefore?: number; // الكمية قبل العملية
  quantityAfter?: number; // الكمية بعد العملية
  reason?: string;
  supplier?: string;
  cost?: number; // تكلفة الوحدة
  totalCost?: number; // إجمالي التكلفة
  notes?: string;
  date?: string; // ISO date string
  timestamp?: string; // بالتوقيت المصري
  orderId?: number;
  responsible?: string; // المسؤول عن العملية
  status?: string; // حالة العملية (مكتملة، معلقة، ملغاة)
  entryDate?: string; // تاريخ الإدخال
  ipAddress?: string; // عنوان IP
  sessionId?: string; // معرف الجلسة
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

// ===== دالة إعادة المحاولة مع تأخير متصاعد (Exponential Backoff) =====
// تستخدم لحل مشكلة التزامن عند استخدام عدة موظفين للنظام في نفس الوقت
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const errorMessage = error?.message || String(error);
      const errorCode = error?.code || error?.response?.status;

      // تحديد إذا كان الخطأ قابل لإعادة المحاولة
      const isRetryable =
        errorCode === 429 || // Rate limit exceeded
        errorCode === 503 || // Service unavailable
        errorCode === 500 || // Internal server error
        errorCode === 'ECONNRESET' ||
        errorCode === 'ETIMEDOUT' ||
        errorCode === 'ENOTFOUND' ||
        errorMessage.includes('quota') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('RESOURCE_EXHAUSTED') ||
        errorMessage.includes('temporarily unavailable') ||
        errorMessage.includes('socket hang up') ||
        errorMessage.includes('ECONNREFUSED');

      if (!isRetryable || attempt === maxRetries) {
        console.error(`❌ [${operationName}] فشل نهائي بعد ${attempt} محاولة:`, errorMessage);
        throw error;
      }

      // حساب التأخير المتصاعد: 1s, 2s, 4s, ...
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      // إضافة عشوائية صغيرة لتجنب التزامن (jitter)
      const jitter = Math.random() * 500;
      const totalDelay = delayMs + jitter;

      console.warn(
        `⚠️ [${operationName}] المحاولة ${attempt}/${maxRetries} فشلت. ` +
        `إعادة المحاولة خلال ${Math.round(totalDelay)}ms... ` +
        `(الخطأ: ${errorMessage.substring(0, 100)})`
      );

      await new Promise(resolve => setTimeout(resolve, totalDelay));
    }
  }

  // لن نصل لهنا أبداً، لكن TypeScript يحتاج return
  throw lastError;
}

const getAuth = () => {
  // GOOGLE_PRIVATE_KEY أولاً (موجود على Netlify)، BASE64 كاحتياط
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
      'تاريخ الإنشاء',
      'BostaSKU'
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${STOCK_SHEET_NAME}!A1:I1`,
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
      range: `${STOCK_SHEET_NAME}!A:I`, // ⚠️ يجب أن يشمل عمود I للـ BostaSKU
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
        minThreshold: parseInt(row[6]) || 10,
        bostaSku: row[8]?.toString().trim() || '' // العمود I (الفهرس 8) — BostaSKU
      };

      // التحقق من صحة اسم المنتج
      if (stockItem.productName && stockItem.productName.length > 0) {
        stockItems.push(stockItem);
        console.log(`✅ تم تحليل المنتج: ${stockItem.productName} (الكمية: ${stockItem.currentQuantity})${stockItem.bostaSku ? ` | BostaSKU: ${stockItem.bostaSku}` : ''}`);
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

// دالة محسنة للبحث عن المنتج بالمتردفات مع مقارنة ذكية
export function findProductBySynonyms(productName: string, stockItems: StockItem[]): StockItem | null {
  if (!productName || !stockItems || stockItems.length === 0) {
    console.log('❌ معطيات غير صالحة للبحث');
    return null;
  }

  console.log(`🔍 بدء البحث الذكي عن المنتج: "${productName}"`);

  // تنظيف وتطبيع اسم المنتج المطلوب
  const normalizedSearchName = productName.toLowerCase().trim()
    .replace(/[إأآا]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');

  // تقسيم اسم المنتج إلى كلمات (تجاهل الكلمات القصيرة جداً)
  const searchWords = normalizedSearchName.split(' ')
    .map(word => word.trim())
    .filter(word => word.length >= 2); // تجاهل الكلمات أقل من حرفين

  console.log(`📝 كلمات البحث المستخرجة: [${searchWords.join(', ')}]`);

  // دالة مساعدة لتنظيف وتطبيع النص
  const normalizeText = (text: string): string => {
    return text.toLowerCase().trim()
      .replace(/[إأآا]/g, 'ا')
      .replace(/[ىي]/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ');
  };

  // دالة للتحقق من وجود كلمات مشتركة
  const hasCommonWords = (text: string, searchWords: string[]): { match: boolean; matchedWords: string[]; percentage: number } => {
    const textWords = normalizeText(text).split(' ')
      .map(word => word.trim())
      .filter(word => word.length >= 2);

    const matchedWords: string[] = [];

    // البحث عن تطابقات مباشرة أو جزئية
    searchWords.forEach(searchWord => {
      textWords.forEach(textWord => {
        // تطابق مباشر
        if (textWord === searchWord) {
          matchedWords.push(searchWord);
        }
        // تطابق جزئي (كلمة تحتوي على الأخرى)
        else if (textWord.includes(searchWord) && searchWord.length >= 3) {
          matchedWords.push(searchWord);
        }
        else if (searchWord.includes(textWord) && textWord.length >= 3) {
          matchedWords.push(textWord);
        }
      });
    });

    // إزالة التكرارات
    const uniqueMatches = [...new Set(matchedWords)];
    const matchPercentage = (uniqueMatches.length / searchWords.length) * 100;

    return {
      match: uniqueMatches.length > 0,
      matchedWords: uniqueMatches,
      percentage: Math.round(matchPercentage)
    };
  };

  let bestMatch: StockItem | null = null;
  let bestScore = 0;
  let bestMatchDetails = '';

  // البحث في جميع المنتجات
  for (const item of stockItems) {
    console.log(`\n🔎 فحص المنتج: "${item.productName}"`);

    // 1. البحث في الاسم الأساسي
    const nameMatch = hasCommonWords(item.productName, searchWords);
    console.log(`   📋 مطابقة الاسم الأساسي: ${nameMatch.match ? '✅' : '❌'} (${nameMatch.percentage}%) - كلمات متطابقة: [${nameMatch.matchedWords.join(', ')}]`);

    if (nameMatch.match && nameMatch.percentage > bestScore) {
      bestMatch = item;
      bestScore = nameMatch.percentage;
      bestMatchDetails = `اسم أساسي - ${nameMatch.percentage}% تطابق - كلمات: [${nameMatch.matchedWords.join(', ')}]`;
      console.log(`   🎯 أفضل مطابقة جديدة: ${bestMatchDetails}`);
    }

    // 2. البحث في المتردفات
    if (item.synonyms) {
      const synonymsList = item.synonyms.split(',').map(s => s.trim()).filter(s => s.length > 0);
      console.log(`   📚 المتردفات المتاحة: [${synonymsList.join(', ')}]`);

      for (const synonym of synonymsList) {
        const synonymMatch = hasCommonWords(synonym, searchWords);
        console.log(`     🔍 مطابقة المترادف "${synonym}": ${synonymMatch.match ? '✅' : '❌'} (${synonymMatch.percentage}%) - كلمات: [${synonymMatch.matchedWords.join(', ')}]`);

        if (synonymMatch.match && synonymMatch.percentage > bestScore) {
          bestMatch = item;
          bestScore = synonymMatch.percentage;
          bestMatchDetails = `مترادف "${synonym}" - ${synonymMatch.percentage}% تطابق - كلمات: [${synonymMatch.matchedWords.join(', ')}]`;
          console.log(`     🎯 أفضل مطابقة جديدة: ${bestMatchDetails}`);
        }
      }
    } else {
      console.log(`   📚 لا توجد متردفات لهذا المنتج`);
    }
  }

  // النتيجة النهائية — يجب أن تكون نسبة التطابق 50% على الأقل
  const MIN_MATCH_THRESHOLD = 50;
  
  if (bestMatch && bestScore >= MIN_MATCH_THRESHOLD) {
    console.log(`\n✅ تم العثور على المنتج بنجاح!`);
    console.log(`📦 المنتج المطابق: "${bestMatch.productName}"`);
    console.log(`🎯 تفاصيل المطابقة: ${bestMatchDetails}`);
    console.log(`📊 نسبة التطابق: ${bestScore}% (الحد الأدنى: ${MIN_MATCH_THRESHOLD}%)`);
    console.log(`💰 الكمية المتاحة: ${bestMatch.currentQuantity}`);
  } else if (bestMatch && bestScore < MIN_MATCH_THRESHOLD) {
    console.log(`\n⚠️ وُجد تطابق جزئي "${bestMatch.productName}" لكن النسبة (${bestScore}%) أقل من الحد الأدنى (${MIN_MATCH_THRESHOLD}%)`);
    console.log(`📝 كلمات البحث المستخدمة: [${searchWords.join(', ')}]`);
    bestMatch = null; // رفض التطابق الضعيف
  } else {
    console.log(`\n❌ لم يتم العثور على أي مطابقة للمنتج "${productName}"`);
    console.log(`📝 كلمات البحث المستخدمة: [${searchWords.join(', ')}]`);
  }

  return bestMatch;
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
        range: `${STOCK_SHEET_NAME}!A${rowIndex}:I${rowIndex}`,
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
            existingItem.lastUpdate, // تاريخ الإنشاء الأصلي
            stockItem.bostaSku ?? existingItem.bostaSku ?? '' // BostaSKU
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
        currentDate,
        stockItem.bostaSku || '' // BostaSKU
      ];

      console.log(`📦 إضافة منتج جديد بـ ID: ${newId}، البيانات:`, newRow);

      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${STOCK_SHEET_NAME}!A:I`,
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
    console.log(`🔍 محاولة خصم المخزون للمنتج: "${productName}" | الكمية: ${quantity} | رقم الطلب: ${orderId}`);

    const stockItems = await fetchStock(true); // استخدام force refresh
    console.log(`📦 تم جلب ${stockItems.stockItems.length} منتج من المخزون`);

    // طباعة جميع المنتجات المتاحة للتشخيص
    console.log('📋 المنتجات المتاحة في المخزون:');
    stockItems.stockItems.forEach((item, index) => {
      console.log(`  ${index + 1}. "${item.productName}" (الكمية: ${item.currentQuantity}) | المتردفات: "${item.synonyms || 'لا توجد'}"`);
    });

    const stockItem = findProductBySynonyms(productName, stockItems.stockItems);
    console.log(`🔍 نتيجة البحث عن "${productName}":`, stockItem ? `وُجد: "${stockItem.productName}"` : 'لم يوجد');

    if (!stockItem) {
      console.error(`❌ المنتج "${productName}" غير موجود في المخزون`);

      // اقتراح منتجات مشابهة بشكل أكثر ذكاءً
      const suggestions = stockItems.stockItems
        .filter(item => {
          const itemName = item.productName.toLowerCase();
          const searchName = productName.toLowerCase();

          // البحث عن كلمات مشتركة
          const searchWords = searchName.split(' ').filter(w => w.length > 2);
          const itemWords = itemName.split(' ').filter(w => w.length > 2);

          // إذا كان هناك كلمات مشتركة
          const commonWords = searchWords.some(sw =>
            itemWords.some(iw => iw.includes(sw) || sw.includes(iw))
          );

          // أو البحث في المتردفات
          const synonymMatch = item.synonyms && item.synonyms.toLowerCase().includes(searchName.substring(0, 4));

          return commonWords || synonymMatch ||
            itemName.includes('جرس') || itemName.includes('باب') || itemName.includes('كاميرا') ||
            searchName.includes(itemName.split(' ')[0]) || itemName.includes(searchName.split(' ')[0]);
        })
        .map(item => `${item.productName} (الكمية: ${item.currentQuantity})`)
        .slice(0, 3);

      let suggestionText = '';
      if (suggestions.length > 0) {
        suggestionText = `\n\n💡 منتجات مشابهة متاحة:\n${suggestions.map(s => `• ${s}`).join('\n')}`;
      }

      // إضافة معلومات عن المتردفات
      let synonymInfo = '\n\n🔍 للبحث بالمتردفات، تأكد من أن اسم المنتج في الطلب يطابق:\n';
      synonymInfo += '• الاسم الأساسي للمنتج في المخزون\n';
      synonymInfo += '• أو أحد المتردفات المسجلة للمنتج\n';
      synonymInfo += '\n📋 أمثلة على المتردفات الموجودة:\n';

      stockItems.stockItems.slice(0, 3).forEach(item => {
        if (item.synonyms) {
          synonymInfo += `• "${item.productName}": ${item.synonyms}\n`;
        }
      });

      return {
        success: false,
        message: `المنتج "${productName}" غير موجود في المخزون${suggestionText}${synonymInfo}`
      };
    }

    console.log(`📊 المنتج الموجود: "${stockItem.productName}" | الكمية المتاحة: ${stockItem.currentQuantity} | المطلوب: ${quantity}`);

    // توضيح كيف تم العثور على المنتج
    const searchWords = productName.toLowerCase().trim().split(' ').filter(w => w.length >= 2);
    const productWords = stockItem.productName.toLowerCase().trim().split(' ').filter(w => w.length >= 2);
    const directMatch = searchWords.some(sw => productWords.some(pw => pw.includes(sw) || sw.includes(pw)));

    if (directMatch) {
      console.log(`✅ تم العثور على المنتج بمطابقة ذكية للكلمات`);
      console.log(`🔍 كلمات البحث: [${searchWords.join(', ')}]`);
      console.log(`📦 كلمات المنتج: [${productWords.join(', ')}]`);
    } else {
      console.log(`✅ تم العثور على المنتج عبر المتردفات`);
      console.log(`📚 المتردفات المستخدمة: "${stockItem.synonyms}"`);
    }

    if (stockItem.currentQuantity < quantity) {
      console.error(`❌ المخزون غير كافي للمنتج "${stockItem.productName}": متوفر ${stockItem.currentQuantity}، مطلوب ${quantity}`);
      return {
        success: false,
        message: `المخزون غير كافي. المتوفر: ${stockItem.currentQuantity}، المطلوب: ${quantity}`,
        availableQuantity: stockItem.currentQuantity
      };
    }

    // تحديث الكمية
    const newQuantity = stockItem.currentQuantity - quantity;
    console.log(`🔄 تحديث المخزون: ${stockItem.currentQuantity} - ${quantity} = ${newQuantity}`);

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

    console.log(`✅ تم خصم المخزون بنجاح: ${quantity} من "${stockItem.productName}". المتبقي: ${newQuantity}`);

    return {
      success: true,
      message: `تم خصم ${quantity} من ${stockItem.productName}. المتبقي: ${newQuantity}`
    };

  } catch (error) {
    console.error('❌ خطأ في خصم المخزون:', error);
    return {
      success: false,
      message: `حدث خطأ أثناء خصم المخزون: ${error}`
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

// دالة محسنة لجلب حركات المخزون مع ترتيب ذكي - محدثة للأعمدة الجديدة
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

    // جلب البيانات من ورقة stock_movements المحسنة (A-T)
    const range = 'stock_movements!A3:T'; // تخطي صف العناوين والتفسير
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log('📋 لا توجد حركات مخزون مسجلة');
      return [];
    }

    // تحويل البيانات إلى كائنات منطقية مع الأعمدة الجديدة
    const movements: StockMovement[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0] || !row[1] || !row[4]) continue; // تخطي الصفوف غير الكاملة

      const movement: StockMovement = {
        id: parseInt(row[0]) || i + 1,              // A: رقم تسلسلي
        date: row[1] || '',                         // B: تاريخ العملية
        timestamp: row[3] || row[2] || '',          // D: التوقيت الكامل أو C: الوقت فقط
        productName: row[4] || '',                  // E: اسم المنتج
        type: mapArabicOperationToEnglish(row[5]) as any, // F: نوع العملية (تحويل من العربية)
        quantity: parseInt(row[6]) || 0,            // G: الكمية المتأثرة
        quantityBefore: parseInt(row[7]) || 0,      // H: الكمية قبل العملية
        quantityAfter: parseInt(row[8]) || 0,       // I: الكمية بعد العملية
        reason: row[9] || 'غير محدد',               // J: سبب العملية
        supplier: row[10] || '',                    // K: المورد/المصدر
        cost: parseFloat(row[11]) || 0,             // L: تكلفة الوحدة
        totalCost: parseFloat(row[12]) || 0,        // M: إجمالي التكلفة
        orderId: parseInt(row[13]) || undefined,    // N: رقم الطلب المرتبط
        responsible: row[14] || 'غير محدد',         // O: المسؤول عن العملية
        notes: row[15] || '',                       // P: ملاحظات إضافية
        status: row[16] || 'مكتملة',               // Q: حالة العملية
        entryDate: row[17] || '',                   // R: تاريخ الإدخال
        ipAddress: row[18] || '',                   // S: IP العملية
        sessionId: row[19] || ''                    // T: معرف الجلسة
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

// دالة مساعدة لتحويل نوع العملية من العربية إلى الإنجليزية
function mapArabicOperationToEnglish(arabicType: string): string {
  const operationMap: { [key: string]: string } = {
    'إضافة أولية': 'initial',
    'إضافة مخزون': 'add_stock',
    'مبيعات (شحن)': 'sale',
    'مرتجعات': 'return',
    'تالف': 'damage',
    'مفقود': 'loss',
    'تعديل يدوي': 'adjustment'
  };
  return operationMap[arabicType] || 'adjustment';
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
      range: `${STOCK_SHEET_NAME}!A:I`, // يشمل عمود BostaSKU
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

// دالة شاملة ومحسنة لإضافة حركة المخزون بطريقة احترافية - محدثة للأعمدة الجديدة
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

    const existingRows = lastIdResponse.data.values || [['رقم تسلسلي']];
    const lastRowIndex = existingRows.length;
    const newSequentialId = lastRowIndex - 1; // -1 لأن الصف الأول عناوين والثاني تفسير

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
    const unitCost = parseFloat(String(movement.cost || 0));
    const totalCost = Math.abs(quantity) * unitCost; // إجمالي التكلفة
    const notes = (movement.notes || '').trim();
    const orderId = movement.orderId || '';

    // الحصول على الكمية قبل وبعد العملية
    let quantityBefore = 0;
    let quantityAfter = 0;

    try {
      const stockData = await fetchStock(true);
      const stockItem = findProductBySynonyms(productName, stockData.stockItems);
      if (stockItem) {
        quantityBefore = stockItem.currentQuantity;
        quantityAfter = quantityBefore + quantity; // الكمية بعد العملية
      }
    } catch (error) {
      console.warn('تعذر الحصول على كمية المخزون:', error);
    }

    // تسجيل تفصيلي للعملية
    const operationDetails = {
      sequentialId: newSequentialId,
      date: egyptianDate,
      time: egyptianTime,
      fullDateTime: fullEgyptianDateTime,
      product: productName,
      operation: movementType,
      quantity: quantity,
      quantityBefore: quantityBefore,
      quantityAfter: quantityAfter,
      reason: reason,
      supplier: supplier || 'غير محدد',
      unitCost: unitCost,
      totalCost: totalCost,
      orderId: orderId || 'غير مرتبط',
      responsible: 'النظام الآلي', // يمكن تحديثه لاحقاً
      notes: notes || 'لا توجد ملاحظات',
      status: 'مكتملة',
      entryDate: fullEgyptianDateTime,
      ipAddress: 'خادم التطبيق',
      sessionId: `session_${movementId}`
    };

    console.log(`📋 [${movementId}] تفاصيل العملية:`, operationDetails);

    // إعداد صف البيانات للإدراج - 20 عمود (A-T)
    const rowData = [
      newSequentialId,                    // A: رقم تسلسلي
      egyptianDate,                       // B: تاريخ العملية
      egyptianTime,                       // C: وقت العملية
      fullEgyptianDateTime,               // D: التوقيت الكامل (مصري)
      productName,                        // E: اسم المنتج
      getOperationTypeArabic(movementType), // F: نوع العملية
      quantity,                           // G: الكمية المتأثرة
      quantityBefore,                     // H: الكمية قبل العملية
      quantityAfter,                      // I: الكمية بعد العملية
      reason,                             // J: سبب العملية
      supplier,                           // K: المورد/المصدر
      unitCost,                           // L: تكلفة الوحدة
      totalCost,                          // M: إجمالي التكلفة
      orderId,                            // N: رقم الطلب المرتبط
      operationDetails.responsible,       // O: المسؤول عن العملية
      notes,                              // P: ملاحظات إضافية
      operationDetails.status,            // Q: حالة العملية
      operationDetails.entryDate,         // R: تاريخ الإدخال
      operationDetails.ipAddress,         // S: IP العملية
      operationDetails.sessionId          // T: معرف الجلسة
    ];

    // إدراج البيانات في الورقة (تخطي الصفين الأول والثاني)
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'stock_movements!A3:T',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [rowData]
      }
    });

    console.log(`✅ [${movementId}] تم تسجيل حركة المخزون رقم ${newSequentialId} بنجاح`);
    console.log(`🕐 التوقيت المسجل: ${fullEgyptianDateTime} (توقيت القاهرة)`);
    console.log(`📊 التأثير: ${quantity > 0 ? 'إضافة' : 'خصم'} ${Math.abs(quantity)} من ${productName}`);
    console.log(`💰 التكلفة: ${totalCost} ج.م (${unitCost} ج.م للوحدة)`);

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

// دالة مساعدة لتحويل نوع العملية إلى العربية
function getOperationTypeArabic(type: string): string {
  const operationTypes: { [key: string]: string } = {
    'initial': 'إضافة أولية',
    'add_stock': 'إضافة مخزون',
    'sale': 'مبيعات (شحن)',
    'return': 'مرتجعات',
    'damage': 'تالف',
    'loss': 'مفقود',
    'adjustment': 'تعديل يدوي'
  };
  return operationTypes[type] || type;
}

/**
 * ✨ دالة محسنة لإضافة حركات المخزون دفعة واحدة
 * تقلل عدد طلبات API بشكل كبير لتجنب تجاوز الحد
 */
export async function addStockMovementsBatch(
  movements: Array<Partial<StockMovement>>
): Promise<{ success: boolean; count: number; message: string }> {
  if (!movements || movements.length === 0) {
    return { success: true, count: 0, message: 'لا توجد حركات لتسجيلها' };
  }

  try {
    console.log(`📦 [BATCH] تسجيل ${movements.length} حركة مخزون دفعة واحدة...`);

    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!spreadsheetId) {
      throw new Error('معرف Google Sheet غير موجود');
    }

    // التأكد من وجود ورقة stock_movements (مرة واحدة فقط)
    await ensureStockMovementsSheetExists();

    // جلب آخر ID من الورقة (مرة واحدة فقط)
    const lastIdResponse = await retryWithBackoff(
      () => sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'stock_movements!A:A',
      }),
      'جلب آخر ID لحركات المخزون'
    );

    const existingRows = lastIdResponse.data.values || [['رقم تسلسلي']];
    let nextSequentialId = existingRows.length - 1;

    // الحصول على التوقيت المصري (مرة واحدة)
    const egyptianDate = getEgyptDate();
    const egyptianTime = getEgyptTime();
    const fullEgyptianDateTime = getEgyptDateTime();

    // إعداد جميع الصفوف دفعة واحدة
    const allRows: any[][] = [];

    for (const movement of movements) {
      nextSequentialId++;

      const productName = (movement.productName || '').trim();
      const movementType = movement.type || 'sale';
      const quantity = movement.quantity || 0;
      const reason = (movement.reason || 'شحن طلب - خصم جماعي').trim();
      const orderId = movement.orderId || '';

      const rowData = [
        nextSequentialId,                      // A: رقم تسلسلي
        egyptianDate,                          // B: تاريخ العملية
        egyptianTime,                          // C: وقت العملية
        fullEgyptianDateTime,                  // D: التوقيت الكامل
        productName,                           // E: اسم المنتج
        getOperationTypeArabic(movementType),  // F: نوع العملية
        quantity,                              // G: الكمية المتأثرة
        '',                                    // H: الكمية قبل (سيتم تحديثها لاحقاً إن لزم)
        '',                                    // I: الكمية بعد
        reason,                                // J: سبب العملية
        '',                                    // K: المورد
        0,                                     // L: تكلفة الوحدة
        0,                                     // M: إجمالي التكلفة
        orderId,                               // N: رقم الطلب
        'النظام الآلي',                        // O: المسؤول
        'شحن جماعي',                           // P: ملاحظات
        'مكتملة',                              // Q: حالة العملية
        fullEgyptianDateTime,                  // R: تاريخ الإدخال
        'خادم التطبيق',                        // S: IP
        `batch_${Date.now()}`                  // T: معرف الجلسة
      ];

      allRows.push(rowData);
    }

    // إدراج جميع الصفوف دفعة واحدة (طلب API واحد!)
    await retryWithBackoff(
      () => sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'stock_movements!A3:T',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: allRows
        }
      }),
      `إضافة ${allRows.length} حركة مخزون`
    );

    console.log(`✅ [BATCH] تم تسجيل ${movements.length} حركة مخزون بنجاح`);

    return {
      success: true,
      count: movements.length,
      message: `تم تسجيل ${movements.length} حركة مخزون بنجاح`
    };

  } catch (error: any) {
    console.error('❌ [BATCH] خطأ في تسجيل حركات المخزون:', error);
    return {
      success: false,
      count: 0,
      message: `فشل في تسجيل حركات المخزون: ${error?.message || error}`
    };
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

  // جلب البيانات مع إعادة المحاولة عند حدوث أخطاء مؤقتة
  const response = await retryWithBackoff(
    () => sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'leads',
      valueRenderOption: 'FORMULA',
    }),
    'جلب بيانات الطلبات'
  );

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((h: string) => (h || '').trim());
  const headerMap: { [key: string]: number } = headers.reduce((map: { [key: string]: number }, header, index) => {
    map[header] = index; // استخدام العنوان كما هو بدون تحويل
    return map;
  }, {});

  // دالة مساعدة للعثور على العمود بطريقة مرنة
  const findColumnIndex = (searchTerms: string[]): number => {
    for (const term of searchTerms) {
      if (headerMap[term] !== undefined) {
        return headerMap[term];
      }
    }

    // بحث ضبابي إذا لم نجد تطابق مباشر
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i].toLowerCase();
      for (const term of searchTerms) {
        if (header.includes(term.toLowerCase()) || term.toLowerCase().includes(header)) {
          return i;
        }
      }
    }

    return -1;
  };

  // العثور على فهارس الأعمدة
  const phoneColumnIndex = findColumnIndex(['رقم الهاتف', 'الهاتف', 'phone', 'Phone']);
  const whatsappColumnIndex = findColumnIndex(['رقم الواتساب', 'الواتساب', 'واتساب', 'whatsapp', 'WhatsApp']);

  // استخدام فهارس ثابتة كبديل إذا لم نجد العناوين
  const finalPhoneColumnIndex = phoneColumnIndex >= 0 ? phoneColumnIndex : 2;
  const finalWhatsappColumnIndex = whatsappColumnIndex >= 0 ? whatsappColumnIndex : 3;

  // التحقق من وجود الأعمدة المطلوبة
  if (phoneColumnIndex === -1) {
    console.error('❌ لم يتم العثور على عمود رقم الهاتف');
  }
  if (whatsappColumnIndex === -1) {
    console.error('❌ لم يتم العثور على عمود رقم الواتساب');
  }

  return rows.slice(1).map((row, index) => {
    const rowIndex = index + 2;

    // دالة مساعدة لتنظيف وتنسيق أرقام الهاتف المصرية
    const cleanAndFormatEgyptianPhone = (phoneStr: string): string => {
      if (!phoneStr) return '';

      const originalInput = phoneStr.toString();

      // تحويل الأرقام العربية إلى إنجليزية أولاً
      const withEnglishNumerals = convertArabicNumerals(originalInput);

      // تنظيف شامل: إزالة كل شيء عدا الأرقام
      let cleaned = withEnglishNumerals.replace(/\D/g, '');

      if (!cleaned) return '';

      let result = '';

      // معالجة الحالات المختلفة للأرقام المصرية
      // الحالة 1: رقم دولي كامل (201XXXXXXXXX - 12 رقم)
      if (cleaned.length === 12 && cleaned.startsWith('201')) {
        result = '0' + cleaned.substring(2); // تحويل إلى 01XXXXXXXXX
      }
      // الحالة 2: رقم محلي صحيح (01XXXXXXXXX - 11 رقم)
      else if (cleaned.length === 11 && cleaned.startsWith('01')) {
        result = cleaned; // صحيح كما هو
      }
      // الحالة 3: رقم بدون الصفر الأول (1XXXXXXXXX - 10 أرقام)
      else if (cleaned.length === 10 && cleaned.startsWith('1')) {
        result = '0' + cleaned; // إضافة الصفر → 01XXXXXXXXX
      }
      // الحالة 4: رقم يبدأ بـ 20 فقط (20XXXXXXXXX - 11 رقم)
      else if (cleaned.length === 11 && cleaned.startsWith('20')) {
        result = '0' + cleaned.substring(1); // تحويل إلى 01XXXXXXXXX
      }
      // الحالة 5: رقم أرضي يبدأ بـ 02 أو 03 (11 رقم - خطأ شائع بإضافة صفر زائد)
      else if (cleaned.length === 11 && (cleaned.startsWith('02') || cleaned.startsWith('03'))) {
        // إزالة الصفر الزائد: 02026182959 → 0226182959
        result = '0' + cleaned.substring(2);
      }
      // الحالة 6: رقم يبدأ بـ 2 فقط (2XXXXXXXXX - 10 أرقام)
      else if (cleaned.length === 10 && cleaned.startsWith('2')) {
        result = '0' + cleaned; // إضافة الصفر → 02XXXXXXXXX
      }
      // إذا لم يطابق أي حالة، حاول إصلاحه
      else if (cleaned.length >= 9) {
        // إذا كان الرقم طويل جداً، خذ آخر 10 أرقام وأضف 0
        if (cleaned.length > 11) {
          const last10 = cleaned.slice(-10);
          if (last10.startsWith('1') || last10.startsWith('2')) {
            result = '0' + last10;
          } else {
            result = cleaned; // إرجاع كما هو
          }
        }
        // إذا كان الرقم قصير، حاول إضافة 01 في البداية
        else if (cleaned.length === 9) {
          result = '01' + cleaned;
        } else {
          result = cleaned; // إرجاع كما هو
        }
      } else {
        // إرجاع الرقم كما هو إذا لم يمكن إصلاحه
        result = cleaned;
      }

      return result;
    };

    // تنظيف وتنسيق الأرقام
    const phoneNumber = cleanAndFormatEgyptianPhone(finalPhoneColumnIndex >= 0 ? (row[finalPhoneColumnIndex] || '') : '');
    // قراءة رقم الواتساب الخام من الشيت (العمود D = الفهرس 3)
    const rawWhatsappFromSheet = row[3] || '';
    const whatsappNumber = cleanAndFormatEgyptianPhone(rawWhatsappFromSheet);

    // تنظيف الأرقام
    const normalizedPhone = phoneNumber.trim();
    const normalizedWhatsApp = whatsappNumber.trim();

    // إرجاع الواتساب كما هو محفوظ في الشيت (بدون إخفائه)
    // لضمان إمكانية التعديل عليه

    return {
      id: rowIndex,
      rowIndex,
      orderDate: row[0] || '', // العمود A
      name: row[1] || '', // العمود B
      phone: normalizedPhone, // العمود C
      whatsapp: normalizedWhatsApp, // العمود D - إرجاع الواتساب كما هو
      governorate: row[4] || '', // العمود E
      area: row[5] || '', // العمود F
      address: row[6] || '', // العمود G
      orderDetails: row[7] || '', // العمود H
      quantity: row[8] || '', // العمود I
      totalPrice: row[9] || '', // العمود J
      productName: row[10] || '', // العمود K
      status: row[11] || '', // العمود L
      notes: row[12] || '', // العمود M
      source: row[13] || '', // العمود N
      whatsappSent: row[14] || '', // العمود O
      assignee: row[16] || '', // العمود Q (الفهرس 16)
      bostaTrackingNumber: row[18] || '', // العمود S (الفهرس 18)
      bostaState: row[19] || '', // العمود T (الفهرس 19)
      lastBostaUpdate: row[20] || '' // العمود U (الفهرس 20)
    };
  });
}

// دالة لتحديث طلب واحد
export async function updateLead(rowNumber: number, updates: Partial<LeadRow>) {
  console.log(`🔄 تحديث الليد ${rowNumber} بالبيانات:`, JSON.stringify(updates, null, 2));

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const headers = ['تاريخ الطلب', 'الاسم', 'رقم الهاتف', 'رقم الواتساب', 'المحافظة', 'المنطقة', 'العنوان', 'تفاصيل الطلب', 'الكمية', 'إجمالي السعر', 'اسم المنتج', 'الحالة', 'ملاحظات', 'المصدر', 'ارسال واتس اب', 'عمود P', 'المسؤول', 'TikTok Lead ID', 'رقم تتبع بوسطة', 'حالة بوسطة', 'آخر تحديث بوسطة'];
  const range = `leads!A${rowNumber}:${String.fromCharCode(64 + headers.length)}${rowNumber}`;

  // جلب البيانات الحالية مع إعادة المحاولة
  const currentData = await retryWithBackoff(
    () => sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range,
    }),
    `قراءة الصف ${rowNumber}`
  );

  const currentRow = currentData.data.values?.[0] || [];
  // ضمان أن المصفوفة بطول الأعمدة الكامل لتجنب المصفوفات المتفرقة
  // Google Sheets لا تُرجع الخلايا الفارغة في نهاية الصف
  while (currentRow.length < headers.length) {
    currentRow.push('');
  }
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
    console.log(`📱 تحديث رقم الواتساب: "${updates.whatsapp}" في العمود D`);
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
    updatedRow[16] = updates.assignee; // المسؤول
  }
  if (updates.bostaTrackingNumber !== undefined) {
    updatedRow[18] = updates.bostaTrackingNumber; // رقم تتبع بوسطة
  }
  if (updates.bostaState !== undefined) {
    updatedRow[19] = updates.bostaState; // حالة بوسطة
  }
  if (updates.lastBostaUpdate !== undefined) {
    updatedRow[20] = updates.lastBostaUpdate; // آخر تحديث بوسطة
  }

  console.log(`✏️ البيانات الجديدة للصف ${rowNumber}:`, updatedRow);

  // تحديث البيانات مع إعادة المحاولة
  await retryWithBackoff(
    () => sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [updatedRow]
      }
    }),
    `تحديث الصف ${rowNumber}`
  );

  console.log(`✅ تم تحديث الليد ${rowNumber} بنجاح`);
}

// دالة لتحديث عدة طلبات
export async function updateLeadsBatch(updates: Array<{ rowNumber: number; updates: Partial<LeadRow> }>) {
  console.log(`🔄 تحديث مجمع لـ ${updates.length} ليد...`);

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const requests = updates.map(({ rowNumber, updates: leadUpdates }) => {
    const values = [];

    // إعداد القيم للتحديث - العمود Q هو المسؤول (الفهرس 16)
    if (leadUpdates.assignee !== undefined) {
      console.log(`📋 تعيين الليد في صف ${rowNumber} للموظف: ${leadUpdates.assignee}`);
      values.push({
        range: `leads!Q${rowNumber}`, // العمود Q (الفهرس 16) هو المسؤول
        values: [[leadUpdates.assignee]]
      });
    }

    // إضافة تحديثات أخرى إذا لزم الأمر
    if (leadUpdates.status !== undefined) {
      values.push({
        range: `leads!L${rowNumber}`, // العمود L (الفهرس 11) هو الحالة
        values: [[leadUpdates.status]]
      });
    }

    return values;
  }).flat();

  if (requests.length > 0) {
    console.log(`⚡ تنفيذ ${requests.length} تحديث مجمع...`);
    // استخدام إعادة المحاولة للتحديث المجمع
    await retryWithBackoff(
      () => sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: 'RAW',
          data: requests
        }
      }),
      `تحديث مجمع لـ ${updates.length} ليد`
    );
    console.log('✅ تم تنفيذ التحديث المجمع بنجاح');
  } else {
    console.log('⚠️ لا توجد تحديثات للتنفيذ');
  }
}

// دالة للحصول على إحصائيات الطلبات
export async function getOrderStatistics() {
  try {
    const leads = await fetchLeads();

    // الإحصائيات العامة
    const overall = {
      total: leads.length,
      confirmed: leads.filter(lead => lead.status === 'تم التأكيد').length, // فقط تم التأكيد (الشحن منفصل)
      pending: leads.filter(lead => ['جديد', 'لم يرد', 'في انتظار تأكيد العميل', 'تم التواصل معه واتساب'].includes(lead.status)).length,
      rejected: leads.filter(lead => lead.status === 'رفض التأكيد').length,
      shipped: leads.filter(lead => ['تم الشحن', 'في الطريق'].includes(lead.status)).length,
      delivered: leads.filter(lead => lead.status === 'تم التسليم').length,
      deliveryFailed: leads.filter(lead => lead.status === 'فشل التسليم').length,
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
          shipped: 0, // "تم الشحن" + "في الطريق"
          delivered: 0,
          deliveryFailed: 0,
          new: 0,
          noAnswer: 0,
          contacted: 0
        };
      }

      productStats[product].total++;

      // حساب دقيق بدون تداخل
      if (lead.status === 'تم التأكيد') {
        productStats[product].confirmed++;
      } else if (['تم الشحن', 'في الطريق'].includes(lead.status)) {
        productStats[product].shipped++;
      } else if (lead.status === 'تم التسليم') {
        productStats[product].delivered++;
      } else if (lead.status === 'فشل التسليم') {
        productStats[product].deliveryFailed++;
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
          shipped: 0, // "تم الشحن" + "في الطريق"
          delivered: 0,
          deliveryFailed: 0,
          new: 0,
          noAnswer: 0,
          contacted: 0
        };
      }

      sourceStats[source].total++;

      // حساب دقيق بدون تداخل
      if (lead.status === 'تم التأكيد') {
        sourceStats[source].confirmed++;
      } else if (['تم الشحن', 'في الطريق'].includes(lead.status)) {
        sourceStats[source].shipped++;
      } else if (lead.status === 'تم التسليم') {
        sourceStats[source].delivered++;
      } else if (lead.status === 'فشل التسليم') {
        sourceStats[source].deliveryFailed++;
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

// دالة لإنشاء منتج تجريبي لاختبار الربط
export async function createTestProduct(): Promise<void> {
  try {
    console.log('🧪 إنشاء منتج تجريبي لاختبار الربط...');

    const testProduct: Partial<StockItem> = {
      productName: 'جرس الباب الحديث بكاميرا',
      initialQuantity: 100,
      currentQuantity: 100,
      synonyms: 'جرس باب, جرس الباب, جرس بكاميرا, جرس حديث, باب جرس, كاميرا باب',
      minThreshold: 10
    };

    await addOrUpdateStockItem(testProduct);
    console.log('✅ تم إنشاء المنتج التجريبي بنجاح');

  } catch (error) {
    console.error('❌ خطأ في إنشاء المنتج التجريبي:', error);
    throw error;
  }
}

// دالة محسنة للبحث عن المنتج بالمتردفات مع تشخيص أفضل
export function findProductBySynonymsEnhanced(productName: string, stockItems: StockItem[]): StockItem | null {
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

// دالة محسنة لإعادة إنشاء وتنظيم رؤوس أعمدة stock_movements
export async function resetStockMovementsHeaders(): Promise<{ success: boolean; message: string }> {
  try {
    console.log('🔄 إعادة تنظيم رؤوس أعمدة stock_movements...');

    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!spreadsheetId) {
      throw new Error('معرف Google Sheet غير موجود');
    }

    // العناوين المفصلة والمنظمة
    const detailedHeaders = [
      'رقم تسلسلي',                    // A - ID تسلسلي فريد
      'تاريخ العملية',                 // B - التاريخ (YYYY-MM-DD)
      'وقت العملية',                  // C - الوقت (HH:MM:SS)
      'التوقيت الكامل (مصري)',         // D - التاريخ والوقت كاملاً بالتوقيت المصري
      'اسم المنتج',                   // E - اسم المنتج المتأثر
      'نوع العملية',                  // F - (إضافة أولية، إضافة مخزون، مبيعات، مرتجعات، تالف، مفقود، تعديل)
      'الكمية المتأثرة',               // G - الكمية (موجب للإضافة، سالب للخصم)
      'الكمية قبل العملية',            // H - الكمية المتوفرة قبل هذه العملية
      'الكمية بعد العملية',           // I - الكمية المتوفرة بعد هذه العملية
      'سبب العملية',                  // J - السبب التفصيلي للعملية
      'المورد/المصدر',                // K - اسم المورد أو مصدر البضاعة
      'تكلفة الوحدة',                 // L - تكلفة الوحدة الواحدة (ج.م)
      'إجمالي التكلفة',               // M - إجمالي تكلفة العملية (ج.م)
      'رقم الطلب المرتبط',             // N - رقم طلب العميل (إن وجد)
      'المسؤول عن العملية',           // O - اسم الموظف المسؤول
      'ملاحظات إضافية',               // P - أي ملاحظات أو تفاصيل إضافية
      'حالة العملية',                 // Q - (مكتملة، معلقة، ملغاة)
      'تاريخ الإدخال',                 // R - متى تم تسجيل هذه العملية في النظام
      'IP العملية',                   // S - عنوان IP للجهاز المستخدم
      'معرف الجلسة'                   // T - معرف جلسة المستخدم
    ];

    // حذف البيانات الموجودة وإعادة إنشاء العناوين
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'stock_movements!A:T'
    });

    console.log('🗑️ تم حذف البيانات القديمة');

    // إدراج العناوين الجديدة
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'stock_movements!A1:T1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [detailedHeaders]
      }
    });

    console.log('📋 تم إدراج العناوين الجديدة');

    // الحصول على معرف الشيت لتطبيق التنسيق
    const sheetId = await getSheetId(spreadsheetId, 'stock_movements');

    // تطبيق تنسيق متقدم للعناوين
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          // تنسيق صف العناوين
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: 20
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.2, green: 0.4, blue: 0.8 }, // أزرق داكن
                  textFormat: {
                    foregroundColor: { red: 1, green: 1, blue: 1 }, // أبيض
                    bold: true,
                    fontSize: 11
                  },
                  horizontalAlignment: 'CENTER',
                  verticalAlignment: 'MIDDLE',
                  wrapStrategy: 'WRAP',
                  borders: {
                    top: { style: 'SOLID', width: 2, color: { red: 0.1, green: 0.2, blue: 0.6 } },
                    bottom: { style: 'SOLID', width: 2, color: { red: 0.1, green: 0.2, blue: 0.6 } },
                    left: { style: 'SOLID', width: 1, color: { red: 0.1, green: 0.2, blue: 0.6 } },
                    right: { style: 'SOLID', width: 1, color: { red: 0.1, green: 0.2, blue: 0.6 } }
                  }
                }
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy,borders)'
            }
          },
          // تجميد صف العناوين
          {
            updateSheetProperties: {
              properties: {
                sheetId,
                gridProperties: {
                  frozenRowCount: 1,
                  frozenColumnCount: 1 // تجميد العمود الأول أيضاً
                }
              },
              fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount'
            }
          },
          // تعديل عرض الأعمدة
          {
            updateDimensionProperties: {
              range: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 20
              },
              properties: {
                pixelSize: 120 // عرض موحد للأعمدة
              },
              fields: 'pixelSize'
            }
          },
          // عرض خاص للأعمدة المهمة
          {
            updateDimensionProperties: {
              range: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: 3, // عمود التوقيت الكامل
                endIndex: 4
              },
              properties: {
                pixelSize: 180
              },
              fields: 'pixelSize'
            }
          },
          {
            updateDimensionProperties: {
              range: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: 4, // عمود اسم المنتج
                endIndex: 5
              },
              properties: {
                pixelSize: 200
              },
              fields: 'pixelSize'
            }
          },
          {
            updateDimensionProperties: {
              range: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: 9, // عمود السبب
                endIndex: 10
              },
              properties: {
                pixelSize: 250
              },
              fields: 'pixelSize'
            }
          },
          {
            updateDimensionProperties: {
              range: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: 15, // عمود الملاحظات
                endIndex: 16
              },
              properties: {
                pixelSize: 300
              },
              fields: 'pixelSize'
            }
          }
        ]
      }
    });

    console.log('🎨 تم تطبيق التنسيق المتقدم');

    // إضافة صف تفسيري تحت العناوين
    const explanationRow = [
      'رقم تلقائي',                    // A
      'YYYY-MM-DD',                  // B
      'HH:MM:SS',                    // C
      'التوقيت الكامل بالقاهرة',       // D
      'اسم دقيق للمنتج',              // E
      'إضافة/خصم/تعديل',              // F
      '+/- عدد القطع',                // G
      'الكمية السابقة',               // H
      'الكمية الجديدة',               // I
      'سبب تفصيلي',                  // J
      'اسم المورد',                  // K
      'سعر الوحدة',                  // L
      'إجمالي المبلغ',               // M
      'رقم الطلب',                   // N
      'اسم الموظف',                  // O
      'تفاصيل إضافية',               // P
      'مكتملة/معلقة',                // Q
      'وقت التسجيل',                 // R
      'عنوان الشبكة',                // S
      'معرف المستخدم'                // T
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'stock_movements!A2:T2',
      valueInputOption: 'RAW',
      requestBody: {
        values: [explanationRow]
      }
    });

    // تنسيق صف التفسير
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 2,
              startColumnIndex: 0,
              endColumnIndex: 20
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 }, // رمادي فاتح
                textFormat: {
                  foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 },
                  italic: true,
                  fontSize: 9
                },
                horizontalAlignment: 'CENTER',
                wrapStrategy: 'WRAP'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,wrapStrategy)'
          }
        }]
      }
    });

    console.log('📝 تم إضافة صف التفسير');

    return {
      success: true,
      message: `تم إعادة تنظيم رؤوس أعمدة stock_movements بنجاح!\n\n📊 تم إنشاء ${detailedHeaders.length} عمود مفصل:\n${detailedHeaders.map((header, index) => `${String.fromCharCode(65 + index)}: ${header}`).join('\n')}`
    };

  } catch (error) {
    console.error('❌ خطأ في إعادة تنظيم stock_movements:', error);
    return {
      success: false,
      message: `فشل في إعادة تنظيم stock_movements: ${error}`
    };
  }
}

// دالة جديدة لخصم المخزون الجماعي - أكثر كفاءة للطلبات المتعددة
// ✨ محمية بـ Mutex لمنع Race Conditions
import { stockMutex } from './stockValidation';

export async function deductStockBulk(
  orderItems: Array<{ productName: string; quantity: number; orderId: number }>,
  options?: { skipLock?: boolean }
): Promise<{
  success: boolean;
  message: string;
  results: Array<{
    orderId: number;
    productName: string;
    quantity: number;
    success: boolean;
    message: string;
    availableQuantity?: number;
  }>;
  summary?: {
    totalOrders: number;
    successfulOrders: number;
    failedOrders: number;
    productsSummary: Array<{
      productName: string;
      totalQuantityRequested: number;
      availableQuantity: number;
      totalQuantityDeducted: number;
    }>;
  };
}> {
  // ✨ تحسين: دعم تخطي القفل عند الاستخدام من داخل عملية ذرية مقفلة مسبقاً
  const skipLock = options?.skipLock ?? false;
  let release: (() => void) | null = null;
  
  if (!skipLock) {
    release = await stockMutex.acquire();
    console.log('🔒 تم الحصول على قفل المخزون للخصم الجماعي');
  } else {
    console.log('⏭️ تخطي القفل - العملية مقفلة مسبقاً');
  }

  try {
    console.log(`📦 بدء خصم المخزون الجماعي لـ ${orderItems.length} طلب...`);

    // الخطوة 1: تجميع الكميات المطلوبة حسب المنتج
    const productQuantities = new Map<string, {
      totalQuantity: number;
      orders: Array<{ orderId: number; quantity: number }>;
    }>();

    for (const item of orderItems) {
      const normalizedName = item.productName.trim();
      if (!productQuantities.has(normalizedName)) {
        productQuantities.set(normalizedName, {
          totalQuantity: 0,
          orders: []
        });
      }

      const productData = productQuantities.get(normalizedName)!;
      productData.totalQuantity += item.quantity;
      productData.orders.push({ orderId: item.orderId, quantity: item.quantity });
    }

    console.log(`📊 تم تجميع ${productQuantities.size} منتج مختلف`);

    // الخطوة 2: جلب المخزون مرة واحدة فقط
    const stockData = await fetchStock(true);
    const stockItems = stockData.stockItems;
    console.log(`📦 تم جلب ${stockItems.length} منتج من المخزون`);

    // الخطوة 3: التحقق من توفر المخزون وتحضير التحديثات
    const results: Array<any> = [];
    const stockUpdates: Array<{ stockItem: StockItem; newQuantity: number }> = [];
    const stockMovements: Array<any> = [];
    const productsSummary: Array<any> = [];

    for (const [productName, data] of productQuantities.entries()) {
      console.log(`\n🔍 معالجة المنتج: "${productName}" - الكمية المطلوبة الإجمالية: ${data.totalQuantity}`);

      // البحث عن المنتج في المخزون
      const stockItem = findProductBySynonyms(productName, stockItems);

      if (!stockItem) {
        console.error(`❌ المنتج "${productName}" غير موجود في المخزون`);

        // إضافة نتائج فاشلة لجميع الطلبات الخاصة بهذا المنتج
        for (const order of data.orders) {
          results.push({
            orderId: order.orderId,
            productName,
            quantity: order.quantity,
            success: false,
            message: `المنتج "${productName}" غير موجود في المخزون`
          });
        }

        productsSummary.push({
          productName,
          totalQuantityRequested: data.totalQuantity,
          availableQuantity: 0,
          totalQuantityDeducted: 0
        });

        continue;
      }

      console.log(`✅ تم العثور على المنتج: "${stockItem.productName}" - المتوفر: ${stockItem.currentQuantity}`);

      // التحقق من كفاية المخزون
      if (stockItem.currentQuantity < data.totalQuantity) {
        console.error(`❌ المخزون غير كافي للمنتج "${productName}". المطلوب: ${data.totalQuantity}, المتوفر: ${stockItem.currentQuantity}`);

        // إضافة نتائج فاشلة لجميع الطلبات
        for (const order of data.orders) {
          results.push({
            orderId: order.orderId,
            productName,
            quantity: order.quantity,
            success: false,
            message: `المخزون غير كافي. المتوفر الإجمالي: ${stockItem.currentQuantity}، المطلوب الإجمالي: ${data.totalQuantity}`,
            availableQuantity: stockItem.currentQuantity
          });
        }

        productsSummary.push({
          productName: stockItem.productName,
          totalQuantityRequested: data.totalQuantity,
          availableQuantity: stockItem.currentQuantity,
          totalQuantityDeducted: 0
        });

        continue;
      }

      // المخزون كافي - تحضير التحديثات
      const newQuantity = stockItem.currentQuantity - data.totalQuantity;
      console.log(`✅ المخزون كافي. سيتم تحديث: ${stockItem.currentQuantity} - ${data.totalQuantity} = ${newQuantity}`);

      stockUpdates.push({
        stockItem,
        newQuantity
      });

      // إضافة نتائج ناجحة لجميع الطلبات
      for (const order of data.orders) {
        results.push({
          orderId: order.orderId,
          productName: stockItem.productName,
          quantity: order.quantity,
          success: true,
          message: `سيتم خصم ${order.quantity} من ${stockItem.productName}`
        });

        // تحضير حركة مخزون لكل طلب
        stockMovements.push({
          productName: stockItem.productName,
          type: 'sale',
          quantity: -order.quantity,
          orderId: order.orderId,
          reason: 'شحن طلب - خصم جماعي'
        });
      }

      productsSummary.push({
        productName: stockItem.productName,
        totalQuantityRequested: data.totalQuantity,
        availableQuantity: stockItem.currentQuantity,
        totalQuantityDeducted: data.totalQuantity
      });
    }

    // الخطوة 4: تنفيذ جميع التحديثات دفعة واحدة
    console.log(`\n🚀 تنفيذ ${stockUpdates.length} تحديث مخزون...`);

    // تحديث المخزون دفعة واحدة
    for (const update of stockUpdates) {
      await addOrUpdateStockItem({
        ...update.stockItem,
        currentQuantity: update.newQuantity
      });
      console.log(`✅ تم تحديث "${update.stockItem.productName}": ${update.stockItem.currentQuantity} → ${update.newQuantity}`);
    }

    // ✨ تسجيل حركات المخزون دفعة واحدة (طلب API واحد بدلاً من طلب لكل حركة)
    console.log(`📝 تسجيل ${stockMovements.length} حركة مخزون دفعة واحدة...`);
    if (stockMovements.length > 0) {
      const movementsResult = await addStockMovementsBatch(stockMovements);
      if (!movementsResult.success) {
        console.warn('⚠️ تحذير: فشل تسجيل بعض حركات المخزون:', movementsResult.message);
      }
    }

    // حساب الإحصائيات
    const successfulOrders = results.filter(r => r.success).length;
    const failedOrders = results.filter(r => !r.success).length;

    const summaryMessage = `✅ تم معالجة ${orderItems.length} طلب:
- نجح: ${successfulOrders} طلب
- فشل: ${failedOrders} طلب
- منتجات مختلفة: ${productQuantities.size}
- تحديثات مخزون: ${stockUpdates.length}`;

    console.log(`\n📊 ${summaryMessage}`);

    return {
      success: failedOrders === 0,
      message: summaryMessage,
      results,
      summary: {
        totalOrders: orderItems.length,
        successfulOrders,
        failedOrders,
        productsSummary
      }
    };

  } catch (error: any) {
    const errorMessage = error?.message || error?.toString() || 'خطأ غير معروف';
    console.error('❌ خطأ في خصم المخزون الجماعي:', errorMessage, error);
    return {
      success: false,
      message: `حدث خطأ أثناء خصم المخزون الجماعي: ${errorMessage}`,
      results: orderItems.map(item => ({
        orderId: item.orderId,
        productName: item.productName,
        quantity: item.quantity,
        success: false,
        message: `خطأ في خصم المخزون: ${errorMessage}`
      }))
    };
  } finally {
    // ✨ تحرير قفل المخزون فقط إذا تم الحصول عليه
    if (release) {
      release();
      console.log('🔓 تم تحرير قفل المخزون بعد الخصم الجماعي');
    }
  }
}
