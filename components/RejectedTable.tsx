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

interface RejectedTableProps {
  orders: Order[];
  onUpdateOrder: (id: number, updates: Partial<Order>) => Promise<void>;
}

export default function RejectedTable({ orders, onUpdateOrder }: RejectedTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [governorateFilter, setGovernorateFilter] = useState('');
  const [loadingOrders, setLoadingOrders] = useState<Set<number>>(new Set());

  // Calculate statistics
  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const thisWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toDateString();
    const thisMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toDateString();

    const todayRejected = orders.filter(order => 
      new Date(order.orderDate).toDateString() === today
    ).length;

    const weekRejected = orders.filter(order => 
      new Date(order.orderDate) >= new Date(thisWeek)
    ).length;

    const monthRejected = orders.filter(order => 
      new Date(order.orderDate) >= new Date(thisMonth)
    ).length;

    // Count by source
    const sourceCount = orders.reduce((acc, order) => {
      acc[order.source || 'غير محدد'] = (acc[order.source || 'غير محدد'] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Count by governorate
    const governorateCount = orders.reduce((acc, order) => {
      acc[order.governorate || 'غير محدد'] = (acc[order.governorate || 'غير محدد'] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: orders.length,
      today: todayRejected,
      week: weekRejected,
      month: monthRejected,
      sourceCount,
      governorateCount
    };
  }, [orders]);

  // Filter data
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = !searchTerm || 
        order.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.phone.includes(searchTerm);
      
      const matchesSource = !sourceFilter || order.source === sourceFilter;
      const matchesGovernorate = !governorateFilter || order.governorate === governorateFilter;

      return matchesSearch && matchesSource && matchesGovernorate;
    });
  }, [orders, searchTerm, sourceFilter, governorateFilter]);

  const uniqueSources = [...new Set(orders.map(order => order.source).filter(Boolean))];
  const uniqueGovernorates = [...new Set(orders.map(order => order.governorate).filter(Boolean))];

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatPhoneNumber = (phone: string) => {
    return phone.replace(/\+/g, '');
  };

  const handleRestoreOrder = async (orderId: number, newStatus: string) => {
    if (!confirm(`هل أنت متأكد من تغيير حالة الطلب إلى "${newStatus}"؟`)) {
      return;
    }

    setLoadingOrders(prev => new Set(prev.add(orderId)));
    try {
      await onUpdateOrder(orderId, { status: newStatus });
    } catch (error) {
      console.error(`Failed to restore order ${orderId}:`, error);
      alert(`فشل في استعادة الطلب #${orderId}.`);
    } finally {
      setLoadingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-red-200">
          <div className="flex items-center">
            <div className="p-2 bg-red-100 rounded-lg">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div className="mr-4">
              <p className="text-sm font-medium text-gray-600">إجمالي المرفوضة</p>
              <p className="text-2xl font-bold text-red-600">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="mr-4">
              <p className="text-sm font-medium text-gray-600">اليوم</p>
              <p className="text-2xl font-bold text-orange-600">{stats.today}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="mr-4">
              <p className="text-sm font-medium text-gray-600">هذا الأسبوع</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.week}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 00-2 2v6a2 2 0 002 2zm10-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2m0-8V9a2 2 0 00-2-2h-2m2 2a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="mr-4">
              <p className="text-sm font-medium text-gray-600">هذا الشهر</p>
              <p className="text-2xl font-bold text-purple-600">{stats.month}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Rejection Sources */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">المصادر الأكثر رفضاً</h3>
          <div className="space-y-2">
            {Object.entries(stats.sourceCount)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 5)
              .map(([source, count]) => (
                <div key={source} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{source}</span>
                  <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Top Rejection Governorates */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">المحافظات الأكثر رفضاً</h3>
          <div className="space-y-2">
            {Object.entries(stats.governorateCount)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 5)
              .map(([governorate, count]) => (
                <div key={governorate} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{governorate}</span>
                  <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">البحث بالاسم أو الهاتف</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
      </div>

      {/* Results Summary */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <p className="text-sm text-gray-600">
          عرض <span className="font-bold">{filteredOrders.length}</span> من أصل <span className="font-bold">{orders.length}</span> طلب مرفوض
        </p>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
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
                  السعر
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  المصدر
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  التاريخ
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  الحالة
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  الملاحظات
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  الإجراءات
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.map((order) => {
                const isLoading = loadingOrders.has(order.id);
                return (
                <tr key={order.id} className={`hover:bg-gray-50 ${isLoading ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {order.name}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopy(order.phone)}
                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm font-mono"
                        title={`اضغط لنسخ: ${formatPhoneForDisplay(order.phone)}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        {formatPhoneForDisplay(order.phone)}
                      </button>
                      {order.phone && (
                        <a
                          href={`https://wa.me/${formatPhoneNumber(order.phone)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50"
                          title={`WhatsApp: ${order.phone}`}
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                          </svg>
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">{order.governorate}</td>
                  <td className="px-4 py-3 text-sm">{order.productName}</td>
                  <td className="px-4 py-3 text-sm font-medium">{order.totalPrice}</td>
                  <td className="px-4 py-3 text-sm">{order.source}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(order.orderDate).toLocaleDateString('ar-EG')}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                    {order.notes || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleRestoreOrder(order.id, 'جديد')}
                        disabled={isLoading}
                        className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded hover:bg-green-200 disabled:opacity-50"
                        title="إعادة الطلب إلى الطلبات الجديدة"
                      >
                        {isLoading ? '...' : 'جديد'}
                      </button>
                      <button
                        onClick={() => handleRestoreOrder(order.id, 'في انتظار تأكيد العميل')}
                        disabled={isLoading}
                        className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded hover:bg-yellow-200 disabled:opacity-50"
                        title="نقل إلى في انتظار التأكيد"
                      >
                        {isLoading ? '...' : 'انتظار'}
                      </button>
                      <button
                        onClick={() => handleRestoreOrder(order.id, 'تم التأكيد')}
                        disabled={isLoading}
                        className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200 disabled:opacity-50"
                        title="تأكيد الطلب مباشرة"
                      >
                        {isLoading ? '...' : 'تأكيد'}
                      </button>
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>

        {filteredOrders.length === 0 && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">لا توجد طلبات مرفوضة</h3>
            <p className="mt-1 text-sm text-gray-500">لا توجد طلبات تطابق معايير البحث.</p>
          </div>
        )}
      </div>
    </div>
  );
} 