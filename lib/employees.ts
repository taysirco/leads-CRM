/**
 * ملف مشترك لإدارة بيانات الموظفين
 * يوحد جميع العمليات المتعلقة بالموظفين في مكان واحد
 */

import { google } from 'googleapis';

export interface Employee {
  username: string;
  displayName: string;
}

// إعدادات Google Sheets
const SHEET_ID = process.env.GOOGLE_SHEET_ID as string;
const SETTINGS_SHEET_NAME = 'settings';

// قائمة الموظفين الافتراضية
const DEFAULT_EMPLOYEES: Employee[] = [
  { username: 'heba.', displayName: 'هبه' },
  { username: 'mai.', displayName: 'مي' },
  { username: 'nada.', displayName: 'ندا' }
];

/**
 * جلب قائمة أسماء المستخدمين للموظفين من متغيرات البيئة
 * يقرأ من CALL_CENTER_USERS بصيغة: "user1:pass1:name1,user2:pass2:name2"
 * @returns مصفوفة أسماء المستخدمين
 */
export function getEmployeesFromEnv(): string[] {
  const envUsers = process.env.CALL_CENTER_USERS;
  
  if (envUsers) {
    // تنسيق: "heba.:zz2122:هبه,mai.:zz2122:مي,nada.:zz2122:ندا"
    const parsed = envUsers.split(',')
      .map(entry => entry.trim())
      .filter(Boolean)
      .map(entry => {
        const parts = entry.split(':');
        return parts[0]?.trim(); // أول جزء هو اسم المستخدم
      })
      .filter(Boolean) as string[];
    
    if (parsed.length > 0) {
      return parsed;
    }
  }
  
  // القيم الافتراضية
  return DEFAULT_EMPLOYEES.map(e => e.username);
}

/**
 * جلب قائمة الموظفين الكاملة مع أسماء العرض
 * يقرأ من CALL_CENTER_USERS بصيغة: "user1:pass1:name1,user2:pass2:name2"
 * @returns مصفوفة كائنات الموظفين
 */
export function getEmployeesWithDisplayNames(): Employee[] {
  const envUsers = process.env.CALL_CENTER_USERS;
  
  if (envUsers) {
    const employees = envUsers.split(',')
      .map(entry => entry.trim())
      .filter(Boolean)
      .map(entry => {
        const parts = entry.split(':');
        const username = parts[0]?.trim() || '';
        const displayName = parts[2]?.trim() || username.replace('.', '');
        return { username, displayName };
      })
      .filter(emp => emp.username);
    
    if (employees.length > 0) {
      return employees;
    }
  }
  
  return DEFAULT_EMPLOYEES;
}

/**
 * الحصول على اسم العرض لموظف معين
 * @param username اسم المستخدم
 * @returns اسم العرض
 */
export function getEmployeeDisplayName(username: string): string {
  const employees = getEmployeesWithDisplayNames();
  const employee = employees.find(e => e.username === username);
  return employee?.displayName || username.replace('.', '');
}

/**
 * التحقق من صحة اسم مستخدم موظف
 * @param username اسم المستخدم للتحقق
 * @returns true إذا كان موظف صالح
 */
export function isValidEmployee(username: string): boolean {
  const employees = getEmployeesFromEnv();
  return employees.includes(username);
}

/**
 * الحصول على عدد الموظفين
 * @returns عدد الموظفين
 */
export function getEmployeeCount(): number {
  return getEmployeesFromEnv().length;
}

// ========================
// Round Robin Index Storage
// ========================

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

// كاش محلي لتقليل طلبات API
let cachedRoundRobinIndex: number | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 5000; // 5 ثواني

/**
 * التأكد من وجود ورقة الإعدادات
 */
async function ensureSettingsSheetExists(): Promise<void> {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // محاولة الوصول للورقة
    try {
      await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${SETTINGS_SHEET_NAME}!A1:B1`,
      });
    } catch (error: any) {
      if (error.message?.includes('Unable to parse range') ||
        error.message?.includes('Sheet not found')) {
        console.log('⚙️ إنشاء ورقة الإعدادات...');
        await createSettingsSheet();
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('❌ خطأ في التحقق من ورقة الإعدادات:', error);
  }
}

/**
 * إنشاء ورقة الإعدادات
 */
async function createSettingsSheet(): Promise<void> {
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
              title: SETTINGS_SHEET_NAME,
              gridProperties: {
                columnCount: 3,
                rowCount: 100
              }
            }
          }
        }]
      }
    });

    // إضافة العناوين والقيم الافتراضية
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SETTINGS_SHEET_NAME}!A1:C2`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          ['المفتاح', 'القيمة', 'آخر تحديث'],
          ['lastAssignedIndex', '-1', new Date().toISOString()]
        ]
      }
    });

    console.log('✅ تم إنشاء ورقة الإعدادات بنجاح');
  } catch (error) {
    console.error('❌ خطأ في إنشاء ورقة الإعدادات:', error);
  }
}

/**
 * جلب مؤشر Round Robin من Google Sheets
 * @returns المؤشر المحفوظ أو -1 إذا لم يكن موجوداً
 */
export async function getRoundRobinIndex(): Promise<number> {
  // استخدام الكاش إذا كان حديثاً
  const now = Date.now();
  if (cachedRoundRobinIndex !== null && (now - lastFetchTime) < CACHE_TTL) {
    return cachedRoundRobinIndex;
  }

  try {
    await ensureSettingsSheetExists();

    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SETTINGS_SHEET_NAME}!A:B`,
    });

    const rows = response.data.values || [];
    
    // البحث عن lastAssignedIndex
    for (const row of rows) {
      if (row[0] === 'lastAssignedIndex') {
        const value = parseInt(row[1]) || -1;
        cachedRoundRobinIndex = value;
        lastFetchTime = now;
        console.log(`📊 تم جلب مؤشر Round Robin: ${value}`);
        return value;
      }
    }

    // إذا لم يُعثر عليه، أضفه
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SETTINGS_SHEET_NAME}!A:C`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [['lastAssignedIndex', '-1', new Date().toISOString()]]
      }
    });

    cachedRoundRobinIndex = -1;
    lastFetchTime = now;
    return -1;

  } catch (error) {
    console.error('❌ خطأ في جلب مؤشر Round Robin:', error);
    return cachedRoundRobinIndex ?? -1;
  }
}

/**
 * حفظ مؤشر Round Robin في Google Sheets
 * @param index المؤشر الجديد
 */
export async function saveRoundRobinIndex(index: number): Promise<void> {
  // تحديث الكاش فوراً
  cachedRoundRobinIndex = index;
  lastFetchTime = Date.now();

  try {
    await ensureSettingsSheetExists();

    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // جلب البيانات للعثور على الصف الصحيح
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SETTINGS_SHEET_NAME}!A:B`,
    });

    const rows = response.data.values || [];
    let rowIndex = -1;

    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === 'lastAssignedIndex') {
        rowIndex = i + 1; // +1 لأن الشيت يبدأ من 1
        break;
      }
    }

    if (rowIndex > 0) {
      // تحديث القيمة الموجودة
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SETTINGS_SHEET_NAME}!B${rowIndex}:C${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[index.toString(), new Date().toISOString()]]
        }
      });
    } else {
      // إضافة صف جديد
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SETTINGS_SHEET_NAME}!A:C`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['lastAssignedIndex', index.toString(), new Date().toISOString()]]
        }
      });
    }

    console.log(`💾 تم حفظ مؤشر Round Robin: ${index}`);

  } catch (error) {
    console.error('❌ خطأ في حفظ مؤشر Round Robin:', error);
    // الكاش لا يزال محدثاً، لذا العملية ستستمر
  }
}
