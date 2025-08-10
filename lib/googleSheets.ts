import { google } from 'googleapis';
import { formatEgyptianPhone } from './phoneFormatter';

const SHEET_ID = process.env.GOOGLE_SHEET_ID as string;
const SHEET_NAME = 'leads'; // Define sheet name as a constant
const STOCK_SHEET_NAME = 'stock'; // Define stock sheet name

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

// دالة لإنشاء stock sheet إذا لم يكن موجود
export async function ensureStockSheetExists() {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // محاولة الحصول على معلومات الشيت
    try {
      await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${STOCK_SHEET_NAME}!A1:H1`,
      });
      console.log('Stock sheet already exists');
      return true;
    } catch (error) {
      // إذا كان الشيت غير موجود، أنشئه
      console.log('Creating stock sheet...');
      
      // إضافة الشيت الجديد
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: STOCK_SHEET_NAME,
              }
            }
          }]
        }
      });

      // إضافة عناوين الأعمدة
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${STOCK_SHEET_NAME}!A1:H1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            'رقم',
            'اسم المنتج',
            'الكمية الأولية',
            'الكمية الحالية',
            'آخر تحديث',
            'المتردفات',
            'الحد الأدنى',
            'تاريخ الإنشاء'
          ]]
        }
      });

      console.log('Stock sheet created successfully');
      return true;
    }
  } catch (error) {
    console.error('Error ensuring stock sheet exists:', error);
    throw error;
  }
}

// دالة لجلب بيانات المخزون
export async function fetchStock(): Promise<StockItem[]> {
  await ensureStockSheetExists();
  
  try {
    console.log(`📊 بدء جلب بيانات المخزون من ${STOCK_SHEET_NAME}...`);
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${STOCK_SHEET_NAME}!A:H`,
    });

    const values = response.data.values || [];
    console.log(`📋 تم جلب ${values.length} صف من Google Sheets`);
    
    if (values.length <= 1) {
      console.log('📝 الشيت فارغ أو يحتوي على العناوين فقط');
      return []; // فقط العناوين أو فارغ
    }

    const stockItems: StockItem[] = [];
    
    console.log('🔄 معالجة صفوف البيانات...');
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      
      // تخطي الصفوف الفارغة
      if (!row || row.length === 0 || !row[1]) {
        console.log(`⚠️ تخطي الصف ${i + 1} (فارغ أو غير مكتمل)`);
        continue;
      }
      
      const stockItem: StockItem = {
        id: parseInt(row[0]) || i,
        rowIndex: i + 1,
        productName: row[1] || '',
        initialQuantity: parseInt(row[2]) || 0,
        currentQuantity: parseInt(row[3]) || 0,
        lastUpdate: row[4] || getCurrentEgyptianDate(),
        synonyms: row[5] || '',
        minThreshold: parseInt(row[6]) || 10,
      };
      
      console.log(`✅ منتج ${i}: ${stockItem.productName} (الكمية: ${stockItem.currentQuantity})`);
      stockItems.push(stockItem);
    }

    console.log(`✅ تم تحليل ${stockItems.length} منتج بنجاح`);
    return stockItems;
  } catch (error) {
    console.error('❌ خطأ في جلب بيانات المخزون:', error);
    throw error;
  }
}

// دالة للبحث عن منتج باستخدام المتردفات
export function findProductBySynonyms(searchName: string, stockItems: StockItem[]): StockItem | null {
  if (!searchName) return null;
  
  const normalizeText = (text: string) => 
    text.toLowerCase()
      .replace(/[أإآا]/g, 'ا')
      .replace(/[ىي]/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const searchNormalized = normalizeText(searchName);

  for (const item of stockItems) {
    // مطابقة مباشرة مع اسم المنتج
    if (normalizeText(item.productName) === searchNormalized) {
      return item;
    }

    // مطابقة جزئية مع اسم المنتج
    if (normalizeText(item.productName).includes(searchNormalized) || 
        searchNormalized.includes(normalizeText(item.productName))) {
      return item;
    }

    // مطابقة مع المتردفات
    if (item.synonyms) {
      const synonyms = item.synonyms.split(',').map(s => s.trim());
      for (const synonym of synonyms) {
        if (normalizeText(synonym) === searchNormalized ||
            normalizeText(synonym).includes(searchNormalized) ||
            searchNormalized.includes(normalizeText(synonym))) {
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
    
    const stockItems = await fetchStock();
    const existingItem = stockItems.find(item => 
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
      const newId = stockItems.length > 0 ? Math.max(...stockItems.map(item => item.id)) + 1 : 1;
      
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
    const stockItems = await fetchStock();
    const stockItem = findProductBySynonyms(productName, stockItems);

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
    const stockItems = await fetchStock();
    return stockItems.filter(item => 
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
    const stockItems = await fetchStock();
    const stockItem = findProductBySynonyms(returnItem.productName || '', stockItems);
    
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
    const stockItems = await fetchStock();
    const alerts = await getStockAlerts();
    
    // إحصائيات عامة
    const totalProducts = stockItems.length;
    const totalStockValue = stockItems.reduce((sum, item) => sum + item.currentQuantity, 0);
    const lowStockCount = alerts.length;
    const outOfStockCount = stockItems.filter(item => item.currentQuantity <= 0).length;

    // تقرير المنتجات حسب الحالة
    const byStatus = {
      inStock: stockItems.filter(item => item.currentQuantity > (item.minThreshold || 10)).length,
      lowStock: stockItems.filter(item => 
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
      stockItems,
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
    const stockItems = await fetchStock();
    console.log('✅ تم جلب بيانات المخزون:', stockItems.length, 'منتج');
    
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
    const updatedItems = await fetchStock();
    const addedProduct = updatedItems.find(item => item.productName === testProduct.productName);
    
    if (addedProduct) {
      console.log('✅ تم العثور على المنتج التجريبي في الشيت');
      return {
        success: true,
        message: 'اختبار التزامن مع Google Sheets نجح بشكل كامل',
        data: {
          totalProducts: updatedItems.length,
          testProduct: addedProduct,
          allProducts: updatedItems
        }
      };
    } else {
      console.log('❌ لم يتم العثور على المنتج التجريبي');
      return {
        success: false,
        message: 'فشل في العثور على المنتج بعد الإضافة',
        data: { totalProducts: updatedItems.length }
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