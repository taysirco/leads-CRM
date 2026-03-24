import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * API Endpoint: /api/bosta-ranking
 * Fetches customer delivery ranking from Bosta by phone number
 * 
 * Query: ?phone=01XXXXXXXXX
 * Returns: { ranking, classification, totalDeliveries }
 */

interface RankingResponse {
  success: boolean;
  ranking: number | null;
  classification: 'excellent' | 'medium' | 'low' | 'new' | 'error';
  classificationAr: string;
  totalDeliveries: number;
  phone: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RankingResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      ranking: null,
      classification: 'error',
      classificationAr: 'خطأ',
      totalDeliveries: 0,
      phone: '',
    });
  }

  const { phone } = req.query;

  if (!phone || typeof phone !== 'string') {
    return res.status(400).json({
      success: false,
      ranking: null,
      classification: 'error',
      classificationAr: 'رقم غير صحيح',
      totalDeliveries: 0,
      phone: '',
    });
  }

  const apiKey = process.env.BOSTA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      ranking: null,
      classification: 'error',
      classificationAr: 'خطأ في الإعدادات',
      totalDeliveries: 0,
      phone,
    });
  }

  try {
    // تنظيف رقم الهاتف - إزالة الأصفار والرموز
    const cleanPhone = phone.replace(/\D/g, '').replace(/^0/, '');
    const searchPhone = '0' + cleanPhone; // format: 01XXXXXXXXX
    const fullPhone = '+20' + cleanPhone; // format: +201XXXXXXXXX

    // ⚠️ ملاحظة مهمة: فلتر receiverPhone في Bosta API لا يعمل فعلياً
    // لذلك نستخدم search الذي يرتب النتائج بحيث تظهر المطابقة أولاً
    // ثم نتحقق يدوياً من تطابق رقم الهاتف
    const response = await fetch(
      `https://app.bosta.co/api/v0/deliveries?search=${searchPhone}&pageSize=10`,
      {
        headers: {
          Authorization: apiKey,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Bosta API error: ${response.status}`);
    }

    const data = await response.json();
    const deliveries = data.deliveries || [];

    // البحث عن طلب يطابق رقم هاتف العميل فعلياً
    const matchedDelivery = deliveries.find((del: any) => {
      const receiverPhone = del.receiver?.phone || '';
      return (
        receiverPhone === fullPhone ||
        receiverPhone === searchPhone ||
        receiverPhone === cleanPhone ||
        receiverPhone.endsWith(cleanPhone)
      );
    });

    // استخراج الـ ranking من الطلب المطابق
    let ranking: number | null = null;
    let totalDeliveries = 0;
    let customerFound = false;

    if (matchedDelivery) {
      customerFound = true;
      if (matchedDelivery.receiver?.ranking !== undefined) {
        ranking = matchedDelivery.receiver.ranking;
      }
      // عدد الطلبات غير متاح بدقة من هذا الـ endpoint، لكن وجود matching يعني عميل سابق
      totalDeliveries = 1; // نعرف على الأقل أن هناك طلب واحد
    }

    // تصنيف العميل
    let classification: RankingResponse['classification'];
    let classificationAr: string;

    if (!customerFound) {
      classification = 'new';
      classificationAr = 'عميل جديد';
    } else if (ranking === null || ranking === undefined) {
      classification = 'new';
      classificationAr = 'عميل جديد';
    } else if (ranking >= 70) {
      classification = 'excellent';
      classificationAr = 'ممتاز';
    } else if (ranking >= 40) {
      classification = 'medium';
      classificationAr = 'متوسط';
    } else {
      classification = 'low';
      classificationAr = 'ضعيف';
    }

    // Cache for 5 minutes — ranking doesn't change rapidly
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

    return res.status(200).json({
      success: true,
      ranking,
      classification,
      classificationAr,
      totalDeliveries,
      phone: cleanPhone,
    });
  } catch (error) {
    console.error('Bosta ranking error:', error);
    return res.status(200).json({
      success: false,
      ranking: null,
      classification: 'error',
      classificationAr: 'خطأ',
      totalDeliveries: 0,
      phone,
    });
  }
}
