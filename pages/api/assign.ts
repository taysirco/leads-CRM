import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchLeads, updateLead, LeadRow } from '../../lib/googleSheets';

const EMPLOYEES = ['heba.', 'ahmed.', 'raed.'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const role = req.cookies['user_role'] || 'admin';
  if (role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }

  try {
    const leads = await fetchLeads();

    // نوزع فقط الليدز غير المعيّنة، على كل الحالات
    const unassigned = leads.filter(l => !l.assignee || String(l.assignee).trim() === '');

    if (unassigned.length === 0) {
      return res.status(200).json({ message: 'لا توجد ليدز غير معيّنة للتوزيع.' });
    }

    // عداد لكل موظف
    const counts: Record<string, number> = Object.fromEntries(EMPLOYEES.map(e => [e, 0]));

    // جولة دائرية
    let idx = 0;
    const updates: Promise<any>[] = [];
    for (const lead of unassigned) {
      const assignee = EMPLOYEES[idx % EMPLOYEES.length];
      idx++;
      updates.push(updateLead(lead.rowIndex, { assignee }));
      counts[assignee]++;
    }

    await Promise.all(updates);

    res.status(200).json({ message: 'تم التوزيع بنجاح', distributed: counts });
  } catch (error: any) {
    console.error('Assign error:', error);
    res.status(500).json({ message: 'حدث خطأ أثناء التوزيع', error: error.message });
  }
} 