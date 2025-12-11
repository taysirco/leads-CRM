import useSWR from 'swr';
import { useState, useMemo } from 'react';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const fetcher = (url: string) => fetch(url).then(r => r.json());

// ألوان الرسوم البيانية
const CHART_COLORS = {
  confirmed: '#22c55e',  // أخضر
  rejected: '#ef4444',   // أحمر
  pending: '#eab308',    // أصفر
  shipped: '#3b82f6',    // أزرق
  new: '#8b5cf6'         // بنفسجي
};

interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  bgColor?: string;
  textColor?: string;
  suffix?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, bgColor = 'bg-white', textColor = 'text-gray-900', suffix = '' }) => (
  <div className={`${bgColor} rounded-lg shadow-sm border p-4 sm:p-6 text-center`}>
    <div className={`text-2xl sm:text-4xl mb-2`}>{icon}</div>
    <div className={`text-xs sm:text-sm font-medium text-gray-600 mb-1`}>{label}</div>
    <div className={`text-lg sm:text-2xl font-bold ${textColor}`}>{value}{suffix}</div>
  </div>
);

// بطاقة تقرير المنتج المحسنة - تعرض الصورة العامة بوضوح
const ProductReportCard: React.FC<{ title: string; stats: any }> = ({ title, stats }) => {
  const totalConfirmed = (stats.confirmed || 0) + (stats.shipped || 0);
  const totalPending = (stats.new || 0) + (stats.noAnswer || 0) + (stats.pending || 0) + (stats.contacted || 0);
  const totalRejected = stats.rejected || 0;
  const total = stats.total || 0;

  // النسب المئوية
  const confirmRate = total > 0 ? ((totalConfirmed / total) * 100) : 0;
  const rejectRate = total > 0 ? ((totalRejected / total) * 100) : 0;
  const pendingRate = total > 0 ? ((totalPending / total) * 100) : 0;
  const noAnswerRate = total > 0 ? (((stats.noAnswer || 0) / total) * 100) : 0;

  // تحديد مستوى نجاح المنتج
  const getSuccessLevel = () => {
    if (confirmRate >= 60) return { label: 'ممتاز', color: 'text-green-700', bg: 'bg-green-100', icon: '🌟' };
    if (confirmRate >= 50) return { label: 'جيد جداً', color: 'text-blue-700', bg: 'bg-blue-50', icon: '✅' };
    if (confirmRate >= 40) return { label: 'جيد', color: 'text-yellow-700', bg: 'bg-yellow-50', icon: '👍' };
    return { label: 'ضعيف', color: 'text-red-600', bg: 'bg-red-50', icon: '📉' };
  };

  const successLevel = getSuccessLevel();

  return (
    <div className={`border rounded-lg p-4 sm:p-5 shadow-sm ${successLevel.bg}`}>
      {/* العنوان ومستوى النجاح */}
      <div className="flex justify-between items-start mb-4">
        <h3 className="font-bold text-base sm:text-lg text-gray-800">{title}</h3>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${successLevel.color} ${successLevel.bg} border`}>
          {successLevel.icon} {successLevel.label}
        </span>
      </div>

      {/* الإجمالي */}
      <div className="text-center mb-4 py-2 bg-white/60 rounded-lg">
        <span className="text-2xl font-bold text-gray-800">{total}</span>
        <span className="text-sm text-gray-600 mr-2">طلب إجمالي</span>
      </div>

      {/* النسب الرئيسية مع شريط التقدم */}
      <div className="space-y-3">
        {/* نسبة التأكيد */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium text-green-700">✅ مؤكد</span>
            <span className="text-sm font-bold text-green-700">{totalConfirmed} ({confirmRate.toFixed(1)}%)</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${confirmRate}%` }} />
          </div>
        </div>

        {/* نسبة الرفض */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium text-red-700">❌ مرفوض</span>
            <span className="text-sm font-bold text-red-700">{totalRejected} ({rejectRate.toFixed(1)}%)</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 transition-all" style={{ width: `${rejectRate}%` }} />
          </div>
        </div>

        {/* نسبة الانتظار */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium text-yellow-700">⏳ انتظار</span>
            <span className="text-sm font-bold text-yellow-700">{totalPending} ({pendingRate.toFixed(1)}%)</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-yellow-500 transition-all" style={{ width: `${pendingRate}%` }} />
          </div>
        </div>

        {/* نسبة عدم الرد */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium text-gray-600">📵 لم يرد</span>
            <span className="text-sm font-bold text-gray-600">{stats.noAnswer || 0} ({noAnswerRate.toFixed(1)}%)</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-gray-400 transition-all" style={{ width: `${noAnswerRate}%` }} />
          </div>
        </div>
      </div>

      {/* ملخص سريع */}
      <div className="mt-4 pt-3 border-t border-gray-200/50">
        <div className="text-center p-2 bg-white/50 rounded text-xs">
          <div className="font-bold text-purple-700">{confirmRate > 0 && rejectRate > 0 ? (confirmRate / rejectRate).toFixed(1) : '-'}</div>
          <div className="text-gray-600">نسبة تأكيد:رفض</div>
        </div>
      </div>
    </div>
  );
};

// بطاقة تقرير المصدر المبسطة
const SourceReportCard: React.FC<{ title: string; stats: any }> = ({ title, stats }) => {
  const total = stats.total || 0;
  const totalConfirmed = (stats.confirmed || 0) + (stats.shipped || 0);
  const confirmRate = total > 0 ? ((totalConfirmed / total) * 100) : 0;

  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm flex items-center justify-between">
      <div>
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <span className="text-xs text-gray-500">{total} طلب</span>
      </div>
      <div className="text-left">
        <div className={`text-lg font-bold ${confirmRate >= 20 ? 'text-green-600' : confirmRate >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
          {confirmRate.toFixed(1)}%
        </div>
        <div className="text-xs text-gray-500">معدل التأكيد</div>
      </div>
    </div>
  );
};

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
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month' | 'all'>('all');

  // Fetch dashboard data - single call for all data
  const { data, error, isLoading } = useSWR('/api/orders?stats=true', fetcher, {
    refreshInterval: 15000,
    revalidateOnFocus: true
  });

  // Extract data safely with defaults
  const overall = data?.data?.overall || { total: 0, confirmed: 0, shipped: 0, new: 0, noAnswer: 0, pending: 0, contacted: 0, rejected: 0 };
  const byProduct = data?.data?.byProduct || {};
  const bySource = data?.data?.bySource || {};

  // حساب الإحصائيات المحسنة - MUST be called before any returns
  const enhancedStats = useMemo(() => {
    const totalConfirmed = (overall.confirmed || 0) + (overall.shipped || 0);
    const totalPending = (overall.new || 0) + (overall.noAnswer || 0) + (overall.pending || 0) + (overall.contacted || 0);
    const totalRejected = overall.rejected || 0;
    const conversionRate = overall.total > 0 ? ((totalConfirmed / overall.total) * 100).toFixed(1) : '0.0';
    const decisionRate = overall.total > 0 ? (((totalConfirmed + totalRejected) / overall.total) * 100).toFixed(1) : '0.0';

    return {
      totalConfirmed,
      totalPending,
      totalRejected,
      conversionRate,
      decisionRate
    };
  }, [overall]);

  // بيانات الرسم البياني الدائري - جميع الحالات مع دمج التأكيد والشحن
  const pieChartData = useMemo(() => {
    const totalConfirmed = (overall.confirmed || 0) + (overall.shipped || 0);
    return [
      { name: 'مؤكد (تأكيد+شحن)', value: totalConfirmed, color: '#22c55e' }, // أخضر
      { name: 'جديد', value: overall.new || 0, color: '#8b5cf6' }, // بنفسجي
      { name: 'لم يرد', value: overall.noAnswer || 0, color: '#f97316' }, // برتقالي
      { name: 'انتظار تأكيد', value: overall.pending || 0, color: '#eab308' }, // أصفر
      { name: 'تواصل واتساب', value: overall.contacted || 0, color: '#06b6d4' }, // سماوي
      { name: 'مرفوض', value: overall.rejected || 0, color: '#ef4444' }, // أحمر
    ].filter(item => item.value > 0); // إخفاء الحالات الفارغة
  }, [overall]);

  // Early returns AFTER all hooks
  if (error) return <div>فشل في جلب الإحصائيات: {error.message}</div>;
  if (!data) return <div>جاري تحميل الإحصائيات...</div>;

  if (data.error) {
    return <div>حدث خطأ: {data.error}</div>;
  }

  if (!data.data?.overall || !data.data?.byProduct || !data.data?.bySource) {
    return <div>البيانات غير مكتملة.</div>;
  }

  // Employee Reports Logic (for admin)
  const renderEmployeeReports = () => {
    if (user?.role !== 'admin' || isLoading) {
      return null;
    }

    if (!data?.data) {
      return <div className="text-center py-8 text-red-600">خطأ في تحميل تقارير الموظفين</div>;
    }

    const stats = data.data;
    const byAssignee = stats?.byAssignee || {};
    const byAssigneeByProduct = stats?.byAssigneeByProduct || {};

    // حساب إحصائيات شاملة ومؤشرات الأداء بالمنطق الصحيح
    const employees = ['heba.', 'ahmed.', 'aisha.'];

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
                        <h4 className="font-bold text-base sm:text-lg text-gray-900">{emp === 'heba.' ? '👩‍💼 هبة' : emp === 'ahmed.' ? '👨‍💼 أحمد' : '👩‍💼 عائشة'}</h4>
                        <p className="text-xs sm:text-sm text-gray-700">نصيب: {share}% من الليدز المعينة ({empData.total} ليد)</p>
                      </div>
                      <div className="sm:text-right">
                        <div className={`px-2 py-1 rounded text-xs font-medium ${parseFloat(conversionRate) >= 25 ? 'bg-green-100 text-green-800' :
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
                const empName = emp === 'heba.' ? 'هبة' : emp === 'ahmed.' ? 'أحمد' : 'عائشة';

                return (
                  <div key={emp} className="border rounded-lg p-4">
                    <h4 className="font-medium mb-3 text-gray-900">{empName}</h4>
                    {Object.keys(empProducts).length === 0 ? (
                      <p className="text-sm text-gray-600 italic">لا توجد منتجات مُعينة</p>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(empProducts)
                          .sort(([, a]: any, [, b]: any) => b.total - a.total)
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
                  <div className="text-center"><span className="text-gray-600">عائشة</span><div className="font-bold">{balanceInfo.counts['aisha.']}</div></div>
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
                  <p className="font-medium text-gray-800 text-xs sm:text-sm">{emp === 'heba.' ? 'هبة' : emp === 'ahmed.' ? 'أحمد' : 'عائشة'}</p>
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
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-3">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 border-b pb-2 sm:border-0 sm:pb-0">📊 نظرة عامة</h2>

          {/* فلتر الفترة الزمنية */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">الفترة:</span>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as any)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="today">اليوم</option>
              <option value="week">هذا الأسبوع</option>
              <option value="month">هذا الشهر</option>
              <option value="all">الكل</option>
            </select>
          </div>
        </div>

        {/* البطاقات الإحصائية المحسنة */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          <StatCard label="إجمالي الطلبات" value={overall.total} icon="📊" />
          <StatCard label="طلبات جديدة" value={overall.new || 0} icon="🆕" textColor="text-purple-600" />
          <StatCard
            label="مؤكدة (إجمالي)"
            value={enhancedStats.totalConfirmed}
            icon="✅"
            bgColor="bg-green-50"
            textColor="text-green-700"
          />
          <StatCard
            label="في الانتظار"
            value={enhancedStats.totalPending}
            icon="⏳"
            bgColor="bg-yellow-50"
            textColor="text-yellow-700"
          />
          <StatCard
            label="معدل التحويل"
            value={enhancedStats.conversionRate}
            icon="📈"
            bgColor="bg-blue-50"
            textColor="text-blue-700"
            suffix="%"
          />
        </div>

        {/* الرسوم البيانية */}
        {user?.role === 'admin' && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* نسب حالات الطلبات */}
            <div className="bg-white rounded-lg border p-4 sm:p-6">
              <h3 className="font-semibold text-gray-800 mb-4">📊 توزيع حالات الطلبات</h3>
              <div className="space-y-3">
                {/* مؤكد (تأكيد + شحن) */}
                <div className="p-3 bg-green-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-green-800">✅ مؤكد (تأكيد + شحن)</span>
                    <span className="font-bold text-green-700">{enhancedStats.totalConfirmed}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-green-200 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500" style={{ width: `${overall.total > 0 ? (enhancedStats.totalConfirmed / overall.total) * 100 : 0}%` }} />
                    </div>
                    <span className="text-sm font-bold text-green-700 w-14 text-left">
                      {overall.total > 0 ? ((enhancedStats.totalConfirmed / overall.total) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>

                {/* جديد */}
                <div className="p-3 bg-purple-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-purple-800">🆕 جديد</span>
                    <span className="font-bold text-purple-700">{overall.new || 0}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-purple-200 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500" style={{ width: `${overall.total > 0 ? ((overall.new || 0) / overall.total) * 100 : 0}%` }} />
                    </div>
                    <span className="text-sm font-bold text-purple-700 w-14 text-left">
                      {overall.total > 0 ? (((overall.new || 0) / overall.total) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>

                {/* لم يرد */}
                <div className="p-3 bg-orange-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-orange-800">📵 لم يرد</span>
                    <span className="font-bold text-orange-700">{overall.noAnswer || 0}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-orange-200 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-500" style={{ width: `${overall.total > 0 ? ((overall.noAnswer || 0) / overall.total) * 100 : 0}%` }} />
                    </div>
                    <span className="text-sm font-bold text-orange-700 w-14 text-left">
                      {overall.total > 0 ? (((overall.noAnswer || 0) / overall.total) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>

                {/* انتظار تأكيد */}
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-yellow-800">⏳ انتظار تأكيد</span>
                    <span className="font-bold text-yellow-700">{overall.pending || 0}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-yellow-200 rounded-full overflow-hidden">
                      <div className="h-full bg-yellow-500" style={{ width: `${overall.total > 0 ? ((overall.pending || 0) / overall.total) * 100 : 0}%` }} />
                    </div>
                    <span className="text-sm font-bold text-yellow-700 w-14 text-left">
                      {overall.total > 0 ? (((overall.pending || 0) / overall.total) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>

                {/* تواصل واتساب */}
                <div className="p-3 bg-cyan-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-cyan-800">💬 تواصل واتساب</span>
                    <span className="font-bold text-cyan-700">{overall.contacted || 0}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-cyan-200 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500" style={{ width: `${overall.total > 0 ? ((overall.contacted || 0) / overall.total) * 100 : 0}%` }} />
                    </div>
                    <span className="text-sm font-bold text-cyan-700 w-14 text-left">
                      {overall.total > 0 ? (((overall.contacted || 0) / overall.total) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>

                {/* مرفوض */}
                <div className="p-3 bg-red-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-red-800">❌ مرفوض</span>
                    <span className="font-bold text-red-700">{overall.rejected || 0}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-red-200 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500" style={{ width: `${overall.total > 0 ? ((overall.rejected || 0) / overall.total) * 100 : 0}%` }} />
                    </div>
                    <span className="text-sm font-bold text-red-700 w-14 text-left">
                      {overall.total > 0 ? (((overall.rejected || 0) / overall.total) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ملخص سريع */}
            <div className="bg-white rounded-lg border p-4 sm:p-6">
              <h3 className="font-semibold text-gray-800 mb-4">📋 ملخص الأداء</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <span className="text-green-800 font-medium">الطلبات المؤكدة</span>
                  <div className="text-left">
                    <span className="text-2xl font-bold text-green-700">{enhancedStats.totalConfirmed}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                  <span className="text-yellow-800 font-medium">في انتظار المتابعة</span>
                  <div className="text-left">
                    <span className="text-2xl font-bold text-yellow-700">{enhancedStats.totalPending}</span>
                    <span className="text-sm text-yellow-600 mr-2">تحتاج متابعة</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <span className="text-red-800 font-medium">الطلبات المرفوضة</span>
                  <div className="text-left">
                    <span className="text-2xl font-bold text-red-700">{enhancedStats.totalRejected}</span>
                    <span className="text-sm text-red-600 mr-2">مرفوض</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* تقارير الموظفين للأدمن فقط */}
      {user?.role === 'admin' && renderEmployeeReports()}

      {/* تقارير حسب المنتج */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-800 border-b pb-2">🛍️ تقارير حسب المنتج</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
          {Object.entries(byProduct).map(([productName, stats]: [string, any]) => (
            <ProductReportCard key={productName} title={productName} stats={stats} />
          ))}
        </div>
      </div>

      {/* تقارير حسب المصدر */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-gray-800 border-b pb-2">📈 تقارير حسب المصدر</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {Object.entries(bySource).map(([sourceName, stats]: [string, any]) => (
            <SourceReportCard key={sourceName} title={sourceName} stats={stats} />
          ))}
        </div>
      </div>
    </div>
  );
} 