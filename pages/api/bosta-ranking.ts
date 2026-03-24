import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchLeads, updateLead } from '../../lib/googleSheets';

/**
 * API Endpoint: /api/bosta-ranking
 * 
 * استراتيجية الحصول على ranking العميل العالمي من بوسطة:
 * 1. إنشاء delivery مؤقت بالرقم → بوسطة تملأ receiver.ranking من قاعدة البيانات العالمية
 * 2. قراءة الـ ranking من الطلب المُنشأ
 * 3. حذف الطلب فوراً
 * 4. حفظ الـ ranking في Google Sheet لعدم الحاجة لفحصه مرة أخرى
 * 
 * GET: ?phone=01XXXXXXXXX&rowIndex=5  → فحص ranking وحفظه
 * GET: ?batch=true                    → فحص كل العملاء بدون ranking
 */

interface RankingResult {
  phone: string;
  ranking: number | null;
  classification: 'excellent' | 'medium' | 'low' | 'new' | 'error';
  classificationAr: string;
  saved: boolean;
}

interface RankingResponse {
  success: boolean;
  results?: RankingResult[];
  result?: RankingResult;
  error?: string;
}

// تصنيف الـ ranking
function classifyRanking(ranking: number | null | undefined): { classification: string; classificationAr: string } {
  if (ranking === null || ranking === undefined) {
    return { classification: 'new', classificationAr: 'عميل جديد' };
  } else if (ranking >= 70) {
    return { classification: 'excellent', classificationAr: 'ممتاز' };
  } else if (ranking >= 40) {
    return { classification: 'medium', classificationAr: 'متوسط' };
  } else {
    return { classification: 'low', classificationAr: 'ضعيف' };
  }
}

// فحص ranking عميل واحد: إنشاء → قراءة → حذف
async function checkRanking(phone: string, apiKey: string): Promise<number | null> {
  const formattedPhone = phone.startsWith('0') ? phone : '0' + phone;

  try {
    // 1) إنشاء delivery مؤقت
    const createRes = await fetch('https://app.bosta.co/api/v0/deliveries', {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 10,
        specs: {
          packageType: 'Small', size: 'SMALL', weight: 1,
          packageDetails: { itemsCount: 1, description: 'RANKING-CHECK' },
        },
        notes: 'TEMP-RANKING-CHECK',
        cod: 1,
        dropOffAddress: {
          city: { _id: 'rMpGpyDMsRwmGb7bR', name: 'Cairo', nameAr: 'القاهره' },
          zone: { _id: 'ZThjMCqaHf1LOlYxC', name: 'Nasr City', nameAr: 'مدينة نصر' },
          district: { name: 'مدينة نصر' },
          firstLine: 'TEMP-RANKING-CHECK',
          buildingNumber: '1', floor: '1', apartment: '1',
        },
        receiver: { firstName: 'RankCheck', lastName: 'Temp', phone: formattedPhone },
      }),
    });

    if (!createRes.ok) {
      console.error(`Failed to create temp delivery for ${phone}: ${createRes.status}`);
      return null;
    }

    const created = await createRes.json();
    const deliveryId = created._id;
    const trackingNumber = created.trackingNumber;

    if (!deliveryId || !trackingNumber) {
      console.error(`No delivery ID/TN returned for ${phone}`);
      return null;
    }

    // 2) قراءة الـ ranking
    const getRes = await fetch(`https://app.bosta.co/api/v0/deliveries/${trackingNumber}`, {
      headers: { Authorization: apiKey },
    });
    const deliveryData = await getRes.json();
    const ranking = deliveryData.receiver?.ranking ?? null;

    // 3) حذف فوري
    await fetch(`https://app.bosta.co/api/v0/deliveries/${deliveryId}`, {
      method: 'DELETE',
      headers: { Authorization: apiKey },
    }).catch((err) => console.error(`Warning: Failed to delete temp delivery ${deliveryId}:`, err));

    return ranking;
  } catch (error) {
    console.error(`Error checking ranking for ${phone}:`, error);
    return null;
  }
}

// تنسيق قيمة الـ ranking للحفظ في الشيت
function formatRankingForSheet(ranking: number | null): string {
  if (ranking === null) return 'جديد';
  const { classificationAr } = classifyRanking(ranking);
  return `${Math.round(ranking)}% - ${classificationAr}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<RankingResponse>) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.BOSTA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'BOSTA_API_KEY not set' });
  }

  const { phone, rowIndex, batch } = req.query;

  // === وضع الدُفعات: فحص كل الطلبات بدون ranking ===
  if (batch === 'true') {
    try {
      const leads = await fetchLeads();
      // فلترة الطلبات النشطة (جديد/معلق) بدون ranking
      const unchecked = leads.filter(
        (lead) =>
          lead.phone &&
          lead.phone.length >= 10 &&
          !lead.bostaRanking &&
          (lead.status === 'جديد' || lead.status === 'لم يرد' || lead.status === 'معلق' || !lead.status)
      );

      console.log(`📊 فحص ranking لـ ${unchecked.length} طلب بدون تقييم...`);

      const results: RankingResult[] = [];
      // فحص بحد أقصى 10 في المرة الواحدة لتجنب rate limits
      const toCheck = unchecked.slice(0, 10);

      for (const lead of toCheck) {
        const cleanPhone = lead.phone.replace(/\D/g, '');
        const formattedPhone = cleanPhone.startsWith('0') ? cleanPhone : '0' + cleanPhone;

        const ranking = await checkRanking(formattedPhone, apiKey);
        const { classification, classificationAr } = classifyRanking(ranking);
        const sheetValue = formatRankingForSheet(ranking);

        // حفظ في الشيت
        try {
          await updateLead(lead.rowIndex, { bostaRanking: sheetValue });
          console.log(`  ✅ ${lead.name} (${lead.phone}) → ${sheetValue}`);
        } catch (err) {
          console.error(`  ❌ فشل حفظ ranking لـ ${lead.name}:`, err);
        }

        results.push({
          phone: formattedPhone,
          ranking,
          classification: classification as RankingResult['classification'],
          classificationAr,
          saved: true,
        });

        // تأخير 500ms بين كل طلب
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      return res.status(200).json({
        success: true,
        results,
      });
    } catch (error) {
      console.error('Batch ranking error:', error);
      return res.status(500).json({ success: false, error: 'Batch check failed' });
    }
  }

  // === وضع فردي: فحص ranking عميل واحد ===
  if (!phone || typeof phone !== 'string') {
    return res.status(400).json({ success: false, error: 'Phone required' });
  }

  try {
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('0') ? cleanPhone : '0' + cleanPhone;

    const ranking = await checkRanking(formattedPhone, apiKey);
    const { classification, classificationAr } = classifyRanking(ranking);
    const sheetValue = formatRankingForSheet(ranking);

    // حفظ في الشيت إذا تم تمرير rowIndex
    let saved = false;
    if (rowIndex && typeof rowIndex === 'string') {
      try {
        await updateLead(parseInt(rowIndex, 10), { bostaRanking: sheetValue });
        saved = true;
      } catch (err) {
        console.error(`Failed to save ranking for row ${rowIndex}:`, err);
      }
    }

    return res.status(200).json({
      success: true,
      result: {
        phone: formattedPhone,
        ranking,
        classification: classification as RankingResult['classification'],
        classificationAr,
        saved,
      },
    });
  } catch (error) {
    console.error('Single ranking error:', error);
    return res.status(200).json({
      success: false,
      result: {
        phone: phone,
        ranking: null,
        classification: 'error',
        classificationAr: 'خطأ',
        saved: false,
      },
    });
  }
}
