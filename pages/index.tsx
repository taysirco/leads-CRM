import useSWR from 'swr';
import { useState, useEffect, useMemo } from 'react';
import Dashboard from '../components/Dashboard';
import OrdersTable from '../components/OrdersTable';
import BostaExport from '../components/BostaExport';
import ArchiveTable from '../components/ArchiveTable';
import RejectedTable from '../components/RejectedTable';
import NotificationSystem from '../components/NotificationSystem';
import NotificationPermission from '../components/NotificationPermission';
import LiveStats from '../components/LiveStats';
import EnhancedAlerts from '../components/EnhancedAlerts';
import NotificationSettingsComponent from '../components/NotificationSettings';
import { useNotifications } from '../hooks/useNotifications';

interface Lead {
  id: number;
  orderDate: string;
  name: string;
  phone: string;
  governorate: string;
  status: string;
  productName: string;
  totalPrice: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to fetch data');
  }
  return res.json();
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'follow-up' | 'export' | 'archive' | 'rejected'>('orders');
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<any>({
    autoRefresh: true,
    refreshInterval: 30,
    soundEnabled: true
  });
  const [hasInteracted, setHasInteracted] = useState(false);
  
  useEffect(() => {
    const handleInteraction = () => {
      setHasInteracted(true);
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };

    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);

    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  const { data, error, mutate } = useSWR(
    '/api/orders', 
    fetcher, 
    { refreshInterval: notificationSettings.autoRefresh ? notificationSettings.refreshInterval * 1000 : 0 }
  );
  
  // Get all orders for notification system
  const orders = data?.data || [];
  
  // Initialize notification system
  const { 
    notifications, 
    addNotification, 
    removeNotification, 
    removeAllNotifications 
  } = useNotifications(orders, hasInteracted);

  // Get new orders count for enhanced alerts
  const newOrdersCount = notifications.filter(n => n.type === 'new_order').length;

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
      // Show error notification
      addNotification({
        type: 'error',
        title: 'خطأ في التحديث',
        message: 'فشل في تحديث الطلب. حاول مرة أخرى.',
        duration: 5000
      });
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

  // Calculate counts for each tab independently
  const tabCounts = useMemo(() => {
    const allOrders = data?.data || [];
    return {
      orders: allOrders.filter((order: any) => 
        !order.status || 
        order.status === 'جديد' || 
        order.status === 'لم يرد'
      ).length,
      followUp: allOrders.filter((order: any) => 
        order.status === 'في انتظار تأكيد العميل' || 
        order.status === 'تم التواصل معه واتساب'
      ).length,
      export: allOrders.filter((order: any) => order.status === 'تم التأكيد').length,
    };
  }, [data]);

  // Filter orders based on active tab
  const getFilteredOrders = () => {
    if (!orders) return [];
    
    let filteredOrders = [];
    
    switch (activeTab) {
      case 'orders':
        filteredOrders = orders.filter((order: any) => 
          !order.status || 
          order.status === 'جديد' || 
          order.status === 'لم يرد'
        );
        // ترتيب الطلبات النشطة حسب التاريخ - الأحدث أولاً
        filteredOrders = filteredOrders.sort((a: any, b: any) => {
          const dateA = new Date(a.orderDate);
          const dateB = new Date(b.orderDate);
          return dateB.getTime() - dateA.getTime();
        });
        break;
      case 'follow-up':
        filteredOrders = orders.filter((order: any) => 
          order.status === 'في انتظار تأكيد العميل' || 
          order.status === 'تم التواصل معه واتساب'
        );
        break;
      case 'export':
        filteredOrders = orders.filter((order: any) => order.status === 'تم التأكيد');
        break;
      case 'archive':
        filteredOrders = orders.filter((order: any) => order.status === 'تم الشحن');
        break;
      case 'rejected':
        filteredOrders = orders.filter((order: any) => order.status === 'رفض التأكيد');
        break;
      default:
        filteredOrders = orders;
    }
    
    return filteredOrders;
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
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-600 mt-4">جاري تحميل البيانات...</p>
      </div>
    </div>
  );

  const filteredOrders = getFilteredOrders();

  return (
    <>
      {/* Enhanced Alert System */}
      <EnhancedAlerts 
        hasNewOrders={newOrdersCount > 0}
        newOrdersCount={newOrdersCount}
        initialUserInteraction={hasInteracted}
      />
      
      {/* Notification Permission Request */}
      <NotificationPermission />
      
      {/* Notification System */}
      <NotificationSystem
        notifications={notifications}
        onDismiss={removeNotification}
        onDismissAll={removeAllNotifications}
        soundEnabled={notificationSettings.soundEnabled}
        initialUserInteraction={hasInteracted}
      />

      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto p-4">
          <header className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">نظام إدارة الطلبات</h1>
                <p className="text-gray-600 mt-2">إدارة شاملة لطلبات العملاء مع تزامن فوري مع Google Sheets</p>
              </div>
              
              {/* Settings Button */}
              <button
                onClick={() => setShowSettings(true)}
                className="bg-gradient-to-r from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 text-gray-700 px-4 py-2 rounded-xl font-medium transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2"
                title="إعدادات الإشعارات"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                الإعدادات
              </button>
            </div>
          </header>

          {/* Live Statistics */}
          <LiveStats orders={orders} />

          {/* Navigation Tabs */}
          <div className="bg-white rounded-lg shadow-sm mb-6 p-1">
            <nav className="flex space-x-1 space-x-reverse">
              {[
                { id: 'dashboard', name: 'لوحة التحكم', icon: '📊' },
                { id: 'orders', name: 'الطلبات النشطة', icon: '📋' },
                { id: 'follow-up', name: 'متابعة', icon: '👁️' },
                { id: 'export', name: 'تصدير بوسطة', icon: '📤' },
                { id: 'archive', name: 'طلبات الشحن', icon: '🚚' },
                { id: 'rejected', name: 'الطلبات المهملة', icon: '🗑️' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-blue-100 text-blue-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.name}</span>
                  {(tab.id === 'orders' && tabCounts.orders > 0) && (
                    <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                      {tabCounts.orders}
                    </span>
                  )}
                  {(tab.id === 'follow-up' && tabCounts.followUp > 0) && (
                    <span className="bg-orange-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                      {tabCounts.followUp}
                    </span>
                  )}
                  {(tab.id === 'export' && tabCounts.export > 0) && (
                    <span className="bg-green-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                      {tabCounts.export}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <main>
            {activeTab === 'dashboard' && <Dashboard />}
            {activeTab === 'orders' && (
              <div className="text-gray-900">
                <OrdersTable 
                  orders={filteredOrders} 
                  onUpdateOrder={handleUpdateOrder} 
                />
              </div>
            )}
            {activeTab === 'follow-up' && (
              <div className="text-gray-900">
                <OrdersTable 
                  orders={filteredOrders} 
                  onUpdateOrder={handleUpdateOrder} 
                />
              </div>
            )}
            {activeTab === 'export' && (
              <div className="text-gray-900">
                <BostaExport
                  orders={filteredOrders}
                  selectedOrders={selectedOrders}
                  onSelectOrder={handleSelectOrder}
                  onSelectAll={handleSelectAll}
                  onDeselectAll={handleDeselectAll}
                  onUpdateOrder={handleUpdateOrder}
                />
              </div>
            )}
            {activeTab === 'archive' && (
              <div className="text-gray-900">
                <ArchiveTable 
                  orders={filteredOrders} 
                  onUpdateOrder={handleUpdateOrder} 
                />
              </div>
            )}
            {activeTab === 'rejected' && (
              <div className="text-gray-900">
                <RejectedTable 
                  orders={filteredOrders} 
                  onUpdateOrder={handleUpdateOrder} 
                />
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Notification Settings Modal */}
      <NotificationSettingsComponent
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSettingsChange={setNotificationSettings}
      />
    </>
  );
} 