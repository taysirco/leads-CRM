import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchLeads, updateLeadsBatch } from '../../lib/googleSheets';
import { getEmployeesFromEnv } from '../../lib/employees';

/**
 * API لإعادة تعيين ليدز من موظف قديم لموظف جديد
 * أو إعادة توزيع كل الليدز بالتساوي بين الموظفين الحاليين
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const role = req.cookies['user_role'] || 'admin';
  if (role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden - Admin only' });
  }

  try {
    const { action, oldEmployee, newEmployee } = req.body;
    const EMPLOYEES = getEmployeesFromEnv();
    const leads = await fetchLeads();

    // إجراء 1: نقل ليدز من موظف قديم لموظف جديد
    if (action === 'transfer') {
      if (!oldEmployee || !newEmployee) {
        return res.status(400).json({ message: 'يجب تحديد الموظف القديم والجديد' });
      }

      const leadsToTransfer = leads.filter(l => (l.assignee || '').trim() === oldEmployee);
      
      if (leadsToTransfer.length === 0) {
        return res.status(200).json({ 
          message: `لا توجد ليدز معيّنة لـ ${oldEmployee}`,
          transferred: 0 
        });
      }

      console.log(`🔄 نقل ${leadsToTransfer.length} ليد من ${oldEmployee} إلى ${newEmployee}...`);

      const updates = leadsToTransfer.map(lead => ({
        rowNumber: lead.rowIndex,
        updates: { assignee: newEmployee }
      }));

      // تنفيذ على دفعات (50 في كل دفعة لتجنب كوتا API)
      const batchSize = 50;
      let totalTransferred = 0;
      for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize);
        await updateLeadsBatch(batch);
        totalTransferred += batch.length;
        console.log(`✅ تم نقل دفعة ${Math.ceil((i + 1) / batchSize)}/${Math.ceil(updates.length / batchSize)} (${totalTransferred}/${updates.length})`);
        
        // انتظار قصير بين الدفعات لتجنب كوتا
        if (i + batchSize < updates.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`✅ تم نقل ${totalTransferred} ليد من ${oldEmployee} إلى ${newEmployee} بنجاح`);

      return res.status(200).json({
        message: `تم نقل ${totalTransferred} ليد من ${oldEmployee} إلى ${newEmployee} بنجاح`,
        transferred: totalTransferred,
        oldEmployee,
        newEmployee
      });
    }

    // إجراء 2: إعادة توزيع كل الليدز بالتساوي
    if (action === 'redistribute') {
      console.log(`🔄 إعادة توزيع كل الليدز بالتساوي بين ${EMPLOYEES.length} موظف...`);

      const allAssignedLeads = leads.filter(l => {
        const assignee = (l.assignee || '').trim();
        return assignee !== '';
      });

      if (allAssignedLeads.length === 0) {
        return res.status(200).json({ message: 'لا توجد ليدز للتوزيع', redistributed: 0 });
      }

      // توزيع بالتساوي
      const leadsPerEmployee = Math.floor(allAssignedLeads.length / EMPLOYEES.length);
      const remainder = allAssignedLeads.length % EMPLOYEES.length;
      
      const updates: Array<{ rowNumber: number; updates: { assignee: string } }> = [];
      let currentIndex = 0;

      for (let empIdx = 0; empIdx < EMPLOYEES.length; empIdx++) {
        const count = leadsPerEmployee + (empIdx < remainder ? 1 : 0);
        for (let j = 0; j < count && currentIndex < allAssignedLeads.length; j++) {
          const lead = allAssignedLeads[currentIndex];
          updates.push({
            rowNumber: lead.rowIndex,
            updates: { assignee: EMPLOYEES[empIdx] }
          });
          currentIndex++;
        }
      }

      // تنفيذ على دفعات
      const batchSize = 50;
      let totalRedistributed = 0;
      for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize);
        await updateLeadsBatch(batch);
        totalRedistributed += batch.length;
        console.log(`✅ دفعة ${Math.ceil((i + 1) / batchSize)}/${Math.ceil(updates.length / batchSize)} (${totalRedistributed}/${updates.length})`);
        
        if (i + batchSize < updates.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // حساب التوزيع النهائي
      const finalDistribution: Record<string, number> = {};
      EMPLOYEES.forEach((emp, idx) => {
        finalDistribution[emp] = leadsPerEmployee + (idx < remainder ? 1 : 0);
      });

      console.log(`✅ تم إعادة توزيع ${totalRedistributed} ليد بالتساوي`);
      console.log(`📊 التوزيع النهائي:`, finalDistribution);

      return res.status(200).json({
        message: `تم إعادة توزيع ${totalRedistributed} ليد بالتساوي بين ${EMPLOYEES.length} موظف`,
        redistributed: totalRedistributed,
        distribution: finalDistribution
      });
    }

    return res.status(400).json({ message: 'إجراء غير صالح. استخدم transfer أو redistribute' });

  } catch (error) {
    console.error('❌ خطأ في إعادة التعيين:', error);
    return res.status(500).json({
      message: 'حدث خطأ أثناء إعادة التعيين',
      error: error instanceof Error ? error.message : 'خطأ غير معروف'
    });
  }
}
