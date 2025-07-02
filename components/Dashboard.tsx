import useSWR from 'swr';
import React from 'react';

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

  if (error) return <div>فشل في جلب الإحصائيات</div>;
  if (!data) return <div>جاري تحميل الإحصائيات...</div>;

  const { overall, byProduct } = data.data;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">نظرة عامة</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="إجمالي الطلبات" value={overall.total} icon="📊" />
        <StatCard label="طلبات جديدة" value={overall.new} icon="🆕" />
        <StatCard label="مؤكدة" value={overall.confirmed} icon="✅" />
        <StatCard label="طلبات اليوم" value={overall.today} icon="📅" />
      </div>

      <hr className="my-8" />

      <h2 className="text-2xl font-bold mb-4">إحصائيات حسب المنتج</h2>
      <div className="space-y-6">
        {Object.entries(byProduct).map(([productName, stats]: [string, any]) => (
          <div key={productName} className="bg-gray-50 p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-4 text-gray-800">{productName}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              <StatCard label="إجمالي الطلبات" value={stats.total} icon="📦" />
              <StatCard label="جديدة" value={stats.new} icon="🆕" />
              <StatCard label="مؤكدة" value={stats.confirmed} icon="✅" />
              <StatCard label="تم الشحن" value={stats.shipped} icon="🚚" />
              <StatCard label="مرفوضة" value={stats.rejected} icon="❌" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 