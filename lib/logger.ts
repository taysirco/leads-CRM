export const isProduction = process.env.NODE_ENV === 'production';

// يسكت معظم سجلات التطوير في الإنتاج مع إبقاء الأخطاء
export function silenceLogsIfProduction() {
  if (!isProduction) return;
  const noOp = () => {};
  // احتفظ بالأخطاء فقط
  console.log = noOp;
  console.info = noOp;
  console.debug = noOp;
  console.warn = noOp;
  // لا نسكت console.error لتتبع الأخطاء المهمة
} 