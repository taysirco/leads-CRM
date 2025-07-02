import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchLeads, updateLead, getOrderStatistics } from '../../lib/googleSheets';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      // Check if requesting stats
      if (req.query.stats === 'true') {
        const stats = await getOrderStatistics();
        return res.status(200).json({ data: stats });
      }
      
      const { leads, debugInfo } = await fetchLeads();
      res.status(200).json({ data: leads, debugInfo });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'PUT') {
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