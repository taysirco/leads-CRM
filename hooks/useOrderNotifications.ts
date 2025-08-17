import { useEffect, useRef } from 'react';
import { useSmartNotifications, SmartNotification, NotificationType } from './useSmartNotifications';

interface Order {
  id: number;
  customerName: string;
  productName: string;
  status: string;
  source: string;
  assignee?: string;
  createdAt?: string;
  totalPrice?: string;
}

export const useOrderNotifications = (orders: Order[], hasUserInteracted: boolean) => {
  const previousOrdersRef = useRef<Order[]>([]);
  const isInitialLoad = useRef(true);
  
  const {
    notifications,
    addNotification,
    removeNotification,
    clearAllNotifications,
    clearNotificationsByType,
    stats,
    settings,
    updateSettings,
    hasUserInteracted: smartHasInteracted
  } = useSmartNotifications(hasUserInteracted);

  // مراقبة الطلبات الجديدة
  useEffect(() => {
    // تجاهل التحميل الأولي
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      previousOrdersRef.current = [...orders];
      return;
    }

    if (!orders || orders.length === 0) {
      previousOrdersRef.current = [];
      return;
    }

    const previousOrders = previousOrdersRef.current;
    const previousIds = new Set(previousOrders.map(order => order.id));
    
    // البحث عن الطلبات الجديدة
    const newOrders = orders.filter(order => !previousIds.has(order.id));
    
    // البحث عن الطلبات المحدثة
    const updatedOrders = orders.filter(order => {
      if (!previousIds.has(order.id)) return false;
      
      const previousOrder = previousOrders.find(p => p.id === order.id);
      if (!previousOrder) return false;
      
      // فحص التغييرات المهمة
      return (
        previousOrder.status !== order.status ||
        previousOrder.assignee !== order.assignee ||
        previousOrder.customerName !== order.customerName ||
        previousOrder.productName !== order.productName
      );
    });

    // إضافة إشعارات للطلبات الجديدة
    newOrders.forEach(order => {
      const priority = determineOrderPriority(order);
      const displayModes = getDisplayModesForOrder(order, priority);
      
      addNotification({
        type: 'new_order',
        priority,
        title: '🛒 طلب جديد',
        message: `طلب جديد من ${order.customerName} - ${order.productName}`,
        displayModes,
        duration: priority === 'critical' ? 0 : 8000, // الحرج لا ينتهي
        persistent: priority === 'critical',
        preventDuplicates: true,
        data: order,
        actions: [
          {
            label: 'عرض الطلب',
            action: () => {
              // يمكن إضافة منطق للانتقال للطلب
              console.log('Navigate to order:', order.id);
            },
            style: 'primary'
          },
          {
            label: 'تعيين لي',
            action: () => {
              // يمكن إضافة منطق لتعيين الطلب
              console.log('Assign order to me:', order.id);
            },
            style: 'secondary'
          }
        ]
      });
    });

    // إضافة إشعارات للطلبات المحدثة
    updatedOrders.forEach(order => {
      const previousOrder = previousOrders.find(p => p.id === order.id);
      if (!previousOrder) return;

      let updateMessage = '';
      let updateType: NotificationType = 'order_update';
      let priority: 'low' | 'normal' | 'high' | 'critical' = 'normal';

      if (previousOrder.status !== order.status) {
        updateMessage = `تم تحديث حالة الطلب #${order.id} إلى "${order.status}"`;
        
        if (order.status === 'تم الشحن') {
          updateType = 'success';
          updateMessage = `✅ تم شحن الطلب #${order.id} بنجاح`;
        } else if (order.status === 'مرفوض') {
          updateType = 'warning';
          updateMessage = `❌ تم رفض الطلب #${order.id}`;
        }
      } else if (previousOrder.assignee !== order.assignee) {
        updateMessage = `تم تعيين الطلب #${order.id} إلى ${order.assignee || 'غير محدد'}`;
        if (order.assignee === getCurrentUser()) {
          priority = 'high';
          updateMessage = `📋 تم تعيين طلب جديد لك: #${order.id}`;
        }
      }

      if (updateMessage) {
        addNotification({
          type: updateType,
          priority,
          title: '📝 تحديث طلب',
          message: updateMessage,
          displayModes: ['toast'],
          duration: 5000,
          data: { order, previousOrder }
        });
      }
    });

    previousOrdersRef.current = [...orders];
  }, [orders, addNotification]);

  // مراقبة حالات المخزون المنخفض
  const checkStockAlerts = (stockItems: any[]) => {
    if (!stockItems || stockItems.length === 0) return;

    const lowStockItems = stockItems.filter(item => 
      item.currentQuantity <= item.minimumQuantity && item.currentQuantity > 0
    );
    
    const outOfStockItems = stockItems.filter(item => 
      item.currentQuantity <= 0
    );

    if (lowStockItems.length > 0) {
      addNotification({
        type: 'stock_alert',
        priority: 'high',
        title: '📦 تنبيه مخزون منخفض',
        message: `${lowStockItems.length} منتج بحاجة إلى إعادة تموين`,
        displayModes: ['toast', 'banner'],
        duration: 10000,
        data: { lowStockItems },
        actions: [
          {
            label: 'عرض المخزون',
            action: () => {
              // الانتقال لصفحة المخزون
              console.log('Navigate to stock page');
            },
            style: 'primary'
          }
        ]
      });
    }

    if (outOfStockItems.length > 0) {
      addNotification({
        type: 'stock_alert',
        priority: 'critical',
        title: '🚨 مخزون منتهي',
        message: `${outOfStockItems.length} منتج نفد من المخزون تماماً`,
        displayModes: ['toast', 'banner', 'modal'],
        persistent: true,
        data: { outOfStockItems },
        actions: [
          {
            label: 'عرض المخزون',
            action: () => {
              console.log('Navigate to stock page');
            },
            style: 'danger'
          }
        ]
      });
    }
  };

  // تحديد أولوية الطلب
  const determineOrderPriority = (order: Order): 'low' | 'normal' | 'high' | 'critical' => {
    // طلبات VIP أو قيمة عالية جداً
    let totalPrice = 0;
    
    if (order.totalPrice) {
      if (typeof order.totalPrice === 'string') {
        totalPrice = parseFloat(order.totalPrice.replace(/[^\d.]/g, '') || '0');
      } else {
        totalPrice = parseFloat(String(order.totalPrice));
      }
    }
    
    if (totalPrice > 5000) {
      return 'critical';
    }
    
    if (totalPrice > 1000) {
      return 'high';
    }

    // طلبات من مصادر مهمة
    if (order.source === 'Facebook Ads' || order.source === 'Google Ads') {
      return 'normal';
    }

    // طلبات عادية
    return 'normal';
  };

  // تحديد أنماط العرض للطلب
  const getDisplayModesForOrder = (order: Order, priority: string) => {
    const modes = ['toast'] as any[];

    if (priority === 'high' || priority === 'critical') {
      modes.push('banner', 'browser');
    }

    if (priority === 'critical') {
      modes.push('modal', 'title');
    }

    return modes;
  };

  // الحصول على المستخدم الحالي (يمكن تحسينها لاحقاً)
  const getCurrentUser = () => {
    // يمكن استخدام context أو localStorage
    return localStorage.getItem('currentUser') || 'current_user';
  };

  // إشعارات سريعة للعمليات
  const notifySuccess = (message: string, data?: any) => {
    addNotification({
      type: 'success',
      priority: 'normal',
      title: '✅ نجح',
      message,
      displayModes: ['toast'],
      duration: 3000,
      data
    });
  };

  const notifyError = (message: string, data?: any) => {
    addNotification({
      type: 'error',
      priority: 'high',
      title: '❌ خطأ',
      message,
      displayModes: ['toast', 'banner'],
      duration: 8000,
      data
    });
  };

  const notifyWarning = (message: string, data?: any) => {
    addNotification({
      type: 'warning',
      priority: 'normal',
      title: '⚠️ تحذير',
      message,
      displayModes: ['toast'],
      duration: 5000,
      data
    });
  };

  const notifyInfo = (message: string, data?: any) => {
    addNotification({
      type: 'info',
      priority: 'low',
      title: 'ℹ️ معلومات',
      message,
      displayModes: ['toast'],
      duration: 4000,
      data
    });
  };

  return {
    // الإشعارات والإحصائيات
    notifications,
    stats,
    settings,
    hasUserInteracted: smartHasInteracted,

    // إدارة الإشعارات
    removeNotification,
    clearAllNotifications,
    clearNotificationsByType,
    updateSettings,

    // إشعارات سريعة
    notifySuccess,
    notifyError,
    notifyWarning,
    notifyInfo,
    checkStockAlerts,

    // إحصائيات مفيدة
    newOrdersCount: stats.byType.new_order || 0,
    criticalCount: stats.byPriority.critical || 0,
    totalNotifications: stats.total
  };
};
