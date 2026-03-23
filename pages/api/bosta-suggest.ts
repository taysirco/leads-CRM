import type { NextApiRequest, NextApiResponse } from 'next';
import {
  normalizeGovernorateName,
  smartMatchCityAndZone,
  extractCityAndZoneFromAddress,
  sanitizeAddress,
  parseAddressStructure,
} from '../../lib/bosta';

// ==================== Bosta Suggest API ====================
// يقدم اقتراحات ذكية للمحافظة والمنطقة بناءً على بيانات بوسطة الفعلية
// يُستخدم في نافذة التعديل (Edit Modal) لمساعدة موظف الكول سنتر

// 📦 كاش داخلي للمدن — يتم تحميله مرة واحدة فقط
let cachedCitiesList: { nameAr: string; name: string; _id: string; alias?: string }[] = [];
let cachedCitiesTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // ساعة

async function getCitiesList() {
  if (cachedCitiesList.length > 0 && Date.now() - cachedCitiesTimestamp < CACHE_TTL) {
    return cachedCitiesList;
  }
  try {
    const res = await fetch('https://app.bosta.co/api/v2/cities', {
      headers: { 'Authorization': process.env.BOSTA_API_KEY || '' },
    });
    const json = await res.json();
    cachedCitiesList = json?.data?.list || [];
    cachedCitiesTimestamp = Date.now();
    return cachedCitiesList;
  } catch {
    return cachedCitiesList;
  }
}

// 📦 كاش المناطق — يتم تحميلها لكل مدينة مرة واحدة
const cachedZones: Map<string, { data: any[]; timestamp: number }> = new Map();
const ZONES_CACHE_TTL = 30 * 60 * 1000; // 30 دقيقة

async function getZonesForCity(cityId: string) {
  // تحقق من الكاش
  const cached = cachedZones.get(cityId);
  if (cached && Date.now() - cached.timestamp < ZONES_CACHE_TTL) {
    return cached.data;
  }
  try {
    const res = await fetch(`https://app.bosta.co/api/v2/cities/${cityId}/zones`, {
      headers: { 'Authorization': process.env.BOSTA_API_KEY || '' },
    });
    const json = await res.json();
    const zones = (json?.data || []).filter((z: any) => z.dropOffAvailability);
    cachedZones.set(cityId, { data: zones, timestamp: Date.now() });
    return zones;
  } catch {
    return cached?.data || [];
  }
}

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
    const cities = await getCitiesList();
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

  // ── 2. اقتراح المنطقة ──
  if (type === 'zone') {
    if (!governorate) {
      return res.status(200).json({ suggestions: [] });
    }

    // ابحث عن المدينة أولاً
    const cities = await getCitiesList();
    const govNorm = norm(governorate);
    const matchedCity = cities.find(c => {
      const names = [c.nameAr, c.name, c.alias].filter(Boolean) as string[];
      return names.some(n => norm(n) === govNorm || normalizeGovernorateName(n) === normalizeGovernorateName(governorate));
    });

    if (!matchedCity) {
      // fallback: استخدم smartMatch
      const match = await smartMatchCityAndZone(normalizeGovernorateName(governorate));
      if (!match.cityId) return res.status(200).json({ suggestions: [] });
      const zones = await getZonesForCity(match.cityId);
      const q = norm(query || '');

      const scoredZones = zones.map((z: any) => {
        const zn = norm(z.nameAr || '');
        let score = 0;
        if (q.length === 0) score = 1;
        else if (zn === q) score = 1;
        else if (zn.startsWith(q) || q.startsWith(zn)) score = 0.8;
        else if (zn.includes(q) || q.includes(zn)) score = 0.6;
        return { nameAr: z.nameAr, name: z.name, score };
      });

      scoredZones.sort((a: any, b: any) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.nameAr.localeCompare(b.nameAr, 'ar');
      });

      return res.status(200).json({
        suggestions: scoredZones.filter((s: any) => s.score > 0.2).slice(0, 15).map((s: any) => ({
          nameAr: s.nameAr,
          name: s.name,
        })),
      });
    }

    const zones = await getZonesForCity(matchedCity._id);
    const q = norm(query || '');

    const scoredZones = zones.map((z: any) => {
      const zn = norm(z.nameAr || '');
      let score = 0;
      if (q.length === 0) score = 1;
      else if (zn === q) score = 1;
      else if (zn.startsWith(q) || q.startsWith(zn)) score = 0.8;
      else if (zn.includes(q) || q.includes(zn)) score = 0.6;
      return { nameAr: z.nameAr, name: z.name, score };
    });

    scoredZones.sort((a: any, b: any) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.nameAr.localeCompare(b.nameAr, 'ar');
    });

    return res.status(200).json({
      suggestions: q.length > 0
        ? scoredZones.filter((s: any) => s.score > 0.2).slice(0, 15)
        : scoredZones.slice(0, 20),
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

      return res.status(200).json({
        suggestions: {
          governorate: extraction.extracted ? extraction.city : null,
          area: extraction.extracted ? extraction.zone : null,
          matchedCity: match?.city || null,
          matchedZone: match?.zone || null,
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
