import React, { useState, useMemo } from 'react';
import StatusBadge from './StatusBadge';
import { formatPhoneForDisplay } from '../lib/phoneFormatter';

interface Order {
  id: number;
  rowIndex: number;
  orderDate: string;
  name: string;
  phone: string;
  whatsapp: string;
  governorate: string;
  area: string;
  address: string;
  orderDetails: string;
  quantity: string;
  totalPrice: string;
  productName: string;
  source: string;
  status: string;
  notes: string;
  whatsappSent: string;
}

interface ArchiveTableProps {
  orders: Order[];
  onUpdateOrder: (id: number, updates: Partial<Order>) => Promise<void>;
}

export default function ArchiveTable({ orders, onUpdateOrder }: ArchiveTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [governorateFilter, setGovernorateFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Calculate comprehensive statistics
  const stats = useMemo(() => {
    const shippedOrders = orders.filter(order => order.status === 'تم الشحن');
    
    const today = new Date();
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const lastMonth = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);

    const todayShipped = shippedOrders.filter(order => 
      new Date(order.orderDate).toDateString() === today.toDateString()
    ).length;

    const weekShipped = shippedOrders.filter(order => 
      new Date(order.orderDate) >= thisWeek
    ).length;

    const monthShipped = shippedOrders.filter(order => 
      new Date(order.orderDate) >= thisMonth
    ).length;

    const lastMonthShipped = shippedOrders.filter(order => {
      const orderDate = new Date(order.orderDate);
      return orderDate >= lastMonth && orderDate < thisMonth;
    }).length;

    // Calculate total revenue
    const totalRevenue = shippedOrders.reduce((sum, order) => {
      const price = parseFloat(order.totalPrice?.replace(/[^\d.]/g, '') || '0');
      return sum + price;
    }, 0);

    const monthRevenue = shippedOrders
      .filter(order => new Date(order.orderDate) >= thisMonth)
      .reduce((sum, order) => {
        const price = parseFloat(order.totalPrice?.replace(/[^\d.]/g, '') || '0');
        return sum + price;
      }, 0);

    const lastMonthRevenue = shippedOrders
      .filter(order => {
        const orderDate = new Date(order.orderDate);
        return orderDate >= lastMonth && orderDate < thisMonth;
      })
      .reduce((sum, order) => {
        const price = parseFloat(order.totalPrice?.replace(/[^\d.]/g, '') || '0');
        return sum + price;
      }, 0);

    // Revenue growth percentage
    const revenueGrowth = lastMonthRevenue > 0 
      ? ((monthRevenue - lastMonthRevenue) / lastMonthRevenue * 100)
      : 0;

    // Count by source
    const sourceCount = shippedOrders.reduce((acc, order) => {
      acc[order.source || 'غير محدد'] = (acc[order.source || 'غير محدد'] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Count by governorate
    const governorateCount = shippedOrders.reduce((acc, order) => {
      acc[order.governorate || 'غير محدد'] = (acc[order.governorate || 'غير محدد'] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Count by product with revenue
    const productStats = shippedOrders.reduce((acc, order) => {
      const product = order.productName || 'غير محدد';
      const price = parseFloat(order.totalPrice?.replace(/[^\d.]/g, '') || '0');
      
      if (!acc[product]) {
        acc[product] = { count: 0, revenue: 0 };
      }
      acc[product].count++;
      acc[product].revenue += price;
      return acc;
    }, {} as Record<string, { count: number; revenue: number }>);

    // Average order value
    const averageOrderValue = shippedOrders.length > 0 ? totalRevenue / shippedOrders.length : 0;

    return {
      total: shippedOrders.length,
      today: todayShipped,
      week: weekShipped,
      month: monthShipped,
      lastMonth: lastMonthShipped,
      totalRevenue,
      monthRevenue,
      lastMonthRevenue,
      revenueGrowth,
      averageOrderValue,
      sourceCount,
      governorateCount,
      productStats
    };
  }, [orders]);

  // Filter and sort data
  const filteredOrders = useMemo(() => {
    let filtered = orders.filter(order => {
      const isShipped = order.status === 'تم الشحن';
      if (!isShipped) return false;

      const matchesSearch = !searchTerm || 
        order.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.phone.includes(searchTerm) ||
        order.notes.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesSource = !sourceFilter || order.source === sourceFilter;
      const matchesGovernorate = !governorateFilter || order.governorate === governorateFilter;
      const matchesProduct = !productFilter || order.productName === productFilter;
      
      // Date filtering
      let matchesDate = true;
      if (dateFilter !== 'all') {
        const orderDate = new Date(order.orderDate);
        const today = new Date();
        
        switch (dateFilter) {
          case 'today':
            matchesDate = orderDate.toDateString() === today.toDateString();
            break;
          case 'week':
            const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            matchesDate = orderDate >= weekAgo;
            break;
          case 'month':
            const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
            matchesDate = orderDate >= monthAgo;
            break;
        }
      }
      
      return matchesSearch && matchesSource && matchesGovernorate && matchesProduct && matchesDate;
    });

    // Sorting
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'date':
          aValue = new Date(a.orderDate);
          bValue = new Date(b.orderDate);
          break;
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'price':
          aValue = parseFloat(a.totalPrice?.replace(/[^\d.]/g, '') || '0');
          bValue = parseFloat(b.totalPrice?.replace(/[^\d.]/g, '') || '0');
          break;
        case 'governorate':
          aValue = a.governorate.toLowerCase();
          bValue = b.governorate.toLowerCase();
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [orders, searchTerm, sourceFilter, governorateFilter, productFilter, dateFilter, sortBy, sortOrder]);

  const uniqueSources = [...new Set(orders.map(order => order.source).filter(Boolean))];
  const uniqueGovernorates = [...new Set(orders.map(order => order.governorate).filter(Boolean))];
  const uniqueProducts = [...new Set(orders.map(order => order.productName).filter(Boolean))];

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 0
    }).format(price);
  };

  const exportToCSV = () => {
    const headers = ['رقم الطلب', 'التاريخ', 'الاسم', 'الهاتف', 'المحافظة', 'المنتج', 'السعر', 'المصدر'];
    const csvContent = [
      headers.join(','),
      ...filteredOrders.map(order => [
        order.id,
        order.orderDate,
        order.name,
        order.phone,
        order.governorate,
        order.productName,
        order.totalPrice,
        order.source
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `shipped_orders_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-green-200">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="mr-4">
              <p className="text-sm font-medium text-gray-600">إجمالي المشحون</p>
              <p className="text-2xl font-bold text-green-600">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
            <div className="mr-4">
              <p className="text-sm font-medium text-gray-600">إجمالي المبيعات</p>
              <p className="text-xl font-bold text-blue-600">{formatPrice(stats.totalRevenue)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="mr-4">
              <p className="text-sm font-medium text-gray-600">متوسط قيمة الطلب</p>
              <p className="text-xl font-bold text-purple-600">{formatPrice(stats.averageOrderValue)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className={`p-2 rounded-lg ${stats.revenueGrowth >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
              <svg className={`w-6 h-6 ${stats.revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={stats.revenueGrowth >= 0 ? "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" : "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"} />
              </svg>
            </div>
            <div className="mr-4">
              <p className="text-sm font-medium text-gray-600">نمو المبيعات</p>
              <p className={`text-xl font-bold ${stats.revenueGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.revenueGrowth >= 0 ? '+' : ''}{stats.revenueGrowth.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Products */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">أفضل المنتجات</h3>
          <div className="space-y-3">
            {Object.entries(stats.productStats)
              .sort(([,a], [,b]) => b.revenue - a.revenue)
              .slice(0, 5)
              .map(([product, data]) => (
                <div key={product} className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{product}</p>
                    <p className="text-xs text-gray-500">{data.count} طلب</p>
                  </div>
                  <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded">
                    {formatPrice(data.revenue)}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Top Sources */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">أفضل المصادر</h3>
          <div className="space-y-2">
            {Object.entries(stats.sourceCount)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 5)
              .map(([source, count]) => (
                <div key={source} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{source}</span>
                  <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Top Governorates */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">أفضل المحافظات</h3>
          <div className="space-y-2">
            {Object.entries(stats.governorateCount)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 5)
              .map(([governorate, count]) => (
                <div key={governorate} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{governorate}</span>
                  <span className="bg-purple-100 text-purple-800 text-xs font-medium px-2.5 py-0.5 rounded">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">البحث</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بالاسم أو الهاتف..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">الفترة الزمنية</label>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">جميع الفترات</option>
              <option value="today">اليوم</option>
              <option value="week">آخر 7 أيام</option>
              <option value="month">آخر 30 يوم</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">المصدر</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">جميع المصادر</option>
              {uniqueSources.map(source => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">المحافظة</label>
            <select
              value={governorateFilter}
              onChange={(e) => setGovernorateFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">جميع المحافظات</option>
              {uniqueGovernorates.map(gov => (
                <option key={gov} value={gov}>{gov}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">المنتج</label>
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">جميع المنتجات</option>
              {uniqueProducts.map(product => (
                <option key={product} value={product}>{product}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">ترتيب حسب</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="date">التاريخ</option>
              <option value="name">الاسم</option>
              <option value="price">السعر</option>
              <option value="governorate">المحافظة</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">الاتجاه</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="desc">تنازلي</option>
              <option value="asc">تصاعدي</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Summary and Export */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-600">
            عرض <span className="font-bold">{filteredOrders.length}</span> من أصل <span className="font-bold">{stats.total}</span> طلب مشحون
            {filteredOrders.length > 0 && (
              <span className="mr-2">
                | إجمالي القيمة: <span className="font-bold text-green-600">
                  {formatPrice(filteredOrders.reduce((sum, order) => {
                    const price = parseFloat(order.totalPrice?.replace(/[^\d.]/g, '') || '0');
                    return sum + price;
                  }, 0))}
                </span>
              </span>
            )}
          </p>
          
          <button
            onClick={exportToCSV}
            disabled={filteredOrders.length === 0}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            تصدير Excel
          </button>
        </div>
      </div>

      {/* Enhanced Orders Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  رقم الطلب
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  التاريخ
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  العميل
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  الهاتف
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  المحافظة
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  المنتج
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  الكمية
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  السعر
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  المصدر
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  الحالة
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">
                    #{order.id}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(order.orderDate).toLocaleDateString('ar-EG')}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {order.name}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleCopy(order.phone)}
                      className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm font-mono"
                      title={`اضغط لنسخ: ${formatPhoneForDisplay(order.phone)}`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {formatPhoneForDisplay(order.phone)}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm">{order.governorate}</td>
                  <td className="px-4 py-3 text-sm">{order.productName}</td>
                  <td className="px-4 py-3 text-sm font-medium">{order.quantity || '1'}</td>
                  <td className="px-4 py-3 text-sm font-bold text-green-600">{order.totalPrice}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
                      {order.source}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredOrders.length === 0 && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 009.586 13H7" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">لا توجد طلبات مشحونة</h3>
            <p className="mt-1 text-sm text-gray-500">لا توجد طلبات تطابق معايير البحث.</p>
          </div>
        )}
      </div>
    </div>
  );
} 