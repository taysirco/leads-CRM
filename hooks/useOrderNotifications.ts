import { useEffect, useRef } from 'react';
import { useSmartNotifications, SmartNotification, NotificationType } from './useSmartNotifications';

interface Order {
  id: number;
  name: string; // الاسم الصحيح للعميل
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
    notificationHistory,
    addNotification,
    removeNotification,
    clearAllNotifications,
    clearNotificationsByType,
    stats,
    settings,
    updateSettings,
    hasUserInteracted: smartHasInteracted,
    unreadCount,
    isDNDActive,
    markAsRead,
    markAllAsRead,
    clearHistory
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
        previousOrder.name !== order.name ||
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
        message: `طلب جديد من ${order.name} - ${order.productName}`,
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
        // تحديد نوع الإشعار والأولوية حسب الحالة الجديدة
        const statusNotification = getStatusNotificationDetails(order.status, order.id);
        updateType = statusNotification.type;
        updateMessage = statusNotification.message;
        priority = statusNotification.priority;
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

  // تحديد أولوية الطلب بناءً على الحالة والقيمة والمصدر
  const determineOrderPriority = (order: Order): 'low' | 'normal' | 'high' | 'critical' => {
    // 1. أولوية حسب حالة الطلب/الليد
    const statusPriority = getStatusPriority(order.status);

    // 2. أولوية حسب القيمة المالية
    const pricePriority = getPricePriority(order.totalPrice);

    // 3. أولوية حسب المصدر
    const sourcePriority = getSourcePriority(order.source);

    // 4. أولوية حسب الوقت (الطلبات الجديدة أهم)
    const timePriority = getTimePriority(order.createdAt);

    // اختيار أعلى أولوية من بين جميع العوامل
    const allPriorities = [statusPriority, pricePriority, sourcePriority, timePriority];
    const priorityOrder = ['critical', 'high', 'normal', 'low'];

    let finalPriority: 'low' | 'normal' | 'high' | 'critical' = 'normal';

    for (const priority of priorityOrder) {
      if (allPriorities.includes(priority as any)) {
        finalPriority = priority as 'low' | 'normal' | 'high' | 'critical';
        break;
      }
    }

    return finalPriority;
  };

  // تحديد الأولوية حسب حالة الطلب
  const getStatusPriority = (status: string): 'low' | 'normal' | 'high' | 'critical' => {
    const statusPriorities: Record<string, 'low' | 'normal' | 'high' | 'critical'> = {
      // حالات حرجة تحتاج تدخل فوري
      'عودة اتصال': 'critical',
      'اعتراض': 'critical',
      'شكوى': 'critical',
      'إلغاء': 'high',

      // حالات مهمة
      'جديد': 'high',
      'تم التأكيد': 'high',
      'معاد جدولة': 'high',

      // حالات عادية
      'تم الاتصال': 'normal',
      'مهتم': 'normal',
      'يفكر': 'normal',
      'متابعة': 'normal',

      // حالات منخفضة الأولوية
      'لا يرد': 'low',
      'رقم خطأ': 'low',
      'مرفوض': 'low',
      'تم الشحن': 'low',
      'مكتمل': 'low'
    };

    return statusPriorities[status] || 'normal';
  };

  // تحديد الأولوية حسب القيمة المالية
  const getPricePriority = (totalPrice?: string): 'low' | 'normal' | 'high' | 'critical' => {
    let price = 0;

    if (totalPrice) {
      if (typeof totalPrice === 'string') {
        price = parseFloat(totalPrice.replace(/[^\d.]/g, '') || '0');
      } else {
        price = parseFloat(String(totalPrice));
      }
    }

    if (price > 10000) return 'critical';  // طلبات كبيرة جداً
    if (price > 5000) return 'high';       // طلبات كبيرة
    if (price > 1000) return 'normal';     // طلبات متوسطة
    return 'low';                          // طلبات صغيرة
  };

  // تحديد الأولوية حسب المصدر
  const getSourcePriority = (source?: string): 'low' | 'normal' | 'high' | 'critical' => {
    const sourcePriorities: Record<string, 'low' | 'normal' | 'high' | 'critical'> = {
      // مصادر مهمة (مدفوعة)
      'Facebook Ads': 'high',
      'Google Ads': 'high',
      'Instagram Ads': 'high',
      'TikTok Ads': 'high',

      // مصادر عادية
      'Facebook': 'normal',
      'Instagram': 'normal',
      'WhatsApp': 'normal',
      'موقع إلكتروني': 'normal',

      // مصادر أقل أهمية
      'إحالة': 'low',
      'أخرى': 'low'
    };

    return sourcePriorities[source || ''] || 'normal';
  };

  // تحديد الأولوية حسب الوقت
  const getTimePriority = (createdAt?: string): 'low' | 'normal' | 'high' | 'critical' => {
    if (!createdAt) return 'normal';

    const now = new Date();
    const orderDate = new Date(createdAt);
    const hoursDiff = (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60);

    if (hoursDiff < 1) return 'critical';    // أقل من ساعة
    if (hoursDiff < 4) return 'high';        // أقل من 4 ساعات
    if (hoursDiff < 24) return 'normal';     // أقل من يوم
    return 'low';                            // أكثر من يوم
  };

  // تحديد تفاصيل إشعار تحديث الحالة
  const getStatusNotificationDetails = (status: string, orderId: number) => {
    const statusNotifications: Record<string, {
      type: NotificationType;
      message: string;
      priority: 'low' | 'normal' | 'high' | 'critical';
      emoji: string;
    }> = {
      // حالات إيجابية
      'تم التأكيد': {
        type: 'success',
        message: `✅ تم تأكيد الطلب #${orderId}`,
        priority: 'high',
        emoji: '✅'
      },
      'تم الشحن': {
        type: 'success',
        message: `🚚 تم شحن الطلب #${orderId} بنجاح`,
        priority: 'normal',
        emoji: '🚚'
      },
      'مكتمل': {
        type: 'success',
        message: `🎉 تم إكمال الطلب #${orderId}`,
        priority: 'low',
        emoji: '🎉'
      },

      // حالات تحتاج متابعة
      'جديد': {
        type: 'new_order',
        message: `🆕 طلب جديد #${orderId} يحتاج معالجة`,
        priority: 'high',
        emoji: '🆕'
      },
      'عودة اتصال': {
        type: 'warning',
        message: `📞 طلب عودة اتصال #${orderId} - عاجل!`,
        priority: 'critical',
        emoji: '📞'
      },
      'معاد جدولة': {
        type: 'warning',
        message: `📅 تم إعادة جدولة الطلب #${orderId}`,
        priority: 'high',
        emoji: '📅'
      },
      'متابعة': {
        type: 'info',
        message: `📋 الطلب #${orderId} يحتاج متابعة`,
        priority: 'normal',
        emoji: '📋'
      },

      // حالات سلبية
      'مرفوض': {
        type: 'error',
        message: `❌ تم رفض الطلب #${orderId}`,
        priority: 'normal',
        emoji: '❌'
      },
      'إلغاء': {
        type: 'warning',
        message: `🚫 تم إلغاء الطلب #${orderId}`,
        priority: 'high',
        emoji: '🚫'
      },
      'لا يرد': {
        type: 'warning',
        message: `📵 العميل لا يرد - الطلب #${orderId}`,
        priority: 'low',
        emoji: '📵'
      },
      'رقم خطأ': {
        type: 'error',
        message: `📞 رقم خطأ - الطلب #${orderId}`,
        priority: 'low',
        emoji: '📞'
      },

      // حالات خاصة
      'اعتراض': {
        type: 'error',
        message: `⚠️ اعتراض على الطلب #${orderId} - يحتاج تدخل فوري!`,
        priority: 'critical',
        emoji: '⚠️'
      },
      'شكوى': {
        type: 'error',
        message: `😠 شكوى من العميل - الطلب #${orderId}`,
        priority: 'critical',
        emoji: '😠'
      }
    };

    return statusNotifications[status] || {
      type: 'order_update' as NotificationType,
      message: `📝 تم تحديث حالة الطلب #${orderId} إلى "${status}"`,
      priority: 'normal' as const,
      emoji: '📝'
    };
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
    notificationHistory,
    stats,
    settings,
    hasUserInteracted: smartHasInteracted,
    unreadCount,
    isDNDActive,

    // إدارة الإشعارات
    removeNotification,
    clearAllNotifications,
    clearNotificationsByType,
    updateSettings,

    // إدارة السجل
    markAsRead,
    markAllAsRead,
    clearHistory,

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
