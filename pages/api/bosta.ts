import type { NextApiRequest, NextApiResponse } from 'next';
import { createBostaDelivery, getTrackingUrl } from '../../lib/bosta';
import { fetchLeads, updateLead, deductStock, fetchStock, findProductBySynonyms } from '../../lib/googleSheets';
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
    const validOrders: Array<{ order: any; orderId: number; effectiveFulfillment: number; bostaSku?: string }> = [];

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

      // التحقق من اكتمال البيانات المطلوبة (المحافظة ليست مطلوبة هنا — createBostaDelivery يستخرجها من العنوان)
      if (!order.name || !order.phone || !order.address) {
        const missing = [];
        if (!order.name) missing.push('الاسم');
        if (!order.phone) missing.push('الهاتف');
        if (!order.address) missing.push('العنوان');
        results.push({
          orderId,
          success: false,
          error: `بيانات ناقصة للطلب ${orderId}: ${missing.join(', ')}`,
        });
        continue;
      }

      // ✅ نوع الشحن يعتمد فقط على اختيار المستخدم (الراديو بوتن)
      const effectiveFulfillment = fulfillmentType;

      // 🏭 إذا كان شحن من مخزون بوسطة — ابحث عن BostaSKU للمنتج
      let bostaSku: string | undefined;
      if (effectiveFulfillment === 30) {
        const productName = order.productName?.trim();
        if (productName) {
          const { stockItems } = await fetchStock();
          const stockMatch = findProductBySynonyms(productName, stockItems);
          if (stockMatch?.bostaSku) {
            bostaSku = stockMatch.bostaSku;
            console.log(`🏭 [BOSTA API] منتج "${productName}" → BostaSKU: ${bostaSku}`);
          } else {
            results.push({
              orderId,
              success: false,
              error: `المنتج "${productName}" ليس له BostaSKU في نظام المخزون. أضف الكود في عمود BostaSKU في شيت المخزون.`,
            });
            continue;
          }
        }
      }

      // ⚠️ تحذير COD = 0 (ربما خطأ في البيانات)
      const codValue = parseInt(String(order.totalPrice || '0').replace(/\D/g, '')) || 0;
      if (codValue === 0) {
        console.warn(`⚠️ [BOSTA API] الطلب #${orderId} مبلغ التحصيل = 0 — تأكد من صحة السعر`);
      }

      validOrders.push({ order, orderId, effectiveFulfillment, bostaSku });
    }

    // ✅ معالجة متوازية — 3 طلبات في نفس الوقت
    const batchResults = await processBatch(validOrders, async ({ order, orderId, effectiveFulfillment, bostaSku }) => {
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
        bostaSku,
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

          // 📦 خصم المخزون المحلي — فقط إذا كان شحن من مخزوني (ليس من مخزون بوسطة)
          let stockWarning: string | undefined;

          if (effectiveFulfillment !== 30) {
            // ✅ شحن من مخزوني → خصم من المخزون المحلي
            const productName = order.productName?.trim();
            const quantity = parseInt(String(order.quantity || '1')) || 1;

            if (productName) {
              try {
                const stockResult = await deductStock(productName, quantity, orderId);
                if (stockResult.success) {
                  console.log(`📦 [BOSTA API] تم خصم ${quantity} × "${productName}" من المخزون المحلي`);
                } else {
                  stockWarning = stockResult.message;
                  console.warn(`⚠️ [BOSTA API] فشل خصم المخزون للطلب ${orderId}: ${stockResult.message}`);
                }
              } catch (stockErr: any) {
                stockWarning = stockErr.message || 'خطأ في خصم المخزون';
                console.error(`❌ [BOSTA API] خطأ في خصم المخزون للطلب ${orderId}:`, stockErr);
              }
            }
          } else {
            console.log(`🏭 [BOSTA API] شحن من مخزون بوسطة — لن يتم خصم المخزون المحلي للطلب ${orderId}`);
          }

          return {
            orderId,
            success: true,
            trackingNumber: bostaResult.trackingNumber,
            trackingUrl,
            ...(stockWarning ? { stockWarning } : {}),
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
