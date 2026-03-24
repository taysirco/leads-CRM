import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * 🔔 API endpoint لجلب إشعارات بوسطة — الطلبات التي تحتاج إجراء
 * يستخدم: GET /api/v0/notifications من Bosta API
 */

interface BostaNotification {
  id: string;
  titleAr: string;
  textAr: string;
  type: string;
  status: string; // VIEWED | NOT_VIEWED_YET
  createdAt: string;
  trackingNumber: string;
  consigneeName: string;
  consigneePhone: string;
  lastExceptionCode: number;
}

// خريطة أسباب الاستثناءات — مترجمة للعربية
const EXCEPTION_REASONS: Record<number, string> = {
  1: 'العميل طلب التأجيل',
  2: 'العنوان غير صحيح أو غير مكتمل',
  3: 'المنطقة خارج نطاق التوصيل',
  4: 'العميل لا يرد على الهاتف',
  5: 'الهاتف مغلق',
  6: 'الهاتف مشغول',
  7: 'رقم هاتف خاطئ',
  8: 'العميل رفض الاستلام',
  9: 'العميل غير الرأي / تم الإلغاء',
  10: 'الشحنة تالفة',
  11: 'محتويات خاطئة',
  12: 'العميل طلب فتح الشحنة',
  13: 'العميل لم يكن متواجداً',
  14: 'العميل يريد تأجيل الاستلام',
  100: 'مشكلة في التوصيل',
  104: 'فشل محاولة التوصيل',
};

function getExceptionReason(code: number): string {
  return EXCEPTION_REASONS[code] || `سبب غير معروف (${code})`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.BOSTA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'BOSTA_API_KEY not configured' });
  }

  try {
    const response = await fetch('https://app.bosta.co/api/v0/notifications?pageSize=50', {
      headers: { 'Authorization': apiKey },
    });

    if (!response.ok) {
      console.error(`❌ [BOSTA-NOTIF] API error: ${response.status}`);
      return res.status(response.status).json({ error: 'Failed to fetch Bosta notifications' });
    }

    const data = await response.json();
    const allNotifications = data.data?.notifications || [];

    // ✅ فلترة: فقط إشعارات "في انتظار إجراء"
    const actionRequired: BostaNotification[] = allNotifications
      .filter((n: any) => n.type === 'WAITING_FOR_BUSINESS_ACTION_NOTIFICATION')
      .map((n: any) => ({
        id: n._id,
        titleAr: n.titleAr || n.title,
        textAr: n.textAr || n.text,
        type: n.type,
        status: n.status,
        createdAt: n.createdAt,
        trackingNumber: n.extra?.trackingNumber || '',
        consigneeName: n.extra?.consigneeName || 'عميل',
        consigneePhone: n.extra?.consigneePhone || '',
        lastExceptionCode: n.extra?.lastExceptionCode || 0,
      }));

    // إضافة سبب الاستثناء المترجم
    const enriched = actionRequired.map(n => ({
      ...n,
      exceptionReason: getExceptionReason(n.lastExceptionCode),
      isNew: n.status === 'NOT_VIEWED_YET',
      timeAgo: getTimeAgo(n.createdAt),
    }));

    return res.status(200).json({
      success: true,
      count: enriched.length,
      newCount: enriched.filter(n => n.isNew).length,
      notifications: enriched,
    });

  } catch (error: any) {
    console.error('❌ [BOSTA-NOTIF] Error:', error.message);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  if (diffHr < 24) return `منذ ${diffHr} ساعة`;
  if (diffDay === 1) return 'أمس';
  return `منذ ${diffDay} يوم`;
}
