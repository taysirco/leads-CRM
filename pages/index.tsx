import useSWR from 'swr';
import { useState, useEffect, useMemo } from 'react';
import Dashboard from '../components/Dashboard';
import OrdersTable from '../components/OrdersTable';
import BostaExport from '../components/BostaExport';
import ArchiveTable from '../components/ArchiveTable';
import RejectedTable from '../components/RejectedTable';
import StockManagement from '../components/StockManagement';
import LiveStats from '../components/LiveStats';
import SmartNotificationSystem from '../components/SmartNotificationSystem';
import SmartNotificationSettings from '../components/SmartNotificationSettings';
import NotificationTester from '../components/NotificationTester';
import RealTimeStatusTracker from '../components/RealTimeStatusTracker';
import { useRealTimeOrderTracking } from '../hooks/useRealTimeOrderTracking';
import { useCurrentUser } from '../hooks/useCurrentUser';

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
  const { user } = useCurrentUser();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'follow-up' | 'export' | 'archive' | 'rejected' | 'stock'>('orders');
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
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
    { 
      refreshInterval: notificationSettings.autoRefresh ? Math.min(notificationSettings.refreshInterval * 1000, 10000) : 0, // حد أقصى 10 ثوان
      revalidateOnFocus: true, // إعادة تحديث عند التركيز على الصفحة
      revalidateOnReconnect: true, // إعادة تحديث عند إعادة الاتصال
      dedupingInterval: 5000 // منع التكرار لمدة 5 ثوان
    }
  );
  
  const orders = data?.data || [];
  
  const {
    notifications,
    removeNotification,
    clearAllNotifications,
    clearNotificationsByType,
    notifySuccess,
    notifyError,
    notifyWarning,
    settings: smartNotificationSettings,
    updateSettings: updateNotificationSettings,
    newOrdersCount,
    criticalCount,
    hasUserInteracted: smartHasInteracted,
    orderStats,
    statusStats,
    criticalOrders,
    statusChangeHistory
  } = useRealTimeOrderTracking(orders, hasInteracted);

  const handleUpdateOrder = async (orderId: number, updates: any): Promise<void> => {
    try {
      // إذا كان orderId = 0، فهذا يعني طلب إعادة جلب البيانات فقط
      if (orderId === 0) {
        console.log('🔄 إعادة جلب البيانات...');
        await mutate();
        return;
      }
      
      const response = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowNumber: orderId, ...updates }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        // معالجة خاصة لأخطاء المخزون
        if (result.stockError) {
          const errorMessage = updates.status === 'تم الشحن' 
            ? `❌ لا يمكن شحن الطلب رقم ${orderId}\n\n${result.message}`
            : result.message;
            
          if (result.availableQuantity !== undefined) {
            const details = `\n\n📦 التفاصيل:\n• المنتج: ${result.productName}\n• المطلوب: ${result.requiredQuantity}\n• المتوفر: ${result.availableQuantity}\n• النقص: ${result.requiredQuantity - result.availableQuantity}`;
            
            notifyError(errorMessage + details, result);
          } else {
            notifyError(errorMessage, result);
          }
        } else {
          // خطأ عادي
          notifyError(result.message || 'فشل في تحديث الطلب. حاول مرة أخرى.', result);
        }
        throw new Error(result.message || 'فشل في التحديث');
      }
      
      // نجح التحديث
      await mutate();
      
      // عرض رسالة نجاح مع معلومات المخزون إن وُجدت
      if (result.stockResult && result.stockResult.success) {
        notifySuccess(`✅ تم شحن الطلب رقم ${orderId}\n📦 ${result.stockResult.message}`, result);
      } else if (updates.status === 'تم الشحن') {
        notifySuccess(`تم تحديث الطلب رقم ${orderId} بنجاح`, result);
      }
      
      // عرض تحذيرات المخزون إن وُجدت
      if (result.warning) {
        notifyWarning(result.warning, result);
      }
      
    } catch (error) {
      console.error('Error updating order:', error);
      throw error;
    }
  };

  const handleAssign = async () => {
    try {
      notifyWarning('🔄 جاري توزيع الليدز غير المعيّنة بالتساوي بين موظفي الكول سنتر...');
      
      const res = await fetch('/api/assign', { method: 'POST' });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.message || 'فشل التوزيع');
      
      // رسالة تفصيلية عن نتيجة التوزيع
      let message = data.message;
      if (data.distributed > 0) {
        const getEmployeeName = (username: string) => {
          const nameMap: Record<string, string> = {
            'heba.': 'هبة',
            'ahmed.': 'أحمد', 
            'aisha.': 'عائشة'
          };
          return nameMap[username] || username;
        };
        
        const distDetails = Object.entries(data.currentDistribution || {})
          .map(([emp, count]) => {
            const name = getEmployeeName(emp);
            return `${name}: ${count}`;
          })
          .join(' | ');
        message += `\n📊 التوزيع النهائي: ${distDetails}`;
        
        if (data.remainingUnassigned > 0) {
          message += `\n⚠️ ${data.remainingUnassigned} ليد متبقي غير معين`;
        }
        
        if (!data.isBalanced) {
          message += `\n⚡ فارق التوزيع: ${data.balanceDifference} (قد تحتاج توزيع إضافي)`;
        } else {
          message += `\n✅ التوزيع متوازن تماماً`;
        }
      }
      
      if (data.distributed > 0) {
        notifySuccess(message, data);
      } else {
        notifyWarning(message, data);
      }
      
      await mutate(); // تحديث البيانات بعد التوزيع
    } catch (e: any) {
      notifyError(e.message + '\n💡 تأكد من الاتصال بالإنترنت وحاول مرة أخرى', e);
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

  const getFilteredOrders = (tabId: string) => {
    if (!orders) return [];
    
    let filteredOrders = [] as any[];
    
    switch (tabId) {
      case 'orders':
        filteredOrders = orders.filter((order: any) => 
          !order.status || 
          order.status === 'جديد' || 
          order.status === 'لم يرد'
        );
        filteredOrders = filteredOrders.sort((a: any, b: any) => {
          const statusA = a.status || 'جديد';
          const statusB = b.status || 'جديد';
          if (statusA === 'جديد' && statusB !== 'جديد') return -1;
          if (statusA !== 'جديد' && statusB === 'جديد') return 1;
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

  // حساب إحصائيات التوزيع للعرض
  const distributionStats = useMemo(() => {
    const employees = ['heba.', 'ahmed.', 'aisha.'];
    const counts = { 'heba.': 0, 'ahmed.': 0, 'aisha.': 0, 'غير معين': 0 };
    
    orders.forEach((order: any) => {
      const assignee = (order.assignee || '').trim();
      if (employees.includes(assignee)) {
        counts[assignee as keyof typeof counts]++;
      } else {
        counts['غير معين']++;
      }
    });
    
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const employeeCounts = [counts['heba.'], counts['ahmed.'], counts['aisha.']];
    const max = Math.max(...employeeCounts);
    const min = Math.min(...employeeCounts);
    const imbalance = max - min;
    const maxAllowed = Math.ceil(total * 0.1); // 10% كحد أقصى للاختلاف
    const isBalanced = total > 0 ? imbalance <= maxAllowed : true;
    
    return { counts, total, imbalance, isBalanced, maxAllowed };
  }, [orders]);

  // أسماء العرض للموظفين من البيئة إن توفرت
  const employeeDisplayNames = useMemo(() => {
    const envVal = process.env.NEXT_PUBLIC_CALL_CENTER_USERS_DISPLAY || '';
    // صيغة: heba.:هبة,ahmed.:أحمد,aisha.:عائشة
    const map = new Map<string, string>();
    envVal.split(/[,;]+/).map(s => s.trim()).filter(Boolean).forEach(pair => {
      const [u, n] = pair.split(':');
      if (u && n) map.set(u.trim(), n.trim());
    });
    return (username: string) => map.get(username) || (username === 'heba.' ? 'هبة' : username === 'ahmed.' ? 'أحمد' : username === 'aisha.' ? 'عائشة' : username);
  }, []);

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-600 text-xl">فشل في جلب البيانات</p>
        <p className="text-gray-600 mt-2">{(error as any).message}</p>
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

  const filteredOrders = getFilteredOrders(activeTab);

  return (
    <>
      <SmartNotificationSystem
        notifications={notifications}
        onDismiss={removeNotification}
        onDismissAll={clearAllNotifications}
        onDismissType={(type: string) => clearNotificationsByType(type as any)}
        hasUserInteracted={smartHasInteracted}
      />
      
      <SmartNotificationSettings
        settings={smartNotificationSettings}
        onSettingsChange={updateNotificationSettings}
        isOpen={showNotificationSettings}
        onClose={() => setShowNotificationSettings(false)}
      />
      
      <NotificationTester />
      
      <RealTimeStatusTracker
        statusStats={statusStats}
        criticalOrders={criticalOrders}
        statusChangeHistory={statusChangeHistory}
        totalOrders={orders.length}
      />

      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto p-2 sm:p-4">
          <header className="mb-4 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
              <div>
                <h1 className="text-xl sm:text-3xl font-bold text-gray-900">نظام إدارة الطلبات</h1>
                <p className="text-gray-600 mt-1 sm:mt-2 text-sm sm:text-base">إدارة شاملة لطلبات العملاء مع تزامن فوري مع Google Sheets</p>
                {user && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-2">
                    <span className="text-xs sm:text-sm text-blue-600 font-medium">
                      مرحباً {user.displayName || user.username} ({user.role === 'admin' ? 'مدير النظام' : 'موظف كول سنتر'})
                    </span>
                    {user.role === 'admin' && (
                      <div className={`text-xs px-2 py-1 rounded-full ${
                        distributionStats.isBalanced ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {distributionStats.isBalanced ? '✅ توزيع متوازن' : `⚠️ فارق: ${distributionStats.imbalance}`}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {user?.role === 'admin' && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                  <div className="text-right text-xs sm:text-sm text-gray-600 order-2 sm:order-1 sm:mr-4">
                    <div className="grid grid-cols-2 sm:grid-cols-2 gap-1 sm:gap-2 text-xs">
                      <span>إجمالي: {distributionStats.total}</span>
                      <span className={distributionStats.counts['غير معين'] > 0 ? 'text-orange-600 font-medium' : ''}>
                        غير معين: {distributionStats.counts['غير معين']}
                      </span>
                      <span>هبة: {distributionStats.counts['heba.']}</span>
                      <span>أحمد: {distributionStats.counts['ahmed.']}</span>
                      <span>عائشة: {distributionStats.counts['aisha.']}</span>
                      <span className="text-gray-500">
                        حد الفارق: {distributionStats.maxAllowed}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 order-1 sm:order-2">
                    <button
                      onClick={handleAssign}
                      className={`px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl font-medium transition-colors text-xs sm:text-sm ${
                        distributionStats.counts['غير معين'] > 0 || !distributionStats.isBalanced
                          ? 'bg-red-500 hover:bg-red-600 text-white shadow-md animate-pulse'
                          : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                      }`}
                      title={`توزيع تلقائي لليدز غير المعيّنة (${distributionStats.counts['غير معين']} ليد)`}
                    >
                      {distributionStats.counts['غير معين'] > 0 
                        ? `⚡ توزيع ${distributionStats.counts['غير معين']} ليد` 
                        : '🔄 إعادة توزيع'}
                    </button>
                    <button
                      onClick={() => setShowSettings(true)}
                      className="bg-gradient-to-r from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 text-gray-700 px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl font-medium transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2 text-xs sm:text-sm"
                      title="إعدادات الإشعارات"
                    >
                      الإعدادات
                    </button>
                  </div>
                </div>
              )}
              {user?.role !== 'admin' && (
              <button
                onClick={() => setShowSettings(true)}
                  className="bg-gradient-to-r from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 text-gray-700 px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl font-medium transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2 text-xs sm:text-sm self-start sm:self-auto"
                title="إعدادات الإشعارات"
              >
                الإعدادات
              </button>
              )}
            </div>
          </header>

          <LiveStats orders={orders} />

          <div className="bg-white rounded-lg shadow-sm mb-4 sm:mb-6 p-1">
            <nav className="flex flex-wrap sm:flex-nowrap gap-1 sm:space-x-1 sm:space-x-reverse">
              {[
                { id: 'dashboard', name: 'لوحة التحكم', icon: '📊' },
                { id: 'orders', name: 'الطلبات النشطة', icon: '📋' },
                { id: 'follow-up', name: 'متابعة', icon: '👁️' },
                { id: 'export', name: 'تصدير بوسطة', icon: '📤' },
                { id: 'archive', name: 'طلبات الشحن', icon: '🚚' },
                { id: 'rejected', name: 'الطلبات المهملة', icon: '🗑️' },
                ...(user?.role === 'admin' ? [{ id: 'stock', name: 'إدارة المخزون', icon: '📦' }] : []),
              ].map((tab: any) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 rounded-md font-medium transition-all text-xs sm:text-sm ${
                    activeTab === tab.id
                      ? 'bg-blue-100 text-blue-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-xs sm:text-base">{tab.icon}</span>
                  <span className="hidden sm:inline">{tab.name}</span>
                  <span className="sm:hidden text-xs">{
                    tab.id === 'dashboard' ? 'لوحة' :
                    tab.id === 'orders' ? 'نشطة' :
                    tab.id === 'follow-up' ? 'متابعة' :
                    tab.id === 'export' ? 'تصدير' :
                    tab.id === 'archive' ? 'شحن' :
                    tab.id === 'stock' ? 'مخزون' :
                    'مهملة'
                  }</span>
                  {(tab.id === 'orders' && tabCounts.orders > 0) && (
                    <span className="bg-red-500 text-white text-xs rounded-full px-1 sm:px-2 py-1 min-w-[16px] sm:min-w-[20px] text-center text-xs">
                      {tabCounts.orders}
                    </span>
                  )}
                  {(tab.id === 'follow-up' && tabCounts.followUp > 0) && (
                    <span className="bg-orange-500 text-white text-xs rounded-full px-1 sm:px-2 py-1 min-w-[16px] sm:min-w-[20px] text-center text-xs">
                      {tabCounts.followUp}
                    </span>
                  )}
                  {(tab.id === 'export' && tabCounts.export > 0) && (
                    <span className="bg-green-500 text-white text-xs rounded-full px-1 sm:px-2 py-1 min-w-[16px] sm:min-w-[20px] text-center text-xs">
                      {tabCounts.export}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="space-y-6">
            {activeTab === 'dashboard' && <Dashboard />}
            {activeTab === 'orders' && (
              <OrdersTable
                orders={getFilteredOrders('orders')}
                onUpdateOrder={handleUpdateOrder}
              />
            )}
            {activeTab === 'follow-up' && (
                <OrdersTable 
                orders={getFilteredOrders('follow-up')}
                  onUpdateOrder={handleUpdateOrder} 
                />
            )}
            {activeTab === 'export' && (
                <BostaExport
                orders={getFilteredOrders('export')}
                  selectedOrders={selectedOrders}
                  onSelectOrder={handleSelectOrder}
                  onSelectAll={handleSelectAll}
                  onDeselectAll={handleDeselectAll}
                  onUpdateOrder={handleUpdateOrder}
                />
            )}
            {activeTab === 'archive' && (
                <ArchiveTable 
                orders={getFilteredOrders('archive')} 
                  onUpdateOrder={handleUpdateOrder} 
                />
            )}
            {activeTab === 'rejected' && (
                <RejectedTable 
                orders={getFilteredOrders('rejected')} 
                  onUpdateOrder={handleUpdateOrder} 
                />
            )}
            {activeTab === 'stock' && user?.role === 'admin' && (
              <StockManagement />
            )}
          </div>
        </div>
      </div>


    </>
  );
} 