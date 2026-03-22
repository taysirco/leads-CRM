import type { NextApiRequest, NextApiResponse } from 'next';
import { mapBostaStateToCRM, verifyWebhookAuth } from '../../lib/bosta';
import { fetchLeads, updateLead } from '../../lib/googleSheets';
import type { BostaWebhookPayload } from '../../lib/bosta';

/**
 * API Route: /api/bosta-webhook
 * POST — يستقبل webhook من بوسطة عند تغير حالة الشحنة
 * 
 * يتم تسجيل الـ URL في لوحة تحكم بوسطة:
 * Settings → API Integration → Set Up Your Webhook
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // التحقق من صلاحية الطلب
  const authHeader = req.headers['authorization'] as string | undefined;
  if (!verifyWebhookAuth(authHeader)) {
    console.error('❌ [BOSTA WEBHOOK] طلب غير مصرح به');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const payload: BostaWebhookPayload = req.body;

  console.log(`📨 [BOSTA WEBHOOK] استلام تحديث حالة:`, JSON.stringify(payload, null, 2));

  // التحقق من البيانات الأساسية
  if (!payload || payload.state === undefined) {
    console.error('❌ [BOSTA WEBHOOK] بيانات غير صالحة');
    return res.status(400).json({ error: 'Invalid webhook payload' });
  }

  const { state, trackingNumber, businessReference, exceptionReason, numberOfAttempts, cod, timeStamp } = payload;

  // تحويل حالة بوسطة إلى حالة CRM
  const { crmStatus, bostaStateAr } = mapBostaStateToCRM(state);
  const now = new Date().toLocaleString('sv-SE', { timeZone: 'Africa/Cairo' });

  console.log(`🔄 [BOSTA WEBHOOK] الحالة: ${bostaStateAr} (كود: ${state}) → حالة CRM: "${crmStatus}"`);

  try {
    // البحث عن الطلب في Google Sheets
    const leads = await fetchLeads();
    let targetLead = null;

    // 1. البحث باستخدام businessReference (الطريقة الأساسية)
    if (businessReference) {
      // استخراج orderId من businessReference (صيغة: SMRKT-{id}-{date})
      const refMatch = businessReference.match(/SMRKT-(\d+)-/);
      if (refMatch) {
        const orderId = parseInt(refMatch[1]);
        targetLead = leads.find((l) => l.id === orderId);
        if (targetLead) {
          console.log(`✅ [BOSTA WEBHOOK] تم العثور على الطلب ${orderId} بالمرجع: ${businessReference}`);
        }
      }
    }

    // 2. البحث باستخدام رقم التتبع (طريقة بديلة)
    if (!targetLead && trackingNumber) {
      const trackingStr = String(trackingNumber);
      targetLead = leads.find((l) => l.bostaTrackingNumber === trackingStr);
      if (targetLead) {
        console.log(`✅ [BOSTA WEBHOOK] تم العثور على الطلب برقم التتبع: ${trackingStr}`);
      }
    }

    if (!targetLead) {
      console.warn(`⚠️ [BOSTA WEBHOOK] لم يتم العثور على الطلب — مرجع: ${businessReference}, تتبع: ${trackingNumber}`);
      // نُرجع 200 حتى لا تعيد بوسطة إرسال الـ webhook
      return res.status(200).json({
        received: true,
        warning: 'Order not found in CRM',
        businessReference,
        trackingNumber,
      });
    }

    // تجميع ملاحظات الحالة
    let statusNote = `\u200F${bostaStateAr}`;
    if (exceptionReason) {
      statusNote += ` - ${exceptionReason}`;
    }
    if (numberOfAttempts && numberOfAttempts > 0) {
      statusNote += ` (محاولة ${numberOfAttempts})`;
    }
    if (cod && state === 45) {
      statusNote += ` | تحصيل: ${cod} جنيه`;
    }

    // تحديث الطلب في Google Sheet
    const updates: Record<string, string> = {
      status: crmStatus,
      bostaState: bostaStateAr,
      lastBostaUpdate: now,
    };

    // حفظ رقم التتبع إذا لم يكن محفوظاً بالفعل
    if (trackingNumber && (!targetLead.bostaTrackingNumber || targetLead.bostaTrackingNumber.trim() === '')) {
      updates.bostaTrackingNumber = String(trackingNumber);
    }

    await updateLead(targetLead.rowIndex, updates as any);

    console.log(`✅ [BOSTA WEBHOOK] تم تحديث الطلب #${targetLead.id} → "${crmStatus}" (${bostaStateAr})`);

    return res.status(200).json({
      received: true,
      orderId: targetLead.id,
      newStatus: crmStatus,
      bostaState: bostaStateAr,
      trackingNumber: String(trackingNumber),
    });
  } catch (error: any) {
    console.error('❌ [BOSTA WEBHOOK] خطأ في معالجة الـ webhook:', error);
    // نُرجع 200 حتى لا تعيد بوسطة إرسال الـ webhook بسبب خطأ في النظام
    return res.status(200).json({
      received: true,
      error: 'Internal processing error',
      message: error.message,
    });
  }
}
