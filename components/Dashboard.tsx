import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface StatsCardProps {
  title: string;
  value: number;
  bgColor: string;
  textColor: string;
  icon: string;
}

function StatsCard({ title, value, bgColor, textColor, icon }: StatsCardProps) {
  return (
    <div className={`${bgColor} rounded-lg p-6 shadow-sm`}>
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm font-medium ${textColor}`}>{title}</p>
          <p className={`text-3xl font-bold ${textColor} mt-1`}>{value}</p>
        </div>
        <div className={`text-4xl ${textColor} opacity-80`}>{icon}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data, error } = useSWR('/api/orders?stats=true', fetcher, { refreshInterval: 30000 });
  
  if (error) return <div className="p-4">فشل في جلب الإحصائيات</div>;
  if (!data) return <div className="p-4">تحميل...</div>;
  
  const stats = data.data;
  
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">لوحة التحكم</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title="إجمالي الطلبات"
          value={stats.total}
          bgColor="bg-blue-50"
          textColor="text-blue-700"
          icon="📊"
        />
        <StatsCard
          title="طلبات جديدة"
          value={stats.new}
          bgColor="bg-indigo-50"
          textColor="text-indigo-700"
          icon="🆕"
        />
        <StatsCard
          title="تم التأكيد"
          value={stats.confirmed}
          bgColor="bg-green-50"
          textColor="text-green-700"
          icon="✅"
        />
        <StatsCard
          title="طلبات اليوم"
          value={stats.today}
          bgColor="bg-purple-50"
          textColor="text-purple-700"
          icon="📅"
        />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="في انتظار التأكيد"
          value={stats.pending}
          bgColor="bg-yellow-50"
          textColor="text-yellow-700"
          icon="⏳"
        />
        <StatsCard
          title="رفض التأكيد"
          value={stats.rejected}
          bgColor="bg-red-50"
          textColor="text-red-700"
          icon="❌"
        />
        <StatsCard
          title="لم يرد"
          value={stats.noAnswer}
          bgColor="bg-gray-50"
          textColor="text-gray-700"
          icon="📵"
        />
        <StatsCard
          title="تم الشحن"
          value={stats.shipped}
          bgColor="bg-teal-50"
          textColor="text-teal-700"
          icon="🚚"
        />
      </div>
    </div>
  );
} 