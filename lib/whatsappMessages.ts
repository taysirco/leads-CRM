/**
 * قوالب رسائل WhatsApp الجاهزة
 */

export interface CustomerInfo {
  name: string;
  productName: string;
  totalPrice?: string;
  phone: string;
}

/**
 * رسالة المتابعة الأولى - احترافية ودودة
 */
export function generateFollowUpMessage(customer: CustomerInfo): string {
  const message = `السلام عليكم بخصوص طلبك (*${customer.productName}*), حاولنا الاتصال بك ولم نتمكن من الوصول إليك. نرجو التكرم بالرد لتأكيد الطلب, ونحن في خدمتك لأي استفسار.`;

  return encodeURIComponent(message);
}

/**
 * رسالة التذكير الثانية - أكثر إلحاحاً
 */
export function generateSecondReminderMessage(customer: CustomerInfo): string {
  const message = `مرحباً ${customer.name}،
هذه رسالة تذكير أخيرة بخصوص طلبك: *${customer.productName}*.
الطلب محجوز لك لفترة محدودة مع توصيل مجاني وضمان جودة.
للتأكيد النهائي، يرجى الرد برسالة بسيطة.
نحترم قرارك إذا لم تعد مهتماً، فقط أخبرنا لنزيل رقمك من قائمة المتابعة.
مع أطيب التحيات، فريق سماريكتنج`;

  return encodeURIComponent(message);
}

/**
 * رسالة تأكيد الطلب
 */
export function generateConfirmationMessage(customer: CustomerInfo): string {
  const message = `شكراً لك ${customer.name} على تأكيد طلبك!
تم تأكيد طلبك بنجاح: ${customer.productName}${customer.totalPrice ? ` | المبلغ: ${customer.totalPrice} جنيه` : ''}.
سيتم التواصل معك قريباً لتأكيد العنوان وموعد التسليم.
نشكرك على ثقتك الغالية بنا، فريق سماريكتنج`;

  return encodeURIComponent(message);
}

/**
 * رسالة شحن الطلب
 */
export function generateShippingMessage(customer: CustomerInfo): string {
  const message = `بشرى سارة!
عزيزنا ${customer.name},
تم شحن طلبك اليوم: *${customer.productName}*.
سيصل إليك خلال 24-48 ساعة. سيتواصل معك مندوب الشحن قبل الوصول.
نتمنى أن ينال الطلب إعجابك.
شكراً لثقتك، فريق سماريكتنج`;

  return encodeURIComponent(message);
}

/**
 * إنشاء رابط WhatsApp مع رسالة جاهزة
 */
export function createWhatsAppLink(phone: string, message: string): string {
  // تنظيف رقم الهاتف من + 
  const cleanPhone = phone.replace(/\+/g, '');
  return `https://wa.me/${cleanPhone}?text=${message}`;
} 