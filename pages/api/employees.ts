import type { NextApiRequest, NextApiResponse } from 'next';
import { getEmployeesWithDisplayNames } from '../../lib/employees';

/**
 * API endpoint لجلب قائمة الموظفين وأسماء العرض
 * يُستخدم من الواجهة الأمامية لعرض الأسماء ديناميكياً بدون hardcode
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const employees = getEmployeesWithDisplayNames();
    
    // إنشاء خريطة اسم المستخدم ← اسم العرض
    const displayMap: Record<string, string> = {};
    employees.forEach(emp => {
      displayMap[emp.username] = emp.displayName;
    });

    return res.status(200).json({
      employees,
      displayMap,
      count: employees.length,
    });
  } catch (error) {
    console.error('❌ خطأ في جلب بيانات الموظفين:', error);
    return res.status(500).json({ message: 'خطأ في جلب بيانات الموظفين' });
  }
}
