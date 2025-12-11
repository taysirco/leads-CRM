import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useOrderNotifications } from './useOrderNotifications';

interface Order {
  id: number;
  name: string; // الاسم الصحيح للعميل
  phone: string;
  status: string;
  productName: string;
  source: string;
  assignee?: string;
  createdAt?: string;
  totalPrice?: string;
}

interface StatusChangeEvent {
  orderId: number;
  previousStatus: string;
  newStatus: string;
  timestamp: Date;
  userId?: string;
  customerName: string; // نحتفظ بـ customerName هنا للتوافق
  productName: string;
  totalPrice?: string;
}

interface OrderStats {
  total: number;
  byStatus: Record<string, number>;
  recentChanges: StatusChangeEvent[];
  lastUpdate: Date;
}

export const useRealTimeOrderTracking = (orders: Order[], hasUserInteracted: boolean) => {
  const [orderStats, setOrderStats] = useState<OrderStats>({
    total: 0,
    byStatus: {},
    recentChanges: [],
    lastUpdate: new Date()
  });

  const [statusChangeHistory, setStatusChangeHistory] = useState<StatusChangeEvent[]>([]);
  const previousOrdersMapRef = useRef<Map<number, Order>>(new Map());
  const isFirstLoadRef = useRef(true);

  // Refs for stable callback references (to avoid infinite loops)
  const notifySuccessRef = useRef<typeof notifySuccess | null>(null);
  const notifyErrorRef = useRef<typeof notifyError | null>(null);
  const notifyWarningRef = useRef<typeof notifyWarning | null>(null);
  const notifyInfoRef = useRef<typeof notifyInfo | null>(null);
  const detectOrderChangesRef = useRef<typeof detectOrderChanges | null>(null);
  const handleNewOrdersRef = useRef<typeof handleNewOrders | null>(null);
  const handleStatusChangesRef = useRef<typeof handleStatusChanges | null>(null);

  // استخدام نظام الإشعارات المحسن
  const {
    notifySuccess,
    notifyError,
    notifyWarning,
    notifyInfo,
    notifications,
    notificationHistory,
    removeNotification,
    clearAllNotifications,
    clearNotificationsByType,
    settings,
    updateSettings,
    newOrdersCount,
    criticalCount,
    hasUserInteracted: smartHasInteracted,
    unreadCount,
    isDNDActive,
    markAsRead,
    markAllAsRead,
    clearHistory
  } = useOrderNotifications(orders, hasUserInteracted);

  // حساب الإحصائيات الدقيقة
  const calculateOrderStats = useCallback((orderList: Order[]): OrderStats => {
    const byStatus: Record<string, number> = {};

    orderList.forEach(order => {
      const status = order.status || 'غير محدد';
      byStatus[status] = (byStatus[status] || 0) + 1;
    });

    return {
      total: orderList.length,
      byStatus,
      recentChanges: [], // لا نعتمد على statusChangeHistory لتجنب الحلقة اللانهائية
      lastUpdate: new Date()
    };
  }, []); // إزالة statusChangeHistory من الاعتمادات لتجنب Maximum update depth

  // اكتشاف التغييرات الدقيقة
  const detectOrderChanges = useCallback((currentOrders: Order[]) => {
    const currentOrdersMap = new Map(currentOrders.map(order => [order.id, order]));
    const previousOrdersMap = previousOrdersMapRef.current;

    const changes: StatusChangeEvent[] = [];
    const newOrders: Order[] = [];
    const updatedOrders: { previous: Order; current: Order }[] = [];

    // البحث عن الطلبات الجديدة والمحدثة
    currentOrdersMap.forEach((currentOrder, orderId) => {
      const previousOrder = previousOrdersMap.get(orderId);

      if (!previousOrder) {
        // طلب جديد
        newOrders.push(currentOrder);
      } else {
        // فحص التحديثات
        const hasStatusChange = previousOrder.status !== currentOrder.status;
        const hasAssigneeChange = previousOrder.assignee !== currentOrder.assignee;
        const hasOtherChanges = (
          previousOrder.name !== currentOrder.name ||
          previousOrder.productName !== currentOrder.productName ||
          previousOrder.phone !== currentOrder.phone
        );

        if (hasStatusChange || hasAssigneeChange || hasOtherChanges) {
          updatedOrders.push({ previous: previousOrder, current: currentOrder });

          // تسجيل تغيير الحالة
          if (hasStatusChange) {
            const changeEvent: StatusChangeEvent = {
              orderId,
              previousStatus: previousOrder.status,
              newStatus: currentOrder.status,
              timestamp: new Date(),
              customerName: currentOrder.name, // استخدام الحقل الصحيح
              productName: currentOrder.productName,
              totalPrice: currentOrder.totalPrice
            };
            changes.push(changeEvent);
          }
        }
      }
    });

    return { newOrders, updatedOrders, statusChanges: changes };
  }, []);

  // معالجة الطلبات الجديدة
  const handleNewOrders = useCallback((newOrders: Order[]) => {
    if (newOrders.length === 0) return;

    newOrders.forEach(order => {
      // تحديد الأولوية بناءً على القيمة والمصدر
      let priority: 'low' | 'normal' | 'high' | 'critical' = 'normal';

      const price = parseFloat(String(order.totalPrice || '0').replace(/[^\d.]/g, '') || '0');
      if (price > 5000) priority = 'critical';
      else if (price > 1000) priority = 'high';

      if (order.source?.includes('Ads')) priority = 'high';

      notifySuccess(`🛒 طلب جديد من ${order.name}`, {
        orderId: order.id,
        productName: order.productName,
        totalPrice: order.totalPrice,
        source: order.source,
        priority
      });
    });

    // إحصائيات الطلبات الجديدة
    if (newOrders.length > 1) {
      notifyInfo(`📊 تم استلام ${newOrders.length} طلب جديد إجمالي`);
    }
  }, [notifySuccess, notifyInfo]);

  // معالجة تحديثات الحالة
  const handleStatusChanges = useCallback((statusChanges: StatusChangeEvent[]) => {
    if (statusChanges.length === 0) return;

    statusChanges.forEach(change => {
      const { orderId, previousStatus, newStatus, customerName } = change;

      // تحديد نوع الإشعار حسب الحالة الجديدة
      const getStatusNotification = (status: string) => {
        const statusMap: Record<string, {
          type: 'success' | 'warning' | 'error' | 'info';
          priority: 'low' | 'normal' | 'high' | 'critical';
          emoji: string;
          message: string;
        }> = {
          'جديد': {
            type: 'info',
            priority: 'high',
            emoji: '🆕',
            message: `طلب جديد من ${customerName}`
          },
          'تم التأكيد': {
            type: 'success',
            priority: 'high',
            emoji: '✅',
            message: `تم تأكيد طلب ${customerName}`
          },
          'تم الشحن': {
            type: 'success',
            priority: 'normal',
            emoji: '🚚',
            message: `تم شحن طلب ${customerName}`
          },
          'عودة اتصال': {
            type: 'warning',
            priority: 'critical',
            emoji: '📞',
            message: `عودة اتصال عاجلة - ${customerName}`
          },
          'اعتراض': {
            type: 'error',
            priority: 'critical',
            emoji: '⚠️',
            message: `اعتراض من ${customerName} - تدخل فوري مطلوب!`
          },
          'شكوى': {
            type: 'error',
            priority: 'critical',
            emoji: '😠',
            message: `شكوى من ${customerName}`
          },
          'مرفوض': {
            type: 'warning',
            priority: 'normal',
            emoji: '❌',
            message: `تم رفض طلب ${customerName}`
          },
          'إلغاء': {
            type: 'warning',
            priority: 'high',
            emoji: '🚫',
            message: `تم إلغاء طلب ${customerName}`
          },
          'لا يرد': {
            type: 'info',
            priority: 'low',
            emoji: '📵',
            message: `لا يرد - ${customerName}`
          },
          'مكتمل': {
            type: 'success',
            priority: 'low',
            emoji: '🎉',
            message: `تم إكمال طلب ${customerName}`
          }
        };

        return statusMap[status] || {
          type: 'info' as const,
          priority: 'normal' as const,
          emoji: '📝',
          message: `تحديث حالة ${customerName} إلى ${status}`
        };
      };

      const notification = getStatusNotification(newStatus);

      // إرسال الإشعار المناسب
      switch (notification.type) {
        case 'success':
          notifySuccess(`${notification.emoji} ${notification.message}`, change);
          break;
        case 'warning':
          notifyWarning(`${notification.emoji} ${notification.message}`, change);
          break;
        case 'error':
          notifyError(`${notification.emoji} ${notification.message}`, change);
          break;
        case 'info':
          notifyInfo(`${notification.emoji} ${notification.message}`, change);
          break;
      }
    });

    // تحديث تاريخ التغييرات - باستخدام refs لتجنب الحلقة
    // لا نستخدم setStatusChangeHistory هنا لتجنب re-render
  }, [notifySuccess, notifyWarning, notifyError, notifyInfo]);

  // تحديث الـ refs عند تغيير الـ callbacks (يعمل بشكل متزامن قبل الـ effects)
  useLayoutEffect(() => {
    notifySuccessRef.current = notifySuccess;
    notifyErrorRef.current = notifyError;
    notifyWarningRef.current = notifyWarning;
    notifyInfoRef.current = notifyInfo;
    detectOrderChangesRef.current = detectOrderChanges;
    handleNewOrdersRef.current = handleNewOrders;
    handleStatusChangesRef.current = handleStatusChanges;
  });

  // مراقبة التغييرات في الطلبات - effect للإحصائيات فقط
  useEffect(() => {
    if (!orders || orders.length === 0) return;

    // تجاهل التحميل الأول
    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false;
      previousOrdersMapRef.current = new Map(orders.map(order => [order.id, order]));
      // حساب الإحصائيات مباشرة
      const byStatus: Record<string, number> = {};
      orders.forEach(order => {
        const status = order.status || 'غير محدد';
        byStatus[status] = (byStatus[status] || 0) + 1;
      });
      setOrderStats({
        total: orders.length,
        byStatus,
        recentChanges: [],
        lastUpdate: new Date()
      });
      return;
    }

    // اكتشاف التغييرات باستخدام ref
    const detectChanges = detectOrderChangesRef.current;
    if (detectChanges) {
      const { newOrders, updatedOrders, statusChanges } = detectChanges(orders);

      // إرسال الإشعارات باستخدام refs (لا تسبب re-render)
      if (newOrders.length > 0 && handleNewOrdersRef.current) {
        // debounce بسيط - تأخير قصير لمنع الإشعارات المتكررة
        setTimeout(() => {
          if (handleNewOrdersRef.current) {
            // إشعار بسيط للطلبات الجديدة بدون استخدام الـ callback المعقد
            newOrders.forEach(order => {
              if (notifySuccessRef.current) {
                notifySuccessRef.current(`🛒 طلب جديد من ${order.name}`, {
                  orderId: order.id,
                  productName: order.productName,
                  totalPrice: order.totalPrice,
                  source: order.source,
                  priority: 'normal'
                });
              }
            });
          }
        }, 100);
      }

      // إشعارات تغيير الحالة
      if (statusChanges.length > 0) {
        setTimeout(() => {
          statusChanges.forEach(change => {
            const { newStatus, customerName } = change;
            if (notifyInfoRef.current) {
              const emoji = newStatus === 'تم التأكيد' ? '✅' :
                newStatus === 'تم الشحن' ? '🚚' :
                  newStatus === 'عودة اتصال' ? '📞' :
                    newStatus === 'اعتراض' ? '⚠️' :
                      newStatus === 'مرفوض' ? '❌' : '📝';
              notifyInfoRef.current(`${emoji} تغيير حالة ${customerName} إلى ${newStatus}`, change);
            }
          });
        }, 150);
      }

      // إشعارات التعيين
      updatedOrders.forEach(({ previous, current }) => {
        if (previous.assignee !== current.assignee && current.assignee) {
          setTimeout(() => {
            if (notifyInfoRef.current) {
              notifyInfoRef.current(`📋 تم تعيين طلب ${current.name} إلى ${current.assignee}`);
            }
          }, 200);
        }
      });
    }

    // تحديث المراجع والإحصائيات
    previousOrdersMapRef.current = new Map(orders.map(order => [order.id, order]));

    // حساب الإحصائيات مباشرة
    const byStatus: Record<string, number> = {};
    orders.forEach(order => {
      const status = order.status || 'غير محدد';
      byStatus[status] = (byStatus[status] || 0) + 1;
    });
    setOrderStats({
      total: orders.length,
      byStatus,
      recentChanges: [],
      lastUpdate: new Date()
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  // دالة للحصول على إحصائيات دقيقة حسب الحالة
  const getStatusStats = useCallback(() => {
    const stats = {
      جديد: 0,
      'تم الاتصال': 0,
      'تم التأكيد': 0,
      'تم الشحن': 0,
      مرفوض: 0,
      'عودة اتصال': 0,
      اعتراض: 0,
      شكوى: 0,
      مكتمل: 0,
      'لا يرد': 0,
      إلغاء: 0
    };

    orders.forEach(order => {
      if (stats.hasOwnProperty(order.status)) {
        stats[order.status as keyof typeof stats]++;
      }
    });

    return stats;
  }, [orders]);

  // دالة للحصول على الطلبات الحرجة
  const getCriticalOrders = useCallback(() => {
    return orders.filter(order => {
      const criticalStatuses = ['عودة اتصال', 'اعتراض', 'شكوى'];
      const isHighValue = parseFloat(String(order.totalPrice || '0').replace(/[^\d.]/g, '') || '0') > 5000;
      const isPaidSource = order.source?.includes('Ads');

      return criticalStatuses.includes(order.status) || (isHighValue && isPaidSource);
    });
  }, [orders]);

  return {
    // الإحصائيات
    orderStats,
    statusStats: getStatusStats(),
    criticalOrders: getCriticalOrders(),
    statusChangeHistory,

    // الإشعارات
    notifications,
    notificationHistory,
    removeNotification,
    clearAllNotifications,
    clearNotificationsByType,
    settings,
    updateSettings,
    newOrdersCount,
    criticalCount,
    hasUserInteracted: smartHasInteracted,
    unreadCount,
    isDNDActive,

    // إدارة السجل
    markAsRead,
    markAllAsRead,
    clearHistory,

    // دوال المساعدة
    notifySuccess,
    notifyError,
    notifyWarning,
    notifyInfo
  };
};
