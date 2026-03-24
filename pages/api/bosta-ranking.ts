import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchLeads, updateLead } from '../../lib/googleSheets';

/**
 * API Endpoint: /api/bosta-ranking
 * 
 * استراتيجية الحصول على ranking:
 * - listing API (/api/v0/deliveries) يحتوي على receiver.ranking لكل delivery سابق
 * - نمسح كل الصفحات ← نبني خريطة رقم→ranking ← نطابق مع شيت العملاء ← نحفظ
 * 
 * GET: ?batch=true       → فحص وحفظ جميع rankings
 * GET: ?phone=01XXXXXXX  → فحص ranking عميل واحد
 */

interface PhoneRanking {
  ranking: number;
  name: string;
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

// تنسيق رقم الهاتف للمطابقة
function normalizePhone(phone: string): string {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  // +201... → 01...
  if (clean.startsWith('20') && clean.length === 12) clean = '0' + clean.substring(2);
  // 1... → 01...
  if (clean.startsWith('1') && clean.length === 10) clean = '0' + clean;
  return clean;
}

// تنسيق قيمة الـ ranking للحفظ في الشيت
function formatRankingForSheet(ranking: number | null): string {
  if (ranking === null || ranking === undefined) return 'جديد';
  const { classificationAr } = classifyRanking(ranking);
  return `${Math.round(ranking)}% - ${classificationAr}`;
}

// مسح جميع الشحنات من بوسطة وبناء خريطة رقم→ranking
async function scanAllDeliveries(apiKey: string): Promise<Map<string, PhoneRanking>> {
  const phoneMap = new Map<string, PhoneRanking>();
  let page = 1;
  const maxPages = 200; // حد أقصى 2000 delivery
  let emptyPages = 0;

  while (page <= maxPages) {
    try {
      const res = await fetch(`https://app.bosta.co/api/v0/deliveries?pageSize=10&page=${page}`, {
        headers: { Authorization: apiKey },
      });
      
      if (!res.ok) {
        console.error(`Listing page ${page} failed: ${res.status}`);
        break;
      }

      const data = await res.json();
      const deliveries = data.deliveries || [];
      
      if (deliveries.length === 0) {
        emptyPages++;
        if (emptyPages >= 3) break; // 3 صفحات فارغة متتالية = انتهاء
        page++;
        continue;
      }
      
      emptyPages = 0;

      for (const del of deliveries) {
        const receiverPhone = del.receiver?.phone || '';
        const ranking = del.receiver?.ranking;

        if (receiverPhone && ranking !== undefined && ranking !== null) {
          const normalized = normalizePhone(receiverPhone);
          if (normalized && !phoneMap.has(normalized)) {
            phoneMap.set(normalized, {
              ranking,
              name: del.receiver?.fullName || '',
            });
          }
        }
      }

      page++;
    } catch (error) {
      console.error(`Error scanning page ${page}:`, error);
      break;
    }
  }

  console.log(`📊 مسح ${page - 1} صفحة → ${phoneMap.size} رقم مع ranking`);
  return phoneMap;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.BOSTA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'BOSTA_API_KEY not set' });
  }

  const { phone, batch } = req.query;

  // === وضع الدُفعات: مسح كل الشحنات ومطابقة مع الشيت ===
  if (batch === 'true') {
    try {
      console.log('🔍 بدء مسح شامل لـ rankings من بوسطة...');
      
      // 1) مسح كل الشحنات السابقة
      const phoneMap = await scanAllDeliveries(apiKey);
      
      // 2) جلب الطلبات من الشيت
      const leads = await fetchLeads();
      
      // 3) مطابقة وحفظ
      let saved = 0;
      let skipped = 0;
      let newCustomers = 0;
      const results: Array<{ name: string; phone: string; ranking: string; status: string }> = [];

      for (const lead of leads) {
        // تخطي الطلبات التي لها ranking محفوظ بالفعل
        if (lead.bostaRanking && lead.bostaRanking.trim() !== '') {
          skipped++;
          continue;
        }

        if (!lead.phone || lead.phone.length < 10) continue;

        const cleanPhone = normalizePhone(lead.phone);
        const match = phoneMap.get(cleanPhone);

        if (match) {
          const sheetValue = formatRankingForSheet(match.ranking);
          try {
            await updateLead(lead.rowIndex, { bostaRanking: sheetValue });
            saved++;
            results.push({ name: lead.name, phone: cleanPhone, ranking: sheetValue, status: 'saved' });
            console.log(`  ✅ ${lead.name} → ${sheetValue}`);
          } catch (err) {
            console.error(`  ❌ فشل حفظ ranking لـ ${lead.name}:`, err);
            results.push({ name: lead.name, phone: cleanPhone, ranking: sheetValue, status: 'error' });
          }
        } else {
          // عميل جديد - ليس له شحنات سابقة على بوسطة
          try {
            await updateLead(lead.rowIndex, { bostaRanking: 'جديد' });
            newCustomers++;
            results.push({ name: lead.name, phone: cleanPhone, ranking: 'جديد', status: 'new' });
          } catch (err) {
            console.error(`  ❌ فشل تعيين ${lead.name} كجديد:`, err);
          }
        }
      }

      console.log(`\n📊 الملخص: ${saved} محفوظ | ${newCustomers} جديد | ${skipped} موجود مسبقاً`);

      return res.status(200).json({
        success: true,
        summary: { saved, newCustomers, skipped, totalDeliveriesScanned: phoneMap.size },
        results: results.slice(0, 50), // أول 50 نتيجة
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
    const cleanPhone = normalizePhone(phone);
    
    // مسح الشحنات للبحث عن هذا الرقم
    const phoneMap = await scanAllDeliveries(apiKey);
    const match = phoneMap.get(cleanPhone);

    const ranking = match?.ranking ?? null;
    const { classification, classificationAr } = classifyRanking(ranking);

    return res.status(200).json({
      success: true,
      result: {
        phone: cleanPhone,
        ranking,
        classification,
        classificationAr,
        saved: false,
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
