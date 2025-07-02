import React from 'react';

interface DebugInfo {
  row: number;
  phone: any;
  phoneType: string;
  whatsapp: any;
  whatsappType: string;
}

interface DebugPanelProps {
  debugInfo: DebugInfo[];
}

export default function DebugPanel({ debugInfo }: DebugPanelProps) {
  if (!debugInfo || debugInfo.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center mb-6">
        <p className="text-yellow-800 font-medium">لم يتم العثور على أرقام للمعاينة في Google Sheet.</p>
        <p className="text-yellow-700 text-sm mt-1">
          هذه اللوحة تظهر تلقائيًا عند العثور على الأرقام: (1118920324, 1017986564, 1127289000).
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 text-white rounded-lg p-4 font-mono shadow-lg mb-6">
      <h3 className="text-lg font-bold text-yellow-300 border-b border-gray-600 pb-2 mb-3">
        [لوحة التشخيص] القيم الخام للأرقام من Google Sheets
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-400">
            <tr>
              <th className="text-left p-2">الصف في الشيت</th>
              <th className="text-left p-2">القيمة الخام (الهاتف)</th>
              <th className="text-left p-2">نوع البيانات</th>
              <th className="text-left p-2">القيمة الخام (الواتس)</th>
              <th className="text-left p-2">نوع البيانات</th>
            </tr>
          </thead>
          <tbody>
            {debugInfo.map((info, index) => (
              <tr key={index} className="border-t border-gray-700 hover:bg-gray-700">
                <td className="p-2 text-cyan-400">{info.row}</td>
                <td className="p-2 text-green-400">{String(info.phone) === 'null' ? 'فارغ (null)' : String(info.phone)}</td>
                <td className="p-2 text-yellow-400">{info.phoneType}</td>
                <td className="p-2 text-green-400">{String(info.whatsapp) === 'null' ? 'فارغ (null)' : String(info.whatsapp)}</td>
                <td className="p-2 text-yellow-400">{info.whatsappType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-gray-500">
        هذا التقرير يعرض البيانات كما استلمها النظام مباشرة من Google Sheets قبل أي معالجة. إذا ظهرت القيمة "فارغ (null)"، فهذا يعني أن المكتبة لم تستطع قراءة الخلية.
      </p>
    </div>
  );
} 