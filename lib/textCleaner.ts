// دالة تنظيف شاملة للنصوص العربية
export const cleanText = (text: string): string => {
  if (!text) return '';
  
  return text
    .trim() // إزالة المسافات من البداية والنهاية
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // إزالة التشكيل العربي
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // إزالة الأحرف غير المرئية
    .replace(/\s+/g, ' ') // تحويل المسافات المتعددة إلى مسافة واحدة
    .replace(/[\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ') // تنظيف جميع أنواع المسافات
    .toLowerCase() // تحويل الأحرف الإنجليزية إلى أحرف صغيرة
    .replace(/[٠-٩]/g, (match) => String.fromCharCode(match.charCodeAt(0) - '٠'.charCodeAt(0) + '0'.charCodeAt(0))) // تحويل الأرقام العربية إلى إنجليزية
    .replace(/[۰-۹]/g, (match) => String.fromCharCode(match.charCodeAt(0) - '۰'.charCodeAt(0) + '0'.charCodeAt(0))) // تحويل الأرقام الفارسية إلى إنجليزية
    .replace(/[ك]/g, 'ك') // توحيد أشكال حرف الكاف
    .replace(/[ي]/g, 'ي') // توحيد أشكال حرف الياء
    .replace(/[ة]/g, 'ه') // توحيد التاء المربوطة مع الهاء
    .replace(/[أإآ]/g, 'ا') // توحيد أشكال الألف
    .replace(/[ؤ]/g, 'و') // توحيد الواو مع الهمزة
    .replace(/[ئ]/g, 'ي') // توحيد الياء مع الهمزة
    .trim();
};

// دالة إنشاء قائمة منتجات نظيفة ومرتبة
export const getUniqueProducts = (orders: Array<{ productName: string }>): string[] => {
  const cleanedProducts = orders
    .map(o => cleanText(o.productName))
    .filter(Boolean)
    .filter((product, index, array) => array.indexOf(product) === index) // إزالة المكرر
    .sort((a, b) => a.localeCompare(b, 'ar', { numeric: true })); // ترتيب عربي
  
  return cleanedProducts;
};

// دالة مقارنة النصوص المنظفة
export const compareCleanText = (text1: string, text2: string): boolean => {
  return cleanText(text1) === cleanText(text2);
};

// دالة للمساعدة في استكشاف المشاكل - تُظهر تفاصيل النص
export const debugText = (text: string): void => {
  if (!text) {
    console.log('النص فارغ');
    return;
  }
  
  console.log('النص الأصلي:', `"${text}"`);
  console.log('طول النص:', text.length);
  console.log('رموز Unicode:', text.split('').map(char => `${char} (U+${char.charCodeAt(0).toString(16).padStart(4, '0')})`));
  console.log('النص المنظف:', `"${cleanText(text)}"`);
  console.log('طول النص المنظف:', cleanText(text).length);
  
  // تحليل إضافي للأحرف الإنجليزية والأرقام
  const englishChars = text.match(/[a-zA-Z]/g) || [];
  const numbers = text.match(/[0-9٠-٩۰-۹]/g) || [];
  const specialChars = text.match(/[^a-zA-Z0-9\u0600-\u06FF\s]/g) || [];
  
  if (englishChars.length > 0) {
    console.log('الأحرف الإنجليزية:', englishChars.join(', '));
  }
  if (numbers.length > 0) {
    console.log('الأرقام:', numbers.join(', '));
  }
  if (specialChars.length > 0) {
    console.log('أحرف خاصة:', specialChars.join(', '));
  }
  
  console.log('---');
};

// دالة للمساعدة في فهم سبب التكرار
export const analyzeProductDuplicates = (orders: Array<{ productName: string }>): void => {
  console.log('تحليل تكرار أسماء المنتجات:');
  
  const productMap = new Map<string, string[]>();
  
  orders.forEach((order, index) => {
    const original = order.productName || '';
    const cleaned = cleanText(original);
    
    if (!productMap.has(cleaned)) {
      productMap.set(cleaned, []);
    }
    productMap.get(cleaned)!.push(original);
  });
  
  productMap.forEach((originals, cleaned) => {
    if (originals.length > 1) {
      console.log(`المنتج المنظف: "${cleaned}"`);
      console.log('الأشكال الأصلية:');
      originals.forEach((original, i) => {
        console.log(`  ${i + 1}. "${original}"`);
        debugText(original);
      });
    }
  });
};

// دالة اختبار مخصصة للمنتج المحدد
export const testProductCleaning = (): void => {
  console.log('🧪 اختبار تنظيف منتج "موبايل المهام الخاصة":');
  
  const variants = [
    'موبايل المهام الخاصة K19',
    'موبايل المهام الخاصة k19',
    'موبايل المهام الخاصة K١٩',
    'موبايل المهام الخاصة k١٩',
    'موبايل المهام الخاصة ك19',
    'موبايل المهام الخاصة ك١٩',
  ];
  
  variants.forEach((variant, i) => {
    console.log(`\n${i + 1}. اختبار: "${variant}"`);
    const cleaned = cleanText(variant);
    console.log(`   النتيجة: "${cleaned}"`);
    debugText(variant);
  });
  
  // اختبار التوحيد
  const allCleaned = variants.map(cleanText);
  const unique = [...new Set(allCleaned)];
  
  console.log('\n📊 النتائج:');
  console.log(`عدد الأشكال الأصلية: ${variants.length}`);
  console.log(`عدد الأشكال المنظفة الفريدة: ${unique.length}`);
  console.log('الأشكال المنظفة الفريدة:', unique);
  
  if (unique.length === 1) {
    console.log('✅ نجح التوحيد! جميع الأشكال تنتج نفس النتيجة المنظفة');
  } else {
    console.log('❌ فشل التوحيد! لا تزال هناك أشكال مختلفة');
  }
};

// دالة تشخيص حالات الطلبات
export const analyzeOrderStatuses = (orders: Array<{ id: number; status: string }>): void => {
  console.log('🔍 تحليل حالات الطلبات:');
  
  const statusMap = new Map<string, number>();
  const emptyStatuses: number[] = [];
  
  orders.forEach(order => {
    const status = order.status || '';
    const trimmedStatus = status.trim();
    
    if (!trimmedStatus) {
      emptyStatuses.push(order.id);
    } else {
      statusMap.set(trimmedStatus, (statusMap.get(trimmedStatus) || 0) + 1);
    }
  });
  
  console.log('\n📈 إحصائيات الحالات:');
  console.log(`إجمالي الطلبات: ${orders.length}`);
  console.log(`طلبات بدون حالة: ${emptyStatuses.length}`);
  console.log(`حالات فريدة: ${statusMap.size}`);
  
  if (emptyStatuses.length > 0) {
    console.log('\n⚠️ طلبات بدون حالة محددة:', emptyStatuses.slice(0, 10));
    if (emptyStatuses.length > 10) {
      console.log(`... و ${emptyStatuses.length - 10} طلب آخر`);
    }
  }
  
  console.log('\n📋 جميع الحالات الموجودة:');
  Array.from(statusMap.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => {
      console.log(`  "${status}" → ${count} طلب`);
      
      // فحص الأحرف غير المرئية في أسماء الحالات
      if (status.length !== status.trim().length) {
        console.log(`    ⚠️ يحتوي على مسافات زائدة`);
      }
      
      const hasInvisibleChars = /[\u200B-\u200D\uFEFF]/.test(status);
      if (hasInvisibleChars) {
        console.log(`    ⚠️ يحتوي على أحرف غير مرئية`);
      }
    });
};

// دالة اختبار فلتر الحالة
export const testStatusFilter = (orders: Array<{ id: number; status: string }>, filterStatus: string): void => {
  console.log(`🧪 اختبار فلتر الحالة: "${filterStatus}"`);
  
  const matchingOrders = orders.filter(order => {
    const orderStatus = (order.status || 'جديد').trim();
    const selectedStatus = filterStatus.trim();
    return orderStatus === selectedStatus;
  });
  
  console.log(`\n📊 نتائج الفلتر:`);
  console.log(`الطلبات المطابقة: ${matchingOrders.length} من ${orders.length}`);
  
  if (matchingOrders.length > 0) {
    console.log('أمثلة على الطلبات المطابقة:');
    matchingOrders.slice(0, 5).forEach(order => {
      console.log(`  طلب #${order.id}: "${order.status}"`);
    });
  } else {
    console.log('⚠️ لا توجد طلبات مطابقة للفلتر');
    
    // اقتراح حالات مشابهة
    const similarStatuses = orders
      .map(o => o.status || 'جديد')
      .filter((status, index, array) => array.indexOf(status) === index)
      .filter(status => status.toLowerCase().includes(filterStatus.toLowerCase()));
    
    if (similarStatuses.length > 0) {
      console.log('حالات مشابهة موجودة:', similarStatuses);
    }
  }
}; 