import useSWR from 'swr';
import { useState } from 'react';
import Dashboard from '../components/Dashboard';
import OrdersTable from '../components/OrdersTable';
import BostaExport from '../components/BostaExport';
import ArchiveTable from '../components/ArchiveTable';
import RejectedTable from '../components/RejectedTable';

interface Lead {
  id: number;
  orderDate: string;
  name: string;
  phone: string;
  governorate: string;
  status: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    let message = 'Error fetching data';
    try {
      const body = await res.json();
      message = body.error || message;
    } catch {}
    throw new Error(message);
  }
  return res.json();
};

export default function Home() {
  const { data, error, mutate } = useSWR('/api/orders', fetcher, { refreshInterval: 30000 });
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'export' | 'archive' | 'rejected'>('orders');
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);

  const handleUpdateOrder = async (orderId: number, updates: any): Promise<void> => {
    try {
      await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowNumber: orderId, ...updates }),
      });
      await mutate();
    } catch (error) {
      console.error('Error updating order:', error);
      throw error;
    }
  };

  const handleSelectOrder = (orderId: number) => {
    setSelectedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleSelectAll = () => {
    const orders = data?.data || [];
    const exportableOrders = orders.filter((order: any) => 
      order.status === 'تم التأكيد' && 
      order.name && 
      order.phone && 
      order.governorate &&
      order.address
    );
    setSelectedOrders(exportableOrders.map((order: any) => order.id));
  };

  const handleDeselectAll = () => {
    setSelectedOrders([]);
  };

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-600 text-xl">فشل في جلب البيانات</p>
        <p className="text-gray-600 mt-2">{error.message}</p>
      </div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-600 mt-4">جاري تحميل البيانات...</p>
      </div>
    </div>
  );

  const orders = data?.data || [];
  
  const mainOrders = orders.filter(
    (order: any) => !['تم التأكيد', 'رفض التأكيد', 'تم الشحن'].includes(order.status)
  );

  const rejectedOrders = orders.filter((order: any) => order.status === 'رفض التأكيد');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">نظام إدارة الطلبات - سماريكتنج</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">آخر تحديث: {new Date().toLocaleTimeString('ar-EG')}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <nav className="flex space-x-reverse space-x-4 border-b">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`py-2 px-4 font-medium text-sm transition-colors ${
              activeTab === 'dashboard'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            لوحة التحكم
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`py-2 px-4 font-medium text-sm transition-colors ${
              activeTab === 'orders'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            الطلبات ({mainOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`py-2 px-4 font-medium text-sm transition-colors ${
              activeTab === 'export'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            تصدير بوسطة
          </button>
          <button
            onClick={() => setActiveTab('archive')}
            className={`py-2 px-4 font-medium text-sm transition-colors ${
              activeTab === 'archive'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            الأرشيف (مشحون)
          </button>
          <button
            onClick={() => setActiveTab('rejected')}
            className={`py-2 px-4 font-medium text-sm transition-colors ${
              activeTab === 'rejected'
                ? 'border-b-2 border-red-600 text-red-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            المهملة (مرفوض)
          </button>
        </nav>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'orders' && (
          <OrdersTable orders={mainOrders} onUpdateOrder={handleUpdateOrder} />
        )}
        {activeTab === 'export' && (
          <BostaExport 
            orders={orders}
            selectedOrders={selectedOrders}
            onUpdateOrder={handleUpdateOrder}
            onSelectOrder={handleSelectOrder}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
          />
        )}
        {activeTab === 'archive' && <ArchiveTable orders={orders} onUpdateOrder={handleUpdateOrder} />}
        {activeTab === 'rejected' && <RejectedTable orders={rejectedOrders} onUpdateOrder={handleUpdateOrder} />}
      </main>
    </div>
  );
} 