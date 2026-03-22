/**
 * Bosta Shipping API Client
 * يتعامل مع Bosta API لإنشاء الشحنات واستقبال تحديثات الحالة
 */

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

// ==================== Bosta API ====================

export interface BostaDeliveryRequest {
  type: number; // 10 = SEND (delivery from your warehouse), 30 = SEND (from Bosta fulfillment)
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
  fulfillmentType?: number; // 10 = من مخزونك, 30 = من مخزون بوسطة (Fulfillment)
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

  // تحويل المحافظة
  const normalizedGov = normalizeGovernorateName(order.governorate);

  // إنشاء مرجع فريد للطلب (مع لاحقة عشوائية لتجنب التكرار عند إعادة الشحن بنفس اليوم)
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const businessReference = `SMRKT-${order.id}-${new Date().toISOString().slice(0, 10)}-${randomSuffix}`;

  // تحديد نوع الشحن: 10 = عادي (من مخزونك), 30 = من مخزون بوسطة (Fulfillment)
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
      city: normalizedGov,
      zone: order.area || undefined,
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
    notes: order.notes || undefined,
  };

  console.log(`🚚 [BOSTA] إنشاء شحنة جديدة للطلب #${order.id}...`);
  console.log(`📦 [BOSTA] البيانات:`, JSON.stringify(deliveryData, null, 2));

  try {
    const response = await fetch(`${BOSTA_BASE_URL}/deliveries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BOSTA_API_KEY}`,
      },
      body: JSON.stringify(deliveryData),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(`❌ [BOSTA] فشل في إنشاء الشحنة:`, result);
      return {
        success: false,
        error: result.message || result.error || `خطأ من بوسطة: ${response.status}`,
      };
    }

    const trackingNumber = String(result.trackingNumber || result._id || '');
    console.log(`✅ [BOSTA] تم إنشاء الشحنة بنجاح! رقم التتبع: ${trackingNumber}`);

    return {
      success: true,
      trackingNumber,
      bostaId: result._id,
    };
  } catch (error: any) {
    console.error(`❌ [BOSTA] خطأ في الاتصال بـ API:`, error);
    return {
      success: false,
      error: `فشل الاتصال بـ Bosta API: ${error.message}`,
    };
  }
}

// التحقق من صحة webhook
export function verifyWebhookAuth(authHeader: string | null | undefined): boolean {
  const webhookSecret = process.env.BOSTA_WEBHOOK_SECRET;
  // إذا لم يتم تعيين سر webhook، اقبل أي طلب (للتطوير)
  if (!webhookSecret) {
    console.warn('⚠️ [BOSTA] BOSTA_WEBHOOK_SECRET غير مُعرّف — يتم قبول جميع الطلبات');
    return true;
  }
  return authHeader === webhookSecret;
}

// الحصول على رابط التتبع
export function getTrackingUrl(trackingNumber: string | number): string {
  return `https://bosta.co/tracking-shipments?trackingNumber=${trackingNumber}`;
}
