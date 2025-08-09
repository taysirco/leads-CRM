import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchLeads, updateLead, getOrderStatistics, LeadRow } from '../../lib/googleSheets';

const EMPLOYEES = ['heba.', 'ahmed.', 'raed.'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      // Check if requesting stats
      if (req.query.stats === 'true') {
        const stats = await getOrderStatistics();
        return res.status(200).json({ data: stats });
      }
      
      const role = req.cookies['user_role'] || 'admin';
      const username = decodeURIComponent(req.cookies['user_name'] || '');

      let leads = await fetchLeads();

      // توزيع تلقائي: عيّن أي ليد غير معيّن على الموظف الأقل حملاً حالياً
      const counts: Record<string, number> = Object.fromEntries(EMPLOYEES.map(e => [e, 0]));
      for (const l of leads) {
        const a = (l.assignee || '').trim();
        if (EMPLOYEES.includes(a)) counts[a]++;
      }
      const unassigned = leads.filter(l => !l.assignee || String(l.assignee).trim() === '');
      const updates: Promise<any>[] = [];
      for (const l of unassigned) {
        // اختر الأقل عدداً الآن
        const nextAssignee = EMPLOYEES.slice().sort((a, b) => counts[a] - counts[b])[0];
        counts[nextAssignee]++;
        updates.push(updateLead(l.rowIndex, { assignee: nextAssignee }));
      }
      if (updates.length > 0) {
        await Promise.all(updates);
        // أعد الجلب بعد التوزيع
        leads = await fetchLeads();
      }

      // فلترة حسب الموظف إن كان وكيل
      let filtered: LeadRow[] = leads;
      if (role === 'agent' && username) {
        const normalized = (s: string) => (s || '').toLowerCase().trim();
        filtered = leads.filter(l => normalized(l.assignee || '') === normalized(username));
      }

      res.status(200).json({ data: filtered });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'PUT') {
    // Check for bulk update
    if (Array.isArray(req.body.orders)) {
      const { orders, status } = req.body;
      if (!orders || !status) {
        return res.status(400).json({ error: 'Array of orders and a status are required for bulk update' });
      }
      try {
        const updatePromises = orders.map((orderId: number) => updateLead(Number(orderId), { status }));
        await Promise.all(updatePromises);
        res.status(200).json({ message: 'Bulk update successful' });
      } catch (error: any) {
        console.error(`API: Failed to bulk update orders:`, error.message);
        res.status(500).json({ error: error.message });
      }
      return;
    }

    // Handle single order update
    const { rowNumber, ...updates } = req.body;
    if (!rowNumber) {
      return res.status(400).json({ error: 'rowNumber is required' });
    }
    try {
      console.log(`API: Updating row ${rowNumber} with updates:`, updates);
      await updateLead(Number(rowNumber), updates);
      console.log(`API: Successfully updated row ${rowNumber}`);
      res.status(200).json({ message: 'Lead updated successfully' });
    } catch (error: any) {
      console.error(`API: Failed to update row ${rowNumber}:`, error.message);
      res.status(500).json({ error: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'PUT']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
} 