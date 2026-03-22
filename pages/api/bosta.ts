import type { NextApiRequest, NextApiResponse } from 'next';
import { createBostaDelivery } from '../../lib/bosta';
import { fetchLeads, updateLead } from '../../lib/googleSheets';
import { checkRateLimitByType, getClientIP } from '../../lib/rateLimit';

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

  const { orderIds, fulfillmentType } = req.body;

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return res.status(400).json({
      error: 'يجب تحديد طلب واحد على الأقل',
      message: 'أرسل مصفوفة orderIds في body',
    });
  }

  console.log(`🚚 [BOSTA API] طلب إنشاء ${orderIds.length} شحنة...`);

  try {
    // جلب بيانات الطلبات من Google Sheets
    const leads = await fetchLeads();

    const results: Array<{
      orderId: number;
      success: boolean;
      trackingNumber?: string;
      error?: string;
    }> = [];

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

      // إنشاء الشحنة على بوسطة
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
        fulfillmentType: fulfillmentType || 10,
      });

      if (bostaResult.success && bostaResult.trackingNumber) {
        // تحديث الطلب في Google Sheet برقم التتبع والحالة
        const now = new Date().toLocaleString('sv-SE', { timeZone: 'Africa/Cairo' });
        try {
          await updateLead(order.rowIndex, {
            status: 'تم الشحن',
            bostaTrackingNumber: bostaResult.trackingNumber,
            bostaState: 'تم الإنشاء',
            lastBostaUpdate: now,
          });

          console.log(`✅ [BOSTA API] تم الشحن وتحديث الطلب ${orderId} بنجاح`);
          results.push({
            orderId,
            success: true,
            trackingNumber: bostaResult.trackingNumber,
          });
        } catch (updateError: any) {
          console.error(`⚠️ [BOSTA API] تم إنشاء الشحنة لكن فشل تحديث الشيت:`, updateError);
          results.push({
            orderId,
            success: true,
            trackingNumber: bostaResult.trackingNumber,
            error: `تم الشحن (تتبع: ${bostaResult.trackingNumber}) لكن فشل تحديث الشيت: ${updateError.message}`,
          });
        }
      } else {
        results.push({
          orderId,
          success: false,
          error: bostaResult.error || 'خطأ غير معروف من بوسطة',
        });
      }
    }

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
