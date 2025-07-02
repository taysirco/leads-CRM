import useSWR from 'swr';
import React from 'react';
import ReportCard from './ReportCard';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface StatCardProps {
  label: string;
  value: number;
  icon: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon }) => (
  <div className="bg-white p-4 rounded-lg shadow flex items-center">
    <div className="text-3xl mr-4">{icon}</div>
    <div>
      <div className="text-gray-500 text-sm">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  </div>
);

export default function Dashboard() {
  const { data, error } = useSWR('/api/orders?stats=true', fetcher, { refreshInterval: 30000 });

  if (error) return <div>فشل في جلب الإحصائيات: {error.message}</div>;
  if (!data) return <div>جاري تحميل الإحصائيات...</div>;

  if (data.error) {
    return <div>حدث خطأ: {data.error}</div>;
  }

  const { overall, byProduct, bySource } = data.data;

  if (!overall || !byProduct || !bySource) {
    return <div>البيانات غير مكتملة.</div>;
  }

  return (
    <div className="space-y-12">
      <div>
        <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-2">نظرة عامة</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="إجمالي الطلبات" value={overall.total} icon="📊" />
          <StatCard label="طلبات جديدة" value={overall.new} icon="🆕" />
          <StatCard label="مؤكدة" value={overall.confirmed} icon="✅" />
          <StatCard label="طلبات اليوم" value={overall.today} icon="📅" />
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-2">تقارير حسب المنتج</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(byProduct).map(([productName, stats]: [string, any]) => (
            <ReportCard key={productName} title={productName} stats={stats} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-2">تقارير حسب المصدر</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(bySource).map(([sourceName, stats]: [string, any]) => (
            <ReportCard key={sourceName} title={sourceName} stats={stats} />
          ))}
        </div>
      </div>
    </div>
  );
} 