import type { NextApiRequest, NextApiResponse } from 'next';
import { createBostaDelivery, getTrackingUrl } from '../../lib/bosta';
import { fetchLeads, updateLead } from '../../lib/googleSheets';
import { checkRateLimitByType, getClientIP } from '../../lib/rateLimit';

// معالجة متوازية مع حد للتزامن — يمنع إغراق بوسطة بطلبات متزامنة
async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 3
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}

/**
 * API Route: /api/bosta
 * POST — إنشاء شحنة جديدة على بوسطة لطلب/طلبات محددة
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Rate Limiting
  const clientIP = getClientIP(req);
  if (!checkRateLimitByType(clientIP, 'API')) {
    return res.status(429).json({
      error: 'تم تجاوز الحد الأقصى للطلبات',
      message: 'يرجى الانتظار دقيقة واحدة قبل المحاولة مرة أخرى',
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { orderIds, fulfillmentType: rawFulfillmentType } = req.body;

  // التحقق من نوع الشحن — 10 (عادي) أو 25 (تبديل/Exchange) أو 30 (Fulfillment)
  const fulfillmentType = [10, 25, 30].includes(Number(rawFulfillmentType)) ? Number(rawFulfillmentType) : 10;

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return res.status(400).json({
      error: 'يجب تحديد طلب واحد على الأقل',
      message: 'أرسل مصفوفة orderIds في body',
    });
  }

  const typeLabel = fulfillmentType === 30 ? 'مخزون بوسطة' : fulfillmentType === 25 ? 'تبديل/Exchange' : 'عادي';
  console.log(`🚚 [BOSTA API] طلب إنشاء ${orderIds.length} شحنة (نوع: ${typeLabel})...`);

  try {
    // جلب بيانات الطلبات من Google Sheets
    const leads = await fetchLeads();

    const results: Array<{
      orderId: number;
      success: boolean;
      trackingNumber?: string;
      trackingUrl?: string;
      error?: string;
    }> = [];

    // 🧠 فلترة وتحضير الطلبات قبل الإرسال
    const validOrders: Array<{ order: any; orderId: number; effectiveFulfillment: number }> = [];

    for (const orderId of orderIds) {
      const order = leads.find((l) => l.id === Number(orderId));

      if (!order) {
        results.push({ orderId, success: false, error: `الطلب رقم ${orderId} غير موجود` });
        continue;
      }

      // التحقق من أن الطلب لم يُشحن مسبقاً
      if (order.bostaTrackingNumber && order.bostaTrackingNumber.trim() !== '') {
        results.push({
          orderId,
          success: false,
          error: `الطلب رقم ${orderId} تم شحنه مسبقاً - رقم التتبع: ${order.bostaTrackingNumber}`,
        });
        continue;
      }

      // التحقق من اكتمال البيانات المطلوبة
      if (!order.name || !order.phone || !order.governorate || !order.address) {
        const missing = [];
        if (!order.name) missing.push('الاسم');
        if (!order.phone) missing.push('الهاتف');
        if (!order.governorate) missing.push('المحافظة');
        if (!order.address) missing.push('العنوان');
        results.push({
          orderId,
          success: false,
          error: `بيانات ناقصة للطلب ${orderId}: ${missing.join(', ')}`,
        });
        continue;
      }

      // 🧠 ذكاء: كشف تلقائي لنوع التبديل من حالة الطلب
      const isExchangeByStatus = /تبديل|استبدال|exchange/i.test(order.status || '');
      const effectiveFulfillment = isExchangeByStatus ? 25 : fulfillmentType;
      if (isExchangeByStatus && fulfillmentType !== 25) {
        console.log(`🧠 [BOSTA API] كشف تلقائي: الطلب #${orderId} حالته "${order.status}" → تبديل (25)`);
      }

      // ⚠️ تحذير COD = 0 (ربما خطأ في البيانات)
      const codValue = parseInt(String(order.totalPrice || '0').replace(/\D/g, '')) || 0;
      if (codValue === 0) {
        console.warn(`⚠️ [BOSTA API] الطلب #${orderId} مبلغ التحصيل = 0 — تأكد من صحة السعر`);
      }

      validOrders.push({ order, orderId, effectiveFulfillment });
    }

    // ✅ معالجة متوازية — 3 طلبات في نفس الوقت
    const batchResults = await processBatch(validOrders, async ({ order, orderId, effectiveFulfillment }) => {
      const bostaResult = await createBostaDelivery({
        name: order.name,
        phone: order.phone,
        whatsapp: order.whatsapp,
        governorate: order.governorate,
        area: order.area,
        address: order.address,
        productName: order.productName,
        orderDetails: order.orderDetails,
        quantity: order.quantity,
        totalPrice: order.totalPrice,
        notes: order.notes,
        id: order.id,
        fulfillmentType: effectiveFulfillment,
      });

      if (bostaResult.success && bostaResult.trackingNumber) {
        const now = new Date().toLocaleString('sv-SE', { timeZone: 'Africa/Cairo' });
        const trackingUrl = getTrackingUrl(bostaResult.trackingNumber);
        try {
          await updateLead(order.rowIndex, {
            status: 'تم الشحن',
            bostaTrackingNumber: bostaResult.trackingNumber,
            bostaState: 'تم الإنشاء',
            lastBostaUpdate: now,
          });

          console.log(`✅ [BOSTA API] تم الشحن وتحديث الطلب ${orderId} بنجاح`);
          return {
            orderId,
            success: true,
            trackingNumber: bostaResult.trackingNumber,
            trackingUrl,
          };
        } catch (updateError: any) {
          console.error(`⚠️ [BOSTA API] تم إنشاء الشحنة لكن فشل تحديث الشيت:`, updateError);
          return {
            orderId,
            success: true,
            trackingNumber: bostaResult.trackingNumber,
            trackingUrl,
            error: `تم الشحن (تتبع: ${bostaResult.trackingNumber}) لكن فشل تحديث الشيت: ${updateError.message}`,
          };
        }
      } else {
        return {
          orderId,
          success: false,
          error: bostaResult.error || 'خطأ غير معروف من بوسطة',
        };
      }
    }, 3);

    results.push(...batchResults);

    // ملخص النتائج
    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    const statusCode = failedCount === orderIds.length ? 400 : 200;

    return res.status(statusCode).json({
      success: successCount > 0,
      message: `تم إنشاء ${successCount} شحنة من ${orderIds.length}${failedCount > 0 ? ` (فشل ${failedCount})` : ''}`,
      results,
      summary: { total: orderIds.length, success: successCount, failed: failedCount },
    });
  } catch (error: any) {
    console.error('❌ [BOSTA API] خطأ عام:', error);
    return res.status(500).json({
      error: 'خطأ في النظام',
      message: error.message || 'حدث خطأ أثناء إنشاء الشحنات',
    });
  }
}
