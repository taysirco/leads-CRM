import { useState, useEffect, useRef } from 'react';

interface Order {
  id: number;
  name: string;
  phone: string;
  productName: string;
  totalPrice: string;
  status: string;
}

interface Notification {
  id: string;
  type: 'new_order' | 'order_update' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  duration?: number;
  persistent?: boolean;
  data?: any;
}

export const useNotifications = (orders: Order[], initialUserInteraction: boolean) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const previousOrdersRef = useRef<Order[]>([]);
  const isInitialLoad = useRef(true);

  // Function to add a new notification
  const addNotification = (notification: Omit<Notification, 'id' | 'timestamp'>) => {
    const newNotification: Notification = {
      ...notification,
      id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };

    setNotifications(prev => [newNotification, ...prev]);

    // Auto-remove notification after duration if specified
    if (notification.duration && !notification.persistent) {
      setTimeout(() => {
        removeNotification(newNotification.id);
      }, notification.duration);
    }
  };

  // Function to remove a notification
  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Function to remove all notifications
  const removeAllNotifications = () => {
    setNotifications([]);
  };

  // Detect new orders
  useEffect(() => {
    // Skip detection on initial load
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      previousOrdersRef.current = [...orders];
      return;
    }

    if (orders.length === 0) return;

    const previousOrders = previousOrdersRef.current;
    const currentOrderIds = new Set(orders.map(o => o.id));
    const previousOrderIds = new Set(previousOrders.map(o => o.id));

    // Find new orders
    const newOrders = orders.filter(order => !previousOrderIds.has(order.id));
    
    // Find updated orders (status changes)
    const updatedOrders = orders.filter(order => {
      const previousOrder = previousOrders.find(p => p.id === order.id);
      return previousOrder && previousOrder.status !== order.status;
    });

    // Create notifications for new orders
    newOrders.forEach(order => {
      addNotification({
        type: 'new_order',
        title: '🎉 طلب جديد وصل!',
        message: `طلب جديد من ${order.name} بقيمة ${order.totalPrice}`,
        persistent: true, // New orders stay until manually dismissed
        data: {
          customerName: order.name,
          phone: order.phone,
          product: order.productName,
          price: order.totalPrice,
          orderId: order.id
        }
      });
    });

    // Create notifications for important status updates
    updatedOrders.forEach(order => {
      const previousOrder = previousOrders.find(p => p.id === order.id);
      if (!previousOrder) return;

      // Only notify for important status changes
      if (order.status === 'تم التأكيد' && previousOrder.status !== 'تم التأكيد') {
        addNotification({
          type: 'success',
          title: '✅ تم تأكيد طلب',
          message: `تم تأكيد طلب ${order.name}`,
          duration: 5000,
          data: {
            customerName: order.name,
            phone: order.phone,
            product: order.productName,
            price: order.totalPrice,
            orderId: order.id
          }
        });
      } else if (order.status === 'تم الشحن' && previousOrder.status !== 'تم الشحن') {
        addNotification({
          type: 'success',
          title: '🚚 تم شحن طلب',
          message: `تم شحن طلب ${order.name}`,
          duration: 5000,
          data: {
            customerName: order.name,
            phone: order.phone,
            product: order.productName,
            price: order.totalPrice,
            orderId: order.id
          }
        });
      } else if (order.status === 'رفض التأكيد' && previousOrder.status !== 'رفض التأكيد') {
        addNotification({
          type: 'warning',
          title: '❌ تم رفض طلب',
          message: `تم رفض طلب ${order.name}`,
          duration: 5000,
          data: {
            customerName: order.name,
            phone: order.phone,
            product: order.productName,
            price: order.totalPrice,
            orderId: order.id
          }
        });
      }
    });

    // Update previous orders reference
    previousOrdersRef.current = [...orders];
  }, [orders]);

  // Browser notification API for new orders (if permission granted)
  useEffect(() => {
    const newOrderNotifications = notifications.filter(n => n.type === 'new_order');
    
    if (newOrderNotifications.length > 0 && 'Notification' in window && initialUserInteraction) {
      // Request permission if not already granted
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
      
      // Show browser notification for the latest new order
      if (Notification.permission === 'granted') {
        const latestOrder = newOrderNotifications[0];
        if (latestOrder.data) {
          new Notification(latestOrder.title, {
            body: latestOrder.message,
            icon: '/favicon.ico', // You can add a custom icon
            badge: '/favicon.ico',
            tag: 'new-order', // This ensures only one notification shows at a time
            requireInteraction: true, // Keeps the notification visible until user interacts
          });
        }
      }
    }
  }, [notifications, initialUserInteraction]);

  // Title notification (change document title when new orders arrive)
  useEffect(() => {
    const newOrdersCount = notifications.filter(n => n.type === 'new_order').length;
    
    if (newOrdersCount > 0) {
      document.title = `(${newOrdersCount}) طلبات جديدة - Leads CRM`;
      
      // Flash title effect
      let flashInterval: NodeJS.Timeout;
      let isFlashing = false;
      
      flashInterval = setInterval(() => {
        document.title = isFlashing 
          ? `(${newOrdersCount}) طلبات جديدة - Leads CRM`
          : '🔴 طلبات جديدة - Leads CRM';
        isFlashing = !isFlashing;
      }, 1000);

      return () => {
        clearInterval(flashInterval);
        document.title = 'Leads CRM';
      };
    } else {
      document.title = 'Leads CRM';
    }
  }, [notifications]);

  return {
    notifications,
    addNotification,
    removeNotification,
    removeAllNotifications,
  };
}; 