import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function EmployeeReports() {
  const { data } = useSWR('/api/orders?stats=true', fetcher, { refreshInterval: 30000 });
  const stats = data?.data;

  const byAssignee = stats?.byAssignee || {};
  const byAssigneeByProduct = stats?.byAssigneeByProduct || {};

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4 text-gray-900">تقارير الموظفين</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-semibold mb-2">ملخص حسب الموظف</h3>
          <div className="space-y-2">
            {Object.entries(byAssignee).map(([assignee, s]: any) => (
              <div key={assignee} className="p-3 border rounded-lg flex justify-between text-sm">
                <span className="font-medium">{assignee === 'غير معين' ? 'غير معيّن' : assignee}</span>
                <span>إجمالي: {s.total}</span>
                <span className="text-green-700">تأكيد: {s.confirmed}</span>
                <span className="text-red-700">رفض: {s.rejected}</span>
                <span className="text-yellow-700">انتظار: {s.pending}</span>
                <span className="text-gray-700">لم يرد: {s.noAnswer}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-semibold mb-2">حسب الموظف والمنتج</h3>
          <div className="space-y-4 max-h-[400px] overflow-auto pr-2">
            {Object.entries(byAssigneeByProduct).map(([assignee, products]: any) => (
              <div key={assignee} className="border rounded-lg p-3">
                <div className="font-medium mb-2">{assignee === 'غير معين' ? 'غير معيّن' : assignee}</div>
                <div className="space-y-1">
                  {Object.entries(products).map(([product, s]: any) => (
                    <div key={product} className="text-sm flex justify-between">
                      <span className="text-gray-800">{product}</span>
                      <span>تأكيد: {s.confirmed} | رفض: {s.rejected} | إجمالي: {s.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 