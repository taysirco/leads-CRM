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

  // حساب إحصائيات شاملة ومؤشرات الأداء بالمنطق الصحيح
  const employees = ['heba.', 'ahmed.', 'raed.'];
  
  // إجمالي الليدز المعينة للموظفين فقط (بدون غير المعين)
  const assignedLeads = employees.reduce((sum, emp) => sum + (byAssignee[emp]?.total || 0), 0);
  const totalLeads = Object.values(byAssignee).reduce((sum: number, emp: any) => sum + emp.total, 0);

  // دالة لحساب المؤكد الحقيقي (تأكيد + شحن)
  const getRealConfirmed = (emp: EmployeeStats) => emp.confirmed + emp.shipped;

  // دالة لحساب في الانتظار الحقيقي (جديد + لم يرد + انتظار + تواصل)
  const getRealWaiting = (emp: EmployeeStats) => emp.new + emp.noAnswer + emp.pending + emp.contacted;

  // دالة لحساب معدل التحويل الصحيح: (المؤكد الحقيقي / إجمالي الليدز) * 100
  const getConversionRate = (emp: EmployeeStats) => {
    const realConfirmed = getRealConfirmed(emp);
    return emp.total > 0 ? ((realConfirmed / emp.total) * 100).toFixed(1) : '0.0';
  };

  // دالة لحساب معدل الحسم: (المؤكد + المرفوض) / إجمالي الليدز * 100
  const getDecisionRate = (emp: EmployeeStats) => {
    const realConfirmed = getRealConfirmed(emp);
    const decided = realConfirmed + emp.rejected; // مؤكد + مرفوض
    return emp.total > 0 ? ((decided / emp.total) * 100).toFixed(1) : '0.0';
  };

  // دالة لحساب معدل الانتظار: (في الانتظار / إجمالي الليدز) * 100
  const getWaitingRate = (emp: EmployeeStats) => {
    const realWaiting = getRealWaiting(emp);
    return emp.total > 0 ? ((realWaiting / emp.total) * 100).toFixed(1) : '0.0';
  };

  // فحص التوازن في التوزيع
  const checkDistributionBalance = () => {
    const counts = employees.map(emp => byAssignee[emp]?.total || 0);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    const difference = max - min;
    const maxAllowed = Math.ceil(assignedLeads * 0.1); // 10% كحد أقصى للاختلاف
    
    return {
      isBalanced: difference <= maxAllowed,
      difference,
      maxAllowed,
      counts: Object.fromEntries(employees.map((emp, i) => [emp, counts[i]]))
    };
  };

  const balance = checkDistributionBalance();

  // حساب الإحصائيات الإجمالية بالمنطق الصحيح
  const overallStats = {
    totalLeads: assignedLeads,
    // المؤكد الحقيقي = تأكيد + شحن
    totalConfirmed: employees.reduce((sum, emp) => {
      const empData = byAssignee[emp] || { confirmed: 0, shipped: 0 };
      return sum + empData.confirmed + empData.shipped;
    }, 0),
    totalRejected: employees.reduce((sum, emp) => sum + (byAssignee[emp]?.rejected || 0), 0),
    // في الانتظار الحقيقي = جديد + لم يرد + انتظار + تواصل
    totalWaiting: employees.reduce((sum, emp) => {
      const empData = byAssignee[emp] || { new: 0, noAnswer: 0, pending: 0, contacted: 0 };
      return sum + empData.new + empData.noAnswer + empData.pending + empData.contacted;
    }, 0),
    // تفاصيل في الانتظار
    totalNew: employees.reduce((sum, emp) => sum + (byAssignee[emp]?.new || 0), 0),
    totalNoAnswer: employees.reduce((sum, emp) => sum + (byAssignee[emp]?.noAnswer || 0), 0),
    totalPending: employees.reduce((sum, emp) => sum + (byAssignee[emp]?.pending || 0), 0),
    totalContacted: employees.reduce((sum, emp) => sum + (byAssignee[emp]?.contacted || 0), 0),
    // تفاصيل المؤكد
    totalConfirmedOnly: employees.reduce((sum, emp) => sum + (byAssignee[emp]?.confirmed || 0), 0),
    totalShipped: employees.reduce((sum, emp) => sum + (byAssignee[emp]?.shipped || 0), 0),
  };

  // معدل التأكيد العام الصحيح (تأكيد + شحن)
  const overallConfirmationRate = assignedLeads > 0 
    ? ((overallStats.totalConfirmed / assignedLeads) * 100).toFixed(1)
    : '0.0';

  // معدل الحسم العام (مؤكد + مرفوض)
  const overallDecisionRate = assignedLeads > 0 
    ? (((overallStats.totalConfirmed + overallStats.totalRejected) / assignedLeads) * 100).toFixed(1)
    : '0.0';

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

      {/* إحصائيات إجمالية بالمنطق الصحيح */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-semibold text-blue-900">إجمالي الليدز المعينة</h3>
          <p className="text-2xl font-bold text-blue-600">{assignedLeads}</p>
          <p className="text-xs text-blue-500">من أصل {totalLeads} ليد</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <h3 className="font-semibold text-green-900">معدل التأكيد العام</h3>
          <p className="text-2xl font-bold text-green-600">{overallConfirmationRate}%</p>
          <p className="text-xs text-green-500">
            {overallStats.totalConfirmed} من {assignedLeads}
            (تأكيد: {overallStats.totalConfirmedOnly} + شحن: {overallStats.totalShipped})
          </p>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg">
          <h3 className="font-semibold text-yellow-900">في الانتظار</h3>
          <p className="text-2xl font-bold text-yellow-600">{overallStats.totalWaiting}</p>
          <p className="text-xs text-yellow-500">
            جديد: {overallStats.totalNew} | لم يرد: {overallStats.totalNoAnswer} | 
            انتظار: {overallStats.totalPending} | واتساب: {overallStats.totalContacted}
          </p>
        </div>
        <div className="bg-red-50 p-4 rounded-lg">
          <h3 className="font-semibold text-red-900">معدل الحسم</h3>
          <p className="text-2xl font-bold text-red-600">{overallDecisionRate}%</p>
          <p className="text-xs text-red-500">
            حُسم: {overallStats.totalConfirmed + overallStats.totalRejected} | 
            انتظار: {overallStats.totalWaiting}
          </p>
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
              const decisionRate = getDecisionRate(empData);
              const waitingRate = getWaitingRate(empData);
              const share = assignedLeads > 0 ? ((empData.total / assignedLeads) * 100).toFixed(1) : '0.0';
              
              const realConfirmed = getRealConfirmed(empData);
              const realWaiting = getRealWaiting(empData);
              
              return (
                <div key={emp} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-bold text-lg">{emp === 'heba.' ? '👩‍💼 هبة' : emp === 'ahmed.' ? '👨‍💼 أحمد' : '👨‍💼 رائد'}</h4>
                      <p className="text-sm text-gray-600">نصيب: {share}% من الليدز المعينة ({empData.total} ليد)</p>
                    </div>
                    <div className="text-right">
                      <div className={`px-2 py-1 rounded text-xs font-medium ${
                        parseFloat(conversionRate) >= 25 ? 'bg-green-100 text-green-800' :
                        parseFloat(conversionRate) >= 15 ? 'bg-yellow-100 text-yellow-800' :
                        parseFloat(conversionRate) >= 10 ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        معدل التحويل: {conversionRate}%
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                    <div className="text-center bg-green-100 p-2 rounded">
                      <p className="font-semibold text-green-700">{realConfirmed}</p>
                      <p className="text-xs text-green-600">مؤكد</p>
                      <p className="text-xs text-gray-500">({empData.confirmed} + {empData.shipped})</p>
                    </div>
                    <div className="text-center bg-red-100 p-2 rounded">
                      <p className="font-semibold text-red-700">{empData.rejected}</p>
                      <p className="text-xs text-red-600">مرفوض</p>
                    </div>
                    <div className="text-center bg-yellow-100 p-2 rounded">
                      <p className="font-semibold text-yellow-700">{realWaiting}</p>
                      <p className="text-xs text-yellow-600">في الانتظار</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-xs text-gray-600 pt-3 border-t">
                    <div className="text-center">
                      <span className="font-medium text-gray-700">معدل التحويل</span>
                      <div className="font-bold text-green-600">{conversionRate}%</div>
                      <span className="text-gray-500">({realConfirmed}/{empData.total})</span>
                    </div>
                    <div className="text-center">
                      <span className="font-medium text-gray-700">معدل الحسم</span>
                      <div className="font-bold text-blue-600">{decisionRate}%</div>
                      <span className="text-gray-500">تم البت فيه</span>
                    </div>
                    <div className="text-center">
                      <span className="font-medium text-gray-700">في الانتظار</span>
                      <div className="font-bold text-yellow-600">{waitingRate}%</div>
                      <span className="text-gray-500">يحتاج متابعة</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* أداء حسب المنتج بالمنطق المحسن */}
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
                          // معدل التحويل بالمنطق الصحيح: (confirmed + shipped) / total
                          const realConfirmed = stats.confirmed + stats.shipped;
                          const productConversion = stats.total > 0 
                            ? ((realConfirmed / stats.total) * 100).toFixed(1)
                            : '0.0';
                          
                          // معدل الحسم: (confirmed + shipped + rejected) / total  
                          const decided = realConfirmed + stats.rejected;
                          const decisionRate = stats.total > 0 
                            ? ((decided / stats.total) * 100).toFixed(1)
                            : '0.0';
                          
                          return (
                            <div key={product} className="flex justify-between items-center text-sm py-2 px-3 bg-gray-50 rounded">
                              <div className="flex-1">
                                <p className="font-medium text-gray-800 truncate">{product}</p>
                                <p className="text-xs text-gray-500">
                                  تحويل: {productConversion}% | حسم: {decisionRate}% 
                                  ({decided}/{stats.total})
                                </p>
                              </div>
                              <div className="text-right space-x-2 rtl:space-x-reverse">
                                <span className="inline-block w-8 text-center text-green-600 font-medium" title="مؤكد (تأكيد + شحن)">{realConfirmed}</span>
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

      {/* معلومات إضافية وإحصائيات تفصيلية محسنة */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-purple-50 p-4 rounded-lg">
          <h4 className="font-semibold text-purple-900 mb-2">📋 ملخص الحالات</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>مؤكد (تأكيد + شحن):</span><span className="font-bold text-green-600">{overallStats.totalConfirmed}</span></div>
            <div className="flex justify-between pl-4"><span>- تأكيد فقط:</span><span className="text-green-500">{overallStats.totalConfirmedOnly}</span></div>
            <div className="flex justify-between pl-4"><span>- مشحون:</span><span className="text-green-500">{overallStats.totalShipped}</span></div>
            <div className="flex justify-between"><span>مرفوض:</span><span className="font-bold text-red-600">{overallStats.totalRejected}</span></div>
            <div className="flex justify-between"><span>في الانتظار:</span><span className="font-bold text-yellow-600">{overallStats.totalWaiting}</span></div>
            <div className="flex justify-between pl-4"><span>- جديد:</span><span className="text-yellow-500">{overallStats.totalNew}</span></div>
            <div className="flex justify-between pl-4"><span>- لم يرد:</span><span className="text-yellow-500">{overallStats.totalNoAnswer}</span></div>
            <div className="flex justify-between pl-4"><span>- انتظار تأكيد:</span><span className="text-yellow-500">{overallStats.totalPending}</span></div>
            <div className="flex justify-between pl-4"><span>- تواصل واتساب:</span><span className="text-yellow-500">{overallStats.totalContacted}</span></div>
          </div>
        </div>
        
        <div className="bg-indigo-50 p-4 rounded-lg">
          <h4 className="font-semibold text-indigo-900 mb-2">📊 معدلات الأداء</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>معدل التحويل العام:</span>
              <span className="font-bold text-green-600">{overallConfirmationRate}%</span>
            </div>
            <div className="flex justify-between">
              <span>معدل الرفض:</span>
              <span className="font-bold text-red-600">{assignedLeads > 0 ? ((overallStats.totalRejected / assignedLeads) * 100).toFixed(1) : '0.0'}%</span>
            </div>
            <div className="flex justify-between">
              <span>معدل الحسم:</span>
              <span className="font-bold text-blue-600">{overallDecisionRate}%</span>
            </div>
            <div className="flex justify-between">
              <span>معدل الانتظار:</span>
              <span className="font-bold text-yellow-600">{assignedLeads > 0 ? ((overallStats.totalWaiting / assignedLeads) * 100).toFixed(1) : '0.0'}%</span>
            </div>
          </div>
        </div>

        <div className="bg-cyan-50 p-4 rounded-lg">
          <h4 className="font-semibold text-cyan-900 mb-2">⏱️ حالة العمل</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>تم البت فيه:</span>
              <span className="font-bold text-blue-600">{overallStats.totalConfirmed + overallStats.totalRejected}</span>
            </div>
            <div className="flex justify-between">
              <span>يحتاج متابعة:</span>
              <span className="font-bold text-orange-600">{overallStats.totalWaiting}</span>
            </div>
            <div className="flex justify-between">
              <span>إنتاجية اليوم:</span>
              <span className="font-bold text-purple-600">{employees.reduce((sum, emp) => sum + (byAssignee[emp]?.today || 0), 0)}</span>
            </div>
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