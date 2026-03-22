import type { NextApiRequest, NextApiResponse } from 'next';
import {
  validateEgyptianPhone,
  sanitizeAddress,
  normalizeGovernorateName,
  smartMatchCityAndZone,
  extractCityAndZoneFromAddress,
  parseAddressStructure,
} from '../../lib/bosta';

/**
 * 🧠 API تدقيق بيانات الطلب ضد بوسطة — يُستدعى عند تأكيد الطلب
 * 
 * يُرجع:
 * - corrections: تصحيحات مقترحة (المحافظة، المنطقة)
 * - warnings: تحذيرات (عنوان قصير، هاتف غير صالح...)
 * - enrichments: بيانات مستخرجة (مبنى، دور، شقة، علامة مميزة)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { phone, address, governorate, area } = req.body;

  const result: {
    valid: boolean;
    corrections: Record<string, string>;
    warnings: string[];
    enrichments: Record<string, string>;
    details: string[];
  } = {
    valid: true,
    corrections: {},
    warnings: [],
    enrichments: {},
    details: [],
  };

  // ── 1. تدقيق الهاتف ──
  if (phone) {
    const phoneValidation = validateEgyptianPhone(phone);
    if (!phoneValidation.valid) {
      result.warnings.push(`📱 ${phoneValidation.error}`);
      result.valid = false;
    } else if (phoneValidation.formatted !== phone) {
      result.corrections['phone'] = phoneValidation.formatted;
      result.details.push(`📱 تم تنسيق الهاتف: ${phone} → ${phoneValidation.formatted}`);
    }
  } else {
    result.warnings.push('📱 رقم الهاتف فارغ');
    result.valid = false;
  }

  // ── 2. تدقيق العنوان ──
  if (address) {
    const cleanAddress = sanitizeAddress(address);
    if (cleanAddress.length < 5) {
      result.warnings.push(`📍 العنوان قصير جداً (${cleanAddress.length} حروف — المطلوب 5 على الأقل)`);
    }

    // 🏗️ استخراج بنية العنوان
    const parts = parseAddressStructure(cleanAddress);
    if (parts.buildingNumber) result.enrichments['building'] = parts.buildingNumber;
    if (parts.floor) result.enrichments['floor'] = parts.floor === '0' ? 'أرضي' : parts.floor;
    if (parts.apartment) result.enrichments['apartment'] = parts.apartment;
    if (parts.landmark) result.enrichments['landmark'] = parts.landmark;

    // 🧠 استخراج المحافظة/المنطقة من العنوان إذا فارغة
    let effectiveGov = governorate;
    let effectiveArea = area;

    if (!effectiveGov || effectiveGov.trim() === '' || !effectiveArea || effectiveArea.trim() === '') {
      try {
        const extraction = await extractCityAndZoneFromAddress(cleanAddress);
        if (extraction.extracted) {
          if ((!effectiveGov || effectiveGov.trim() === '') && extraction.city) {
            effectiveGov = extraction.city;
            result.corrections['governorate'] = extraction.city;
            result.details.push(`🧠 استخراج ذكي: المحافظة "${extraction.city}" من العنوان`);
          }
          if ((!effectiveArea || effectiveArea.trim() === '') && extraction.zone) {
            effectiveArea = extraction.zone;
            result.corrections['area'] = extraction.zone;
            result.details.push(`🧠 استخراج ذكي: المنطقة "${extraction.zone}" من العنوان`);
          }
        }
      } catch (err) {
        console.error('🧠 [VALIDATE] خطأ في استخراج العنوان:', err);
      }
    }

    // 🧠 مطابقة ذكية ضد قاعدة بيانات بوسطة
    if (effectiveGov) {
      try {
        const normalized = normalizeGovernorateName(effectiveGov);
        const match = await smartMatchCityAndZone(normalized, effectiveArea);

        if (match.city && match.city !== normalized) {
          result.corrections['governorate'] = match.city;
          result.details.push(`✅ تصحيح المحافظة: "${effectiveGov}" → "${match.city}"`);
        }
        if (match.zone && (!effectiveArea || match.zone !== effectiveArea)) {
          result.corrections['area'] = match.zone;
          result.details.push(`✅ تصحيح المنطقة: "${effectiveArea || '-'}" → "${match.zone}"`);
        }
        if (match.warning) {
          result.warnings.push(`🧠 ${match.warning}`);
        }
      } catch (err) {
        console.error('🧠 [VALIDATE] خطأ في مطابقة العنوان:', err);
      }
    } else {
      result.warnings.push('📍 المحافظة فارغة ولم يمكن استخراجها من العنوان');
    }
  } else {
    result.warnings.push('📍 العنوان فارغ');
    result.valid = false;
  }

  // ── 3. تدقيق السعر ──
  const price = parseInt(String(req.body.totalPrice || '0').replace(/\D/g, '')) || 0;
  if (price === 0) {
    result.warnings.push('💰 السعر = 0 (سيتم الشحن بدون تحصيل)');
  }

  return res.status(200).json(result);
}
