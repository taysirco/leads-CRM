import useSWR from 'swr';
import { useState } from 'react';

const fetcher = (url: string) => fetch(url).then(r => r.json());

type EmployeeStats = {
  total: number;
  new: number;
  confirmed: number;
  pending: number;
  rejected: number;
  noAnswer: number;
  contacted: number;
  shipped: number;
  today: number;
};

export default function EmployeeReports() {
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const { data, error, isLoading } = useSWR('/api/orders?stats=true', fetcher, { 
    refreshInterval: 15000,
    revalidateOnFocus: true 
  });
  
  if (isLoading) return <div className="text-center py-8">جاري تحميل التقارير...</div>;
  if (error) return <div className="text-center py-8 text-red-600">خطأ في تحميل التقارير</div>;

  const stats = data?.data;
  const byAssignee = stats?.byAssignee || {};
  const byAssigneeByProduct = stats?.byAssigneeByProduct || {};

  // حساب إحصائيات شاملة ومؤشرات الأداء
  const employees = ['heba.', 'ahmed.', 'raed.'];
  const totalLeads = Object.values(byAssignee).reduce((sum: number, emp: any) => sum + emp.total, 0);
  
  // حساب معدلات التحويل لكل موظف
  const getConversionRate = (emp: EmployeeStats) => {
    const processed = emp.confirmed + emp.rejected;
    return processed > 0 ? ((emp.confirmed / processed) * 100).toFixed(1) : '0.0';
  };

  // حساب معدل الرد
  const getResponseRate = (emp: EmployeeStats) => {
    const responded = emp.confirmed + emp.rejected + emp.pending + emp.contacted;
    return emp.total > 0 ? ((responded / emp.total) * 100).toFixed(1) : '0.0';
  };

  // فحص التوازن في التوزيع
  const checkDistributionBalance = () => {
    const counts = employees.map(emp => byAssignee[emp]?.total || 0);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    const difference = max - min;
    const maxAllowed = Math.ceil(totalLeads * 0.1); // 10% كحد أقصى للاختلاف
    
    return {
      isBalanced: difference <= maxAllowed,
      difference,
      maxAllowed,
      counts: Object.fromEntries(employees.map((emp, i) => [emp, counts[i]]))
    };
  };

  const balance = checkDistributionBalance();

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">📊 تقارير الموظفين - لوحة المراقبة</h2>
        <div className="flex items-center gap-4">
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            balance.isBalanced 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {balance.isBalanced ? '✅ توزيع متوازن' : '⚠️ توزيع غير متوازن'}
          </div>
          <span className="text-sm text-gray-600">آخر تحديث: {new Date().toLocaleTimeString('ar-EG')}</span>
        </div>
      </div>

      {/* إحصائيات إجمالية */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-semibold text-blue-900">إجمالي الليدز</h3>
          <p className="text-2xl font-bold text-blue-600">{totalLeads}</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <h3 className="font-semibold text-green-900">معدل التأكيد العام</h3>
          <p className="text-2xl font-bold text-green-600">
            {totalLeads > 0 ? (
              (Object.values(byAssignee).reduce((sum: number, emp: any) => sum + emp.confirmed, 0) / 
               Object.values(byAssignee).reduce((sum: number, emp: any) => sum + emp.confirmed + emp.rejected, 0) * 100
              ).toFixed(1)
            ) : '0.0'}%
          </p>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg">
          <h3 className="font-semibold text-yellow-900">في الانتظار</h3>
          <p className="text-2xl font-bold text-yellow-600">
            {Object.values(byAssignee).reduce((sum: number, emp: any) => sum + emp.pending + emp.contacted, 0)}
          </p>
        </div>
        <div className="bg-red-50 p-4 rounded-lg">
          <h3 className="font-semibold text-red-900">فارق التوزيع</h3>
          <p className="text-2xl font-bold text-red-600">{balance.difference}</p>
          <p className="text-xs text-red-500">الحد المسموح: {balance.maxAllowed}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* تقرير مفصل لكل موظف */}
        <div>
          <h3 className="font-semibold mb-4 text-lg">📈 أداء الموظفين المفصل</h3>
          <div className="space-y-4">
            {employees.map(emp => {
              const empData = byAssignee[emp] || { total: 0, confirmed: 0, rejected: 0, pending: 0, noAnswer: 0, contacted: 0, shipped: 0, new: 0, today: 0 };
              const conversionRate = getConversionRate(empData);
              const responseRate = getResponseRate(empData);
              const share = totalLeads > 0 ? ((empData.total / totalLeads) * 100).toFixed(1) : '0.0';
              
              return (
                <div key={emp} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-bold text-lg">{emp === 'heba.' ? '👩‍💼 هبة' : emp === 'ahmed.' ? '👨‍💼 أحمد' : '👨‍💼 رائد'}</h4>
                      <p className="text-sm text-gray-600">نصيب: {share}% من إجمالي الليدز</p>
                    </div>
                    <div className="text-right">
                      <div className={`px-2 py-1 rounded text-xs font-medium ${
                        parseFloat(conversionRate) >= 30 ? 'bg-green-100 text-green-800' :
                        parseFloat(conversionRate) >= 20 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        معدل التحويل: {conversionRate}%
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="text-center">
                      <p className="font-semibold text-blue-600">{empData.total}</p>
                      <p className="text-xs text-gray-500">إجمالي</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-green-600">{empData.confirmed}</p>
                      <p className="text-xs text-gray-500">مؤكد</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-red-600">{empData.rejected}</p>
                      <p className="text-xs text-gray-500">مرفوض</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-gray-600">{empData.noAnswer}</p>
                      <p className="text-xs text-gray-500">لم يرد</p>
                    </div>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>معدل الرد: {responseRate}%</span>
                      <span>في الانتظار: {empData.pending + empData.contacted}</span>
                      <span>اليوم: {empData.today}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* أداء حسب المنتج */}
        <div>
          <h3 className="font-semibold mb-4 text-lg">🛍️ الأداء حسب المنتج</h3>
          <div className="space-y-4 max-h-[500px] overflow-auto">
            {employees.map(emp => {
              const empProducts = byAssigneeByProduct[emp] || {};
              const empName = emp === 'heba.' ? 'هبة' : emp === 'ahmed.' ? 'أحمد' : 'رائد';
              
              return (
                <div key={emp} className="border rounded-lg p-4">
                  <h4 className="font-medium mb-3 text-gray-900">{empName}</h4>
                  {Object.keys(empProducts).length === 0 ? (
                    <p className="text-sm text-gray-500 italic">لا توجد منتجات مُعينة</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(empProducts)
                        .sort(([,a]: any, [,b]: any) => b.total - a.total)
                        .map(([product, stats]: any) => {
                          const productConversion = stats.confirmed + stats.rejected > 0 
                            ? ((stats.confirmed / (stats.confirmed + stats.rejected)) * 100).toFixed(1)
                            : '0.0';
                          
                          return (
                            <div key={product} className="flex justify-between items-center text-sm py-2 px-3 bg-gray-50 rounded">
                              <div className="flex-1">
                                <p className="font-medium text-gray-800 truncate">{product}</p>
                                <p className="text-xs text-gray-500">تحويل: {productConversion}%</p>
                              </div>
                              <div className="text-right space-x-2 rtl:space-x-reverse">
                                <span className="inline-block w-8 text-center text-green-600 font-medium">{stats.confirmed}</span>
                                <span className="inline-block w-8 text-center text-red-600 font-medium">{stats.rejected}</span>
                                <span className="inline-block w-10 text-center text-gray-700 font-medium text-xs border-r pr-2">{stats.total}</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* تحذيرات وتوصيات */}
      {!balance.isBalanced && (
        <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <h4 className="font-semibold text-orange-900 mb-2">⚠️ تحذير: عدم توازن في التوزيع</h4>
          <p className="text-sm text-orange-800 mb-2">
            هناك فارق كبير في توزيع الليدز بين الموظفين. الفارق الحالي: {balance.difference} (الحد المسموح: {balance.maxAllowed})
          </p>
          <div className="grid grid-cols-3 gap-4 text-sm">
            {employees.map(emp => (
              <div key={emp} className="text-center">
                <p className="font-medium">{emp === 'heba.' ? 'هبة' : emp === 'ahmed.' ? 'أحمد' : 'رائد'}</p>
                <p className="text-lg font-bold">{balance.counts[emp]}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-orange-600 mt-2">
            💡 توصية: استخدم زر "توزيع الليدز" لإعادة توزيع الليدز غير المُعينة بالتساوي.
          </p>
        </div>
      )}
    </div>
  );
} 