import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchLeads, updateLeadsBatch, LeadRow } from '../../lib/googleSheets';

const EMPLOYEES = ['heba.', 'ahmed.', 'aisha.'];

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
    const currentCounts = { 'heba.': 0, 'ahmed.': 0, 'aisha.': 0 };
    for (const lead of leads) {
      const assignee = (lead.assignee || '').trim();
      if (EMPLOYEES.includes(assignee)) {
        currentCounts[assignee as keyof typeof currentCounts]++;
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
      currentCounts[a as keyof typeof currentCounts] - currentCounts[b as keyof typeof currentCounts]
    );

    // توزيع دفعي للحفاظ على الكوتا (حد أقصى 100 في الدفعة الواحدة)
    const maxBatchSize = 100;
    let distributed = 0;
    const totalToDistribute = Math.min(unassigned.length, maxBatchSize);
    
    const updates: Array<{ rowNumber: number; assignee: string }> = [];
    
    for (let i = 0; i < totalToDistribute; i++) {
      const employeeIndex = i % EMPLOYEES.length;
      const assignee = sortedEmployees[employeeIndex];
      currentCounts[assignee as keyof typeof currentCounts]++;
      
      updates.push({
        rowNumber: unassigned[i].rowIndex,
        assignee: assignee
      });
      distributed++;
    }

    if (updates.length > 0) {
      await updateLeadsBatch(updates);
      console.log(`✅ تم توزيع ${distributed} ليد بنجاح`);
    }

    // حساب التوزيع النهائي
    const finalCounts = { ...currentCounts };
    const balance = Math.max(...Object.values(finalCounts)) - Math.min(...Object.values(finalCounts));
    
    res.status(200).json({ 
      message: `تم التوزيع بنجاح! وُزعت ${distributed} ليد`,
      distributed: distributed,
      currentDistribution: finalCounts,
      remainingUnassigned: unassigned.length - distributed,
      balanceDifference: balance,
      isBalanced: balance <= Math.ceil(leads.length * 0.1) // 10% كحد أقصى للاختلاف
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