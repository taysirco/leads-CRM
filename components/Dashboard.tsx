import useSWR from 'swr';
import { useState } from 'react';
import { useCurrentUser } from '../hooks/useCurrentUser';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface StatCardProps {
  label: string;
  value: number;
  icon: string;
  bgColor?: string;
  textColor?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, bgColor = 'bg-white', textColor = 'text-gray-900' }) => (
  <div className={`${bgColor} rounded-lg shadow-sm border p-4 sm:p-6 text-center`}>
    <div className={`text-2xl sm:text-4xl mb-2`}>{icon}</div>
    <div className={`text-xs sm:text-sm font-medium text-gray-600 mb-1`}>{label}</div>
    <div className={`text-lg sm:text-2xl font-bold ${textColor}`}>{value}</div>
  </div>
);

const ReportCard: React.FC<{ title: string; stats: any }> = ({ title, stats }) => (
  <div className="bg-white border rounded-lg p-4 sm:p-6 shadow-sm">
    <h3 className="font-semibold text-base sm:text-lg mb-4 text-gray-800">{title}</h3>
    <div className="space-y-2 sm:space-y-3">
      <div className="flex justify-between">
        <span className="text-sm text-gray-600">إجمالي:</span>
        <span className="font-semibold text-sm">{stats.total}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-sm text-gray-600">مؤكدة:</span>
        <span className="font-semibold text-sm text-green-600">{stats.confirmed}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-sm text-gray-600">مرفوضة:</span>
        <span className="font-semibold text-sm text-red-600">{stats.rejected}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-sm text-gray-600">معدل التحويل:</span>
        <span className="font-semibold text-sm text-blue-600">
          {stats.total > 0 ? ((stats.confirmed / stats.total) * 100).toFixed(1) : 0}%
        </span>
      </div>
    </div>
  </div>
);

// Employee Stats Types
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

export default function Dashboard() {
  const { user } = useCurrentUser();
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  
  // Fetch regular dashboard data
  const { data, error } = useSWR('/api/orders?stats=true', fetcher, { refreshInterval: 30000 });
  
  // Fetch employee reports data for admin
  const { data: employeeData, error: employeeError, isLoading: employeeLoading } = useSWR(
    user?.role === 'admin' ? '/api/orders?stats=true' : null, 
    fetcher, 
    { refreshInterval: 15000, revalidateOnFocus: true }
  );

  if (error) return <div>فشل في جلب الإحصائيات: {error.message}</div>;
  if (!data) return <div>جاري تحميل الإحصائيات...</div>;

  if (data.error) {
    return <div>حدث خطأ: {data.error}</div>;
  }

  const { overall, byProduct, bySource } = data.data;

  if (!overall || !byProduct || !bySource) {
    return <div>البيانات غير مكتملة.</div>;
  }

  // Employee Reports Logic (for admin)
  const renderEmployeeReports = () => {
    if (user?.role !== 'admin' || employeeLoading) {
      return null;
    }

    if (employeeError) {
      return <div className="text-center py-8 text-red-600">خطأ في تحميل تقارير الموظفين</div>;
    }

    const stats = employeeData?.data;
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

    const balanceInfo = checkDistributionBalance();

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
      <div className="space-y-4 sm:space-y-6">
        <div className="bg-gradient-to-r from-emerald-50 to-blue-50 p-4 sm:p-6 rounded-lg border border-emerald-200">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-2 sm:space-y-0">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">📊 تقارير الموظفين - لوحة المراقبة</h2>
              <p className="text-sm text-gray-700">مراقبة شاملة لأداء فريق الكول سنتر</p>
            </div>
            <span className="text-xs sm:text-sm text-gray-700">آخر تحديث: {new Date().toLocaleTimeString('ar-EG')}</span>
          </div>
        </div>

        {/* إحصائيات إجمالية بالمنطق الصحيح */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <StatCard 
            label="إجمالي الليدز المعينة" 
            value={assignedLeads} 
            icon="👥"
            bgColor="bg-blue-50" 
            textColor="text-blue-800"
          />
          <StatCard 
            label="معدل التأكيد العام" 
            value={parseFloat(overallConfirmationRate)} 
            icon="✅"
            bgColor="bg-green-50" 
            textColor="text-green-800"
          />
          <StatCard 
            label="في الانتظار" 
            value={overallStats.totalWaiting} 
            icon="⏳"
            bgColor="bg-yellow-50" 
            textColor="text-yellow-800"
          />
          <StatCard 
            label="معدل الحسم" 
            value={parseFloat(overallDecisionRate)} 
            icon="📊"
            bgColor="bg-purple-50" 
            textColor="text-purple-800"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
          {/* تقرير مفصل لكل موظف */}
          <div>
            <h3 className="font-semibold mb-4 text-base sm:text-lg text-gray-900">📈 أداء الموظفين المفصل</h3>
            <div className="space-y-3 sm:space-y-4">
              {employees.map(emp => {
                const empData = byAssignee[emp] || { total: 0, confirmed: 0, rejected: 0, pending: 0, noAnswer: 0, contacted: 0, shipped: 0, new: 0, today: 0 };
                const conversionRate = getConversionRate(empData);
                const decisionRate = getDecisionRate(empData);
                const waitingRate = getWaitingRate(empData);
                const share = assignedLeads > 0 ? ((empData.total / assignedLeads) * 100).toFixed(1) : '0.0';
                
                const realConfirmed = getRealConfirmed(empData);
                const realWaiting = getRealWaiting(empData);
                
                return (
                  <div key={emp} className="border rounded-lg p-3 sm:p-4 bg-gray-50">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-3 space-y-2 sm:space-y-0">
                      <div>
                        <h4 className="font-bold text-base sm:text-lg text-gray-900">{emp === 'heba.' ? '👩‍💼 هبة' : emp === 'ahmed.' ? '👨‍💼 أحمد' : '👨‍💼 رائد'}</h4>
                        <p className="text-xs sm:text-sm text-gray-700">نصيب: {share}% من الليدز المعينة ({empData.total} ليد)</p>
                      </div>
                      <div className="sm:text-right">
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
                    
                    <div className="grid grid-cols-3 gap-2 sm:gap-3 text-xs sm:text-sm mb-3">
                      <div className="text-center bg-green-100 p-2 rounded">
                        <p className="font-semibold text-green-800">{realConfirmed}</p>
                        <p className="text-xs text-green-700">مؤكد</p>
                        <p className="text-xs text-gray-600 hidden sm:block">({empData.confirmed} + {empData.shipped})</p>
                      </div>
                      <div className="text-center bg-red-100 p-2 rounded">
                        <p className="font-semibold text-red-800">{empData.rejected}</p>
                        <p className="text-xs text-red-700">مرفوض</p>
                      </div>
                      <div className="text-center bg-yellow-100 p-2 rounded">
                        <p className="font-semibold text-yellow-800">{realWaiting}</p>
                        <p className="text-xs text-yellow-700">في الانتظار</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 sm:gap-4 text-xs text-gray-700 pt-3 border-t">
                      <div className="text-center">
                        <span className="font-medium text-gray-800 text-xs">معدل التحويل</span>
                        <div className="font-bold text-green-700">{conversionRate}%</div>
                        <span className="text-gray-600 text-xs hidden sm:block">({realConfirmed}/{empData.total})</span>
                      </div>
                      <div className="text-center">
                        <span className="font-medium text-gray-800 text-xs">معدل الحسم</span>
                        <div className="font-bold text-blue-700">{decisionRate}%</div>
                        <span className="text-gray-600 text-xs hidden sm:block">تم البت فيه</span>
                      </div>
                      <div className="text-center">
                        <span className="font-medium text-gray-800 text-xs">في الانتظار</span>
                        <div className="font-bold text-yellow-700">{waitingRate}%</div>
                        <span className="text-gray-600 text-xs hidden sm:block">يحتاج متابعة</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* أداء حسب المنتج بالمنطق المحسن */}
          <div>
            <h3 className="font-semibold mb-4 text-lg text-gray-900">🛍️ الأداء حسب المنتج</h3>
            <div className="space-y-4 max-h-[500px] overflow-auto">
              {employees.map(emp => {
                const empProducts = byAssigneeByProduct[emp] || {};
                const empName = emp === 'heba.' ? 'هبة' : emp === 'ahmed.' ? 'أحمد' : 'رائد';
                
                return (
                  <div key={emp} className="border rounded-lg p-4">
                    <h4 className="font-medium mb-3 text-gray-900">{empName}</h4>
                    {Object.keys(empProducts).length === 0 ? (
                      <p className="text-sm text-gray-600 italic">لا توجد منتجات مُعينة</p>
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
                              <div key={product} className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-sm py-2 px-3 bg-gray-50 rounded space-y-2 sm:space-y-0">
                                <div className="flex-1">
                                  <p className="font-medium text-gray-900 text-xs sm:text-sm">{product}</p>
                                  <p className="text-xs text-gray-600">
                                    تحويل: {productConversion}% | حسم: {decisionRate}% 
                                    <span className="hidden sm:inline">({decided}/{stats.total})</span>
                                  </p>
                                </div>
                                <div className="flex justify-between sm:justify-end space-x-4 rtl:space-x-reverse text-xs sm:text-sm">
                                  <div className="text-center">
                                    <span className="text-green-700 font-medium block" title="مؤكد (تأكيد + شحن)">{realConfirmed}</span>
                                    <span className="text-gray-500 text-xs">مؤكد</span>
                                  </div>
                                  <div className="text-center">
                                    <span className="text-red-700 font-medium block">{stats.rejected}</span>
                                    <span className="text-gray-500 text-xs">مرفوض</span>
                                  </div>
                                  <div className="text-center">
                                    <span className="text-gray-800 font-medium block">{stats.total}</span>
                                    <span className="text-gray-500 text-xs">إجمالي</span>
                                  </div>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-purple-50 p-3 sm:p-4 rounded-lg">
            <h4 className="font-semibold text-purple-900 mb-2 text-sm sm:text-base">📋 ملخص الحالات</h4>
            <div className="space-y-1 text-xs sm:text-sm">
              <div className="flex justify-between"><span className="text-gray-700">مؤكد (تأكيد + شحن):</span><span className="font-bold text-green-700">{overallStats.totalConfirmed}</span></div>
              <div className="flex justify-between pl-2 sm:pl-4"><span className="text-gray-600">- تأكيد فقط:</span><span className="text-green-600">{overallStats.totalConfirmedOnly}</span></div>
              <div className="flex justify-between pl-2 sm:pl-4"><span className="text-gray-600">- مشحون:</span><span className="text-green-600">{overallStats.totalShipped}</span></div>
              <div className="flex justify-between"><span className="text-gray-700">مرفوض:</span><span className="font-bold text-red-700">{overallStats.totalRejected}</span></div>
              <div className="flex justify-between"><span className="text-gray-700">في الانتظار:</span><span className="font-bold text-yellow-700">{overallStats.totalWaiting}</span></div>
              <div className="flex justify-between pl-2 sm:pl-4"><span className="text-gray-600">- جديد:</span><span className="text-yellow-600">{overallStats.totalNew}</span></div>
              <div className="flex justify-between pl-2 sm:pl-4"><span className="text-gray-600">- لم يرد:</span><span className="text-yellow-600">{overallStats.totalNoAnswer}</span></div>
              <div className="flex justify-between pl-2 sm:pl-4"><span className="text-gray-600">- انتظار تأكيد:</span><span className="text-yellow-600">{overallStats.totalPending}</span></div>
              <div className="flex justify-between pl-2 sm:pl-4"><span className="text-gray-600">- تواصل واتساب:</span><span className="text-yellow-600">{overallStats.totalContacted}</span></div>
            </div>
          </div>
          
          <div className="bg-indigo-50 p-3 sm:p-4 rounded-lg">
            <h4 className="font-semibold text-indigo-900 mb-2 text-sm sm:text-base">📊 معدلات الأداء</h4>
            <div className="space-y-1 text-xs sm:text-sm">
              <div className="flex justify-between">
                <span className="text-gray-700">معدل التحويل العام:</span>
                <span className="font-bold text-green-700">{overallConfirmationRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">معدل الرفض:</span>
                <span className="font-bold text-red-700">{assignedLeads > 0 ? ((overallStats.totalRejected / assignedLeads) * 100).toFixed(1) : '0.0'}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">معدل الحسم:</span>
                <span className="font-bold text-blue-700">{overallDecisionRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">معدل الانتظار:</span>
                <span className="font-bold text-yellow-700">{assignedLeads > 0 ? ((overallStats.totalWaiting / assignedLeads) * 100).toFixed(1) : '0.0'}%</span>
              </div>
            </div>
          </div>

          <div className="bg-teal-50 p-3 sm:p-4 rounded-lg">
            <h4 className="font-semibold text-teal-900 mb-2 text-sm sm:text-base">⚖️ توازن التوزيع</h4>
            <div className="space-y-1 text-xs sm:text-sm">
              <div className="flex justify-between">
                <span className="text-gray-700">حالة التوزيع:</span>
                <span className={`font-bold ${balanceInfo.isBalanced ? 'text-green-700' : 'text-red-700'}`}>
                  {balanceInfo.isBalanced ? '✅ متوازن' : '⚠️ غير متوازن'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">فارق التوزيع:</span>
                <span className="font-bold text-gray-800">{balanceInfo.difference} ليد</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-700">الحد المسموح:</span>
                <span className="font-bold text-gray-800">{balanceInfo.maxAllowed} ليد</span>
              </div>
              <div className="mt-2 pt-2 border-t border-teal-200">
                <div className="grid grid-cols-3 gap-1 text-xs">
                  <div className="text-center"><span className="text-gray-600">هبة</span><div className="font-bold">{balanceInfo.counts['heba.']}</div></div>
                  <div className="text-center"><span className="text-gray-600">أحمد</span><div className="font-bold">{balanceInfo.counts['ahmed.']}</div></div>
                  <div className="text-center"><span className="text-gray-600">رائد</span><div className="font-bold">{balanceInfo.counts['raed.']}</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* تحذيرات وتوصيات */}
        {!balanceInfo.isBalanced && (
          <div className="p-3 sm:p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <h4 className="font-semibold text-orange-900 mb-2 text-sm sm:text-base">⚠️ تحذير: عدم توازن في التوزيع</h4>
            <p className="text-xs sm:text-sm text-orange-800 mb-2">
              هناك فارق كبير في توزيع الليدز بين الموظفين. الفارق الحالي: {balanceInfo.difference} (الحد المسموح: {balanceInfo.maxAllowed})
            </p>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm">
              {employees.map(emp => (
                <div key={emp} className="text-center">
                  <p className="font-medium text-gray-800 text-xs sm:text-sm">{emp === 'heba.' ? 'هبة' : emp === 'ahmed.' ? 'أحمد' : 'رائد'}</p>
                  <p className="text-base sm:text-lg font-bold text-gray-900">{balanceInfo.counts[emp]}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-orange-700 mt-2">
              💡 توصية: استخدم زر "توزيع الليدز" لإعادة توزيع الليدز غير المُعينة بالتساوي.
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8 sm:space-y-12">
      {/* لوحة التحكم الأساسية */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-800 border-b pb-2">📊 نظرة عامة</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="إجمالي الطلبات" value={overall.total} icon="📊" />
          <StatCard label="طلبات جديدة" value={overall.new} icon="🆕" />
          <StatCard label="مؤكدة" value={overall.confirmed} icon="✅" />
          <StatCard label="طلبات اليوم" value={overall.today} icon="📅" />
        </div>
      </div>

      {/* تقارير الموظفين للأدمن فقط */}
      {user?.role === 'admin' && renderEmployeeReports()}

      {/* تقارير حسب المنتج */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-800 border-b pb-2">🛍️ تقارير حسب المنتج</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
          {Object.entries(byProduct).map(([productName, stats]: [string, any]) => (
            <ReportCard key={productName} title={productName} stats={stats} />
          ))}
        </div>
      </div>

      {/* تقارير حسب المصدر */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-800 border-b pb-2">📈 تقارير حسب المصدر</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
          {Object.entries(bySource).map(([sourceName, stats]: [string, any]) => (
            <ReportCard key={sourceName} title={sourceName} stats={stats} />
          ))}
        </div>
      </div>
    </div>
  );
} 