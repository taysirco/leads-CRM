import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchLeads, updateLeadsBatch, LeadRow } from '../../lib/googleSheets';

function getEmployeesFromEnv(): string[] {
  const envVal = process.env.CALL_CENTER_USERS || '';
  const entries = envVal.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
  const users = entries.map(e => e.split(':')[0]).filter(Boolean);
  const fallback = ['heba.', 'ahmed.', 'aisha.'];
  return users.length > 0 ? users : fallback;
}

const EMPLOYEES = getEmployeesFromEnv();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const role = req.cookies['user_role'] || 'admin';
  if (role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    console.log('🚀 بدء عملية التوزيع اليدوي...');
    const leads = await fetchLeads();

    // حساب التوزيع الحالي
    const currentCounts: Record<string, number> = Object.fromEntries(EMPLOYEES.map(e => [e, 0]));
    for (const lead of leads) {
      const assignee = (lead.assignee || '').trim();
      if (EMPLOYEES.includes(assignee)) {
        currentCounts[assignee] = (currentCounts[assignee] || 0) + 1;
      }
    }

    // العثور على الليدز غير المعينة
    const unassigned = leads.filter(l => !l.assignee || String(l.assignee).trim() === '');

    if (unassigned.length === 0) {
      return res.status(200).json({ 
        message: 'لا توجد ليدز غير معيّنة للتوزيع.',
        currentDistribution: currentCounts,
        totalLeads: leads.length
      });
    }

    console.log(`📊 التوزيع الحالي:`, currentCounts);
    console.log(`📈 ليدز غير معينة: ${unassigned.length}`);

    // توزيع عادل: نبدأ بالموظف الذي لديه أقل عدد
    const sortedEmployees = EMPLOYEES.slice().sort((a, b) => 
      (currentCounts[a] || 0) - (currentCounts[b] || 0)
    );

    // توزيع دفعي للحفاظ على الكوتا (حد أقصى 100 في الدفعة الواحدة)
    const maxBatchSize = 100;
    let distributed = 0;
    const totalToDistribute = Math.min(unassigned.length, maxBatchSize);
    
    const updates: Array<{ rowNumber: number; updates: { assignee: string } }> = [];
    
    for (let i = 0; i < totalToDistribute; i++) {
      const employeeIndex = i % EMPLOYEES.length;
      const assignee = sortedEmployees[employeeIndex];
      currentCounts[assignee] = (currentCounts[assignee] || 0) + 1;
      
      updates.push({
        rowNumber: unassigned[i].rowIndex,
        updates: { assignee }
      });
      distributed++;
    }

    if (updates.length > 0) {
      await updateLeadsBatch(updates);
      console.log(`✅ تم توزيع ${distributed} ليد بنجاح`);
    }

    // حساب التوزيع النهائي
    const finalCounts = { ...currentCounts };
    const values = Object.values(finalCounts);
    const balance = values.length ? Math.max(...values) - Math.min(...values) : 0;
    
    res.status(200).json({ 
      message: `تم التوزيع بنجاح! وُزعت ${distributed} ليد`,
      distributed,
      currentDistribution: finalCounts,
      remainingUnassigned: unassigned.length - distributed,
      balanceDifference: balance,
      isBalanced: values.length ? balance <= Math.ceil(leads.length * 0.1) : true
    });
  } catch (error: any) {
    console.error('❌ خطأ في التوزيع:', error);
    res.status(500).json({ 
      message: 'حدث خطأ أثناء التوزيع', 
      error: error.message,
      suggestion: 'يرجى المحاولة مرة أخرى بعد بضع دقائق لتجنب قيود API'
    });
  }
} 