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
  22: { ar: 'في المخزن', crmStatus: 'تم الشحن', color: 'blue' },
  23: { ar: 'فشل الاستلام من المرسل', crmStatus: 'تم الشحن', color: 'yellow' },
  24: { ar: 'يتم التحضير', crmStatus: 'تم الشحن', color: 'blue' },
  30: { ar: 'في الطريق للعميل', crmStatus: 'في الطريق', color: 'orange' },
  31: { ar: 'خرج للتوصيل', crmStatus: 'في الطريق', color: 'orange' },
  40: { ar: 'تم إعادة الجدولة', crmStatus: 'في الطريق', color: 'yellow' },
  41: { ar: 'تم الاستلام في الفرع', crmStatus: 'في الطريق', color: 'orange' },
  42: { ar: 'تم تحصيل المبلغ', crmStatus: 'تم التسليم', color: 'green' },
  45: { ar: 'تم التسليم', crmStatus: 'تم التسليم', color: 'green' },
  46: { ar: 'تم التسليم جزئياً', crmStatus: 'تم التسليم', color: 'green' },
  47: { ar: 'استثناء - فشل التسليم', crmStatus: 'فشل التسليم', color: 'red' },
  50: { ar: 'قيد الإرجاع', crmStatus: 'فشل التسليم', color: 'red' },
  60: { ar: 'معلّق', crmStatus: 'في الطريق', color: 'yellow' },
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
    cleaned = '0' + cleaned.substring(2);
  } else if (cleaned.startsWith('2') && cleaned.length === 11) {
    cleaned = '0' + cleaned.substring(1);
  } else if (cleaned.startsWith('1') && cleaned.length === 10) {
    cleaned = '0' + cleaned;
  }

  return cleaned;
}

// التحقق من صحة رقم الهاتف المصري (010/011/012/015)
export function validateEgyptianPhone(phone: string): { valid: boolean; formatted: string; error?: string } {
  const formatted = formatToLocalEgyptianNumber(phone);
  if (!formatted) return { valid: false, formatted: '', error: 'رقم الهاتف فارغ' };
  if (formatted.length !== 11) return { valid: false, formatted, error: `رقم الهاتف "${phone}" يجب أن يكون 11 رقم (الحالي: ${formatted.length})` };
  if (!formatted.startsWith('01')) return { valid: false, formatted, error: `رقم الهاتف "${phone}" يجب أن يبدأ بـ 01` };
  const prefix = formatted.substring(0, 3);
  if (!['010', '011', '012', '015'].includes(prefix)) {
    return { valid: false, formatted, error: `بادئة الهاتف "${prefix}" غير صالحة — المسموح: 010, 011, 012, 015` };
  }
  return { valid: true, formatted };
}

// تنظيف العنوان — إزالة الفراغات الزائدة والرموز غير المفيدة
export function sanitizeAddress(address: string): string {
  if (!address) return '';
  return address
    .replace(/\s+/g, ' ')              // فراغات متعددة → واحد
    .replace(/^[\s,.-]+|[\s,.-]+$/g, '') // إزالة الفواصل والنقاط من الأطراف
    .replace(/\n+/g, ' - ')              // أسطر جديدة → فاصل
    .trim();
}

/**
 * 🏗️ تحليل بنية العنوان — استخراج رقم المبنى والدور والشقة
 * يكتشف الأنماط المصرية الشائعة مثل:
 * "عمارة 5 الدور 3 شقة 12" أو "برج 7 ط 2 ش 15" أو "مبنى أ دور أرضي"
 */
export function parseAddressStructure(address: string): {
  buildingNumber?: string;
  floor?: string;
  apartment?: string;
  landmark?: string;
  cleanedAddress: string;
} {
  if (!address) return { cleanedAddress: '' };

  let text = address;
  let buildingNumber: string | undefined;
  let floor: string | undefined;
  let apartment: string | undefined;
  let landmark: string | undefined;

  // --- استخراج رقم المبنى / العمارة / البرج ---
  const buildingPatterns = [
    /(?:عمار[ةه]|برج|مبن[يى]|بناي[ةه]|بلوك|block)\s*[#:.]?\s*([\dأ-ي\w]+)/i,
    /(?:عقار|منزل|فيلا|بيت)\s*[#:.]?\s*([\dأ-ي\w]+)/i,
  ];
  for (const pat of buildingPatterns) {
    const m = text.match(pat);
    if (m) {
      buildingNumber = m[1].trim();
      text = text.replace(m[0], ' ').trim();
      break;
    }
  }

  // --- استخراج الدور / الطابق ---
  const floorPatterns = [
    /(?:الدور|دور|الطابق|طابق|ط)\s*[#:.]?\s*([\dأ-ي\w]+)/i,
    /(?:أرضي|الأرضي|ground)/i,
  ];
  const groundMatch = text.match(floorPatterns[1]);
  if (groundMatch) {
    floor = '0';
    text = text.replace(groundMatch[0], ' ').trim();
  } else {
    const m = text.match(floorPatterns[0]);
    if (m) {
      floor = m[1].trim();
      text = text.replace(m[0], ' ').trim();
    }
  }

  // --- استخراج رقم الشقة ---
  const aptPatterns = [
    /(?:شق[ةه]|ش|apt|apartment|وحد[ةه])\s*[#:.]?\s*([\dأ-ي\w]+)/i,
  ];
  for (const pat of aptPatterns) {
    const m = text.match(pat);
    if (m) {
      apartment = m[1].trim();
      text = text.replace(m[0], ' ').trim();
      break;
    }
  }

  // --- استخراج علامة مميزة (بجوار / أمام / خلف) ---
  const landmarkMatch = text.match(/(?:بجوار|أمام|خلف|قريب من|بالقرب من|بجانب)\s+(.+?)(?:$|[,،-])/i);
  if (landmarkMatch) {
    landmark = landmarkMatch[1].trim();
  }

  return {
    buildingNumber,
    floor,
    apartment,
    landmark,
    cleanedAddress: text.replace(/\s+/g, ' ').trim(),
  };
}

/**
 * 🔢 استخراج الكمية من نص — يدعم "2 قطعة"، "عدد 3"، "3x"، "٢"، إلخ
 */
export function parseQuantity(raw: string | number | undefined | null): number {
  if (typeof raw === 'number') return raw > 0 ? Math.floor(raw) : 1;
  if (!raw) return 1;
  const str = String(raw)
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))) // أرقام عربية → لاتينية
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0)); // أرقام فارسية
  const match = str.match(/(\d+)/);
  const n = match ? parseInt(match[1], 10) : 1;
  return n > 0 ? n : 1;
}

/**
 * 📦 تقدير حجم الشحنة بذكاء من الكمية ونوع المنتج
 */
export function estimatePackageSize(quantity: number, productDesc?: string): 'SMALL' | 'MEDIUM' | 'LARGE' {
  // كلمات تدل على منتج كبير
  const largeKeywords = /ثلاج[ةه]|غسال[ةه]|تلفزيون|شاش[ةه]|تكييف|سرير|كنب[ةه]|مكتب|دولاب/i;
  // كلمات تدل على منتج متوسط
  const mediumKeywords = /جهاز|لابتوب|laptop|طابع[ةه]|مايكرو|خلاط|مكنس[ةه]|حقيب[ةه]/i;

  if (productDesc) {
    if (largeKeywords.test(productDesc)) return 'LARGE';
    if (mediumKeywords.test(productDesc)) return 'MEDIUM';
  }

  if (quantity >= 5) return 'LARGE';
  if (quantity >= 3) return 'MEDIUM';
  return 'SMALL';
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

// كاش في الذاكرة مع TTL — يُحمل ويُجدد كل ساعة
const CACHE_TTL_MS = 60 * 60 * 1000; // ساعة واحدة
let cachedCities: BostaCity[] | null = null;
let cachedCitiesTimestamp = 0;
let cachedZones: Map<string, { data: BostaZone[]; timestamp: number }> = new Map();

/** جلب قائمة المدن من بوسطة (مع كاش + TTL) */
export async function fetchBostaCities(): Promise<BostaCity[]> {
  if (cachedCities && (Date.now() - cachedCitiesTimestamp) < CACHE_TTL_MS) return cachedCities;
  try {
    const res = await fetch(`${BOSTA_BASE_URL}/cities`, {
      headers: { 'Authorization': BOSTA_API_KEY },
    });
    const json = await res.json();
    cachedCities = json?.data?.list || [];
    cachedCitiesTimestamp = Date.now();
    console.log(`📍 [BOSTA] تم تحميل ${cachedCities!.length} مدينة (TTL: 1h)`);
    return cachedCities!;
  } catch (e) {
    console.error('❌ [BOSTA] فشل تحميل المدن:', e);
    return cachedCities || []; // fallback للكاش القديم
  }
}

/** جلب مناطق مدينة معينة من بوسطة (مع كاش + TTL) */
export async function fetchBostaZones(cityId: string): Promise<BostaZone[]> {
  const cached = cachedZones.get(cityId);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) return cached.data;
  try {
    const res = await fetch(`${BOSTA_BASE_URL}/cities/${cityId}/zones`, {
      headers: { 'Authorization': BOSTA_API_KEY },
    });
    const json = await res.json();
    const zones = json?.data || [];
    cachedZones.set(cityId, { data: zones, timestamp: Date.now() });
    return zones;
  } catch (e) {
    console.error(`❌ [BOSTA] فشل تحميل مناطق المدينة ${cityId}:`, e);
    return cached?.data || []; // fallback للكاش القديم
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

/**
 * 🧠 استخراج ذكي — يستخرج المحافظة والمنطقة من نص العنوان
 * يعمل عندما تكون حقول المحافظة أو المنطقة فارغة
 * يبحث في نص العنوان عن أي اسم مدينة/منطقة من قاعدة بيانات بوسطة
 */
export async function extractCityAndZoneFromAddress(
  addressText: string
): Promise<{ city?: string; zone?: string; cityId?: string; extracted: boolean; details?: string }> {
  if (!addressText || addressText.trim().length < 3) {
    return { extracted: false };
  }

  const normalizedAddress = normalizeArabic(addressText);
  const cities = await fetchBostaCities();
  if (cities.length === 0) return { extracted: false };

  // --- المرحلة 1: البحث عن المحافظة في نص العنوان ---
  // نبني قائمة بكل الأسماء الممكنة لكل مدينة (عربي + إنجليزي + alias + اسم الخريطة)
  interface CityCandidate {
    city: BostaCity;
    name: string;            // الاسم الأصلي
    normalizedName: string;  // الاسم المُطبّع
  }

  const cityCandidates: CityCandidate[] = [];
  for (const city of cities) {
    const names = [city.nameAr, city.name, city.alias].filter(Boolean) as string[];
    // إضافة الأسماء المعروفة أيضاً من خريطة المحافظات
    const govName = normalizeGovernorateName(city.nameAr);
    if (govName && govName !== city.nameAr) names.push(govName);

    for (const name of names) {
      const norm = normalizeArabic(name);
      if (norm.length >= 2) { // تجاهل الأسماء القصيرة جداً
        cityCandidates.push({ city, name, normalizedName: norm });
      }
    }
  }

  // ترتيب بالأطول أولاً — لمنع "قنا" من تطابق قبل "الإسكندرية"
  cityCandidates.sort((a, b) => b.normalizedName.length - a.normalizedName.length);

  let matchedCity: BostaCity | null = null;
  let matchedCityName = '';

  for (const candidate of cityCandidates) {
    // بحث بحدود الكلمة — لمنع "قنا" من التطابق داخل "قناة"
    // نستخدم regex مع حدود كلمة عربية (فراغ أو بداية/نهاية نص)
    const escaped = candidate.normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?:^|\\s|[-,،/])${escaped}(?:$|\\s|[-,،/])`, 'i');
    
    if (pattern.test(normalizedAddress) || normalizedAddress === candidate.normalizedName) {
      matchedCity = candidate.city;
      matchedCityName = candidate.name;
      break;
    }
  }

  if (!matchedCity) {
    return { extracted: false, details: 'لم يتم العثور على محافظة في العنوان' };
  }

  // --- المرحلة 2: البحث عن المنطقة في نص العنوان ---
  const zones = await fetchBostaZones(matchedCity._id);
  let matchedZone: string | undefined;

  if (zones.length > 0) {
    interface ZoneCandidate {
      zone: BostaZone;
      name: string;
      normalizedName: string;
    }

    const zoneCandidates: ZoneCandidate[] = [];
    for (const zone of zones) {
      if (!zone.dropOffAvailability) continue;
      const names = [zone.nameAr, zone.name].filter(Boolean) as string[];
      for (const name of names) {
        const norm = normalizeArabic(name);
        if (norm.length >= 2) {
          zoneCandidates.push({ zone, name, normalizedName: norm });
        }
      }
    }

    // ترتيب بالأطول أولاً
    zoneCandidates.sort((a, b) => b.normalizedName.length - a.normalizedName.length);

    for (const candidate of zoneCandidates) {
      const escaped = candidate.normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(?:^|\\s|[-,،/])${escaped}(?:$|\\s|[-,،/])`, 'i');

      if (pattern.test(normalizedAddress) || normalizedAddress.includes(candidate.normalizedName)) {
        matchedZone = candidate.zone.nameAr;
        break;
      }
    }
  }

  const details = matchedZone
    ? `استُخرج من العنوان: المحافظة="${matchedCity.nameAr}" + المنطقة="${matchedZone}"`
    : `استُخرج من العنوان: المحافظة="${matchedCity.nameAr}" (بدون منطقة)`;

  return {
    city: matchedCity.nameAr,
    zone: matchedZone,
    cityId: matchedCity._id,
    extracted: true,
    details,
  };
}

// ==================== Bosta API ====================

export interface BostaDeliveryRequest {
  type: string; // 'Deliver' | 'SEND' | 'EXCHANGE' (حساس لحالة الأحرف — تم التحقق من API)
  specs: {
    packageDetails: {
      itemsCount: number;
      description: string;
      items?: Array<{ name: string; sku: string; quantity: number }>;
    };
    size: string; // "SMALL" | "MEDIUM" | "LARGE"
    weight?: number;
    allowToOpenPackage?: boolean;
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
    phone2?: string;
    email?: string;
  };
  businessReference: string;
  cod: number;
  allowToOpenPackage?: boolean; // في الجذر أيضاً للتوافق
  returnSpecs?: {
    packageDetails: {
      itemsCount: number;
      description: string;
    };
    size?: string;
  };
  notes?: string;
  webhookUrl?: string;
  pickupAddress?: { _id: string }; // موقع الاستلام/الإرجاع المُسجل في بوسطة
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
  bostaSku?: string; // كود SKU في مخازن بوسطة
}): Promise<{ success: boolean; trackingNumber?: string; bostaId?: string; error?: string }> {

  if (!BOSTA_API_KEY) {
    return { success: false, error: 'BOSTA_API_KEY غير مُعرّف في متغيرات البيئة' };
  }

  // تقسيم الاسم إلى اسم أول واسم أخير
  const nameParts = order.name.trim().split(/\s+/);
  const firstName = nameParts[0] || order.name;
  const lastName = nameParts.slice(1).join(' ') || '.';

  // استخراج مبلغ التحصيل (COD) — يدعم الأرقام العشرية (يُقرّب لأعلى)
  const priceStr = String(order.totalPrice || '0').replace(/[^\d.]/g, '');
  const codAmount = Math.ceil(parseFloat(priceStr) || 0);

  // ✅ التحقق من رقم الهاتف الأساسي (مع التحقق من البادئة المصرية)
  const phoneValidation = validateEgyptianPhone(order.phone);
  if (!phoneValidation.valid) {
    return { success: false, error: `📱 ${phoneValidation.error}` };
  }

  // تنسيق رقم الهاتف الثاني (واتساب أو رقم بديل) — يُتجاهل إذا تطابق مع الأساسي أو غير صالح
  let formattedPhone2: string | undefined;
  if (order.whatsapp) {
    const phone2Validation = validateEgyptianPhone(order.whatsapp);
    if (phone2Validation.valid && phone2Validation.formatted !== phoneValidation.formatted) {
      formattedPhone2 = phone2Validation.formatted;
    }
  }

  // ✅ تنظيف العنوان
  const cleanAddress = sanitizeAddress(order.address);
  if (!cleanAddress || cleanAddress.length < 5) {
    return { success: false, error: `📍 العنوان "${order.address}" قصير جداً — يجب أن يكون 5 حروف على الأقل` };
  }

  // 🧠 التحقق الذكي — مطابقة المحافظة والمنطقة ضد قاعدة بيانات بوسطة
  let effectiveGov = order.governorate;
  let effectiveArea = order.area;

  // 🧠🧠 استخراج ذكي — إذا المحافظة أو المنطقة فارغة، نستخرجها من العنوان
  const govMissing = !effectiveGov || effectiveGov.trim() === '';
  const areaMissing = !effectiveArea || effectiveArea.trim() === '';

  if (govMissing || areaMissing) {
    const extraction = await extractCityAndZoneFromAddress(cleanAddress);
    if (extraction.extracted) {
      if (govMissing && extraction.city) {
        effectiveGov = extraction.city;
        console.log(`🧠 [BOSTA] استخراج ذكي: المحافظة "${extraction.city}" من العنوان "${cleanAddress}"`);
      }
      if (areaMissing && extraction.zone) {
        effectiveArea = extraction.zone;
        console.log(`🧠 [BOSTA] استخراج ذكي: المنطقة "${extraction.zone}" من العنوان "${cleanAddress}"`);
      }
      if (extraction.details) {
        console.log(`🧠 [BOSTA] ${extraction.details}`);
      }
    } else {
      if (govMissing) {
        return { success: false, error: `📍 المحافظة فارغة ولم يمكن استخراجها من العنوان "${cleanAddress}"` };
      }
    }
  }

  const normalizedGov = normalizeGovernorateName(effectiveGov);
  const match = await smartMatchCityAndZone(normalizedGov, effectiveArea);
  if (match.warning) {
    console.log(`🧠 [BOSTA] ${match.warning}`);
  }

  // إنشاء مرجع فريد للطلب (مع لاحقة عشوائية لتجنب التكرار عند إعادة الشحن بنفس اليوم)
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const businessReference = `SMRKT-${order.id}-${new Date().toISOString().slice(0, 10)}-${randomSuffix}`;

  // ✅ تحديد نوع الشحن — بوسطة تقبل: 'Deliver' أو 'SEND' أو 'EXCHANGE' (حساس لحالة الأحرف! تم التحقق بالفعل من API)
  const numericType = order.fulfillmentType || 10;
  const shipmentType: string = numericType === 25 ? 'EXCHANGE' : 'Deliver';

  // 🏗️ تحليل بنية العنوان — استخراج المبنى والدور والشقة تلقائياً
  const addressParts = parseAddressStructure(cleanAddress);

  // 🧠 إنشاء السطر الثاني ذكياً من البيانات المستخرجة
  const secondLineParts: string[] = [];
  if (addressParts.buildingNumber) secondLineParts.push(`عمارة ${addressParts.buildingNumber}`);
  if (addressParts.floor) secondLineParts.push(addressParts.floor === '0' ? 'دور أرضي' : `الدور ${addressParts.floor}`);
  if (addressParts.apartment) secondLineParts.push(`شقة ${addressParts.apartment}`);
  const secondLine = secondLineParts.length > 0 ? secondLineParts.join(' - ') : undefined;

  // 🧠 ملاحظات ذكية للسائق — تجمع كل المعلومات المفيدة
  const smartNotesParts: string[] = [];
  if (order.notes) smartNotesParts.push(order.notes);
  if (addressParts.landmark) smartNotesParts.push(`📍 ${addressParts.landmark}`);
  const qty = parseQuantity(order.quantity);
  if (qty > 1) smartNotesParts.push(`📦 ${qty} قطع`);
  if (shipmentType === 'EXCHANGE') smartNotesParts.push('🔄 تبديل — استلام المنتج القديم');
  const smartNotes = smartNotesParts.length > 0 ? smartNotesParts.join(' | ') : undefined;

  const deliveryData: BostaDeliveryRequest = {
    type: shipmentType,
    specs: {
      packageDetails: {
        itemsCount: qty,
        description: order.productName || order.orderDetails || 'Order',
        ...(numericType === 30 && order.bostaSku && {
          items: [{
            name: order.productName || order.orderDetails || 'Order',
            sku: order.bostaSku,
            quantity: qty
          }]
        }),
      },
      size: estimatePackageSize(qty, order.productName || order.orderDetails),
      allowToOpenPackage: true,
    },
    dropOffAddress: {
      city: match.city,
      zone: match.zone || undefined,
      firstLine: effectiveArea ? `${effectiveArea} - ${cleanAddress}` : cleanAddress,
      ...(secondLine && { secondLine }),
      ...(addressParts.buildingNumber && { buildingNumber: addressParts.buildingNumber }),
      ...(addressParts.floor && { floor: addressParts.floor }),
      ...(addressParts.apartment && { apartment: addressParts.apartment }),
    },
    receiver: {
      firstName,
      lastName,
      phone: phoneValidation.formatted,
      ...(formattedPhone2 && { phone2: formattedPhone2 }),
    },
    businessReference,
    cod: codAmount,
    allowToOpenPackage: true, // في الجذر أيضاً للتأكد
    ...(shipmentType === 'EXCHANGE' && {
      returnSpecs: {
        packageDetails: {
          itemsCount: qty,
          description: `إرجاع: ${order.productName || order.orderDetails || 'Order'}`,
        },
        size: estimatePackageSize(qty, order.productName || order.orderDetails),
      },
    }),
    notes: smartNotes,
    // ✅ موقع الاستلام/الإرجاع حسب نوع الشحن — قابل للتعديل عبر ENV
    pickupAddress: numericType === 30
      ? { _id: process.env.BOSTA_FULFILLMENT_PICKUP_ID || 'hFkb9kXv1' }  // Bosta Fulfillment New Cairo Warehouse
      : { _id: process.env.BOSTA_DEFAULT_PICKUP_ID || '6hbvJbsxM' }, // المكتب الرئسي - دمياط
  };

  // 🏗️ لوج تفاصيل العنوان المستخرجة
  if (addressParts.buildingNumber || addressParts.floor || addressParts.apartment) {
    console.log(`🏗️ [BOSTA] عنوان مُحلل: مبنى=${addressParts.buildingNumber || '-'} دور=${addressParts.floor || '-'} شقة=${addressParts.apartment || '-'}${secondLine ? ` → secondLine="${secondLine}"` : ''}`);
  }
  if (addressParts.landmark) {
    console.log(`📍 [BOSTA] علامة مميزة: ${addressParts.landmark}`);
  }

  const pkgSize = estimatePackageSize(qty, order.productName || order.orderDetails);
  console.log(`🚚 [BOSTA] إنشاء شحنة للطلب #${order.id} → ${match.city}/${match.zone || '-'} | COD: ${codAmount} | نوع: ${shipmentType} | حجم: ${pkgSize}`);
  // 🔍 DEBUG: طباعة البيانات الكاملة لتشخيص المشكلة
  console.log(`🔍 [BOSTA DEBUG] type=${deliveryData.type}, allowToOpenPackage_root=${deliveryData.allowToOpenPackage}, allowToOpenPackage_specs=${deliveryData.specs?.allowToOpenPackage}`);
  console.log(`📦 [BOSTA DEBUG] Full payload:`, JSON.stringify(deliveryData, null, 2));

  // ✅ Retry مع exponential backoff — 3 محاولات
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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
        // إذا 400 (bad request) لا تعد المحاولة — الخطأ في البيانات
        if (response.status === 400 || response.status === 422) {
          console.error(`❌ [BOSTA] فشل (${response.status}):`, JSON.stringify(result));
          console.error(`❌ [BOSTA] البيانات المرسلة:`, JSON.stringify(deliveryData));
          return {
            success: false,
            error: result.message || result.error || JSON.stringify(result) || `خطأ من بوسطة: ${response.status}`,
          };
        }
        // للأخطاء الأخرى (500, 503, timeout) — أعد المحاولة
        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 500; // 1s, 2s
          console.warn(`⚠️ [BOSTA] فشل المحاولة ${attempt}/${MAX_RETRIES} (${response.status}) — إعادة بعد ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        console.error(`❌ [BOSTA] فشل نهائي بعد ${MAX_RETRIES} محاولات:`, JSON.stringify(result));
        return {
          success: false,
          error: result.message || result.error || `خطأ من بوسطة: ${response.status}`,
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
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 500;
        console.warn(`⚠️ [BOSTA] خطأ اتصال (محاولة ${attempt}/${MAX_RETRIES}) — إعادة بعد ${delay}ms:`, error.message);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      console.error(`❌ [BOSTA] خطأ في الاتصال بـ API بعد ${MAX_RETRIES} محاولات:`, error);
      return {
        success: false,
        error: `فشل الاتصال بـ Bosta API: ${error.message}`,
      };
    }
  }

  // لن يصل هنا أبداً — لكن TypeScript يحتاجه
  return { success: false, error: 'خطأ غير متوقع' };
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
