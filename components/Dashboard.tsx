import useSWR from 'swr';
import React, { useState } from 'react';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0
  }).format(price);
};

const StatCard = ({ label, value, subValue, growth }: { label: string, value: string, subValue?: string, growth?: number }) => (
  <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-100">
    <p className="text-sm text-gray-500">{label}</p>
    <p className="text-2xl font-bold mt-1">{value}</p>
    {subValue && <p className="text-xs text-gray-400">{subValue}</p>}
    {growth !== undefined && (
      <div className={`mt-2 text-xs flex items-center ${growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={growth >= 0 ? "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" : "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"} />
        </svg>
        <span>{growth.toFixed(1)}% مقارنة بالشهر الماضي</span>
      </div>
    )}
  </div>
);

const ProductPerformanceTable = ({ products }: { products: any[] }) => {
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'revenue', direction: 'desc' });

  const sortedProducts = React.useMemo(() => {
    let sortableItems = [...products];
    sortableItems.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
    return sortableItems;
  }, [products, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };
  
  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key) return '↕️';
    return sortConfig.direction === 'desc' ? '🔽' : '🔼';
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
       <h3 className="text-xl font-semibold mb-4 text-gray-800">أداء المنتجات</h3>
       <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th onClick={() => requestSort('originalName')} className="px-4 py-2 text-right cursor-pointer">المنتج {getSortIcon('originalName')}</th>
              <th onClick={() => requestSort('total')} className="px-4 py-2 text-right cursor-pointer">إجمالي الطلبات {getSortIcon('total')}</th>
              <th onClick={() => requestSort('confirmed')} className="px-4 py-2 text-right cursor-pointer">المؤكدة {getSortIcon('confirmed')}</th>
              <th onClick={() => requestSort('shipped')} className="px-4 py-2 text-right cursor-pointer">المشحونة {getSortIcon('shipped')}</th>
              <th onClick={() => requestSort('rejected')} className="px-4 py-2 text-right cursor-pointer">المرفوضة {getSortIcon('rejected')}</th>
              <th onClick={() => requestSort('revenue')} className="px-4 py-2 text-right cursor-pointer">الإيرادات {getSortIcon('revenue')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedProducts.map((product) => (
              <tr key={product.originalName} className="border-b">
                <td className="px-4 py-3 font-medium">{product.originalName}</td>
                <td className="px-4 py-3">{product.total}</td>
                <td className="px-4 py-3">{product.confirmed}</td>
                <td className="px-4 py-3">{product.shipped}</td>
                <td className="px-4 py-3 text-red-500">{product.rejected}</td>
                <td className="px-4 py-3 font-bold text-green-600">{formatPrice(product.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const { data, error } = useSWR('/api/orders?stats=true', fetcher, { refreshInterval: 60000 });

  if (error) return <div className="p-4 text-red-500">فشل في جلب الإحصائيات: {error.message}</div>;
  if (!data || !data.data) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-600 mt-4">جاري تحميل لوحة التحكم الذكية...</p>
      </div>
    </div>
  );

  const { overall, financials, conversion, byProduct } = data.data;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-4">نظرة عامة على الأداء</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard label="إجمالي الإيرادات (تم الشحن)" value={formatPrice(financials.totalRevenue)} growth={financials.revenueGrowth} />
          <StatCard label="متوسط قيمة الطلب" value={formatPrice(financials.averageOrderValue)} />
          <StatCard label="معدل التأكيد" value={`${conversion.confirmationRate.toFixed(1)}%`} subValue={`${overall.confirmed} طلب مؤكد`} />
          <StatCard label="إجمالي الطلبات" value={overall.total.toString()} subValue={`${overall.shipped} طلب مشحون`} />
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-4">ملخص اليوم (بتوقيت القاهرة)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard label="طلبات اليوم" value={overall.today.toString()} subValue={`أمس: ${overall.yesterday}`} />
          <StatCard label="طلبات جديدة" value={overall.new.toString()} />
          <StatCard label="في انتظار التأكيد" value={overall.pending.toString()} />
          <StatCard label="لم يتم الرد" value={overall.noAnswer.toString()} />
        </div>
      </div>
      
      <ProductPerformanceTable products={byProduct} />
    </div>
  );
} 