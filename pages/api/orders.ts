import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchLeads, updateLead, getOrderStatistics } from '../../lib/googleSheets';

// Increase the timeout for this specific function
export const config = {
  maxDuration: 60, // Set timeout to 60 seconds
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method === 'GET') {
      if (req.query.stats === 'true') {
        const stats = await getOrderStatistics();
        return res.status(200).json({ data: stats });
      }
      
      const leads = await fetchLeads();
      return res.status(200).json({ data: leads });

    } else if (req.method === 'PUT') {
      if (Array.isArray(req.body.orders)) {
        const { orders, status } = req.body;
        if (!orders || !status) {
          return res.status(400).json({ error: 'Array of orders and a status are required for bulk update' });
        }
        const updatePromises = orders.map((orderId: number) => updateLead(Number(orderId), { status }));
        await Promise.all(updatePromises);
        return res.status(200).json({ message: 'Bulk update successful' });
      }

      const { rowNumber, ...updates } = req.body;
      if (!rowNumber) {
        return res.status(400).json({ error: 'rowNumber is required' });
      }
      
      console.log(`API: Updating row ${rowNumber} with updates:`, updates);
      await updateLead(Number(rowNumber), updates);
      console.log(`API: Successfully updated row ${rowNumber}`);
      return res.status(200).json({ message: 'Lead updated successfully' });

    } else {
      res.setHeader('Allow', ['GET', 'PUT']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error: any) {
    console.error(`API Error: ${error.message}`, {
      method: req.method,
      url: req.url,
      body: req.body,
    });
    // Ensure a response is always sent
    if (!res.headersSent) {
      return res.status(500).json({ error: `An internal server error occurred: ${error.message}` });
    }
  }
} 