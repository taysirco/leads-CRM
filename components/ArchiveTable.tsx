import React, { useState, useMemo } from 'react';
import StatusBadge from './StatusBadge';

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
  const [loadingOrders, setLoadingOrders] = useState<Set<number>>(new Set());

  const archivedOrders = useMemo(() => {
    return orders.filter(order => {
      const isArchived = ['رفض التأكيد', 'تم الشحن'].includes(order.status);
      if (!isArchived) return false;

      const matchesSearch = !searchTerm ||
        order.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.phone.includes(searchTerm) ||
        order.notes.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesSearch;
    });
  }, [orders, searchTerm]);

  const handleRevertStatus = async (orderId: number) => {
    setLoadingOrders(prev => new Set(prev.add(orderId)));
    try {
      await onUpdateOrder(orderId, { status: 'جديد' });
    } catch (error) {
      console.error(`Failed to revert order ${orderId}:`, error);
      alert(`فشل في إعادة الطلب #${orderId}.`);
    } finally {
      setLoadingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  return (
    <div className="bg-white shadow-lg rounded-lg overflow-hidden">
      <div className="p-4 bg-gray-50 border-b">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">الأرشيف (الطلبات المرفوضة والمشحونة)</h2>
          <input
            type="text"
            placeholder="بحث في الأرشيف..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-1/3 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <p className="text-sm text-gray-600 mt-2">
          يتم عرض {archivedOrders.length} طلب هنا كمرجع.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="px-4 py-3 text-right font-medium text-gray-700">رقم الطلب</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">تاريخ الطلب</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">الاسم</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">الهاتف</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">المنتج</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">السعر</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">الملاحظات</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">الحالة</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {archivedOrders.map((order) => {
              const isLoading = loadingOrders.has(order.id);
              return (
                <tr key={order.id} className={`hover:bg-gray-50 ${isLoading ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">#{order.id}</td>
                  <td className="px-4 py-3">
                    {order.orderDate ? new Date(order.orderDate).toLocaleDateString('ar-EG') : '-'}
                  </td>
                  <td className="px-4 py-3 font-medium">{order.name}</td>
                  <td className="px-4 py-3">{order.phone}</td>
                  <td className="px-4 py-3">{order.productName}</td>
                  <td className="px-4 py-3">{order.totalPrice}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{order.notes || '-'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3">
                    {order.status === 'رفض التأكيد' && (
                      <button
                        onClick={() => handleRevertStatus(order.id)}
                        disabled={isLoading}
                        className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        title="إعادة الطلب إلى قائمة الطلبات النشطة"
                      >
                        {isLoading ? 'جاري...' : 'إعادة للطلبات'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
} 