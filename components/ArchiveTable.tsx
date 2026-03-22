import React, { useState, useMemo } from 'react';
import StatusBadge from './StatusBadge';
import { cleanText, getUniqueProducts } from '../lib/textCleaner';

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
  bostaTrackingNumber?: string;
  bostaState?: string;
  lastBostaUpdate?: string;
}

interface ArchiveTableProps {
  orders: Order[];
  onUpdateOrder: (id: number, updates: Partial<Order>) => Promise<void>;
}

// حالات الشحن التي تظهر في الأرشيف
const ARCHIVE_STATUSES = ['تم الشحن', 'في الطريق', 'تم التسليم', 'فشل التسليم'];

export default function ArchiveTable({ orders, onUpdateOrder }: ArchiveTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const shippedOrders = useMemo(() => {
    return orders.filter(order => {
      const isShipped = ARCHIVE_STATUSES.includes(order.status);
      if (!isShipped) return false;

      const matchesSearch = !searchTerm ||
        String(order.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(order.phone || '').includes(searchTerm) ||
        (order.bostaTrackingNumber && String(order.bostaTrackingNumber).includes(searchTerm)) ||
        (order.notes && String(order.notes).toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesProduct = !productFilter || cleanText(order.productName) === productFilter;
      const matchesStatus = !statusFilter || order.status === statusFilter;
      
      return matchesSearch && matchesProduct && matchesStatus;
    });
  }, [orders, searchTerm, productFilter, statusFilter]);

  // استخدام الدالة المشتركة لإنشاء قائمة منتجات نظيفة ومرتبة للطلبات المشحونة
  const products = useMemo(() => {
    const shippedOrders = orders.filter(o => ARCHIVE_STATUSES.includes(o.status));
    return getUniqueProducts(shippedOrders);
  }, [orders]);

  return (
    <div className="bg-white shadow-lg rounded-lg overflow-hidden">
      <div className="p-4 bg-gray-50 border-b">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">طلبات الشحن (الأرشيف)</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">البحث</label>
          <input
            type="text"
              placeholder="بحث بالاسم، الهاتف، أو رقم التتبع..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">المنتج</label>
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="" className="text-gray-900 bg-white">كل المنتجات</option>
              {products.map(product => (
                <option key={product} value={product} className="text-gray-900 bg-white">{product}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">حالة الشحن</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="" className="text-gray-900 bg-white">كل الحالات</option>
              {ARCHIVE_STATUSES.map(status => (
                <option key={status} value={status} className="text-gray-900 bg-white">{status}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          يتم عرض {shippedOrders.length} طلب.
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
              <th className="px-4 py-3 text-right font-medium text-gray-700">رقم التتبع</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700 hidden md:table-cell">حالة بوسطة</th>
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
                <td className="px-4 py-3">
                  {order.bostaTrackingNumber ? (
                    <a
                      href={`https://bosta.co/tracking-shipments?trackingNumber=${order.bostaTrackingNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 hover:underline font-mono text-xs flex items-center gap-1"
                      title="فتح صفحة التتبع على بوسطة"
                    >
                      📦 {order.bostaTrackingNumber}
                    </a>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  {order.bostaState ? (
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-700">{order.bostaState}</span>
                      {order.lastBostaUpdate && (
                        <span className="text-xs text-gray-400 mt-0.5">{order.lastBostaUpdate}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}