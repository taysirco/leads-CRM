/**
 * تنسيق أرقام الهاتف المصرية إلى الصيغة الموحدة +201XXXXXXXXX
 */
export function formatEgyptianPhone(phone: string | number): string {
  if (!phone) {
    return '';
  }

  // 1. تحويل المدخل إلى نص وتنظيفه من كل شيء عدا الأرقام
  const cleaned = String(phone).replace(/\D/g, '');

  if (!cleaned) {
    return '';
  }

  // 2. معالجة الحالات الأكثر شيوعًا ووضوحًا
  
  // الحالة (أ): رقم دولي صحيح بدون علامة + (e.g., "201012345678")
  if (cleaned.length === 12 && cleaned.startsWith('201')) {
    return `+${cleaned}`;
  }
  
  // الحالة (ب): رقم محلي صحيح (e.g., "01012345678")
  if (cleaned.length === 11 && cleaned.startsWith('01')) {
    return `+20${cleaned.substring(1)}`;
  }
  
  // الحالة (ج): رقم مكون من 10 خانات يبدأ بـ 1 (الحالة المطلوبة)
  // (e.g., "1012345678" -> يفترض أنه كان "01012345678")
  if (cleaned.length === 10 && cleaned.startsWith('1')) {
    return `+20${cleaned}`;
  }

  // 3. إذا لم تتطابق أي قاعدة واضحة، أعد الرقم الأصلي كما هو
  // هذا يضمن ظهور الأرقام غير القياسية في الواجهة ليتمكن المستخدم من إصلاحها يدويًا
  return String(phone);
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
 * تنسيق رقم للعرض (بدون +)
 */
export function formatPhoneForDisplay(phone: string): string {
  const formatted = formatEgyptianPhone(phone);
  return formatted.startsWith('+') ? formatted.substring(1) : formatted;
}

/**
 * دالة اختبار لعرض كيفية عمل منسق الأرقام
 */
export function testPhoneFormatter(): void {
  const testNumbers = [
    '2011003307745',
    '11003307745',
    '011003307745',
    '20/11003307745',
    '20 10 80995870',
    '+20 10 65583725',
    '10 65583725',
    '1065583725',
    '65583725'
  ];
  
  console.log('🔧 اختبار منسق أرقام الهاتف المصرية:');
  console.log('=====================================');
  
  testNumbers.forEach(number => {
    const formatted = formatEgyptianPhone(number);
    const isValid = isValidEgyptianPhone(formatted);
    console.log(`📞 "${number}" → "${formatted}" ${isValid ? '✅' : '❌'}`);
  });
  
  console.log('=====================================');
} 