import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchLeads, updateLead, getOrderStatistics, LeadRow, updateLeadsBatch } from '../../lib/googleSheets';

const EMPLOYEES = ['heba.', 'ahmed.', 'raed.'];
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
          const currentAssignments = { 'heba.': 0, 'ahmed.': 0, 'raed.': 0 };
          for (const lead of leads) {
            const assignee = (lead.assignee || '').trim();
            if (EMPLOYEES.includes(assignee)) {
              currentAssignments[assignee as keyof typeof currentAssignments]++;
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
              currentAssignments[a as keyof typeof currentAssignments] - 
              currentAssignments[b as keyof typeof currentAssignments]
            );
            
            const batch = slice.map((lead, index) => {
              const assigneeIndex = index % EMPLOYEES.length;
              const assignee = sortedEmployees[assigneeIndex];
              currentAssignments[assignee as keyof typeof currentAssignments]++;
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
      await updateLead(Number(rowNumber), updates);
      return res.status(200).json({ message: 'Lead updated successfully' });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
} 