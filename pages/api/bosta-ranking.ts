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
    // تنظيف رقم الهاتف
    const cleanPhone = phone.replace(/\D/g, '').replace(/^0/, '');

    const response = await fetch(
      `https://app.bosta.co/api/v0/deliveries?receiverPhone=${cleanPhone}&pageSize=1`,
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
    const totalDeliveries = data.count || 0;

    // استخراج الـ ranking من أول طلب
    let ranking: number | null = null;
    if (deliveries.length > 0 && deliveries[0].receiver?.ranking !== undefined) {
      ranking = deliveries[0].receiver.ranking;
    }

    // تصنيف العميل
    let classification: RankingResponse['classification'];
    let classificationAr: string;

    if (totalDeliveries === 0 || deliveries.length === 0) {
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
