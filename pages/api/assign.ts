import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchLeads, updateLeadsBatch, LeadRow } from '../../lib/googleSheets';
import { getEmployeesFromEnv, getRoundRobinIndex, saveRoundRobinIndex } from '../../lib/employees';

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

    // العثور على الليدز غير المعينة أو المعينة لموظف قديم غير موجود في القائمة
    const unassigned = leads.filter((l: any) => {
      const assignee = (l.assignee || '').trim();
      return !assignee || !EMPLOYEES.includes(assignee);
    });
    console.log(`📈 ليدز غير معينة أو معينة لموظف قديم: ${unassigned.length}`);

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

    // توزيع دفعي للحفاظ على الكوتا (حد أقصى 200 في الدفعة الواحدة)
    const maxBatchSize = 200;
    const totalToDistribute = Math.min(unassigned.length, maxBatchSize);

    const updates: Array<{ rowNumber: number; updates: { assignee: string } }> = [];

    // جلب مؤشر Round Robin المحفوظ
    let lastAssignedIndex = await getRoundRobinIndex();
    console.log(`📊 مؤشر Round Robin الحالي: ${lastAssignedIndex}`);

    // توزيع ذكي ومتوازن: نعطي الأولوية للموظف الذي لديه أقل ليدز
    for (let i = 0; i < totalToDistribute; i++) {
      const lead = unassigned[i];

      // العثور على الموظفين الذين لديهم أقل عدد من الليدز
      const minCount = Math.min(...EMPLOYEES.map(emp => currentCounts[emp] || 0));
      const employeesWithMinLeads = EMPLOYEES.filter(emp => (currentCounts[emp] || 0) === minCount);
      
      // استخدام Round Robin بين الموظفين المتساوين لضمان العدالة
      let selectedIndex = 0;
      if (employeesWithMinLeads.length > 1) {
        // البحث عن الموظف التالي في الدورة
        const currentIndices = employeesWithMinLeads.map(emp => EMPLOYEES.indexOf(emp));
        const nextIndex = currentIndices.find(idx => idx > lastAssignedIndex);
        if (nextIndex !== undefined) {
          selectedIndex = employeesWithMinLeads.indexOf(EMPLOYEES[nextIndex]);
        } else {
          selectedIndex = 0; // العودة للبداية
        }
      }
      
      const assignee = employeesWithMinLeads[selectedIndex];
      lastAssignedIndex = EMPLOYEES.indexOf(assignee);

      // تحديث العداد المحلي لضمان التوزيع العادل في نفس الدفعة
      currentCounts[assignee] = (currentCounts[assignee] || 0) + 1;

      console.log(`📋 تعيين الليد #${lead.id} (صف ${lead.rowIndex}) للموظف: ${assignee} (إجمالي جديد: ${currentCounts[assignee]})`);

      updates.push({
        rowNumber: lead.rowIndex,
        updates: { assignee }
      });
    }

    console.log(`⚡ سيتم توزيع ${updates.length} ليد في هذه الدفعة`);

    // تنفيذ التحديث المجمع
    if (updates.length > 0) {
      await updateLeadsBatch(updates);
      // حفظ مؤشر Round Robin بعد التوزيع
      await saveRoundRobinIndex(lastAssignedIndex);
      console.log(`✅ تم توزيع ${updates.length} ليد بنجاح وحفظ مؤشر Round Robin: ${lastAssignedIndex}`);
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