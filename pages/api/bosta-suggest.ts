import type { NextApiRequest, NextApiResponse } from 'next';
import {
  normalizeGovernorateName,
  smartMatchCityAndZone,
  extractCityAndZoneFromAddress,
  sanitizeAddress,
  parseAddressStructure,
  fetchBostaCities,
  fetchBostaZones,
} from '../../lib/bosta';

// ==================== Bosta Suggest API ====================
// يقدم اقتراحات ذكية للمحافظة والمنطقة بناءً على بيانات بوسطة الفعلية
// يُستخدم في نافذة التعديل (Edit Modal) لمساعدة موظف الكول سنتر
//
// ⚠️ يستخدم الكاش المشترك من lib/bosta.ts — بدون تكرار

/** تطبيع بسيط للمقارنة */
function norm(text: string): string {
  return text
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim().toLowerCase();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end();
  }

  const { type, query, governorate, address } = req.body;

  // ── 1. اقتراح المحافظة ──
  if (type === 'governorate') {
    const cities = await fetchBostaCities();
    const q = norm(query || '');

    // إرجاع كل المحافظات مرتبة بالأقرب للإدخال
    const scored = cities.map(city => {
      const names = [city.nameAr, city.name, city.alias].filter(Boolean) as string[];
      let bestScore = 0;
      for (const name of names) {
        const n = norm(name);
        if (n === q) bestScore = Math.max(bestScore, 1);
        else if (n.startsWith(q) || q.startsWith(n)) bestScore = Math.max(bestScore, 0.8);
        else if (n.includes(q) || q.includes(n)) bestScore = Math.max(bestScore, 0.6);
        else {
          // حساب تشابه الأحرف
          let matches = 0;
          for (let i = 0; i < Math.min(n.length, q.length); i++) {
            if (n[i] === q[i]) matches++;
          }
          const score = q.length > 0 ? matches / Math.max(n.length, q.length) : 0;
          bestScore = Math.max(bestScore, score);
        }
      }
      return { nameAr: city.nameAr, name: city.name, _id: city._id, score: bestScore };
    });

    // ترتيب: الأعلى تطابقاً أولاً، ثم أبجدياً
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.nameAr.localeCompare(b.nameAr, 'ar');
    });

    // إرجاع أعلى 10 نتائج
    const suggestions = q.length > 0
      ? scored.filter(s => s.score > 0.2).slice(0, 10)
      : scored.slice(0, 27); // كل المحافظات إذا لم يكتب شيء

    return res.status(200).json({
      suggestions: suggestions.map(s => ({
        nameAr: s.nameAr,
        name: s.name,
        _id: s._id,
      })),
    });
  }

  // ── 2. اقتراح المنطقة (مع تحليل العنوان الذكي) ──
  if (type === 'zone') {
    if (!governorate) {
      return res.status(200).json({ suggestions: [] });
    }

    // ابحث عن المدينة أولاً
    const cities = await fetchBostaCities();
    const govNorm = norm(governorate);
    const matchedCity = cities.find(c => {
      const names = [c.nameAr, c.name, c.alias].filter(Boolean) as string[];
      return names.some(n => norm(n) === govNorm || normalizeGovernorateName(n) === normalizeGovernorateName(governorate));
    });

    let cityId: string | undefined;
    if (matchedCity) {
      cityId = matchedCity._id;
    } else {
      const match = await smartMatchCityAndZone(normalizeGovernorateName(governorate));
      cityId = match.cityId;
    }

    if (!cityId) return res.status(200).json({ suggestions: [] });

    const zones = await fetchBostaZones(cityId);
    const q = norm(query || '');
    const addr = norm(address || '');

    // 🧠 دالة تسجيل المنطقة بناءً على العنوان
    // تبحث عن تطابقات بين اسم المنطقة ونص العنوان
    const scoreZoneByAddress = (zoneNameAr: string, zoneNameEn: string): number => {
      if (!addr || addr.length < 3) return 0;

      const znAr = norm(zoneNameAr || '');
      const znEn = (zoneNameEn || '').toLowerCase().trim();
      let bestScore = 0;

      // 1. تطابق كامل: اسم المنطقة بالكامل موجود في العنوان
      if (znAr.length >= 3 && addr.includes(znAr)) {
        // كلما كان الاسم أطول كلما كان التطابق أدق
        bestScore = Math.max(bestScore, 0.9 + (znAr.length / 100));
      }

      // 2. تطابق إنجليزي
      if (znEn.length >= 3 && addr.includes(znEn)) {
        bestScore = Math.max(bestScore, 0.85);
      }

      // 3. مطابقة كلمات — فقط للكلمات الطويلة بما يكفي (4+ أحرف)
      // لمنع كلمات قصيرة شائعة مثل "مدينه" من إنتاج تطابقات خاطئة
      const znWords = znAr.split(/\s+/).filter(w => w.length >= 2);
      const addrWords = addr.split(/[\s,،\-\/\.]+/).filter(w => w.length >= 2);
      
      for (const word of addrWords) {
        // كلمة من العنوان تطابق اسم المنطقة بالكامل (كلمة واحدة)
        if (znWords.length === 1 && znAr === word) {
          bestScore = Math.max(bestScore, 0.95);
        }
        // منطقة من كلمة واحدة: بداية مشتركة (4+ حروف فقط)
        else if (znWords.length === 1 && word.length >= 4 && znAr.length >= 4) {
          if (znAr.startsWith(word) || word.startsWith(znAr)) {
            bestScore = Math.max(bestScore, 0.7);
          }
        }
        // كلمة طويلة (4+) من العنوان تحتوي جزء مهم من اسم المنطقة
        else if (word.length >= 4 && znAr.length >= 4 && (word.includes(znAr) || znAr.includes(word))) {
          bestScore = Math.max(bestScore, 0.5);
        }
      }

      return bestScore;
    };

    // تسجيل كل منطقة
    const scoredZones = zones
      .filter((z: any) => z.dropOffAvailability)
      .map((z: any) => {
        const zn = norm(z.nameAr || '');

        // نقاط البحث النصي (ما كتبه المستخدم في خانة المنطقة)
        let queryScore = 0;
        if (q.length === 0) queryScore = 0; // لا bonus if no query
        else if (zn === q) queryScore = 1;
        else if (zn.startsWith(q) || q.startsWith(zn)) queryScore = 0.8;
        else if (zn.includes(q) || q.includes(zn)) queryScore = 0.6;
        else {
          // تشابه حرفي
          let matches = 0;
          for (let i = 0; i < Math.min(zn.length, q.length); i++) {
            if (zn[i] === q[i]) matches++;
          }
          queryScore = q.length > 0 ? (matches / Math.max(zn.length, q.length)) * 0.4 : 0;
        }

        // نقاط تحليل العنوان (ذكاء إضافي)
        const addressScore = scoreZoneByAddress(z.nameAr, z.name);

        // الدرجة النهائية: الأعلى من الاثنين + bonus إذا كلاهما موجود
        const finalScore = Math.max(queryScore, addressScore)
          + (queryScore > 0 && addressScore > 0 ? 0.1 : 0);

        return {
          nameAr: z.nameAr,
          name: z.name,
          score: finalScore,
          isAddressMatch: addressScore > 0.5, // علامة للعرض في UI
        };
      });

    // ترتيب: الأعلى تطابقاً أولاً
    scoredZones.sort((a: any, b: any) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.nameAr.localeCompare(b.nameAr, 'ar');
    });

    // إرجاع النتائج
    const results = q.length > 0
      ? scoredZones.filter((s: any) => s.score > 0.15).slice(0, 15)
      : scoredZones.slice(0, 20);

    return res.status(200).json({
      suggestions: results.map((s: any) => ({
        nameAr: s.nameAr,
        name: s.name,
        isAddressMatch: s.isAddressMatch || false,
      })),
    });
  }

  // ── 3. تحليل العنوان الذكي ──
  if (type === 'analyze-address') {
    if (!address || address.trim().length < 3) {
      return res.status(200).json({ suggestions: null });
    }

    const cleanAddr = sanitizeAddress(address);
    const parsed = parseAddressStructure(cleanAddr);

    try {
      const extraction = await extractCityAndZoneFromAddress(cleanAddr);
      const normalizedGov = governorate ? normalizeGovernorateName(governorate) : null;
      let match = null;

      if (extraction.extracted && extraction.city) {
        match = await smartMatchCityAndZone(extraction.city, extraction.zone);
      } else if (normalizedGov) {
        match = await smartMatchCityAndZone(normalizedGov);
      }

      // 🧠 إذا لم نجد المنطقة عبر smartMatch، نستخدم zone scoring من العنوان
      let bestZoneFromAddress: string | null = null;
      const effectiveGov = match?.city || (extraction.extracted ? extraction.city : null) || normalizedGov;
      if (effectiveGov && !match?.zone) {
        const cities = await fetchBostaCities();
        const govNorm2 = norm(effectiveGov);
        const mc = cities.find(c => {
          const names = [c.nameAr, c.name, c.alias].filter(Boolean) as string[];
          return names.some(n => norm(n) === govNorm2 || normalizeGovernorateName(n) === normalizeGovernorateName(effectiveGov));
        });
        if (mc) {
          const zones = await fetchBostaZones(mc._id);
          const addrNorm = norm(cleanAddr);
          let bestScore = 0;
          for (const z of zones) {
            const znAr = norm(z.nameAr || '');
            if (znAr.length < 3) continue;
            // تطابق كامل للاسم في العنوان
            if (addrNorm.includes(znAr)) {
              const score = 0.9 + (znAr.length / 100);
              if (score > bestScore) {
                bestScore = score;
                bestZoneFromAddress = z.nameAr;
              }
            }
          }
        }
      }

      return res.status(200).json({
        suggestions: {
          governorate: extraction.extracted ? extraction.city : null,
          area: extraction.extracted ? extraction.zone : null,
          matchedCity: match?.city || null,
          matchedZone: match?.zone || bestZoneFromAddress || null,
          building: parsed.buildingNumber || null,
          floor: parsed.floor || null,
          apartment: parsed.apartment || null,
          landmark: parsed.landmark || null,
        },
      });
    } catch (err) {
      console.error('🧠 [SUGGEST] خطأ في تحليل العنوان:', err);
      return res.status(200).json({
        suggestions: {
          building: parsed.buildingNumber || null,
          floor: parsed.floor || null,
          apartment: parsed.apartment || null,
          landmark: parsed.landmark || null,
        },
      });
    }
  }

  return res.status(400).json({ error: 'Invalid type. Use: governorate, zone, analyze-address' });
}
