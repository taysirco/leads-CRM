import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Order } from '../types';

// ==================== أنواع التنبيهات ====================

export type ReminderPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ReminderCategory = 
  | 'new_order'           // طلب جديد لم يُتابع
  | 'no_response'         // لم يرد منذ فترة
  | 'pending_confirmation' // في انتظار تأكيد طويل
  | 'whatsapp_sent'       // أرسل واتساب ولم يرد
  | 'shipping_fee'        // طلب مصاريف شحن معلق
  | 'old_order';          // طلب قديم جداً

export interface FollowUpReminder {
  id: string;
  orderId: number;
  order: Order;
  category: ReminderCategory;
  priority: ReminderPriority;
  title: string;
  message: string;
  timeElapsed: string;      // "منذ 3 ساعات"
  hoursElapsed: number;
  suggestedAction: string;
  createdAt: Date;
  isDismissed: boolean;
  dismissedUntil?: Date;    // تأجيل التنبيه
}

export interface ReminderSettings {
  enabled: boolean;
  // فترات التنبيه بالدقائق
  thresholds: {
    newOrder: number;              // طلب جديد (افتراضي: 15 دقيقة)
    noResponse: number;            // لم يرد (افتراضي: 30 دقيقة)
    pendingConfirmation: number;   // انتظار تأكيد (افتراضي: 60 دقيقة)
    whatsappSent: number;          // واتساب مُرسل (افتراضي: 90 دقيقة)
    shippingFee: number;           // طلب مصاريف شحن (افتراضي: 120 دقيقة)
    oldOrder: number;              // طلب قديم (افتراضي: 240 دقيقة)
  };
  // إعدادات العرض
  showInDashboard: boolean;
  showFloatingWidget: boolean;
  playSound: boolean;
  maxRemindersVisible: number;
  // فلترة
  filterByAssignee: boolean;      // فلترة حسب الموظف المسؤول
  currentAssignee?: string;
}

interface ReminderStats {
  total: number;
  byPriority: Record<ReminderPriority, number>;
  byCategory: Record<ReminderCategory, number>;
  urgent: number;
}

const DEFAULT_SETTINGS: ReminderSettings = {
  enabled: true,
  thresholds: {
    newOrder: 15,            // 15 دقيقة
    noResponse: 30,          // 30 دقيقة
    pendingConfirmation: 60, // ساعة
    whatsappSent: 90,        // ساعة ونصف
    shippingFee: 120,        // ساعتين
    oldOrder: 240,           // 4 ساعات
  },
  showInDashboard: true,
  showFloatingWidget: true,
  playSound: false,
  maxRemindersVisible: 5,
  filterByAssignee: false,
};

// ==================== دوال مساعدة ====================

function parseOrderDate(dateStr: string | number | null | undefined): Date | null {
  if (!dateStr) return null;
  
  // التأكد من أن القيمة string
  const strDate = String(dateStr).trim();
  if (!strDate || strDate === 'undefined' || strDate === 'null') return null;
  
  // محاولة تحليل التاريخ بتنسيقات مختلفة
  const formats = [
    // DD/MM/YYYY HH:mm:ss
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):?(\d{2})?$/,
    // YYYY-MM-DD HH:mm:ss
    /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2}):?(\d{2})?$/,
    // DD-MM-YYYY HH:mm
    /^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})$/,
  ];

  for (const format of formats) {
    const match = strDate.match(format);
    if (match) {
      try {
        if (format === formats[0]) {
          // DD/MM/YYYY
          return new Date(
            parseInt(match[3]), // year
            parseInt(match[2]) - 1, // month (0-indexed)
            parseInt(match[1]), // day
            parseInt(match[4]) || 0, // hour
            parseInt(match[5]) || 0, // minute
            parseInt(match[6]) || 0  // second
          );
        } else if (format === formats[1]) {
          // YYYY-MM-DD
          return new Date(
            parseInt(match[1]), // year
            parseInt(match[2]) - 1, // month
            parseInt(match[3]), // day
            parseInt(match[4]) || 0,
            parseInt(match[5]) || 0,
            parseInt(match[6]) || 0
          );
        }
      } catch {
        continue;
      }
    }
  }

  // محاولة أخيرة باستخدام Date.parse
  const parsed = Date.parse(strDate);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }

  return null;
}

function getMinutesElapsed(orderDate: Date): number {
  const now = new Date();
  const diffMs = now.getTime() - orderDate.getTime();
  return diffMs / (1000 * 60); // بالدقائق
}

function formatTimeElapsed(minutes: number): string {
  if (minutes < 60) {
    const m = Math.floor(minutes);
    return `منذ ${m} دقيقة`;
  } else if (minutes < 1440) { // أقل من 24 ساعة
    const h = Math.floor(minutes / 60);
    return `منذ ${h} ساعة${h > 2 && h < 11 ? 'ات' : ''}`;
  } else {
    const days = Math.floor(minutes / 1440);
    return `منذ ${days} يوم`;
  }
}

function determinePriority(minutes: number, category: ReminderCategory): ReminderPriority {
  // الطلبات القديمة جداً لها أولوية عالية
  if (category === 'old_order' || minutes > 480) return 'urgent'; // > 8 ساعات
  if (category === 'new_order' && minutes > 60) return 'high';    // > ساعة
  if (minutes > 240) return 'high';   // > 4 ساعات
  if (minutes > 120) return 'medium'; // > ساعتين
  return 'low';
}

function getCategoryInfo(category: ReminderCategory): { title: string; icon: string; action: string } {
  const info: Record<ReminderCategory, { title: string; icon: string; action: string }> = {
    new_order: {
      title: 'طلب جديد بانتظار المتابعة',
      icon: '🆕',
      action: 'اتصل بالعميل لتأكيد الطلب'
    },
    no_response: {
      title: 'لم يرد على الاتصال',
      icon: '📵',
      action: 'حاول الاتصال مرة أخرى أو أرسل واتساب'
    },
    pending_confirmation: {
      title: 'في انتظار تأكيد العميل',
      icon: '⏳',
      action: 'تابع مع العميل للحصول على التأكيد'
    },
    whatsapp_sent: {
      title: 'تم إرسال واتساب ولم يرد',
      icon: '💬',
      action: 'اتصل بالعميل أو أرسل رسالة تذكير'
    },
    shipping_fee: {
      title: 'طلب مصاريف الشحن معلق',
      icon: '💰',
      action: 'تابع مع العميل بخصوص مصاريف الشحن'
    },
    old_order: {
      title: 'طلب قديم يحتاج إجراء',
      icon: '⚠️',
      action: 'راجع الطلب واتخذ إجراء نهائي'
    }
  };
  return info[category];
}

function determineCategory(order: Order, minutesElapsed: number, thresholds: ReminderSettings['thresholds']): ReminderCategory | null {
  const status = order.status;

  // الحالات المكتملة لا تحتاج تنبيه
  if (['تم التأكيد', 'تم الشحن', 'رفض التأكيد'].includes(status)) {
    return null;
  }

  // طلب قديم جداً
  if (minutesElapsed >= thresholds.oldOrder) {
    return 'old_order';
  }

  // حسب الحالة
  if (status === 'جديد' && minutesElapsed >= thresholds.newOrder) {
    return 'new_order';
  }

  if (status === 'لم يرد' && minutesElapsed >= thresholds.noResponse) {
    return 'no_response';
  }

  if (status === 'في انتظار تأكيد العميل' && minutesElapsed >= thresholds.pendingConfirmation) {
    return 'pending_confirmation';
  }

  if (status === 'تم التواصل معه واتساب' && minutesElapsed >= thresholds.whatsappSent) {
    return 'whatsapp_sent';
  }

  if (status === 'طلب مصاريف الشحن' && minutesElapsed >= thresholds.shippingFee) {
    return 'shipping_fee';
  }

  return null;
}

// ==================== الـ Hook الرئيسي ====================

export function useFollowUpReminders(orders: Order[], currentUser?: string) {
  const [settings, setSettings] = useState<ReminderSettings>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('followUpReminderSettings');
      if (saved) {
        try {
          return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        } catch {
          return DEFAULT_SETTINGS;
        }
      }
    }
    return DEFAULT_SETTINGS;
  });

  const [dismissedReminders, setDismissedReminders] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('dismissedReminders');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // تنظيف التنبيهات المؤجلة القديمة
          const now = new Date();
          const valid = parsed.filter((item: { id: string; until?: string }) => {
            if (!item.until) return true;
            return new Date(item.until) > now;
          });
          return new Set(valid.map((item: { id: string }) => item.id));
        } catch {
          return new Set();
        }
      }
    }
    return new Set();
  });

  const lastSoundPlayedRef = useRef<number>(0);

  // حفظ الإعدادات
  useEffect(() => {
    localStorage.setItem('followUpReminderSettings', JSON.stringify(settings));
  }, [settings]);

  // حساب التنبيهات
  const reminders = useMemo((): FollowUpReminder[] => {
    if (!settings.enabled || !orders.length) return [];

    const result: FollowUpReminder[] = [];

    for (const order of orders) {
      // فلترة حسب الموظف إذا كان مفعلاً
      if (settings.filterByAssignee && settings.currentAssignee) {
        if (order.assignee !== settings.currentAssignee) continue;
      }

      const orderDate = parseOrderDate(order.orderDate);
      if (!orderDate) continue;

      const minutesElapsed = getMinutesElapsed(orderDate);
      const category = determineCategory(order, minutesElapsed, settings.thresholds);

      if (!category) continue;

      // التنبيه مرة واحدة فقط لكل طلب (باستخدام order.id فقط)
      const reminderId = `order-${order.id}`;
      
      // تجاهل التنبيهات المرفوضة (مرة واحدة لكل طلب)
      if (dismissedReminders.has(reminderId)) continue;

      const categoryInfo = getCategoryInfo(category);
      const priority = determinePriority(minutesElapsed, category);

      result.push({
        id: reminderId,
        orderId: order.id,
        order,
        category,
        priority,
        title: `${categoryInfo.icon} ${categoryInfo.title}`,
        message: `${order.name} - ${order.productName || 'بدون منتج'}`,
        timeElapsed: formatTimeElapsed(minutesElapsed),
        hoursElapsed: minutesElapsed, // نحتفظ بالاسم للتوافق
        suggestedAction: categoryInfo.action,
        createdAt: new Date(),
        isDismissed: false,
      });
    }

    // ترتيب حسب الأولوية ثم الوقت
    const priorityOrder: Record<ReminderPriority, number> = {
      urgent: 0,
      high: 1,
      medium: 2,
      low: 3
    };

    return result.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.hoursElapsed - a.hoursElapsed;
    });
  }, [orders, settings, dismissedReminders]);

  // إحصائيات التنبيهات
  const stats = useMemo((): ReminderStats => {
    const byPriority: Record<ReminderPriority, number> = {
      low: 0, medium: 0, high: 0, urgent: 0
    };
    const byCategory: Record<ReminderCategory, number> = {
      new_order: 0, no_response: 0, pending_confirmation: 0,
      whatsapp_sent: 0, shipping_fee: 0, old_order: 0
    };

    for (const reminder of reminders) {
      byPriority[reminder.priority]++;
      byCategory[reminder.category]++;
    }

    return {
      total: reminders.length,
      byPriority,
      byCategory,
      urgent: byPriority.urgent + byPriority.high
    };
  }, [reminders]);

  // تشغيل صوت عند وجود تنبيهات عاجلة جديدة
  useEffect(() => {
    if (!settings.playSound || stats.urgent === 0) return;
    
    const now = Date.now();
    // لا تشغل صوت أكثر من مرة كل 5 دقائق
    if (now - lastSoundPlayedRef.current < 5 * 60 * 1000) return;

    // يمكن إضافة تشغيل صوت هنا
    lastSoundPlayedRef.current = now;
  }, [stats.urgent, settings.playSound]);

  // رفض تنبيه
  const dismissReminder = useCallback((reminderId: string, hoursToSnooze?: number) => {
    setDismissedReminders(prev => {
      const newSet = new Set(prev);
      newSet.add(reminderId);
      
      // حفظ في localStorage
      const saved = Array.from(newSet).map(id => ({
        id,
        until: hoursToSnooze ? new Date(Date.now() + hoursToSnooze * 60 * 60 * 1000).toISOString() : undefined
      }));
      localStorage.setItem('dismissedReminders', JSON.stringify(saved));
      
      return newSet;
    });
  }, []);

  // رفض كل التنبيهات
  const dismissAllReminders = useCallback(() => {
    const allIds = reminders.map(r => r.id);
    setDismissedReminders(new Set(allIds));
    
    const saved = allIds.map(id => ({ id }));
    localStorage.setItem('dismissedReminders', JSON.stringify(saved));
  }, [reminders]);

  // إعادة تعيين التنبيهات المرفوضة
  const resetDismissed = useCallback(() => {
    setDismissedReminders(new Set());
    localStorage.removeItem('dismissedReminders');
  }, []);

  // تحديث الإعدادات
  const updateSettings = useCallback((updates: Partial<ReminderSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  // تحديث فترات التنبيه
  const updateThresholds = useCallback((updates: Partial<ReminderSettings['thresholds']>) => {
    setSettings(prev => ({
      ...prev,
      thresholds: { ...prev.thresholds, ...updates }
    }));
  }, []);

  // تعيين الموظف الحالي للفلترة
  const setCurrentAssignee = useCallback((assignee: string | undefined) => {
    setSettings(prev => ({
      ...prev,
      currentAssignee: assignee,
      filterByAssignee: !!assignee
    }));
  }, []);

  // الحصول على التنبيهات المرئية
  const visibleReminders = useMemo(() => {
    return reminders.slice(0, settings.maxRemindersVisible);
  }, [reminders, settings.maxRemindersVisible]);

  return {
    // البيانات
    reminders,
    visibleReminders,
    stats,
    
    // الإعدادات
    settings,
    updateSettings,
    updateThresholds,
    
    // الإجراءات
    dismissReminder,
    dismissAllReminders,
    resetDismissed,
    setCurrentAssignee,
    
    // حالات مساعدة
    hasUrgentReminders: stats.urgent > 0,
    isEmpty: reminders.length === 0,
  };
}

export default useFollowUpReminders;
