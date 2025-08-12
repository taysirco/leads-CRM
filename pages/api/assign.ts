import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchLeads, updateLeadsBatch, LeadRow } from '../../lib/googleSheets';

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
    console.log(`📊 إجمالي الليدز: ${leads.length}`);

    // حساب التوزيع الحالي بدقة
    const currentCounts: Record<string, number> = {};
    EMPLOYEES.forEach(emp => {
      currentCounts[emp] = 0;
    });
    
    // عد الليدز المعينة حالياً لكل موظف
    for (const lead of leads) {
      const assignee = (lead.assignee || '').trim();
      if (assignee && EMPLOYEES.includes(assignee)) {
        currentCounts[assignee] = (currentCounts[assignee] || 0) + 1;
      }
    }

    console.log(`📊 التوزيع الحالي:`, currentCounts);

    // العثور على الليدز غير المعينة
    const unassigned = leads.filter(l => !l.assignee || String(l.assignee).trim() === '');
    console.log(`📈 ليدز غير معينة: ${unassigned.length}`);

    if (unassigned.length === 0) {
      return res.status(200).json({ 
        message: 'لا توجد ليدز غير معيّنة للتوزيع.',
        currentDistribution: currentCounts,
        totalLeads: leads.length,
        distributed: 0,
        remainingUnassigned: 0,
        isBalanced: true,
        balanceDifference: 0
      });
    }

    // توزيع عادل: نبدأ بالموظف الذي لديه أقل عدد (ترتيب تصاعدي)
    const sortedEmployees = EMPLOYEES.slice().sort((a, b) => 
      (currentCounts[a] || 0) - (currentCounts[b] || 0)
    );

    console.log('👥 ترتيب الموظفين حسب العبء الحالي:', 
      sortedEmployees.map(emp => `${emp}: ${currentCounts[emp]}`).join(', '));

    // توزيع دفعي للحفاظ على الكوتا (حد أقصى 100 في الدفعة الواحدة)
    const maxBatchSize = 100;
    const totalToDistribute = Math.min(unassigned.length, maxBatchSize);
    
    const updates: Array<{ rowNumber: number; updates: { assignee: string } }> = [];
    
    // توزيع ذكي باستخدام Round-Robin مع مراعاة التوزيع الحالي
    for (let i = 0; i < totalToDistribute; i++) {
      // استخدام modulo للتوزيع الدائري
      const employeeIndex = i % EMPLOYEES.length;
      const assignee = sortedEmployees[employeeIndex];
      
      // تحديث العداد المحلي لضمان التوزيع العادل في نفس الدفعة
      currentCounts[assignee] = (currentCounts[assignee] || 0) + 1;
      
      console.log(`📋 تعيين الليد #${unassigned[i].id} (صف ${unassigned[i].rowIndex}) للموظف: ${assignee}`);
      
      updates.push({
        rowNumber: unassigned[i].rowIndex,
        updates: { assignee }
      });
    }

    console.log(`⚡ سيتم توزيع ${updates.length} ليد في هذه الدفعة`);

    // تنفيذ التحديث المجمع
    if (updates.length > 0) {
      await updateLeadsBatch(updates);
      console.log(`✅ تم توزيع ${updates.length} ليد بنجاح`);
    }

    // حساب التوزيع النهائي والإحصائيات
    const finalDistribution = { ...currentCounts };
    const distributed = updates.length;
    const remainingUnassigned = unassigned.length - distributed;
    
    // حساب التوازن في التوزيع
    const counts = Object.values(finalDistribution);
    const minCount = Math.min(...counts);
    const maxCount = Math.max(...counts);
    const balanceDifference = maxCount - minCount;
    const isBalanced = balanceDifference <= 1; // فرق أقل من أو يساوي 1 يعتبر متوازن

    console.log('📊 التوزيع النهائي:', finalDistribution);
    console.log(`📈 تم توزيع: ${distributed}, متبقي غير معين: ${remainingUnassigned}`);
    console.log(`⚖️ التوازن: ${isBalanced ? 'متوازن' : 'غير متوازن'} (فارق: ${balanceDifference})`);

    return res.status(200).json({
      message: `تم توزيع ${distributed} ليد بنجاح بين ${EMPLOYEES.length} موظف.`,
      currentDistribution: finalDistribution,
      totalLeads: leads.length,
      distributed,
      remainingUnassigned,
      isBalanced,
      balanceDifference
    });
  } catch (error) {
    console.error('❌ خطأ في التوزيع:', error);
    return res.status(500).json({ 
      message: 'حدث خطأ أثناء توزيع الليدز. يرجى المحاولة مرة أخرى.',
      error: error instanceof Error ? error.message : 'خطأ غير معروف'
    });
  }
} 