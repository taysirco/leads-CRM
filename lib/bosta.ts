/**
 * Bosta Shipping API Client
 * يتعامل مع Bosta API لإنشاء الشحنات واستقبال تحديثات الحالة
 */
import crypto from 'crypto';

const BOSTA_BASE_URL = 'https://app.bosta.co/api/v2';
const BOSTA_API_KEY = process.env.BOSTA_API_KEY || '';

// ==================== خريطة حالات بوسطة ====================

export const BOSTA_STATE_MAP: Record<number, { ar: string; crmStatus: string; color: string }> = {
  10: { ar: 'تم الإنشاء', crmStatus: 'تم الشحن', color: 'blue' },
  20: { ar: 'تم الاستلام من المرسل', crmStatus: 'تم الشحن', color: 'blue' },
  21: { ar: 'جاري الاستلام', crmStatus: 'تم الشحن', color: 'blue' },
  24: { ar: 'يتم التحضير', crmStatus: 'تم الشحن', color: 'blue' },
  30: { ar: 'في الطريق للعميل', crmStatus: 'في الطريق', color: 'orange' },
  41: { ar: 'تم الاستلام في الفرع', crmStatus: 'في الطريق', color: 'orange' },
  45: { ar: 'تم التسليم', crmStatus: 'تم التسليم', color: 'green' },
  46: { ar: 'تم التسليم جزئياً', crmStatus: 'تم التسليم', color: 'green' },
  47: { ar: 'استثناء - فشل التسليم', crmStatus: 'فشل التسليم', color: 'red' },
  50: { ar: 'قيد الإرجاع', crmStatus: 'فشل التسليم', color: 'red' },
  80: { ar: 'تم الإرجاع', crmStatus: 'فشل التسليم', color: 'red' },
  85: { ar: 'تم الإنهاء', crmStatus: 'فشل التسليم', color: 'red' },
  100: { ar: 'في انتظار إجراء', crmStatus: 'فشل التسليم', color: 'yellow' },
};

// دالة لتحويل كود حالة بوسطة إلى حالة CRM
export function mapBostaStateToCRM(stateCode: number): { crmStatus: string; bostaStateAr: string } {
  const mapping = BOSTA_STATE_MAP[stateCode];
  if (mapping) {
    return { crmStatus: mapping.crmStatus, bostaStateAr: mapping.ar };
  }
  return { crmStatus: 'تم الشحن', bostaStateAr: `حالة غير معروفة (${stateCode})` };
}

// ==================== تنسيق البيانات ====================

// تحويل رقم الهاتف إلى الصيغة المحلية المصرية (01xxxxxxxxx)
// مُصدّرة لاستخدامها في BostaExport.tsx أيضاً (DRY)
export function formatToLocalEgyptianNumber(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');

  if (cleaned.startsWith('20') && cleaned.length === 12) {
    return '0' + cleaned.substring(2);
  }
  if (cleaned.startsWith('2') && cleaned.length === 11) {
    return '0' + cleaned.substring(1);
  }
  if (cleaned.startsWith('1') && cleaned.length === 10) {
    return '0' + cleaned;
  }
  if (cleaned.startsWith('01') && cleaned.length === 11) {
    return cleaned;
  }
  return cleaned;
}

// Bosta API يقبل أسماء المحافظات بالعربية مباشرة

// تحويل اسم المحافظة إلى الاسم الذي يتعرف عليه بوسطة
// مُصدّرة لاستخدامها في BostaExport.tsx أيضاً (DRY)
// قاموس شامل: عربي + إنجليزي + متغيرات شائعة
export function normalizeGovernorateName(governorate: string): string {
  if (!governorate) return '';
  const cleaned = governorate.trim();

  const aliasMap: Record<string, string> = {
    // === الأسماء العربية الكاملة ===
    'القاهرة': 'القاهرة', 'الجيزة': 'الجيزة', 'الإسكندرية': 'الإسكندرية',
    'الشرقية': 'الشرقية', 'القليوبية': 'القليوبية', 'المنوفية': 'المنوفية',
    'الغربية': 'الغربية', 'الدقهلية': 'الدقهلية', 'البحيرة': 'البحيرة',
    'المنيا': 'المنيا', 'الفيوم': 'الفيوم', 'الإسماعيلية': 'الإسماعيلية',
    'السويس': 'السويس', 'الأقصر': 'الأقصر', 'البحر الأحمر': 'البحر الأحمر',
    'الوادي الجديد': 'الوادي الجديد', 'شمال سيناء': 'شمال سيناء',
    'جنوب سيناء': 'جنوب سيناء', 'بني سويف': 'بني سويف',
    'كفر الشيخ': 'كفر الشيخ', 'دمياط': 'دمياط', 'سوهاج': 'سوهاج',
    'أسيوط': 'أسيوط', 'أسوان': 'أسوان', 'قنا': 'قنا',
    'بور سعيد': 'بور سعيد', 'مرسى مطروح': 'مرسى مطروح',

    // === متغيرات عربية شائعة (بدون ال التعريف / أخطاء إملائية) ===
    'قاهرة': 'القاهرة', 'جيزة': 'الجيزة', 'اسكندرية': 'الإسكندرية',
    'اسماعيلية': 'الإسماعيلية', 'إسماعيلية': 'الإسماعيلية',
    'شرقية': 'الشرقية', 'قليوبية': 'القليوبية', 'منوفية': 'المنوفية',
    'غربية': 'الغربية', 'دقهلية': 'الدقهلية', 'بحيرة': 'البحيرة',
    'منيا': 'المنيا', 'فيوم': 'الفيوم', 'اسيوط': 'أسيوط',
    'اسوان': 'أسوان', 'بورسعيد': 'بور سعيد', 'مطروح': 'مرسى مطروح',
    'اقصر': 'الأقصر', 'أقصر': 'الأقصر', 'لوكسور': 'الأقصر',
    'بنى سويف': 'بني سويف',
    'سيناء الجنوبية': 'جنوب سيناء', 'جنوب سينا': 'جنوب سيناء',
    'سينا الجنوبية': 'جنوب سيناء', 'سيناء الشمالية': 'شمال سيناء',
    'شمال سينا': 'شمال سيناء', 'سينا الشمالية': 'شمال سيناء',

    // === الأسماء الإنجليزية ===
    'cairo': 'القاهرة', 'giza': 'الجيزة', 'alexandria': 'الإسكندرية',
    'ash sharqia': 'الشرقية', 'qalyubia': 'القليوبية', 'menofia': 'المنوفية',
    'gharbia': 'الغربية', 'dakahlia': 'الدقهلية', 'beheira': 'البحيرة',
    'minya': 'المنيا', 'faiyum': 'الفيوم', 'ismailia': 'الإسماعيلية',
    'suez': 'السويس', 'luxor': 'الأقصر', 'red sea': 'البحر الأحمر',
    'new valley': 'الوادي الجديد', 'north sinai': 'شمال سيناء',
    'south sinai': 'جنوب سيناء', 'beni suef': 'بني سويف',
    'kafr el sheikh': 'كفر الشيخ', 'damietta': 'دمياط', 'sohag': 'سوهاج',
    'assiut': 'أسيوط', 'aswan': 'أسوان', 'qena': 'قنا',
    'port said': 'بور سعيد', 'matrouh': 'مرسى مطروح',
  };

  // بحث مباشر
  const directMatch = aliasMap[cleaned];
  if (directMatch) return directMatch;

  // بحث case-insensitive (للأسماء الإنجليزية)
  const lowerMatch = aliasMap[cleaned.toLowerCase()];
  if (lowerMatch) return lowerMatch;

  // بحث جزئي ذكي
  for (const [key, value] of Object.entries(aliasMap)) {
    if (cleaned.includes(key) || key.includes(cleaned)) {
      return value;
    }
  }

  return cleaned;
}

// ==================== التحقق الذكي من المدينة والمنطقة عبر Bosta API ====================

interface BostaCity {
  _id: string;
  name: string;       // English name (e.g. "Cairo")
  nameAr: string;     // Arabic name (e.g. "القاهره")
  alias?: string;     // alias (e.g. "القاهرة")
}

interface BostaZone {
  _id: string;
  name: string;       // English name
  nameAr: string;     // Arabic name
  dropOffAvailability: boolean;
}

// كاش في الذاكرة — يُحمل مرة واحدة لكل cold start
let cachedCities: BostaCity[] | null = null;
let cachedZones: Map<string, BostaZone[]> = new Map();

/** جلب قائمة المدن من بوسطة (مع كاش) */
async function fetchBostaCities(): Promise<BostaCity[]> {
  if (cachedCities) return cachedCities;
  try {
    const res = await fetch(`${BOSTA_BASE_URL}/cities`, {
      headers: { 'Authorization': BOSTA_API_KEY },
    });
    const json = await res.json();
    cachedCities = json?.data?.list || [];
    console.log(`📍 [BOSTA] تم تحميل ${cachedCities!.length} مدينة`);
    return cachedCities!;
  } catch (e) {
    console.error('❌ [BOSTA] فشل تحميل المدن:', e);
    return [];
  }
}

/** جلب مناطق مدينة معينة من بوسطة (مع كاش) */
async function fetchBostaZones(cityId: string): Promise<BostaZone[]> {
  if (cachedZones.has(cityId)) return cachedZones.get(cityId)!;
  try {
    const res = await fetch(`${BOSTA_BASE_URL}/cities/${cityId}/zones`, {
      headers: { 'Authorization': BOSTA_API_KEY },
    });
    const json = await res.json();
    const zones = json?.data || [];
    cachedZones.set(cityId, zones);
    return zones;
  } catch (e) {
    console.error(`❌ [BOSTA] فشل تحميل مناطق المدينة ${cityId}:`, e);
    return [];
  }
}

/** تطبيع النص العربي — إزالة التشكيل وتوحيد الحروف */
function normalizeArabic(text: string): string {
  return text
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670]/g, '') // حذف التشكيل
    .replace(/[أإآ]/g, 'ا')    // توحيد الألف
    .replace(/ة/g, 'ه')        // التاء المربوطة → هاء
    .replace(/ى/g, 'ي')        // الألف المقصورة → ياء
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim().toLowerCase();
}

/** حساب تشابه بين نصين — مُحسّن للعربية */
function textSimilarity(a: string, b: string): number {
  const na = normalizeArabic(a);
  const nb = normalizeArabic(b);
  if (na === nb) return 1;

  // تطابق احتواء — أحدهما جزء من الآخر
  if (na.length > 2 && nb.length > 2) {
    if (na.includes(nb) || nb.includes(na)) return 0.85;
  }

  // للكلمات القصيرة جداً (مثل "قنا") — يُفضل Levenshtein-like
  if (na.length <= 4 || nb.length <= 4) {
    // مقارنة حرف بحرف مع تسامح خطأ واحد
    const maxLen = Math.max(na.length, nb.length);
    let matches = 0;
    for (let i = 0; i < Math.min(na.length, nb.length); i++) {
      if (na[i] === nb[i]) matches++;
    }
    return maxLen > 0 ? matches / maxLen : 0;
  }

  // Bigram similarity (أفضل من Jaccard على مستوى الحروف المفردة)
  const bigramsA = new Set<string>();
  const bigramsB = new Set<string>();
  for (let i = 0; i < na.length - 1; i++) bigramsA.add(na.substring(i, i + 2));
  for (let i = 0; i < nb.length - 1; i++) bigramsB.add(nb.substring(i, i + 2));
  const intersection = [...bigramsA].filter(bg => bigramsB.has(bg)).length;
  const union = new Set([...bigramsA, ...bigramsB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * 🧠 التحقق الذكي — يطابق المدينة والمنطقة ضد قاعدة بيانات بوسطة الفعلية
 * يرجع الأسماء المصححة أو null إذا لم يجد تطابق
 */
export async function smartMatchCityAndZone(
  userCity: string,
  userArea?: string
): Promise<{ city: string; zone?: string; cityId?: string; warning?: string }> {
  const cities = await fetchBostaCities();
  if (cities.length === 0) {
    // إذا فشل التحميل، نرجع القيمة كما هي
    return { city: userCity, zone: userArea };
  }

  // ابحث عن أفضل تطابق للمدينة
  let bestCity: BostaCity | null = null;
  let bestScore = 0;

  for (const city of cities) {
    const candidates = [city.name, city.nameAr, city.alias || ''].filter(Boolean);
    for (const candidate of candidates) {
      const score = textSimilarity(userCity, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestCity = city;
      }
    }
  }

  if (!bestCity || bestScore < 0.5) {
    return { city: userCity, zone: userArea, warning: `⚠️ المدينة "${userCity}" غير موجودة في بوسطة` };
  }

  // استخدم اسم المدينة المعتمد من بوسطة (nameAr)
  const correctedCity = bestCity.nameAr;
  let warning = bestScore < 0.9 ? `📍 تم تصحيح المدينة: "${userCity}" → "${correctedCity}"` : undefined;

  // إذا لا يوجد منطقة، نرجع المدينة فقط
  if (!userArea || userArea.trim() === '') {
    return { city: correctedCity, cityId: bestCity._id, warning };
  }

  // ابحث عن أفضل تطابق للمنطقة
  const zones = await fetchBostaZones(bestCity._id);
  if (zones.length === 0) {
    return { city: correctedCity, zone: userArea, cityId: bestCity._id, warning };
  }

  let bestZone: BostaZone | null = null;
  let bestZoneScore = 0;

  for (const zone of zones) {
    if (!zone.dropOffAvailability) continue;
    const candidates = [zone.name, zone.nameAr].filter(Boolean);
    for (const candidate of candidates) {
      const score = textSimilarity(userArea, candidate);
      if (score > bestZoneScore) {
        bestZoneScore = score;
        bestZone = zone;
      }
    }
  }

  if (bestZone && bestZoneScore >= 0.5) {
    const correctedZone = bestZone.nameAr;
    if (bestZoneScore < 0.9) {
      const zoneWarning = `📍 تم تصحيح المنطقة: "${userArea}" → "${correctedZone}"`;
      warning = warning ? `${warning} | ${zoneWarning}` : zoneWarning;
    }
    return { city: correctedCity, zone: correctedZone, cityId: bestCity._id, warning };
  }

  // المنطقة غير موجودة — نرسلها كما هي (بوسطة قد تقبلها)
  return { city: correctedCity, zone: userArea, cityId: bestCity._id, warning };
}

// ==================== Bosta API ====================

export interface BostaDeliveryRequest {
  type: number; // 10 = إرسال عادي, 25 = تبديل (Exchange), 30 = Fulfillment
  specs: {
    packageDetails: {
      itemsCount: number;
      description: string;
    };
    size: string; // "SMALL" | "MEDIUM" | "LARGE"
    weight?: number;
  };
  dropOffAddress: {
    city: string;
    zone?: string;
    firstLine: string;
    secondLine?: string;
    buildingNumber?: string;
    floor?: string;
    apartment?: string;
  };
  receiver: {
    firstName: string;
    lastName: string;
    phone: string;
    phone2?: string; // رقم هاتف ثاني (واتساب أو بديل)
    email?: string;
  };
  businessReference: string;
  cod: number;
  allowToOpenPackage?: boolean;
  returnSpecs?: { // مطلوب لنوع 25 (تبديل/Exchange)
    packageDetails: {
      itemsCount: number;
      description: string;
    };
    size?: string;
  };
  notes?: string;
  webhookUrl?: string;
}

export interface BostaDeliveryResponse {
  _id: string;
  trackingNumber: string | number;
  state: { code: number; value: string };
  message?: string;
  error?: string;
}

export interface BostaWebhookPayload {
  _id: string;
  trackingNumber: number | string;
  state: number;
  type: string; // "SEND" | "EXCHANGE" | "CUSTOMER_RETURN_PICKUP" | "RTO"
  cod?: string | number;
  timeStamp: number;
  isConfirmedDelivery?: boolean;
  deliveryPromiseDate?: string;
  exceptionReason?: string;
  exceptionCode?: number;
  businessReference?: string;
  numberOfAttempts?: number;
}

// إنشاء شحنة جديدة على بوسطة
export async function createBostaDelivery(order: {
  name: string;
  phone: string;
  whatsapp?: string;
  governorate: string;
  area: string;
  address: string;
  productName: string;
  orderDetails?: string;
  quantity: string;
  totalPrice: string;
  notes?: string;
  id: number;
  fulfillmentType?: number; // 10 = عادي, 25 = تبديل (Exchange), 30 = Fulfillment
}): Promise<{ success: boolean; trackingNumber?: string; bostaId?: string; error?: string }> {

  if (!BOSTA_API_KEY) {
    return { success: false, error: 'BOSTA_API_KEY غير مُعرّف في متغيرات البيئة' };
  }

  // تقسيم الاسم إلى اسم أول واسم أخير
  const nameParts = order.name.trim().split(/\s+/);
  const firstName = nameParts[0] || order.name;
  const lastName = nameParts.slice(1).join(' ') || '.';

  // استخراج مبلغ التحصيل (COD)
  const codAmount = parseInt(String(order.totalPrice).replace(/\D/g, '')) || 0;

  // تنسيق رقم الهاتف الأساسي
  const formattedPhone = formatToLocalEgyptianNumber(order.phone);
  if (!formattedPhone) {
    return { success: false, error: `رقم الهاتف "${order.phone}" غير صالح — لا يمكن تنسيقه` };
  }

  // تنسيق رقم الهاتف الثاني (واتساب أو رقم بديل) — يُتجاهل إذا تطابق مع الأساسي
  const rawPhone2 = order.whatsapp ? formatToLocalEgyptianNumber(order.whatsapp) : undefined;
  const formattedPhone2 = (rawPhone2 && rawPhone2 !== formattedPhone) ? rawPhone2 : undefined;

  // 🧠 التحقق الذكي — مطابقة المحافظة والمنطقة ضد قاعدة بيانات بوسطة
  const normalizedGov = normalizeGovernorateName(order.governorate);
  const match = await smartMatchCityAndZone(normalizedGov, order.area);
  if (match.warning) {
    console.log(`🧠 [BOSTA] ${match.warning}`);
  }

  // إنشاء مرجع فريد للطلب (مع لاحقة عشوائية لتجنب التكرار عند إعادة الشحن بنفس اليوم)
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const businessReference = `SMRKT-${order.id}-${new Date().toISOString().slice(0, 10)}-${randomSuffix}`;

  // تحديد نوع الشحن: 10 = عادي, 25 = تبديل, 30 = Fulfillment
  const shipmentType = order.fulfillmentType || 10;

  const deliveryData: BostaDeliveryRequest = {
    type: shipmentType,
    specs: {
      packageDetails: {
        itemsCount: parseInt(order.quantity) || 1,
        description: order.productName || order.orderDetails || 'Order',
      },
      size: 'SMALL',
    },
    dropOffAddress: {
      city: match.city,           // ✅ المدينة المصححة من بوسطة
      zone: match.zone || undefined, // ✅ المنطقة المصححة من بوسطة
      firstLine: order.address,
    },
    receiver: {
      firstName,
      lastName,
      phone: formattedPhone,
      ...(formattedPhone2 && { phone2: formattedPhone2 }),
    },
    businessReference,
    cod: codAmount,
    allowToOpenPackage: true, // ✅ السماح للعميل بفتح الشحنة والفحص
    // ✅ بيانات الإرجاع لشحنات التبديل (Exchange type 25)
    ...(shipmentType === 25 && {
      returnSpecs: {
        packageDetails: {
          itemsCount: parseInt(order.quantity) || 1,
          description: `إرجاع: ${order.productName || order.orderDetails || 'Order'}`,
        },
        size: 'SMALL',
      },
    }),
    notes: order.notes || undefined,
  };

  const typeLabel = shipmentType === 30 ? 'Fulfillment' : shipmentType === 25 ? 'تبديل' : 'عادي';
  console.log(`🚚 [BOSTA] إنشاء شحنة للطلب #${order.id} → ${match.city}/${match.zone || '-'} | COD: ${codAmount} | نوع: ${typeLabel}`);
  // لا نطبع البيانات الكاملة في الإنتاج (خصوصية أرقام الهاتف)
  if (process.env.NODE_ENV === 'development') {
    console.log(`📦 [BOSTA] البيانات:`, JSON.stringify(deliveryData, null, 2));
  }

  try {
    const response = await fetch(`${BOSTA_BASE_URL}/deliveries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': BOSTA_API_KEY,
      },
      body: JSON.stringify(deliveryData),
    });

    const responseText = await response.text();
    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch {
      console.error(`❌ [BOSTA] رد غير صالح (ليس JSON):`, responseText.substring(0, 500));
      return { success: false, error: `رد غير صالح من بوسطة: ${response.status}` };
    }

    if (!response.ok) {
      console.error(`❌ [BOSTA] فشل (${response.status}):`, JSON.stringify(result));
      console.error(`❌ [BOSTA] البيانات المرسلة:`, JSON.stringify(deliveryData));
      return {
        success: false,
        error: result.message || result.error || JSON.stringify(result) || `خطأ من بوسطة: ${response.status}`,
      };
    }

    // بوسطة تُغلف البيانات في result.data
    const data = result.data || result;
    const trackingNumber = String(data.trackingNumber || data._id || '');
    console.log(`✅ [BOSTA] تم إنشاء الشحنة بنجاح! رقم التتبع: ${trackingNumber}`);

    return {
      success: true,
      trackingNumber,
      bostaId: data._id,
    };
  } catch (error: any) {
    console.error(`❌ [BOSTA] خطأ في الاتصال بـ API:`, error);
    return {
      success: false,
      error: `فشل الاتصال بـ Bosta API: ${error.message}`,
    };
  }
}

// التحقق من صحة webhook — timing-safe لمنع هجمات التوقيت
export function verifyWebhookAuth(authHeader: string | null | undefined): boolean {
  const webhookSecret = process.env.BOSTA_WEBHOOK_SECRET;
  // إذا لم يتم تعيين سر webhook، اقبل أي طلب (للتطوير)
  if (!webhookSecret) {
    console.warn('⚠️ [BOSTA] BOSTA_WEBHOOK_SECRET غير مُعرّف — يتم قبول جميع الطلبات');
    return true;
  }
  if (!authHeader) return false;
  // مقارنة آمنة ضد هجمات التوقيت
  try {
    const secretBuf = Buffer.from(webhookSecret, 'utf8');
    const headerBuf = Buffer.from(authHeader, 'utf8');
    if (secretBuf.length !== headerBuf.length) return false;
    return crypto.timingSafeEqual(secretBuf, headerBuf);
  } catch {
    return false;
  }
}

// الحصول على رابط التتبع
export function getTrackingUrl(trackingNumber: string | number): string {
  return `https://bosta.co/tracking-shipments?trackingNumber=${trackingNumber}`;
}
