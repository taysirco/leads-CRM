import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * API Endpoint: /api/bosta-ranking
 * Fetches customer GLOBAL delivery ranking from Bosta by phone number
 * 
 * Strategy: Create a temporary delivery → read receiver.ranking → delete immediately
 * This works because Bosta populates receiver.ranking from their global database on creation
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
      success: false, ranking: null, classification: 'error',
      classificationAr: 'خطأ', totalDeliveries: 0, phone: '',
    });
  }

  const { phone } = req.query;

  if (!phone || typeof phone !== 'string') {
    return res.status(400).json({
      success: false, ranking: null, classification: 'error',
      classificationAr: 'رقم غير صحيح', totalDeliveries: 0, phone: '',
    });
  }

  const apiKey = process.env.BOSTA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      success: false, ranking: null, classification: 'error',
      classificationAr: 'خطأ في الإعدادات', totalDeliveries: 0, phone,
    });
  }

  try {
    // تنظيف رقم الهاتف
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('0') ? cleanPhone : '0' + cleanPhone;

    // === الاستراتيجية: إنشاء طلب مؤقت → قراءة ranking → حذف فوري ===
    // هذا هو الطريق الوحيد للحصول على ranking العميل العالمي من بوسطة
    // لأن الـ listing API لا يفلتر بالهاتف و الـ search لا يعمل بشكل صحيح

    // 1) إنشاء delivery مؤقت
    const createRes = await fetch('https://app.bosta.co/api/v0/deliveries', {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 10, // SEND
        specs: {
          packageType: 'Small',
          size: 'SMALL',
          weight: 1,
          packageDetails: { itemsCount: 1, description: 'RANKING-CHECK-TEMP' },
        },
        notes: 'TEMP-RANKING-CHECK',
        cod: 1,
        dropOffAddress: {
          city: { _id: 'rMpGpyDMsRwmGb7bR', name: 'Cairo', nameAr: 'القاهره' },
          zone: { _id: 'ZThjMCqaHf1LOlYxC', name: 'Nasr City', nameAr: 'مدينة نصر' },
          district: { name: 'مدينة نصر' },
          firstLine: 'TEMP-RANKING-CHECK',
          buildingNumber: '1',
          floor: '1',
          apartment: '1',
        },
        receiver: {
          firstName: 'RankingCheck',
          lastName: 'Temp',
          phone: formattedPhone,
        },
      }),
    });

    if (!createRes.ok) {
      throw new Error(`Bosta create error: ${createRes.status}`);
    }

    const created = await createRes.json();
    const deliveryId = created._id;
    const trackingNumber = created.trackingNumber;

    if (!deliveryId) {
      throw new Error('No delivery ID returned');
    }

    // 2) قراءة الـ ranking من الـ delivery المنشأ
    const getRes = await fetch(
      `https://app.bosta.co/api/v0/deliveries/${trackingNumber}`,
      { headers: { Authorization: apiKey } }
    );
    const deliveryData = await getRes.json();
    const ranking = deliveryData.receiver?.ranking ?? null;

    // 3) حذف الـ delivery فوراً
    await fetch(`https://app.bosta.co/api/v0/deliveries/${deliveryId}`, {
      method: 'DELETE',
      headers: { Authorization: apiKey },
    }).catch(() => {
      // حتى لو فشل الحذف، نستمر — الطلبات المؤقتة يمكن حذفها لاحقاً
      console.error('Warning: Failed to delete temp delivery', deliveryId);
    });

    // 4) تصنيف العميل
    let classification: RankingResponse['classification'];
    let classificationAr: string;

    if (ranking === null || ranking === undefined) {
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

    // Cache for 10 minutes
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');

    return res.status(200).json({
      success: true,
      ranking,
      classification,
      classificationAr,
      totalDeliveries: ranking !== null ? 1 : 0,
      phone: formattedPhone,
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
