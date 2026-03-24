import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchLeads, updateLead } from '../../lib/googleSheets';

/**
 * API Endpoint: /api/bosta-ranking
 * 
 * طريقة الفحص: Create → Wait → Read → Delete
 * - إنشاء شحنة مؤقتة → انتظار ranking → قراءة → حذف
 * - يصل لقاعدة بيانات بوسطة العالمية (ليس فقط شحناتنا)
 * 
 * GET: ?auto=true       → فحص تلقائي لأول 5 عملاء بدون ranking
 * GET: ?phone=01XXXXXXX → فحص ranking عميل واحد
 * GET: ?phone=01XXXXXXX&save=true&row=N → فحص وحفظ في الشيت
 */

// Extended timeout for Vercel (create-wait-read-delete takes ~15s per customer)
export const config = {
  maxDuration: 300, // 5 minutes max
};

// تصنيف الـ ranking
function classifyRanking(ranking: number | null | undefined): { classification: string; classificationAr: string } {
  if (ranking === null || ranking === undefined) {
    return { classification: 'new', classificationAr: 'جديد' };
  } else if (ranking >= 70) {
    return { classification: 'excellent', classificationAr: 'ممتاز' };
  } else if (ranking >= 40) {
    return { classification: 'medium', classificationAr: 'متوسط' };
  } else {
    return { classification: 'low', classificationAr: 'ضعيف' };
  }
}

// تنسيق رقم الهاتف للمطابقة
function normalizePhone(phone: string): string {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  if (clean.startsWith('20') && clean.length === 12) clean = '0' + clean.substring(2);
  if (clean.startsWith('1') && clean.length === 10) clean = '0' + clean;
  return clean;
}

// تنسيق قيمة ranking للشيت
function formatRankingForSheet(ranking: number | null): string {
  if (ranking === null || ranking === undefined) return 'جديد';
  const { classificationAr } = classifyRanking(ranking);
  return `${Math.round(ranking)}% - ${classificationAr}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * الطريقة الأساسية: Create → Wait → Read → Delete
 * إنشاء شحنة مؤقتة → انتظار حتى يظهر ranking → قراءة → حذف
 */
async function checkRankingViaCreateDelete(
  phone: string,
  name: string,
  apiKey: string
): Promise<number | null> {
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone || cleanPhone.length < 10 || !cleanPhone.startsWith('01')) {
    return null;
  }

  // Step 1: Create temp delivery
  const createPayload = {
    type: 'Deliver',
    specs: {
      packageDetails: { itemsCount: 1, description: 'Ranking Check' },
      size: 'SMALL',
      weight: 1,
    },
    dropOffAddress: {
      city: 'Cairo',
      zone: 'Nasr City',
      firstLine: 'شارع عباس العقاد',
    },
    receiver: {
      firstName: (name.split(' ')[0] || 'عميل').substring(0, 30),
      lastName: (name.split(' ').slice(1).join(' ') || 'فحص').substring(0, 30),
      phone: cleanPhone,
    },
    businessReference: 'RANK-' + Date.now(),
    cod: 50,
    notes: 'Ranking check - auto',
  };

  try {
    const createRes = await fetch('https://app.bosta.co/api/v0/deliveries', {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(createPayload),
    });
    const created = await createRes.json();

    if (!created._id) {
      console.error(`❌ فشل إنشاء شحنة لـ ${cleanPhone}: ${created.message || 'unknown'}`);
      return null;
    }

    console.log(`📦 شحنة TN:${created.trackingNumber} لـ ${cleanPhone}`);

    // Step 2: Wait and check ranking via search API
    let ranking: number | null = null;
    const delays = [4000, 5000, 6000]; // 3 attempts: 4s, 5s, 6s

    for (let attempt = 0; attempt < delays.length; attempt++) {
      await sleep(delays[attempt]);

      try {
        const searchRes = await fetch(
          `https://app.bosta.co/api/v0/deliveries?search=${cleanPhone}&pageSize=10`,
          { headers: { Authorization: apiKey } }
        );
        const searchData = await searchRes.json();

        for (const d of (searchData.deliveries || [])) {
          const rPhone = normalizePhone(d.receiver?.phone || '');
          if (rPhone === cleanPhone && d.receiver?.ranking !== undefined && d.receiver?.ranking !== null) {
            ranking = d.receiver.ranking;
            break;
          }
        }
      } catch (e) {
        console.error(`⚠️ خطأ بحث محاولة ${attempt + 1}`);
      }

      if (ranking !== null) {
        console.log(`✅ ${cleanPhone} → ${Math.round(ranking)}% (محاولة ${attempt + 1})`);
        break;
      }
    }

    // Step 3: Delete temp delivery
    try {
      await fetch(`https://app.bosta.co/api/v0/deliveries/${created._id}`, {
        method: 'DELETE',
        headers: { Authorization: apiKey },
      });
    } catch (e) {
      console.error(`⚠️ فشل حذف ${created._id}`);
    }

    if (ranking === null) {
      console.log(`⚪ ${cleanPhone} — عميل جديد فعلاً`);
    }

    return ranking;

  } catch (error: any) {
    console.error(`❌ خطأ فحص ${cleanPhone}: ${error.message}`);
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.BOSTA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'BOSTA_API_KEY not set' });
  }

  const { phone, auto, save, row, limit } = req.query;

  // =============================================
  // وضع تلقائي: فحص العملاء بدون ranking
  // GET /api/bosta-ranking?auto=true&limit=5
  // =============================================
  if (auto === 'true') {
    try {
      const maxCheck = Math.min(parseInt(limit as string) || 5, 10); // حد أقصى 10
      console.log(`🤖 فحص تلقائي — حد أقصى ${maxCheck} عملاء`);

      const leads = await fetchLeads();

      // إيجاد العملاء بدون ranking (Column V فارغ)
      const needsCheck = leads.filter(lead => {
        const ranking = (lead.bostaRanking || '').trim();
        const hasPhone = lead.phone && lead.phone.length >= 10;
        return !ranking && hasPhone;
      });

      if (needsCheck.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'جميع العملاء تم فحصهم بالفعل',
          checked: 0,
          remaining: 0,
        });
      }

      console.log(`📋 ${needsCheck.length} عميل بدون ranking — سيتم فحص ${Math.min(maxCheck, needsCheck.length)}`);

      const toCheck = needsCheck.slice(0, maxCheck);
      let updated = 0;
      let confirmedNew = 0;
      const results: Array<{ name: string; phone: string; ranking: string }> = [];

      for (const lead of toCheck) {
        const cleanPhone = normalizePhone(lead.phone);

        // فحص الرقم الأساسي
        let ranking = await checkRankingViaCreateDelete(lead.phone, lead.name, apiKey);

        // جرب رقم الواتساب إذا مختلف
        if (ranking === null && lead.whatsapp) {
          const whatsappNorm = normalizePhone(lead.whatsapp);
          if (whatsappNorm !== cleanPhone && whatsappNorm.startsWith('01')) {
            ranking = await checkRankingViaCreateDelete(lead.whatsapp, lead.name, apiKey);
          }
        }

        if (ranking !== null) {
          const value = formatRankingForSheet(ranking);
          try {
            await updateLead(lead.rowIndex, { bostaRanking: value });
            updated++;
            results.push({ name: lead.name, phone: cleanPhone, ranking: value });
          } catch (e) {
            console.error(`❌ فشل حفظ ${lead.name}`);
          }
        } else {
          // تأكيد أنه جديد فعلاً
          try {
            await updateLead(lead.rowIndex, { bostaRanking: 'جديد' });
            confirmedNew++;
            results.push({ name: lead.name, phone: cleanPhone, ranking: 'جديد' });
          } catch (e) {
            console.error(`❌ فشل تعيين ${lead.name}`);
          }
        }

        // تأخير بين العملاء
        await sleep(1000);
      }

      return res.status(200).json({
        success: true,
        checked: toCheck.length,
        updated,
        confirmedNew,
        remaining: needsCheck.length - toCheck.length,
        results,
      });

    } catch (error: any) {
      console.error('Auto ranking error:', error);
      return res.status(500).json({ success: false, error: 'Auto check failed: ' + error.message });
    }
  }

  // =============================================
  // وضع فردي: فحص ranking رقم واحد
  // GET /api/bosta-ranking?phone=01XXXXXXX
  // GET /api/bosta-ranking?phone=01XXXXXXX&save=true&row=5
  // =============================================
  if (!phone || typeof phone !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Required: ?phone=01XXXXXXX or ?auto=true',
    });
  }

  try {
    const ranking = await checkRankingViaCreateDelete(phone, 'فحص', apiKey);
    const { classification, classificationAr } = classifyRanking(ranking);
    const sheetValue = formatRankingForSheet(ranking);

    // حفظ في الشيت إذا طُلب
    let saved = false;
    if (save === 'true' && row) {
      const rowIndex = parseInt(row as string);
      if (rowIndex > 0) {
        try {
          await updateLead(rowIndex, { bostaRanking: sheetValue });
          saved = true;
        } catch (e) {
          console.error(`فشل حفظ ranking في صف ${rowIndex}`);
        }
      }
    }

    return res.status(200).json({
      success: true,
      result: {
        phone: normalizePhone(phone),
        ranking,
        rankingPercent: ranking !== null ? Math.round(ranking) + '%' : null,
        classification,
        classificationAr,
        sheetValue,
        saved,
      },
    });

  } catch (error: any) {
    console.error('Single ranking error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
