import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchLeads, updateLead, getOrderStatistics, LeadRow, updateLeadsBatch } from '../../lib/googleSheets';
import { deductStock, deductStockBulk } from '../../lib/googleSheets';
import { checkRateLimitByType, getClientIP } from '../../lib/rateLimit';
import { validateStockAvailability, formatValidationError, atomicBulkShipping } from '../../lib/stockValidation';
import { getEmployeesFromEnv, getRoundRobinIndex, saveRoundRobinIndex } from '../../lib/employees';

const EMPLOYEES = getEmployeesFromEnv();
let lastAutoAssignAt = 0; // ms timestamp
let autoAssignInProgress = false; // منع التداخل
let hasRunInitialAutoAssign = false; // ضمان التوزيع التلقائي عند التشغيل الأول

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Rate Limiting - حماية من الطلبات الزائدة
  const clientIP = getClientIP(req);
  if (!checkRateLimitByType(clientIP, 'API')) {
    return res.status(429).json({
      error: 'تم تجاوز الحد الأقصى للطلبات',
      message: 'يرجى الانتظار دقيقة واحدة قبل المحاولة مرة أخرى'
    });
  }

  if (req.method === 'GET') {
    try {
      if (req.query.stats === 'true') {
        const stats = await getOrderStatistics();
        return res.status(200).json({ data: stats });
      }

      const role = req.cookies['user_role'] || 'admin';
      const username = decodeURIComponent(req.cookies['user_name'] || '');

      let leads = await fetchLeads();

      // توزيع تلقائي محسّن مع قيود صارمة لتجنب الكوتا
      const now = Date.now();
      const canAutoAssign = !autoAssignInProgress &&
        (!hasRunInitialAutoAssign || (now - lastAutoAssignAt > 60_000)) && // التشغيل الأول أو كل دقيقة
        req.query.noAutoAssign !== 'true'; // السماح بتجاهل التوزيع التلقائي

      if (canAutoAssign) {
        autoAssignInProgress = true;
        try {
          // حساب التوزيع الحالي بدقة
          const currentAssignments: Record<string, number> = {};
          EMPLOYEES.forEach(emp => {
            currentAssignments[emp] = 0;
          });

          // عد الليدز المعينة حالياً لكل موظف
          for (const lead of leads) {
            const assignee = (lead.assignee || '').trim();
            if (assignee && EMPLOYEES.includes(assignee)) {
              currentAssignments[assignee] = (currentAssignments[assignee] || 0) + 1;
            }
          }

          // العثور على الليدز غير المعينة
          const unassigned = leads.filter(l => !l.assignee || String(l.assignee).trim() === '');

          if (unassigned.length > 0) {
            // حد أقصى 50 تحديث في الدفعة الواحدة
            const batchSize = Math.min(50, unassigned.length);
            const slice = unassigned.slice(0, batchSize);

            // جلب مؤشر Round Robin المحفوظ
            let lastAutoAssignedIndex = await getRoundRobinIndex();

            // إنشاء دفعة التحديث مع توزيع ذكي ومتوازن
            const batch = [];

            for (let i = 0; i < slice.length; i++) {
              const lead = slice[i];

              // العثور على الموظفين الذين لديهم أقل عدد من الليدز
              const minCount = Math.min(...EMPLOYEES.map(emp => currentAssignments[emp] || 0));
              const employeesWithMinLeads = EMPLOYEES.filter(emp => (currentAssignments[emp] || 0) === minCount);
              
              // استخدام Round Robin بين الموظفين المتساوين لضمان العدالة
              let selectedIndex = 0;
              if (employeesWithMinLeads.length > 1) {
                // البحث عن الموظف التالي في الدورة
                const currentIndices = employeesWithMinLeads.map(emp => EMPLOYEES.indexOf(emp));
                const nextIndex = currentIndices.find(idx => idx > lastAutoAssignedIndex);
                if (nextIndex !== undefined) {
                  selectedIndex = employeesWithMinLeads.indexOf(EMPLOYEES[nextIndex]);
                } else {
                  selectedIndex = 0; // العودة للبداية
                }
              }
              
              const assignee = employeesWithMinLeads[selectedIndex];
              lastAutoAssignedIndex = EMPLOYEES.indexOf(assignee);
              currentAssignments[assignee] = (currentAssignments[assignee] || 0) + 1;

              batch.push({
                rowNumber: lead.rowIndex,
                updates: { assignee }
              });
            }

            // تنفيذ التحديث المجمع
            await updateLeadsBatch(batch);
            // حفظ مؤشر Round Robin بعد التوزيع
            await saveRoundRobinIndex(lastAutoAssignedIndex);
            lastAutoAssignAt = now;
            hasRunInitialAutoAssign = true;

            // إعادة جلب البيانات بعد التحديث
            leads = await fetchLeads();
          }
        } catch (e) {
          console.error('❌ فشل التوزيع التلقائي:', e);
          // في حالة فشل التوزيع، لا نؤثر على عرض البيانات
        } finally {
          autoAssignInProgress = false;
        }
      }

      // فلترة حسب الموظف إن كان وكيل
      let filtered: LeadRow[] = leads;
      if (role === 'agent' && username) {
        const normalized = (s: string) => (s || '').toLowerCase().trim();
        filtered = leads.filter(l => normalized(l.assignee || '') === normalized(username));
      }

      return res.status(200).json({ data: filtered });
    } catch (error: any) {
      console.error('خطأ في API orders:', error.message);
      return res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'PUT') {
    console.log('🔄 طلب PUT وصل إلى /api/orders');
    console.log('📝 البيانات المستلمة:', JSON.stringify(req.body, null, 2));

    // التحقق من نوع التحديث (جماعي أم فردي)
    const { orders, status, rowNumber } = req.body;

    console.log('🔍 تحليل نوع التحديث:');
    console.log(`  - orders: ${Array.isArray(orders) ? `مصفوفة بـ ${orders.length} عنصر` : 'غير موجود'}`);
    console.log(`  - status: ${status || 'غير موجود'}`);
    console.log(`  - rowNumber: ${rowNumber || 'غير موجود'}`);

    // التحديث الجماعي
    if (Array.isArray(orders) && status) {
      console.log('📦 تحديث جماعي مكتشف');
      try {
        console.log(`📦 تحديث جماعي: ${orders.length} طلب إلى حالة "${status}"`);

        // ✨ إذا كانت الحالة "تم الشحن"، استخدم العملية الذرية الآمنة
        if (status === 'تم الشحن') {
          console.log('🔒 [ATOMIC] استخدام العملية الذرية للشحن الآمن...');
          
          const atomicResult = await atomicBulkShipping(orders);
          
          if (!atomicResult.success) {
            // فشل كلي أو جزئي
            if (atomicResult.shippedOrders.length === 0) {
              // فشل كلي - لم يتم شحن أي طلب
              return res.status(400).json({
                error: 'لا يمكن إتمام الشحن',
                stockError: true,
                preValidationFailed: true,
                message: atomicResult.message,
                failedOrders: atomicResult.failedOrders,
                stockResults: atomicResult.stockResults
              });
            } else {
              // فشل جزئي - تم شحن بعض الطلبات فقط
              const errorDetails = atomicResult.stockResults
                .filter(r => !r.success)
                .map(r => `• الطلب ${r.orderId}: ${r.message}${r.availableQuantity !== undefined ? ` (متوفر: ${r.availableQuantity})` : ''}`)
                .join('\n');

              let productSummary = '';
              if (atomicResult.stockSummary?.productsSummary?.length > 0) {
                productSummary = '\n\n📋 ملخص المنتجات:\n';
                for (const product of atomicResult.stockSummary.productsSummary) {
                  productSummary += `• ${product.productName}: مطلوب ${product.totalQuantityRequested}، متوفر ${product.availableQuantity}${product.totalQuantityDeducted > 0 ? `، تم خصم ${product.totalQuantityDeducted}` : ''}\n`;
                }
              }

              return res.status(400).json({
                error: 'فشل في شحن بعض الطلبات',
                stockError: true,
                message: `❌ تم شحن ${atomicResult.shippedOrders.length} من ${orders.length} طلب فقط:\n\n${errorDetails}\n\n⚠️ تم إرجاع ${atomicResult.revertedOrders.length} طلب إلى حالتها الأصلية${productSummary}`,
                failedOrders: atomicResult.failedOrders,
                stockResults: atomicResult.stockResults,
                successfulOrders: atomicResult.shippedOrders,
                revertedOrders: atomicResult.revertedOrders,
                stockSummary: atomicResult.stockSummary
              });
            }
          }

          // نجاح كامل
          const response: any = {
            success: true,
            message: `✅ تم شحن ${atomicResult.shippedOrders.length} طلب بنجاح`
          };

          if (atomicResult.stockSummary) {
            response.message += `\n\n📦 تفاصيل خصم المخزون:`;
            response.message += `\n• إجمالي الطلبات: ${atomicResult.stockSummary.totalOrders}`;
            response.message += `\n• نجح: ${atomicResult.stockSummary.successfulOrders} طلب`;
            response.message += `\n• منتجات مختلفة: ${atomicResult.stockSummary.productsSummary?.length || 0}`;

            const totalDeducted = atomicResult.stockSummary.productsSummary?.reduce(
              (sum: number, product: any) => sum + product.totalQuantityDeducted,
              0
            ) || 0;
            response.message += `\n• إجمالي القطع المخصومة: ${totalDeducted}`;

            response.stockResults = atomicResult.stockResults;
            response.stockSummary = atomicResult.stockSummary;
          }

          return res.status(200).json(response);
        }

        // للحالات الأخرى (غير "تم الشحن") - تحديث عادي
        console.log('🔄 تحديث حالة الطلبات (غير شحن)...');
        const updatePromises = orders.map((orderId: number) => updateLead(Number(orderId), { status }));
        await Promise.all(updatePromises);
        console.log('✅ تم تحديث جميع الطلبات بنجاح');

        return res.status(200).json({
          success: true,
          message: `تم تحديث ${orders.length} طلب بنجاح إلى حالة "${status}"`
        });

      } catch (error: any) {
        console.error(`❌ خطأ في التحديث الجماعي:`, error.message);
        return res.status(500).json({
          error: 'خطأ في التحديث الجماعي',
          message: error.message
        });
      }
    }

    // التحديث الفردي
    else if (rowNumber) {
      console.log('👤 تحديث فردي مكتشف');
      console.log(`🎯 رقم الصف: ${rowNumber}`);

      const updates = { ...req.body };
      delete updates.rowNumber;

      console.log('📋 التحديثات المطلوبة:', JSON.stringify(updates, null, 2));

      try {
        console.log(`🚀 بدء تحديث الطلب ${rowNumber}...`);
        let stockResult = null;
        let originalStatus = null;
        let cachedTargetLead: any = null;

        // الخطوة 1: حفظ الحالة الأصلية إذا كان التحديث إلى "تم الشحن"
        if (updates.status === 'تم الشحن') {
          console.log('🔍 الخطوة 1: جلب الحالة الأصلية للطلب...');
          const leads = await fetchLeads();
          cachedTargetLead = leads.find(lead => lead.id === Number(rowNumber));

          if (!cachedTargetLead) {
            console.error(`❌ لم يتم العثور على الطلب ${rowNumber}`);
            return res.status(400).json({
              error: 'لا يمكن الشحن',
              stockError: true,
              message: 'لم يتم العثور على بيانات الطلب في النظام'
            });
          }

          originalStatus = cachedTargetLead.status || 'جديد';
          console.log(`📋 الحالة الأصلية للطلب ${rowNumber}: "${originalStatus}"`);

          // 🛡️ حماية من الخصم المزدوج — إذا كان الطلب بالفعل "تم الشحن" لا نخصم مرة أخرى
          if (originalStatus === 'تم الشحن') {
            console.log(`⚠️ [GUARD] الطلب ${rowNumber} بالفعل في حالة "تم الشحن" — لن يتم خصم المخزون مجدداً`);
            await updateLead(Number(rowNumber), updates);
            return res.status(200).json({
              success: true,
              message: 'الطلب محدث بالفعل — لم يتم خصم المخزون لأنه مشحون مسبقاً'
            });
          }

          // التحقق من وجود البيانات المطلوبة للشحن
          const productName = cachedTargetLead.productName?.trim();
          const quantityStr = cachedTargetLead.quantity?.toString().trim();

          // 📝 طلب يدوي بدون بيانات المنتج — أرشفة مباشرة بدون خصم مخزون
          if (!productName || !quantityStr) {
            console.log(`📝 [INDIVIDUAL] الطلب ${rowNumber} — بيانات المنتج غير مكتملة (المنتج: "${productName || ''}", الكمية: "${quantityStr || ''}") — أرشفة مباشرة بدون خصم مخزون`);
            await updateLead(Number(rowNumber), updates);
            return res.status(200).json({
              success: true,
              message: '✅ تم أرشفة الطلب بنجاح (بدون خصم مخزون — بيانات المنتج غير مكتملة)'
            });
          }
        }

        // الخطوة 2: خصم المخزون أولاً (قبل تحديث الشيت) — الترتيب الصحيح
        if (updates.status === 'تم الشحن') {
          console.log('🚚 الخطوة 2: خصم المخزون قبل تحديث الحالة...');
          try {
            const productName = cachedTargetLead.productName?.trim();
            const quantityStr = cachedTargetLead.quantity?.toString().trim();
            const orderId = cachedTargetLead.id;
            const quantity = parseInt(quantityStr!) || 1;

            console.log(`🚚 محاولة خصم مخزون الطلب ${rowNumber}: ${quantity} × ${productName}`);

            stockResult = await deductStock(productName!, quantity, orderId);

            if (!stockResult.success) {
              console.error(`❌ فشل خصم المخزون: ${stockResult.message}`);

              if (stockResult.message.includes('المخزون غير كافي')) {
                return res.status(400).json({
                  error: 'لا يمكن الشحن',
                  stockError: true,
                  message: `⚠️ ${stockResult.message}`,
                  availableQuantity: stockResult.availableQuantity,
                  requiredQuantity: quantity,
                  productName: productName
                });
              }

              return res.status(500).json({
                error: 'خطأ في نظام المخزون',
                stockError: true,
                message: `فشل في معالجة المخزون: ${stockResult.message}`
              });
            }

            console.log(`✅ تم خصم المخزون بنجاح: ${stockResult.message}`);
          } catch (stockError: any) {
            console.error(`❌ خطأ في خصم المخزون للطلب ${rowNumber}:`, stockError);
            return res.status(500).json({
              error: 'خطأ في نظام المخزون',
              stockError: true,
              message: `حدث خطأ أثناء التحقق من المخزون. يرجى المحاولة مرة أخرى.`
            });
          }
        }

        // الخطوة 3: تحديث حالة الطلب (بعد نجاح خصم المخزون)
        console.log('🔄 الخطوة 3: تحديث حالة الطلب...');
        await updateLead(Number(rowNumber), updates);
        console.log('✅ تم تحديث الطلب بنجاح');

        // إرسال النتيجة مع معلومات المخزون إذا كانت متوفرة
        const response: any = {
          success: true,
          message: 'تم تحديث الطلب بنجاح'
        };

        if (stockResult) {
          response.stockResult = stockResult;
          if (stockResult.success) {
            response.message += ` وتم خصم المخزون: ${stockResult.message}`;
          } else {
            response.warning = `تحذير المخزون: ${stockResult.message}`;
          }
        }

        return res.status(200).json(response);
      } catch (error: any) {
        console.error(`❌ خطأ في تحديث الطلب ${rowNumber}:`, error);
        return res.status(500).json({
          error: 'خطأ في النظام',
          message: error.message
        });
      }
    }

    // طلب غير صالح
    else {
      return res.status(400).json({
        error: 'طلب غير صالح',
        message: 'يجب تحديد إما orders و status للتحديث الجماعي، أو rowNumber للتحديث الفردي'
      });
    }
  } else {
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
} 