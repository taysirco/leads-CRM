import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchLeads, updateLead, getOrderStatistics, LeadRow, updateLeadsBatch } from '../../lib/googleSheets';
import { deductStock } from '../../lib/googleSheets';

// استخراج قائمة الموظفين من CALL_CENTER_USERS
function getEmployeesFromEnv(): string[] {
  const fallback = ['heba.', 'ahmed.', 'aisha.'];
  const envVal = process.env.CALL_CENTER_USERS || '';
  
  if (!envVal || !envVal.trim()) {
    console.log('⚠️ لم يتم العثور على CALL_CENTER_USERS في متغيرات البيئة، استخدام القيم الافتراضية');
    return fallback;
  }
  
  const entries = envVal.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
  const users = entries.map(e => e.split(':')[0]).filter(Boolean);
  
  if (users.length === 0) {
    console.log('⚠️ لم يتم العثور على مستخدمين صالحين، استخدام القيم الافتراضية');
    return fallback;
  }
  
  console.log('✅ تم تحميل موظفي الكول سنتر:', users);
  return users;
}

const EMPLOYEES = getEmployeesFromEnv();
let lastAutoAssignAt = 0; // ms timestamp
let autoAssignInProgress = false; // منع التداخل
let hasRunInitialAutoAssign = false; // ضمان التوزيع التلقائي عند التشغيل الأول

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
          console.log('🔄 بدء التوزيع التلقائي...');
          
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

          console.log('📊 التوزيع الحالي قبل التوزيع التلقائي:', currentAssignments);

          // العثور على الليدز غير المعينة
          const unassigned = leads.filter(l => !l.assignee || String(l.assignee).trim() === '');
          
          if (unassigned.length > 0) {
            console.log(`📈 عدد الليدز غير المعينة: ${unassigned.length}`);
            
            // حد أقصى 50 تحديث في الدفعة الواحدة لضمان التوزيع السريع
            const batchSize = Math.min(50, unassigned.length);
            const slice = unassigned.slice(0, batchSize);
            
            // ترتيب الموظفين حسب أقل عدد ليدز مُعينة (التوزيع العادل)
            const sortedEmployees = EMPLOYEES.slice().sort((a, b) => 
              (currentAssignments[a] || 0) - (currentAssignments[b] || 0)
            );
            
            console.log('👥 ترتيب الموظفين حسب العبء الحالي:', sortedEmployees.map(emp => 
              `${emp}: ${currentAssignments[emp]}`).join(', '));
            
            // إنشاء دفعة التحديث مع توزيع ذكي ومتوازن
            const batch = [];
            
            // توزيع متوازن: نوزع الليدز على الموظفين بالتناوب
            for (let i = 0; i < slice.length; i++) {
              const lead = slice[i];
              
              // العثور على الموظف الذي لديه أقل ليدز حالياً
              const employeeWithLeastLeads = EMPLOYEES.reduce((minEmp, emp) => 
                (currentAssignments[emp] || 0) < (currentAssignments[minEmp] || 0) ? emp : minEmp
              );
              
              const assignee = employeeWithLeastLeads;
              
              // تحديث العداد المحلي لضمان التوزيع العادل في نفس الدفعة
              currentAssignments[assignee] = (currentAssignments[assignee] || 0) + 1;
              
              console.log(`📋 تعيين الليد #${lead.id} (صف ${lead.rowIndex}) للموظف: ${assignee} (إجمالي جديد: ${currentAssignments[assignee]})`);
              
              batch.push({ 
                rowNumber: lead.rowIndex, 
                updates: { assignee } 
              });
            }

            console.log(`⚡ سيتم توزيع ${batch.length} ليد في هذه الدفعة`);
            
            // تنفيذ التحديث المجمع
            await updateLeadsBatch(batch);
            lastAutoAssignAt = now;
            hasRunInitialAutoAssign = true; // تم تشغيل التوزيع التلقائي لأول مرة
            
            // إعادة جلب البيانات بعد التحديث للتأكد من التحديث
            leads = await fetchLeads();
            
            console.log(`✅ تم توزيع ${batch.length} ليد تلقائياً بنجاح`);
            console.log('📊 التوزيع المتوقع بعد التحديث:', currentAssignments);
          } else {
            console.log('ℹ️ لا توجد ليدز غير معينة للتوزيع التلقائي');
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
        
        // الخطوة 1: تحديث جميع الطلبات إلى الحالة الجديدة أولاً
        console.log('🔄 الخطوة 1: تحديث حالة الطلبات...');
        const updatePromises = orders.map((orderId: number) => updateLead(Number(orderId), { status }));
        await Promise.all(updatePromises);
        console.log('✅ تم تحديث جميع الطلبات بنجاح');
        
        let stockResults: any[] = [];
        let failedOrders: number[] = [];
        let ordersToRevert: number[] = [];
        
        // الخطوة 2: إذا كانت الحالة الجديدة "تم الشحن"، اخصم المخزون بعد التحديث
        if (status === 'تم الشحن') {
          console.log('🚚 الخطوة 2: خصم المخزون بعد تأكيد الشحن...');
          const leads = await fetchLeads();
          console.log(`📊 تم جلب ${leads.length} ليد من قاعدة البيانات`);
          
          for (const orderId of orders) {
            console.log(`\n🔍 معالجة الطلب ${orderId}...`);
            try {
              const targetLead = leads.find(lead => lead.id === Number(orderId));
              
              if (!targetLead) {
                console.error(`❌ لم يتم العثور على الطلب ${orderId} في قاعدة البيانات`);
                failedOrders.push(orderId);
                ordersToRevert.push(orderId);
                stockResults.push({
                  orderId,
                  success: false,
                  message: 'لم يتم العثور على الطلب في قاعدة البيانات'
                });
                continue;
              }
              
              // التحقق الصارم من البيانات المطلوبة
              const productName = (targetLead.productName || '').trim();
              const quantityStr = (targetLead.quantity || '').toString().trim();
              const quantity = parseInt(quantityStr) || 0;
              
              console.log(`📋 بيانات الطلب ${orderId}:`);
              console.log(`  - اسم المنتج: "${productName}"`);
              console.log(`  - الكمية (نص): "${quantityStr}"`);
              console.log(`  - الكمية (رقم): ${quantity}`);
              
              // التحقق من صحة البيانات
              if (!productName) {
                console.error(`❌ الطلب ${orderId}: اسم المنتج فارغ أو غير موجود`);
                failedOrders.push(orderId);
                ordersToRevert.push(orderId);
                stockResults.push({
                  orderId,
                  productName: 'غير محدد',
                  quantity: 0,
                  success: false,
                  message: 'اسم المنتج فارغ أو غير موجود'
                });
                continue;
              }
              
              if (quantity <= 0) {
                console.error(`❌ الطلب ${orderId}: الكمية غير صحيحة (${quantity})`);
                failedOrders.push(orderId);
                ordersToRevert.push(orderId);
                stockResults.push({
                  orderId,
                  productName,
                  quantity,
                  success: false,
                  message: `الكمية غير صحيحة: ${quantityStr} → ${quantity}`
                });
                continue;
              }
              
              // خصم المخزون
              console.log(`🚚 محاولة خصم المخزون للطلب ${orderId}: ${quantity} × ${productName}`);
              const stockResult = await deductStock(productName, quantity, targetLead.id);
              
              stockResults.push({
                orderId,
                productName,
                quantity,
                ...stockResult
              });
              
              if (stockResult.success) {
                console.log(`✅ نجح خصم المخزون للطلب ${orderId}: ${stockResult.message}`);
              } else {
                console.error(`❌ فشل خصم المخزون للطلب ${orderId}: ${stockResult.message}`);
                failedOrders.push(orderId);
                ordersToRevert.push(orderId);
              }
              
            } catch (error) {
              console.error(`❌ خطأ في معالجة الطلب ${orderId}:`, error);
              failedOrders.push(orderId);
              ordersToRevert.push(orderId);
              stockResults.push({
                orderId,
                productName: 'غير محدد',
                quantity: 0,
                success: false,
                message: `خطأ في النظام: ${error}`
              });
            }
          }
          
          console.log(`\n📊 ملخص خصم المخزون:`);
          console.log(`  - إجمالي الطلبات: ${orders.length}`);
          console.log(`  - نجحت: ${orders.length - failedOrders.length}`);
          console.log(`  - فشلت: ${failedOrders.length}`);
          console.log(`  - ستُرجع: ${ordersToRevert.length}`);
          
          if (stockResults.length > 0) {
            const successfulResults = stockResults.filter(r => r.success);
            const totalDeducted = successfulResults.reduce((sum, r) => sum + (r.quantity || 0), 0);
            console.log(`  - إجمالي المخصوم: ${totalDeducted} قطعة`);
          }
          
          // الخطوة 3: إرجاع الطلبات التي فشل خصم مخزونها إلى حالة سابقة
          if (ordersToRevert.length > 0) {
            console.log(`🔄 الخطوة 3: إرجاع ${ordersToRevert.length} طلب إلى حالة "تم التأكيد"...`);
            try {
              const revertPromises = ordersToRevert.map((orderId: number) => 
                updateLead(Number(orderId), { status: 'تم التأكيد' })
              );
              await Promise.all(revertPromises);
              console.log('✅ تم إرجاع الطلبات الفاشلة بنجاح');
            } catch (revertError) {
              console.error('❌ خطأ في إرجاع الطلبات:', revertError);
            }
            
            const failedStockResults = stockResults.filter(r => !r.success);
            const errorDetails = failedStockResults.map(r => {
              let detail = `• الطلب ${r.orderId} (${r.productName || 'غير محدد'}): ${r.message}`;
              if (r.availableQuantity !== undefined && r.quantity) {
                detail += ` | متوفر: ${r.availableQuantity} | مطلوب: ${r.quantity}`;
              } else if (r.quantity) {
                detail += ` | الكمية المطلوبة: ${r.quantity}`;
              }
              return detail;
            }).join('\n');
            
            const successfulOrders = orders.filter((id: number) => !failedOrders.includes(id));
            const successfulResults = stockResults.filter(r => r.success);
            const totalDeductedFromFailed = successfulResults.reduce((sum, r) => sum + (r.quantity || 0), 0);
            
            let detailedMessage = `❌ تم شحن ${successfulOrders.length} من ${orders.length} طلب فقط:\n\n`;
            detailedMessage += `✅ الطلبات الناجحة: ${successfulOrders.length}\n`;
            detailedMessage += `📦 إجمالي المخصوم من المخزون: ${totalDeductedFromFailed} قطعة\n\n`;
            detailedMessage += `❌ الطلبات الفاشلة (${failedOrders.length}):\n${errorDetails}\n\n`;
            detailedMessage += `🔄 تم إرجاع الطلبات الفاشلة إلى حالة "تم التأكيد"`;
            
            return res.status(400).json({
              error: 'فشل في شحن بعض الطلبات',
              stockError: true,
              message: detailedMessage,
              failedOrders,
              stockResults,
              successfulOrders,
              revertedOrders: ordersToRevert,
              summary: {
                total: orders.length,
                successful: successfulOrders.length,
                failed: failedOrders.length,
                totalDeducted: totalDeductedFromFailed
              }
            });
          }
        }
        
        const response: any = {
          success: true,
          message: `تم تحديث ${orders.length} طلب بنجاح إلى حالة "${status}"`
        };
        
        if (stockResults.length > 0) {
          const totalDeducted = stockResults.reduce((sum, r) => sum + (r.quantity || 0), 0);
          const successfulDeductions = stockResults.filter(r => r.success);
          const totalSuccessfulDeducted = successfulDeductions.reduce((sum, r) => sum + (r.quantity || 0), 0);
          
          response.message = `✅ تم تحديث ${orders.length} طلب بنجاح إلى حالة "${status}"`;
          response.message += `\n📦 تم خصم إجمالي ${totalSuccessfulDeducted} قطعة من المخزون`;
          response.message += `\n🎯 تفاصيل الخصم: ${successfulDeductions.length} منتج مختلف`;
          
          response.stockResults = stockResults;
          response.summary = {
            totalOrders: orders.length,
            totalDeducted: totalSuccessfulDeducted,
            productsAffected: successfulDeductions.length,
            allSuccessful: stockResults.every(r => r.success)
          };
        }
        
        return res.status(200).json(response);
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
        
        // الخطوة 1: حفظ الحالة الأصلية إذا كان التحديث إلى "تم الشحن"
        if (updates.status === 'تم الشحن') {
          console.log('🔍 الخطوة 1: جلب الحالة الأصلية للطلب...');
          const leads = await fetchLeads();
          const targetLead = leads.find(lead => lead.id === Number(rowNumber));
          
          if (!targetLead) {
            console.error(`❌ لم يتم العثور على الطلب ${rowNumber}`);
            return res.status(400).json({
              error: 'لا يمكن الشحن',
              stockError: true,
              message: 'لم يتم العثور على بيانات الطلب في النظام'
            });
          }
          
          originalStatus = targetLead.status || 'جديد';
          console.log(`📋 الحالة الأصلية للطلب ${rowNumber}: "${originalStatus}"`);
          
          // التحقق من وجود البيانات المطلوبة للشحن
          const productName = targetLead!.productName?.trim();
          const quantityStr = targetLead!.quantity?.toString().trim();
          
          if (!productName || !quantityStr) {
            console.error(`❌ بيانات ناقصة للطلب ${rowNumber}: منتج=${productName}, كمية=${quantityStr}`);
            return res.status(400).json({
              error: 'لا يمكن الشحن',
              stockError: true,
              message: 'بيانات الطلب غير مكتملة (اسم المنتج أو الكمية مفقود)'
            });
          }
        }
        
        // الخطوة 2: تحديث الطلب أولاً
        console.log('🔄 الخطوة 2: تحديث حالة الطلب...');
        await updateLead(Number(rowNumber), updates);
        console.log('✅ تم تحديث الطلب بنجاح');
        
        // الخطوة 3: إذا تم تغيير الحالة إلى "تم الشحن"، اخصم من المخزون بعد التحديث
        if (updates.status === 'تم الشحن') {
          console.log('🚚 الخطوة 3: خصم المخزون بعد تأكيد الشحن...');
          try {
            // جلب بيانات الطلب المحدثة
            const leads = await fetchLeads();
            const targetLead = leads.find(lead => lead.id === Number(rowNumber));
            
            const productName = targetLead!.productName?.trim();
            const quantityStr = targetLead!.quantity?.toString().trim();
            const orderId = targetLead!.id;
            const quantity = parseInt(quantityStr!) || 1;
            
            console.log(`🚚 محاولة خصم مخزون الطلب ${rowNumber}: ${quantity} × ${productName}`);
            
            // خصم المخزون وتسجيل النتيجة
            stockResult = await deductStock(productName!, quantity, orderId);
            
            if (stockResult.success) {
              console.log(`✅ تم خصم المخزون بنجاح: ${stockResult.message}`);
            } else {
              console.error(`❌ فشل خصم المخزون: ${stockResult.message}`);
              
              // الخطوة 4: إرجاع الطلب إلى حالته الأصلية في حالة فشل خصم المخزون
              console.log(`🔄 الخطوة 4: إرجاع الطلب ${rowNumber} إلى الحالة الأصلية "${originalStatus}"...`);
              try {
                await updateLead(Number(rowNumber), { status: originalStatus });
                console.log('✅ تم إرجاع الطلب إلى حالته الأصلية بنجاح');
              } catch (revertError) {
                console.error('❌ خطأ في إرجاع الطلب:', revertError);
              }
              
              // في حالة عدم توفر المخزون، إرجاع خطأ مع تفاصيل الإرجاع
              if (stockResult.message.includes('المخزون غير كافي')) {
                return res.status(400).json({
                  error: 'لا يمكن الشحن',
                  stockError: true,
                  message: `⚠️ ${stockResult.message}\n\n🔄 تم إرجاع الطلب إلى حالة "${originalStatus}"`,
                  availableQuantity: stockResult.availableQuantity,
                  requiredQuantity: quantity,
                  productName: productName,
                  revertedToStatus: originalStatus
                });
              }
              
              // في حالة أخطاء أخرى في المخزون
              return res.status(500).json({
                error: 'خطأ في نظام المخزون',
                stockError: true,
                message: `فشل في معالجة المخزون: ${stockResult.message}\n\n🔄 تم إرجاع الطلب إلى حالة "${originalStatus}"`,
                revertedToStatus: originalStatus
              });
            }
          } catch (stockError) {
            console.error(`❌ خطأ في خصم المخزون للطلب ${rowNumber}:`, stockError);
            
            // إرجاع الطلب إلى حالته الأصلية في حالة خطأ النظام
            console.log(`🔄 إرجاع الطلب ${rowNumber} إلى الحالة الأصلية "${originalStatus}" بسبب خطأ في النظام...`);
            try {
              await updateLead(Number(rowNumber), { status: originalStatus });
              console.log('✅ تم إرجاع الطلب إلى حالته الأصلية بنجاح');
            } catch (revertError) {
              console.error('❌ خطأ في إرجاع الطلب:', revertError);
            }
            
            return res.status(500).json({
              error: 'خطأ في نظام المخزون',
              stockError: true,
              message: `حدث خطأ أثناء التحقق من المخزون. تم إرجاع الطلب إلى حالة "${originalStatus}". يرجى المحاولة مرة أخرى أو التحقق من المخزون يدوياً.`,
              revertedToStatus: originalStatus
            });
          }
        }
        
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