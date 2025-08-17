import { useState, useEffect, useRef, useCallback } from 'react';

// أنواع الإشعارات
export type NotificationType = 
  | 'new_order' 
  | 'order_update' 
  | 'success' 
  | 'warning' 
  | 'error' 
  | 'info'
  | 'stock_alert'
  | 'system';

// مستويات الأولوية
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

// أنماط العرض
export type NotificationDisplayMode = 
  | 'toast'          // إشعار صغير في الزاوية
  | 'banner'         // شريط في الأعلى
  | 'modal'          // نافذة منبثقة
  | 'fullscreen'     // شاشة كاملة
  | 'browser'        // إشعار المتصفح
  | 'title'          // وميض العنوان
  | 'sound';         // صوت فقط

export interface SmartNotification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  timestamp: Date;
  
  // إعدادات العرض
  displayModes: NotificationDisplayMode[];
  duration?: number; // بالميلي ثانية، undefined = دائم
  persistent?: boolean; // يبقى حتى يتم إغلاقه يدوياً
  
  // إعدادات السلوك
  autoExpand?: boolean; // يتوسع تلقائياً عند ظهوره
  requireInteraction?: boolean; // يتطلب تفاعل المستخدم
  preventDuplicates?: boolean; // منع التكرار
  
  // بيانات إضافية
  data?: any;
  actions?: Array<{
    label: string;
    action: () => void;
    style?: 'primary' | 'secondary' | 'danger';
  }>;
}

export interface NotificationSettings {
  enabled: boolean;
  soundEnabled: boolean;
  browserNotifications: boolean;
  titleFlashing: boolean;
  maxVisibleNotifications: number;
  defaultDuration: number;
  prioritySettings: Record<NotificationPriority, {
    enabled: boolean;
    displayModes: NotificationDisplayMode[];
    duration?: number;
    sound?: boolean;
  }>;
}

// الإعدادات الافتراضية
const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  soundEnabled: true,
  browserNotifications: true,
  titleFlashing: true,
  maxVisibleNotifications: 5,
  defaultDuration: 5000,
  prioritySettings: {
    low: {
      enabled: true,
      displayModes: ['toast'],
      duration: 3000,
      sound: false
    },
    normal: {
      enabled: true,
      displayModes: ['toast'],
      duration: 5000,
      sound: true
    },
    high: {
      enabled: true,
      displayModes: ['toast', 'banner', 'browser'],
      duration: 8000,
      sound: true
    },
    critical: {
      enabled: true,
      displayModes: ['toast', 'banner', 'modal', 'browser', 'title'],
      duration: 0, // دائم
      sound: true
    }
  }
};

export const useSmartNotifications = (initialUserInteraction: boolean = false) => {
  const [notifications, setNotifications] = useState<SmartNotification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [hasUserInteracted, setHasUserInteracted] = useState(initialUserInteraction);
  
  // مراجع للتحكم في المؤقتات والأصوات
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const titleFlashIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastNotificationTimeRef = useRef<Date | null>(null);
  
  // تحميل الإعدادات من localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('notification-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (error) {
        console.warn('Failed to load notification settings:', error);
      }
    }
  }, []);
  
  // حفظ الإعدادات في localStorage
  const updateSettings = useCallback((newSettings: Partial<NotificationSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem('notification-settings', JSON.stringify(updated));
  }, [settings]);
  
  // تشغيل الصوت
  const playNotificationSound = useCallback((priority: NotificationPriority = 'normal') => {
    if (!settings.soundEnabled || !hasUserInteracted) return;
    
    const prioritySettings = settings.prioritySettings[priority];
    if (!prioritySettings.sound) return;
    
    try {
      // إنشاء صوت مخصص حسب الأولوية
      const audioContext = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // تكوين الصوت حسب الأولوية
      const soundConfig = {
        low: { freq: [400], duration: 0.2, volume: 0.1 },
        normal: { freq: [600, 800], duration: 0.3, volume: 0.2 },
        high: { freq: [800, 1000, 800], duration: 0.5, volume: 0.3 },
        critical: { freq: [1200, 800, 1200, 800], duration: 0.8, volume: 0.4 }
      };
      
      const config = soundConfig[priority];
      const freqChangeDuration = config.duration / config.freq.length;
      
      config.freq.forEach((freq, index) => {
        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + (index * freqChangeDuration));
      });
      
      gainNode.gain.setValueAtTime(config.volume, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + config.duration);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + config.duration);
      
    } catch (error) {
      console.warn('Audio notification not supported:', error);
    }
  }, [settings.soundEnabled, hasUserInteracted, settings.prioritySettings]);
  
  // إشعار المتصفح
  const showBrowserNotification = useCallback((notification: SmartNotification) => {
    if (!settings.browserNotifications || !hasUserInteracted) return;
    if (!('Notification' in window)) return;
    
    // طلب الإذن إذا لم يتم منحه
    if (Notification.permission === 'default') {
      Notification.requestPermission();
      return;
    }
    
    if (Notification.permission === 'granted') {
      const browserNotification = new Notification(notification.title, {
        body: notification.message,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: `${notification.type}-${notification.priority}`,
        requireInteraction: notification.priority === 'critical'
      });
      
      // إغلاق تلقائي للإشعارات غير الحرجة
      if (notification.priority !== 'critical' && notification.duration) {
        setTimeout(() => {
          browserNotification.close();
        }, notification.duration);
      }
    }
  }, [settings.browserNotifications, hasUserInteracted]);
  
  // وميض العنوان
  const startTitleFlashing = useCallback((count: number) => {
    if (!settings.titleFlashing) return;
    
    // إيقاف الوميض السابق
    if (titleFlashIntervalRef.current) {
      clearInterval(titleFlashIntervalRef.current);
    }
    
    let isFlashing = false;
    const originalTitle = 'Leads CRM';
    const flashTitle = `🔴 (${count}) طلبات جديدة - ${originalTitle}`;
    
    document.title = flashTitle;
    
    titleFlashIntervalRef.current = setInterval(() => {
      document.title = isFlashing ? flashTitle : `(${count}) طلبات جديدة - ${originalTitle}`;
      isFlashing = !isFlashing;
    }, 1000);
    
  }, [settings.titleFlashing]);
  
  const stopTitleFlashing = useCallback(() => {
    if (titleFlashIntervalRef.current) {
      clearInterval(titleFlashIntervalRef.current);
      titleFlashIntervalRef.current = null;
    }
    document.title = 'Leads CRM';
  }, []);
  
  // إضافة إشعار جديد
  const addNotification = useCallback((notificationData: Omit<SmartNotification, 'id' | 'timestamp'>) => {
    if (!settings.enabled) return;
    
    const prioritySettings = settings.prioritySettings[notificationData.priority];
    if (!prioritySettings.enabled) return;
    
    // منع التكرار إذا كان مطلوباً
    if (notificationData.preventDuplicates) {
      const exists = notifications.find(n => 
        n.type === notificationData.type && 
        n.message === notificationData.message
      );
      if (exists) return;
    }
    
    const notification: SmartNotification = {
      ...notificationData,
      id: `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      displayModes: notificationData.displayModes.length > 0 
        ? notificationData.displayModes 
        : prioritySettings.displayModes,
      duration: notificationData.duration ?? prioritySettings.duration ?? settings.defaultDuration
    };
    
    // إضافة الإشعار
    setNotifications(prev => {
      const updated = [notification, ...prev];
      // الحد من عدد الإشعارات المرئية
      return updated.slice(0, settings.maxVisibleNotifications);
    });
    
    // تشغيل الأصوات والتأثيرات
    if (notification.displayModes.includes('sound') || prioritySettings.sound) {
      playNotificationSound(notification.priority);
    }
    
    if (notification.displayModes.includes('browser')) {
      showBrowserNotification(notification);
    }
    
    // إعداد المؤقت للإزالة التلقائية
    if (notification.duration && notification.duration > 0 && !notification.persistent) {
      const timer = setTimeout(() => {
        removeNotification(notification.id);
      }, notification.duration);
      
      timersRef.current.set(notification.id, timer);
    }
    
    lastNotificationTimeRef.current = new Date();
    
  }, [
    settings, 
    notifications, 
    playNotificationSound, 
    showBrowserNotification
  ]);
  
  // إزالة إشعار
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    
    // إلغاء المؤقت
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);
  
  // إزالة جميع الإشعارات
  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
    
    // إلغاء جميع المؤقتات
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current.clear();
    
    stopTitleFlashing();
  }, [stopTitleFlashing]);
  
  // إزالة الإشعارات حسب النوع
  const clearNotificationsByType = useCallback((type: NotificationType) => {
    const toRemove = notifications.filter(n => n.type === type);
    toRemove.forEach(n => removeNotification(n.id));
  }, [notifications, removeNotification]);
  
  // تحديث وميض العنوان عند تغيير الإشعارات
  useEffect(() => {
    const newOrdersCount = notifications.filter(n => n.type === 'new_order').length;
    const criticalCount = notifications.filter(n => n.priority === 'critical').length;
    
    if (newOrdersCount > 0 || criticalCount > 0) {
      startTitleFlashing(newOrdersCount || criticalCount);
    } else {
      stopTitleFlashing();
    }
    
    return () => stopTitleFlashing();
  }, [notifications, startTitleFlashing, stopTitleFlashing]);
  
  // تنظيف المؤقتات عند إلغاء التحميل
  useEffect(() => {
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
      if (titleFlashIntervalRef.current) {
        clearInterval(titleFlashIntervalRef.current);
      }
    };
  }, []);
  
  // تتبع تفاعل المستخدم
  useEffect(() => {
    if (hasUserInteracted) return;
    
    const handleInteraction = () => {
      setHasUserInteracted(true);
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
    
    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, [hasUserInteracted]);
  
  // إحصائيات مفيدة
  const stats = {
    total: notifications.length,
    byType: notifications.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1;
      return acc;
    }, {} as Record<NotificationType, number>),
    byPriority: notifications.reduce((acc, n) => {
      acc[n.priority] = (acc[n.priority] || 0) + 1;
      return acc;
    }, {} as Record<NotificationPriority, number>),
    newOrdersCount: notifications.filter(n => n.type === 'new_order').length,
    criticalCount: notifications.filter(n => n.priority === 'critical').length,
    lastNotificationTime: lastNotificationTimeRef.current
  };
  
  return {
    notifications,
    settings,
    stats,
    hasUserInteracted,
    
    // Actions
    addNotification,
    removeNotification,
    clearAllNotifications,
    clearNotificationsByType,
    updateSettings,
    
    // Utilities
    playNotificationSound,
    showBrowserNotification,
    startTitleFlashing,
    stopTitleFlashing
  };
};
