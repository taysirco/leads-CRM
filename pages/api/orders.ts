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
              return { rowNumber: lead.rowIndex, assignee };
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
    if (Array.isArray(req.body.orders)) {
      const { orders, status } = req.body;
      if (!orders || !status) {
        return res.status(400).json({ error: 'Array of orders and a status are required for bulk update' });
      }
      try {
        // للتحديث الجماعي، نحتاج للتحقق من خصم المخزون لكل طلب إذا كانت الحالة "تم الشحن"
        if (status === 'تم الشحن') {
          // جلب بيانات الطلبات للحصول على معلومات المنتجات
          const leads = await fetchLeads();
          const targetLeads = leads.filter(lead => orders.includes(lead.id));
          
          const stockWarnings: string[] = [];
          
          // محاولة خصم المخزون لكل طلب
          for (const lead of targetLeads) {
            try {
              const quantity = parseInt(lead.quantity) || 1;
              const result = await deductStock(lead.productName, quantity, lead.id);
              
              if (!result.success) {
                stockWarnings.push(`طلب #${lead.id}: ${result.message}`);
              }
            } catch (error) {
              console.error(`Error deducting stock for order ${lead.id}:`, error);
              stockWarnings.push(`طلب #${lead.id}: خطأ في خصم المخزون`);
            }
          }
          
          // إذا كان هناك تحذيرات، أرسلها مع النتيجة
          if (stockWarnings.length > 0) {
            const updatePromises = orders.map((orderId: number) => updateLead(Number(orderId), { status }));
            await Promise.all(updatePromises);
            
            return res.status(200).json({ 
              message: 'Bulk update successful', 
              stockWarnings,
              warning: 'تم التحديث مع وجود تحذيرات في المخزون'
            });
          }
        }
        
        const updatePromises = orders.map((orderId: number) => updateLead(Number(orderId), { status }));
        await Promise.all(updatePromises);
        return res.status(200).json({ message: 'Bulk update successful' });
      } catch (error: any) {
        console.error(`API: Failed to bulk update orders:`, error.message);
        return res.status(500).json({ error: error.message });
      }
    }

    const { rowNumber, ...updates } = req.body;
    if (!rowNumber) {
      return res.status(400).json({ error: 'rowNumber is required' });
    }
    
    try {
      let stockResult = null;
      
      // إذا تم تغيير الحالة إلى "تم الشحن"، اخصم من المخزون
      if (updates.status === 'تم الشحن') {
        try {
          // جلب بيانات الطلب للحصول على معلومات المنتج
          const leads = await fetchLeads();
          const targetLead = leads.find(lead => lead.id === Number(rowNumber));
          
          if (targetLead) {
            const quantity = parseInt(targetLead.quantity) || 1;
            stockResult = await deductStock(targetLead.productName, quantity, targetLead.id);
            
            console.log(`Stock deduction result for order ${rowNumber}:`, stockResult);
          }
        } catch (stockError) {
          console.error(`Error deducting stock for order ${rowNumber}:`, stockError);
          // لا نوقف العملية، لكن نسجل الخطأ
          stockResult = {
            success: false,
            message: 'خطأ في خصم المخزون'
          };
        }
      }
      
      // تحديث الطلب
      await updateLead(Number(rowNumber), updates);
      
      // إرسال النتيجة مع معلومات المخزون إذا كانت متوفرة
      const response: any = { message: 'Lead updated successfully' };
      
      if (stockResult) {
        response.stockResult = stockResult;
        if (!stockResult.success) {
          response.warning = stockResult.message;
        }
      }
      
      return res.status(200).json(response);
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
} 