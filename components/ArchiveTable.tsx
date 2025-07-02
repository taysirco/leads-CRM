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

  const shippedOrders = useMemo(() => {
    return orders.filter(order => {
      const isShipped = order.status === 'تم الشحن';
      if (!isShipped) return false;

      const matchesSearch = !searchTerm ||
        order.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.phone.includes(searchTerm) ||
        (order.notes && order.notes.toLowerCase().includes(searchTerm.toLowerCase()));
      
      return matchesSearch;
    });
  }, [orders, searchTerm]);

  return (
    <div className="bg-white shadow-lg rounded-lg overflow-hidden">
      <div className="p-4 bg-gray-50 border-b">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">الأرشيف (الطلبات المشحونة)</h2>
          <input
            type="text"
            placeholder="بحث في الطلبات المشحونة..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-1/3 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <p className="text-sm text-gray-600 mt-2">
          يتم عرض {shippedOrders.length} طلب تم شحنه.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-right font-medium text-gray-700">#</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">الاسم</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">الهاتف</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">المنتج</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {shippedOrders.map((order) => (
              <tr key={order.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-800 font-medium">{order.id}</td>
                <td className="px-4 py-3 text-gray-900 font-semibold">{order.name}</td>
                <td className="px-4 py-3 text-gray-800 font-mono">{order.phone}</td>
                <td className="px-4 py-3 text-gray-800">{order.productName}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={order.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 