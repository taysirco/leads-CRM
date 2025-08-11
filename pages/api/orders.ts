import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchLeads, updateLead, getOrderStatistics, LeadRow, updateLeadsBatch } from '../../lib/googleSheets';
import { deductStock } from '../../lib/googleSheets';

// استخراج قائمة الموظفين من CALL_CENTER_USERS
function getEmployeesFromEnv(): string[] {
  const envVal = process.env.CALL_CENTER_USERS || '';
  const entries = envVal.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
  const users = entries.map(e => e.split(':')[0]).filter(Boolean);
  // fallback للأسماء الافتراضية
  const fallback = ['heba.', 'ahmed.', 'aisha.'];
  return users.length > 0 ? users : fallback;
}

const EMPLOYEES = getEmployeesFromEnv();
let lastAutoAssignAt = 0; // ms timestamp
let autoAssignInProgress = false; // منع التداخل

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
                          (now - lastAutoAssignAt > 120_000) && // مرة كل دقيقتين
                          req.query.noAutoAssign !== 'true'; // السماح بتجاهل التوزيع التلقائي
      
      if (canAutoAssign) {
        autoAssignInProgress = true;
        try {
          // حساب التوزيع الحالي
          const currentAssignments: Record<string, number> = Object.fromEntries(EMPLOYEES.map(e => [e, 0]));
          for (const lead of leads) {
            const assignee = (lead.assignee || '').trim();
            if (EMPLOYEES.includes(assignee)) {
              currentAssignments[assignee] = (currentAssignments[assignee] || 0) + 1;
            }
          }

          // العثور على الليدز غير المعينة
          const unassigned = leads.filter(l => !l.assignee || String(l.assignee).trim() === '');
          
          if (unassigned.length > 0) {
            // حد أقصى 20 تحديث في الدفعة الواحدة لتوفير الكوتا
            const batchSize = Math.min(20, unassigned.length);
            const slice = unassigned.slice(0, batchSize);
            
            // ترتيب الموظفين حسب أقل عدد ليدز مُعينة
            const sortedEmployees = EMPLOYEES.slice().sort((a, b) => 
              (currentAssignments[a] || 0) - (currentAssignments[b] || 0)
            );
            
            const batch = slice.map((lead, index) => {
              const assigneeIndex = index % EMPLOYEES.length;
              const assignee = sortedEmployees[assigneeIndex];
              currentAssignments[assignee] = (currentAssignments[assignee] || 0) + 1;
              return { 
                rowNumber: lead.rowIndex, 
                updates: { assignee } 
              };
            });

            await updateLeadsBatch(batch);
            lastAutoAssignAt = now;
            
            // إعادة جلب البيانات بعد التحديث
            leads = await fetchLeads();
            
            console.log(`✅ تم توزيع ${batch.length} ليد تلقائياً. التوزيع الحالي:`, currentAssignments);
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
        
        let stockResults: any[] = [];
        let failedOrders: number[] = [];
        
        // إذا كانت الحالة الجديدة "تم الشحن"، نحتاج لخصم المخزون لكل طلب
        if (status === 'تم الشحن') {
          const leads = await fetchLeads();
          
          for (const orderId of orders) {
            try {
              const targetLead = leads.find(lead => lead.id === Number(orderId));
              
              if (targetLead && targetLead.productName && targetLead.quantity) {
                const quantity = parseInt(targetLead.quantity) || 1;
                const productName = targetLead.productName || 'غير محدد';
                
                console.log(`🚚 معالجة شحن الطلب ${orderId}: ${quantity} × ${productName}`);
                
                const stockResult = await deductStock(productName, quantity, targetLead.id);
                stockResults.push({
                  orderId,
                  productName,
                  quantity,
                  ...stockResult
                });
                
                if (!stockResult.success) {
                  console.error(`❌ فشل خصم مخزون الطلب ${orderId}: ${stockResult.message}`);
                  failedOrders.push(orderId);
                }
              } else {
                console.error(`❌ لم يتم العثور على الطلب ${orderId} أو بيانات ناقصة`);
                failedOrders.push(orderId);
                stockResults.push({
                  orderId,
                  success: false,
                  message: 'لم يتم العثور على بيانات الطلب أو بيانات ناقصة'
                });
              }
            } catch (error) {
              console.error(`❌ خطأ في معالجة الطلب ${orderId}:`, error);
              failedOrders.push(orderId);
              stockResults.push({
                orderId,
                success: false,
                message: `خطأ في النظام: ${error}`
              });
            }
          }
          
          // إذا فشل أي طلب في خصم المخزون، أرجع خطأ مع التفاصيل
          if (failedOrders.length > 0) {
            const failedStockResults = stockResults.filter(r => !r.success);
            const errorDetails = failedStockResults.map(r => 
              `• الطلب ${r.orderId}: ${r.message}${r.availableQuantity !== undefined ? ` (متوفر: ${r.availableQuantity})` : ''}`
            ).join('\n');
            
            return res.status(400).json({
              error: 'فشل في شحن بعض الطلبات',
              stockError: true,
              message: `❌ لا يمكن شحن ${failedOrders.length} من ${orders.length} طلب بسبب نقص المخزون:\n\n${errorDetails}`,
              failedOrders,
              stockResults,
              successfulOrders: orders.filter((id: number) => !failedOrders.includes(id))
            });
          }
        }
        
        // تحديث جميع الطلبات إذا نجحت عمليات المخزون
        const updatePromises = orders.map((orderId: number) => updateLead(Number(orderId), { status }));
        await Promise.all(updatePromises);
        
        const response: any = {
          success: true,
          message: `تم تحديث ${orders.length} طلب بنجاح إلى حالة "${status}"`
        };
        
        if (stockResults.length > 0) {
          const totalDeducted = stockResults.reduce((sum, r) => sum + (r.quantity || 0), 0);
          response.message += `\n📦 تم خصم إجمالي ${totalDeducted} قطعة من المخزون`;
          response.stockResults = stockResults;
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
        
        // إذا تم تغيير الحالة إلى "تم الشحن"، اخصم من المخزون
        if (updates.status === 'تم الشحن') {
          try {
            // جلب بيانات الطلب للحصول على معلومات المنتج
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
            
            // التحقق من وجود البيانات المطلوبة للشحن
            const productName = targetLead!.productName?.trim();
            const quantityStr = targetLead!.quantity?.toString().trim();
            const orderId = targetLead!.id;
            
            if (!productName || !quantityStr) {
              console.error(`❌ بيانات ناقصة للطلب ${rowNumber}: منتج=${productName}, كمية=${quantityStr}`);
              return res.status(400).json({
                error: 'لا يمكن الشحن',
                stockError: true,
                message: 'بيانات الطلب غير مكتملة (اسم المنتج أو الكمية مفقود)'
              });
            }
            
            const quantity = parseInt(quantityStr) || 1;
            
            console.log(`🚚 محاولة شحن الطلب ${rowNumber}: ${quantity} × ${productName}`);
            
            // خصم المخزون وتسجيل النتيجة
            stockResult = await deductStock(productName, quantity, orderId);
            
            if (stockResult.success) {
              console.log(`✅ تم خصم المخزون بنجاح: ${stockResult.message}`);
            } else {
              console.error(`❌ فشل خصم المخزون: ${stockResult.message}`);
              
              // في حالة عدم توفر المخزون، منع تحديث الحالة إلى "تم الشحن"
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
              
              // في حالة أخطاء أخرى في المخزون
              return res.status(500).json({
                error: 'خطأ في نظام المخزون',
                stockError: true,
                message: `فشل في معالجة المخزون: ${stockResult.message}`
              });
            }
          } catch (stockError) {
            console.error(`❌ خطأ في خصم المخزون للطلب ${rowNumber}:`, stockError);
            
            // في حالة خطأ في النظام، منع الشحن أيضاً
            return res.status(500).json({
              error: 'خطأ في نظام المخزون',
              stockError: true,
              message: 'حدث خطأ أثناء التحقق من المخزون. يرجى المحاولة مرة أخرى أو التحقق من المخزون يدوياً.'
            });
          }
        }
        
        // تحديث الطلب فقط إذا لم تكن هناك مشاكل في المخزون
        await updateLead(Number(rowNumber), updates);
        
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