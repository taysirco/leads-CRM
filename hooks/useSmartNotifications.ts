import { useState, useEffect, useRef, useCallback } from 'react';
import {
  playNotificationAudioByType,
  setGlobalVolume,
  setMuted,
  isSoundMuted,
  preloadSounds,
  initAudioSystem
} from '../lib/notificationSounds';

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

  // للتجميع
  groupId?: string; // معرف المجموعة
  groupCount?: number; // عدد الإشعارات في المجموعة
  isGrouped?: boolean; // هل هذا إشعار مجمّع
  groupedNotifications?: SmartNotification[]; // الإشعارات المجمعة

  // حالة القراءة (للسجل)
  isRead?: boolean;

  // بيانات إضافية
  data?: any;
  actions?: Array<{
    label: string;
    action: () => void;
    style?: 'primary' | 'secondary' | 'danger';
  }>;
}

// إعدادات وضع عدم الإزعاج
export interface DoNotDisturbSettings {
  enabled: boolean;
  schedule: {
    enabled: boolean;
    startTime: string; // "22:00"
    endTime: string;   // "08:00"
  };
  allowCritical: boolean; // السماح للحرج بالمرور
  silentMode: boolean; // صامت (يظهر بدون صوت)
}

export interface NotificationSettings {
  enabled: boolean;
  soundEnabled: boolean;
  soundVolume: number; // 0.0 - 1.0
  browserNotifications: boolean;
  titleFlashing: boolean;
  maxVisibleNotifications: number;
  defaultDuration: number;

  // تجميع الإشعارات
  groupSimilarNotifications: boolean;
  groupingWindow: number; // مدة التجميع بالميلي ثانية

  // وضع عدم الإزعاج
  doNotDisturb: DoNotDisturbSettings;

  // إعدادات الأولويات
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
  soundVolume: 0.5,
  browserNotifications: true,
  titleFlashing: true,
  maxVisibleNotifications: 5,
  defaultDuration: 5000,

  // تجميع الإشعارات
  groupSimilarNotifications: true,
  groupingWindow: 5000, // 5 ثوان

  // وضع عدم الإزعاج
  doNotDisturb: {
    enabled: false,
    schedule: {
      enabled: false,
      startTime: '22:00',
      endTime: '08:00'
    },
    allowCritical: true,
    silentMode: false
  },

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
  const [notificationHistory, setNotificationHistory] = useState<SmartNotification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [hasUserInteracted, setHasUserInteracted] = useState(initialUserInteraction);
  const [unreadCount, setUnreadCount] = useState(0);

  // مراجع للتحكم في المؤقتات
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const titleFlashIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastNotificationTimeRef = useRef<Date | null>(null);
  const pendingGroupRef = useRef<Map<string, SmartNotification[]>>(new Map());
  const groupTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // تحميل الإعدادات من localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('notification-settings-v2');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch (error) {
        console.warn('Failed to load notification settings:', error);
      }
    }

    // تحميل سجل الإشعارات
    const savedHistory = localStorage.getItem('notification-history');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        // تحويل التواريخ
        const history = parsed.map((n: any) => ({
          ...n,
          timestamp: new Date(n.timestamp)
        }));
        setNotificationHistory(history.slice(0, 100)); // آخر 100
      } catch (error) {
        console.warn('Failed to load notification history:', error);
      }
    }
  }, []);

  // حفظ الإعدادات في localStorage
  const updateSettings = useCallback((newSettings: Partial<NotificationSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem('notification-settings-v2', JSON.stringify(updated));

    // تحديث مستوى الصوت
    if (newSettings.soundVolume !== undefined) {
      setGlobalVolume(newSettings.soundVolume);
    }

    // تحديث حالة الكتم
    if (newSettings.soundEnabled !== undefined) {
      setMuted(!newSettings.soundEnabled);
    }
  }, [settings]);

  // حفظ سجل الإشعارات
  const saveHistory = useCallback((history: SmartNotification[]) => {
    const toSave = history.slice(0, 100).map(n => ({
      ...n,
      timestamp: n.timestamp.toISOString(),
      actions: undefined // لا نحفظ الدوال
    }));
    localStorage.setItem('notification-history', JSON.stringify(toSave));
  }, []);

  // التحقق من وضع عدم الإزعاج
  const isDNDActive = useCallback((): boolean => {
    const { doNotDisturb } = settings;

    if (!doNotDisturb.enabled) return false;

    // التحقق من الجدولة
    if (doNotDisturb.schedule.enabled) {
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();

      const [startHour, startMin] = doNotDisturb.schedule.startTime.split(':').map(Number);
      const [endHour, endMin] = doNotDisturb.schedule.endTime.split(':').map(Number);

      const startTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;

      // معالجة الحالة عندما يمتد الوقت عبر منتصف الليل
      if (startTime > endTime) {
        // مثلاً: من 22:00 إلى 08:00
        if (currentTime >= startTime || currentTime < endTime) {
          return true;
        }
      } else {
        // مثلاً: من 14:00 إلى 16:00
        if (currentTime >= startTime && currentTime < endTime) {
          return true;
        }
      }
      return false;
    }

    return true; // DND مفعّل بدون جدولة
  }, [settings]);

  // تشغيل الصوت المحسّن
  const playNotificationSound = useCallback((
    type: NotificationType,
    priority: NotificationPriority
  ) => {
    console.log(`🎵 محاولة تشغيل صوت - النوع: ${type}, الأولوية: ${priority}`);

    // التحقق من الإعدادات
    if (!settings.soundEnabled) {
      console.log('❌ الأصوات معطلة في الإعدادات');
      return;
    }

    if (!hasUserInteracted) {
      console.log('❌ لم يتفاعل المستخدم مع الصفحة بعد');
      return;
    }

    // التحقق من وضع عدم الإزعاج
    if (isDNDActive() && priority !== 'critical') {
      if (!settings.doNotDisturb.silentMode) {
        console.log('🌙 وضع عدم الإزعاج مفعّل');
        return;
      }
    }

    const prioritySettings = settings.prioritySettings[priority];
    if (!prioritySettings.sound) {
      console.log(`❌ الصوت معطل لأولوية ${priority}`);
      return;
    }

    // تشغيل الصوت الجديد
    playNotificationAudioByType(type, priority);

  }, [settings, hasUserInteracted, isDNDActive]);

  // إشعار المتصفح
  const showBrowserNotification = useCallback((notification: SmartNotification) => {
    if (!settings.browserNotifications || !hasUserInteracted) return;
    if (!('Notification' in window)) return;

    // التحقق من DND
    if (isDNDActive() && notification.priority !== 'critical') {
      if (!settings.doNotDisturb.allowCritical) return;
    }

    // طلب الإذن إذا لم يتم منحه
    if (Notification.permission === 'default') {
      Notification.requestPermission();
      return;
    }

    if (Notification.permission === 'granted') {
      const title = notification.isGrouped
        ? `${notification.title} (${notification.groupCount})`
        : notification.title;

      const browserNotification = new Notification(title, {
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
  }, [settings.browserNotifications, settings.doNotDisturb, hasUserInteracted, isDNDActive]);

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

  // تجميع الإشعارات
  const getGroupId = useCallback((notification: Omit<SmartNotification, 'id' | 'timestamp'>): string => {
    return `${notification.type}-${notification.priority}`;
  }, []);

  // معالجة التجميع
  const processGroupedNotification = useCallback((
    groupId: string,
    pendingNotifications: SmartNotification[]
  ) => {
    if (pendingNotifications.length === 0) return;

    if (pendingNotifications.length === 1) {
      // إشعار واحد فقط - إضافته مباشرة
      const notification = pendingNotifications[0];
      setNotifications(prev => {
        const updated = [notification, ...prev];
        return updated.slice(0, settings.maxVisibleNotifications);
      });
    } else {
      // إشعارات متعددة - تجميعها
      const firstNotification = pendingNotifications[0];
      const groupedNotification: SmartNotification = {
        ...firstNotification,
        id: `group-${Date.now()}`,
        isGrouped: true,
        groupId,
        groupCount: pendingNotifications.length,
        groupedNotifications: pendingNotifications,
        title: `${firstNotification.title} (${pendingNotifications.length})`,
        message: `${pendingNotifications.length} إشعارات متشابهة`
      };

      setNotifications(prev => {
        const updated = [groupedNotification, ...prev];
        return updated.slice(0, settings.maxVisibleNotifications);
      });
    }

    // مسح المجموعة المعلقة
    pendingGroupRef.current.delete(groupId);
    groupTimersRef.current.delete(groupId);
  }, [settings.maxVisibleNotifications]);

  // إضافة إشعار جديد
  const addNotification = useCallback((notificationData: Omit<SmartNotification, 'id' | 'timestamp'>) => {
    if (!settings.enabled) return;

    // التحقق من DND
    if (isDNDActive() && notificationData.priority !== 'critical') {
      if (!settings.doNotDisturb.allowCritical) {
        console.log('🌙 تم تجاهل الإشعار - وضع عدم الإزعاج');
        return;
      }
    }

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
      duration: notificationData.duration ?? prioritySettings.duration ?? settings.defaultDuration,
      isRead: false
    };

    // إضافة للسجل
    setNotificationHistory(prev => {
      const updated = [notification, ...prev].slice(0, 100);
      saveHistory(updated);
      return updated;
    });
    setUnreadCount(prev => prev + 1);

    // التجميع
    if (settings.groupSimilarNotifications) {
      const groupId = getGroupId(notification);
      const pending = pendingGroupRef.current.get(groupId) || [];
      pending.push(notification);
      pendingGroupRef.current.set(groupId, pending);

      // إلغاء المؤقت السابق
      const existingTimer = groupTimersRef.current.get(groupId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // تعيين مؤقت جديد
      const timer = setTimeout(() => {
        const finalPending = pendingGroupRef.current.get(groupId) || [];
        processGroupedNotification(groupId, finalPending);
      }, settings.groupingWindow);

      groupTimersRef.current.set(groupId, timer);
    } else {
      // إضافة مباشرة بدون تجميع
      setNotifications(prev => {
        const updated = [notification, ...prev];
        return updated.slice(0, settings.maxVisibleNotifications);
      });
    }

    // تشغيل الأصوات والتأثيرات
    if (notification.displayModes.includes('sound') || prioritySettings.sound) {
      playNotificationSound(notification.type, notification.priority);
    }

    if (notification.displayModes.includes('browser')) {
      showBrowserNotification(notification);
    }

    // إعداد المؤقت للإزالة التلقائية
    if (notification.duration && notification.duration > 0 && !notification.persistent) {
      const timer = setTimeout(() => {
        removeNotification(notification.id);
      }, notification.duration + (settings.groupSimilarNotifications ? settings.groupingWindow : 0));

      timersRef.current.set(notification.id, timer);
    }

    lastNotificationTimeRef.current = new Date();

  }, [
    settings,
    notifications,
    playNotificationSound,
    showBrowserNotification,
    isDNDActive,
    getGroupId,
    processGroupedNotification,
    saveHistory
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

    // إلغاء مؤقتات التجميع
    groupTimersRef.current.forEach(timer => clearTimeout(timer));
    groupTimersRef.current.clear();
    pendingGroupRef.current.clear();

    stopTitleFlashing();
  }, [stopTitleFlashing]);

  // إزالة الإشعارات حسب النوع
  const clearNotificationsByType = useCallback((type: NotificationType) => {
    const toRemove = notifications.filter(n => n.type === type);
    toRemove.forEach(n => removeNotification(n.id));
  }, [notifications, removeNotification]);

  // تعليم الإشعار كمقروء
  const markAsRead = useCallback((id: string) => {
    setNotificationHistory(prev => {
      const updated = prev.map(n =>
        n.id === id ? { ...n, isRead: true } : n
      );
      saveHistory(updated);
      return updated;
    });
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, [saveHistory]);

  // تعليم الكل كمقروء
  const markAllAsRead = useCallback(() => {
    setNotificationHistory(prev => {
      const updated = prev.map(n => ({ ...n, isRead: true }));
      saveHistory(updated);
      return updated;
    });
    setUnreadCount(0);
  }, [saveHistory]);

  // مسح السجل
  const clearHistory = useCallback(() => {
    setNotificationHistory([]);
    setUnreadCount(0);
    localStorage.removeItem('notification-history');
  }, []);

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
      groupTimersRef.current.forEach(timer => clearTimeout(timer));
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
      // تهيئة نظام الصوت
      preloadSounds();
      initAudioSystem();

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

  // تحديث مستوى الصوت عند تغيير الإعدادات
  useEffect(() => {
    setGlobalVolume(settings.soundVolume);
    setMuted(!settings.soundEnabled);
  }, [settings.soundVolume, settings.soundEnabled]);

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
    lastNotificationTime: lastNotificationTimeRef.current,
    historyCount: notificationHistory.length,
    unreadCount
  };

  return {
    notifications,
    notificationHistory,
    settings,
    stats,
    hasUserInteracted,
    unreadCount,
    isDNDActive: isDNDActive(),

    // Actions
    addNotification,
    removeNotification,
    clearAllNotifications,
    clearNotificationsByType,
    updateSettings,

    // History Actions
    markAsRead,
    markAllAsRead,
    clearHistory,

    // Utilities
    playNotificationSound,
    showBrowserNotification,
    startTitleFlashing,
    stopTitleFlashing
  };
};
