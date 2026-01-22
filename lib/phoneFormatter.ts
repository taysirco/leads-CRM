/**
 * تحويل الأرقام العربية (٠١٢٣٤٥٦٧٨٩) إلى أرقام إنجليزية (0123456789)
 */
export function convertArabicNumerals(str: string): string {
  if (!str) return '';

  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const persianNumerals = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  let result = str;

  // تحويل الأرقام العربية
  arabicNumerals.forEach((arabic, index) => {
    result = result.replace(new RegExp(arabic, 'g'), index.toString());
  });

  // تحويل الأرقام الفارسية (للاحتياط)
  persianNumerals.forEach((persian, index) => {
    result = result.replace(new RegExp(persian, 'g'), index.toString());
  });

  return result;
}

/**
 * تنسيق أرقام الهاتف المصرية إلى الصيغة الموحدة +201XXXXXXXXX
 * يدعم أرقام المحمول والأرقام الأرضية
 */
export function formatEgyptianPhone(phone: string | number): string {
  if (!phone) {
    return '';
  }

  // 1. تحويل الأرقام العربية إلى إنجليزية ثم تنظيفه من كل شيء عدا الأرقام
  const withEnglishNumerals = convertArabicNumerals(String(phone));
  const cleaned = withEnglishNumerals.replace(/\D/g, '');

  if (!cleaned) {
    return '';
  }

  // 2. معالجة الحالات الأكثر شيوعًا ووضوحًا

  // الحالة (أ): رقم دولي صحيح بدون علامة + (e.g., "201012345678" - 12 رقم)
  if (cleaned.length === 12 && cleaned.startsWith('20')) {
    return `+${cleaned}`;
  }

  // الحالة (ب): رقم محلي محمول صحيح (e.g., "01012345678" - 11 رقم يبدأ بـ 01)
  if (cleaned.length === 11 && cleaned.startsWith('01')) {
    return `+20${cleaned.substring(1)}`;
  }

  // الحالة (ب-2): رقم أرضي بصفر زائد (e.g., "02026182959" - 11 رقم يبدأ بـ 02 أو 03)
  // هذا خطأ شائع حيث يتم إضافة صفر زائد للأرقام الأرضية
  if (cleaned.length === 11 && (cleaned.startsWith('02') || cleaned.startsWith('03'))) {
    // إزالة الصفر الزائد: 02026182959 → +20226182959
    return `+20${cleaned.substring(2)}`;
  }

  // الحالة (ج): رقم أرضي مصري (e.g., "0226182959" - 10 أرقام يبدأ بـ 0)
  // أو رقم محمول بدون 0 الأول (e.g., "1012345678" - 10 أرقام يبدأ بـ 1)
  if (cleaned.length === 10) {
    if (cleaned.startsWith('1')) {
      // رقم محمول بدون الصفر الأول
      return `+20${cleaned}`;
    } else if (cleaned.startsWith('2') || cleaned.startsWith('3')) {
      // رقم أرضي بدون الصفر الأول (القاهرة 2، الإسكندرية 3)
      return `+20${cleaned}`;
    }
  }

  // الحالة (د): رقم أرضي كامل (e.g., "0226182959" أو "0326182959" - 10 أرقام)
  if (cleaned.length === 10 && cleaned.startsWith('0')) {
    return `+20${cleaned.substring(1)}`;
  }

  // الحالة (هـ): رقم يبدأ بـ 20 ثم 0 (e.g., "2002XXXXXXXX" - 12 رقم، رقم أرضي دولي خاطئ)
  if (cleaned.length === 12 && cleaned.startsWith('200')) {
    // إزالة الصفر الزائد: 2002XXXXXXX -> +202XXXXXXX
    return `+20${cleaned.substring(3)}`;
  }

  // الحالة (و): رقم يبدأ بـ 002 (صيغة دولية قديمة)
  if (cleaned.startsWith('002') && cleaned.length >= 12) {
    return `+${cleaned.substring(2)}`;
  }

  // 3. إذا لم تتطابق أي قاعدة واضحة، أعد الرقم مع علامة تحذير
  // هذا يضمن ظهور الأرقام غير القياسية في الواجهة ليتمكن المستخدم من إصلاحها يدويًا
  return `${cleaned} ⚠️`;
}

/**
 * التحقق من صحة الرقم المصري المنسق
 */
export function isValidEgyptianPhone(phone: string): boolean {
  // الصيغة الصحيحة للأرقام المصرية: +201 + 9 أرقام = 13 رقم إجمالي  
  // مثال: +201065583725 (كما طلب المستخدم)
  const phoneRegex = /^\+201[0-9]{9}$/;
  return phoneRegex.test(phone);
}

/**
 * تنسيق رقم للعرض المحلي (01xxxxxxxxx)
 */
export function formatPhoneForDisplay(phone: string | number): string {
  const internationalFormat = formatEgyptianPhone(phone);
  if (!internationalFormat) return '';

  // إزالة علامة التحذير إن وُجدت
  const cleanedFormat = internationalFormat.replace(' ⚠️', '');
  const cleaned = cleanedFormat.replace(/\D/g, '');
  
  // رقم محمول دولي (201XXXXXXXXX - 12 رقم)
  if (cleaned.startsWith('201') && cleaned.length === 12) {
    return `0${cleaned.substring(2)}`;
  }
  
  // رقم أرضي دولي (202XXXXXXXX أو 203XXXXXXXX - 11 رقم)
  if ((cleaned.startsWith('202') || cleaned.startsWith('203')) && cleaned.length === 11) {
    return `0${cleaned.substring(2)}`;
  }

  return internationalFormat; // Fallback to the full number if something is unusual
}

/**
 * دالة اختبار لعرض كيفية عمل منسق الأرقام
 */
export function testPhoneFormatter(): void {
  const testNumbers = [
    // أرقام إنجليزية
    '2011003307745',
    '11003307745',
    '011003307745',
    '20/11003307745',
    '20 10 80995870',
    '+20 10 65583725',
    '10 65583725',
    '1065583725',
    '65583725',
    // أرقام عربية
    '٠١٠٦٥٥٨٣٧٢٥',         // رقم عربي كامل
    '٠١٠١٢٣٤٥٦٧٨',         // رقم عربي آخر
    '01٠٦٥٥٨٣٧٢٥',         // مختلط (إنجليزي وعربي)
    '+٢٠١٠٦٥٥٨٣٧٢٥',       // دولي بأرقام عربية
    '٢٠١٠٦٥٥٨٣٧٢٥'        // دولي بدون + بأرقام عربية
  ];

  console.log('🔧 اختبار منسق أرقام الهاتف المصرية:');
  console.log('=====================================');

  testNumbers.forEach(number => {
    const formatted = formatEgyptianPhone(number);
    const isValid = isValidEgyptianPhone(formatted);
    console.log(`📞 "${number}" → "${formatted}" ${isValid ? '✅' : '❌'}`);
  });

  console.log('=====================================');

  // اختبار تحويل الأرقام العربية
  console.log('\n🔄 اختبار تحويل الأرقام العربية:');
  console.log('=====================================');
  const arabicTests = [
    '٠١٢٣٤٥٦٧٨٩',
    '۰۱۲۳۴۵۶۷۸۹',  // فارسية
    '0١2٣4٥6٧8٩'   // مختلطة
  ];
  arabicTests.forEach(num => {
    console.log(`"${num}" → "${convertArabicNumerals(num)}"`);
  });
  console.log('=====================================');
} 