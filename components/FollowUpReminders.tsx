'use client';

import React, { useState, useCallback } from 'react';
import { useFollowUpReminders, FollowUpReminder, ReminderPriority, ReminderCategory } from '../hooks/useFollowUpReminders';
import type { Order } from '../types';

interface FollowUpRemindersProps {
  orders: Order[];
  currentUser?: string;
  onOrderClick?: (order: Order) => void;
  onCallClick?: (order: Order) => void;
  onWhatsAppClick?: (order: Order) => void;
}

// ==================== مكونات فرعية ====================

const PriorityBadge: React.FC<{ priority: ReminderPriority }> = ({ priority }) => {
  const styles: Record<ReminderPriority, string> = {
    urgent: 'bg-red-100 text-red-800 border-red-200 animate-pulse',
    high: 'bg-orange-100 text-orange-800 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-gray-100 text-gray-600 border-gray-200',
  };

  const labels: Record<ReminderPriority, string> = {
    urgent: 'عاجل',
    high: 'مهم',
    medium: 'متوسط',
    low: 'عادي',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${styles[priority]}`}>
      {labels[priority]}
    </span>
  );
};

const CategoryIcon: React.FC<{ category: ReminderCategory }> = ({ category }) => {
  const icons: Record<ReminderCategory, string> = {
    new_order: '🆕',
    no_response: '📵',
    pending_confirmation: '⏳',
    whatsapp_sent: '💬',
    shipping_fee: '💰',
    old_order: '⚠️',
  };

  return <span className="text-lg">{icons[category]}</span>;
};

// ==================== بطاقة التنبيه ====================

interface ReminderCardProps {
  reminder: FollowUpReminder;
  onDismiss: (id: string, hours?: number) => void;
  onOrderClick?: (order: Order) => void;
  onCallClick?: (order: Order) => void;
  onWhatsAppClick?: (order: Order) => void;
  compact?: boolean;
}

const ReminderCard: React.FC<ReminderCardProps> = ({
  reminder,
  onDismiss,
  onOrderClick,
  onCallClick,
  onWhatsAppClick,
  compact = false,
}) => {
  const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);

  const priorityBorders: Record<ReminderPriority, string> = {
    urgent: 'border-r-4 border-r-red-500',
    high: 'border-r-4 border-r-orange-500',
    medium: 'border-r-4 border-r-yellow-500',
    low: 'border-r-4 border-r-gray-300',
  };

  if (compact) {
    return (
      <div
        className={`bg-white rounded-lg shadow-sm p-3 ${priorityBorders[reminder.priority]} hover:shadow-md transition-shadow cursor-pointer`}
        onClick={() => onOrderClick?.(reminder.order)}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <CategoryIcon category={reminder.category} />
            <div className="truncate">
              <span className="font-medium text-gray-900">{reminder.order.name}</span>
              <span className="text-gray-500 text-sm mr-2">{reminder.timeElapsed}</span>
            </div>
          </div>
          <PriorityBadge priority={reminder.priority} />
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm border ${priorityBorders[reminder.priority]} overflow-hidden`}>
      {/* الهيدر */}
      <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CategoryIcon category={reminder.category} />
          <span className="font-semibold text-gray-800">{reminder.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <PriorityBadge priority={reminder.priority} />
          <span className="text-xs text-gray-500">{reminder.timeElapsed}</span>
        </div>
      </div>

      {/* المحتوى */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h4 className="font-bold text-gray-900 text-lg">{reminder.order.name}</h4>
            <p className="text-gray-600 text-sm mt-1">
              {reminder.order.productName || 'بدون منتج'} 
              {reminder.order.totalPrice && <span className="mr-2">• {reminder.order.totalPrice} ج.م</span>}
            </p>
            <p className="text-gray-500 text-xs mt-2">
              {reminder.order.governorate && <span>{reminder.order.governorate}</span>}
              {reminder.order.source && <span className="mr-2">• {reminder.order.source}</span>}
            </p>
          </div>
          
          {/* الحالة */}
          <div className="text-left">
            <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
              {reminder.order.status}
            </span>
          </div>
        </div>

        {/* الإجراء المقترح */}
        <div className="mt-3 p-2 bg-blue-50 rounded-lg">
          <p className="text-blue-800 text-sm">
            <span className="font-medium">💡 الإجراء المقترح:</span> {reminder.suggestedAction}
          </p>
        </div>

        {/* أزرار الإجراءات */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => onCallClick?.(reminder.order)}
            className="flex items-center gap-1 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium"
          >
            <span>📞</span> اتصال
          </button>
          
          <button
            onClick={() => onWhatsAppClick?.(reminder.order)}
            className="flex items-center gap-1 px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm font-medium"
          >
            <span>💬</span> واتساب
          </button>
          
          <button
            onClick={() => onOrderClick?.(reminder.order)}
            className="flex items-center gap-1 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
          >
            <span>👁️</span> عرض
          </button>

          <div className="relative mr-auto">
            <button
              onClick={() => setShowSnoozeOptions(!showSnoozeOptions)}
              className="flex items-center gap-1 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
            >
              <span>⏰</span> تأجيل
            </button>
            
            {showSnoozeOptions && (
              <div className="absolute left-0 bottom-full mb-1 bg-white border rounded-lg shadow-lg p-2 z-10 min-w-[120px]">
                <button
                  onClick={() => { onDismiss(reminder.id, 1); setShowSnoozeOptions(false); }}
                  className="block w-full text-right px-3 py-1.5 text-sm hover:bg-gray-100 rounded"
                >
                  ساعة واحدة
                </button>
                <button
                  onClick={() => { onDismiss(reminder.id, 2); setShowSnoozeOptions(false); }}
                  className="block w-full text-right px-3 py-1.5 text-sm hover:bg-gray-100 rounded"
                >
                  ساعتين
                </button>
                <button
                  onClick={() => { onDismiss(reminder.id, 4); setShowSnoozeOptions(false); }}
                  className="block w-full text-right px-3 py-1.5 text-sm hover:bg-gray-100 rounded"
                >
                  4 ساعات
                </button>
                <button
                  onClick={() => { onDismiss(reminder.id); setShowSnoozeOptions(false); }}
                  className="block w-full text-right px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
                >
                  تجاهل نهائي
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== ويدجت التنبيهات العائم ====================

interface FloatingWidgetProps {
  reminders: FollowUpReminder[];
  stats: { total: number; urgent: number };
  onExpand: () => void;
}

const FloatingWidget: React.FC<FloatingWidgetProps> = ({ reminders, stats, onExpand }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (stats.total === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50">
      {/* الزر الرئيسي */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-all
          ${stats.urgent > 0 
            ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' 
            : 'bg-blue-500 hover:bg-blue-600 text-white'}
        `}
      >
        <span className="text-xl">⏰</span>
        <span className="font-bold">{stats.total}</span>
        <span className="text-sm">تنبيه متابعة</span>
        {stats.urgent > 0 && (
          <span className="bg-white text-red-600 px-2 py-0.5 rounded-full text-xs font-bold">
            {stats.urgent} عاجل
          </span>
        )}
      </button>

      {/* القائمة المنسدلة */}
      {isExpanded && (
        <div className="absolute bottom-full left-0 mb-2 w-80 max-h-96 overflow-y-auto bg-white rounded-xl shadow-2xl border">
          <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
            <h3 className="font-bold text-gray-800">تنبيهات المتابعة</h3>
            <button
              onClick={onExpand}
              className="text-blue-600 text-sm hover:underline"
            >
              عرض الكل
            </button>
          </div>
          
          <div className="p-2 space-y-2">
            {reminders.slice(0, 5).map(reminder => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                onDismiss={() => {}}
                compact
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== إعدادات التنبيهات ====================

interface ReminderSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReturnType<typeof useFollowUpReminders>['settings'];
  updateSettings: ReturnType<typeof useFollowUpReminders>['updateSettings'];
  updateThresholds: ReturnType<typeof useFollowUpReminders>['updateThresholds'];
  resetDismissed: () => void;
}

const ReminderSettingsModal: React.FC<ReminderSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  updateSettings,
  updateThresholds,
  resetDismissed,
}) => {
  if (!isOpen) return null;

  const thresholdLabels: Record<keyof typeof settings.thresholds, string> = {
    newOrder: 'طلب جديد',
    noResponse: 'لم يرد',
    pendingConfirmation: 'انتظار تأكيد',
    whatsappSent: 'واتساب مُرسل',
    shippingFee: 'طلب مصاريف شحن',
    oldOrder: 'طلب قديم',
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">⚙️ إعدادات تنبيهات المتابعة</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* تفعيل/إيقاف */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-800">تفعيل التنبيهات</h3>
              <p className="text-sm text-gray-500">تلقي تنبيهات للطلبات التي تحتاج متابعة</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => updateSettings({ enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* فترات التنبيه */}
          <div>
            <h3 className="font-semibold text-gray-800 mb-3">⏱️ فترات التنبيه (بالدقائق)</h3>
            <p className="text-xs text-gray-500 mb-3">التنبيه يظهر مرة واحدة فقط لكل طلب</p>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(settings.thresholds).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 flex-1">
                    {thresholdLabels[key as keyof typeof settings.thresholds]}
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={value}
                      onChange={(e) => updateThresholds({ [key]: parseInt(e.target.value) || 1 })}
                      className="w-16 px-2 py-1 border rounded-lg text-center"
                    />
                    <span className="text-xs text-gray-400">د</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* خيارات العرض */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-800">🖥️ خيارات العرض</h3>
            
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showFloatingWidget}
                onChange={(e) => updateSettings({ showFloatingWidget: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-gray-700">عرض الويدجت العائم</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showInDashboard}
                onChange={(e) => updateSettings({ showInDashboard: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-gray-700">عرض في لوحة التحكم</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.playSound}
                onChange={(e) => updateSettings({ playSound: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-gray-700">تشغيل صوت للتنبيهات العاجلة</span>
            </label>

            <div className="flex items-center gap-3">
              <label className="text-gray-700">الحد الأقصى للتنبيهات المرئية:</label>
              <input
                type="number"
                min="3"
                max="20"
                value={settings.maxRemindersVisible}
                onChange={(e) => updateSettings({ maxRemindersVisible: parseInt(e.target.value) || 5 })}
                className="w-16 px-2 py-1 border rounded-lg text-center"
              />
            </div>
          </div>

          {/* إعادة تعيين */}
          <div className="pt-4 border-t">
            <button
              onClick={resetDismissed}
              className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              🔄 إعادة عرض التنبيهات المرفوضة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== المكون الرئيسي ====================

export const FollowUpReminders: React.FC<FollowUpRemindersProps> = ({
  orders,
  currentUser,
  onOrderClick,
  onCallClick,
  onWhatsAppClick,
}) => {
  const {
    reminders,
    visibleReminders,
    stats,
    settings,
    updateSettings,
    updateThresholds,
    dismissReminder,
    dismissAllReminders,
    resetDismissed,
  } = useFollowUpReminders(orders, currentUser);

  const [showSettings, setShowSettings] = useState(false);
  const [showFullList, setShowFullList] = useState(false);

  const handleCallClick = useCallback((order: Order) => {
    if (onCallClick) {
      onCallClick(order);
    } else {
      window.open(`tel:${order.phone}`, '_self');
    }
  }, [onCallClick]);

  const handleWhatsAppClick = useCallback((order: Order) => {
    if (onWhatsAppClick) {
      onWhatsAppClick(order);
    } else {
      const phone = order.whatsapp || order.phone;
      const cleanPhone = phone.replace(/\D/g, '');
      window.open(`https://wa.me/${cleanPhone}`, '_blank');
    }
  }, [onWhatsAppClick]);

  if (!settings.enabled) return null;

  return (
    <>
      {/* الويدجت العائم */}
      {settings.showFloatingWidget && (
        <FloatingWidget
          reminders={visibleReminders}
          stats={stats}
          onExpand={() => setShowFullList(true)}
        />
      )}

      {/* قسم لوحة التحكم */}
      {settings.showInDashboard && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-4 sm:p-6">
          {/* الهيدر */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${stats.urgent > 0 ? 'bg-red-100' : 'bg-amber-100'}`}>
                <span className="text-2xl">⏰</span>
              </div>
              <div>
                <h3 className="font-bold text-gray-800 text-lg">تنبيهات المتابعة</h3>
                <p className="text-sm text-gray-600">
                  {stats.total} طلب يحتاج متابعة
                  {stats.urgent > 0 && <span className="text-red-600 font-medium"> • {stats.urgent} عاجل</span>}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-white rounded-lg transition-colors"
                title="الإعدادات"
              >
                ⚙️
              </button>
              <button
                onClick={dismissAllReminders}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-white rounded-lg transition-colors"
              >
                تجاهل الكل
              </button>
            </div>
          </div>

          {/* ملخص سريع */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {stats.byPriority.urgent > 0 && (
              <div className="bg-red-100 rounded-lg p-2 text-center">
                <div className="text-red-800 font-bold text-lg">{stats.byPriority.urgent}</div>
                <div className="text-red-600 text-xs">عاجل</div>
              </div>
            )}
            {stats.byPriority.high > 0 && (
              <div className="bg-orange-100 rounded-lg p-2 text-center">
                <div className="text-orange-800 font-bold text-lg">{stats.byPriority.high}</div>
                <div className="text-orange-600 text-xs">مهم</div>
              </div>
            )}
            {stats.byPriority.medium > 0 && (
              <div className="bg-yellow-100 rounded-lg p-2 text-center">
                <div className="text-yellow-800 font-bold text-lg">{stats.byPriority.medium}</div>
                <div className="text-yellow-600 text-xs">متوسط</div>
              </div>
            )}
            {stats.byPriority.low > 0 && (
              <div className="bg-gray-100 rounded-lg p-2 text-center">
                <div className="text-gray-800 font-bold text-lg">{stats.byPriority.low}</div>
                <div className="text-gray-600 text-xs">عادي</div>
              </div>
            )}
          </div>

          {/* قائمة التنبيهات */}
          <div className="space-y-3">
            {stats.total === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">✅</div>
                <p className="font-medium text-gray-700">ممتاز! لا توجد طلبات تحتاج متابعة حالياً</p>
                <p className="text-sm mt-1">سيتم تنبيهك تلقائياً عند وجود طلبات تحتاج متابعة</p>
              </div>
            ) : (
              visibleReminders.map(reminder => (
                <ReminderCard
                  key={reminder.id}
                  reminder={reminder}
                  onDismiss={dismissReminder}
                  onOrderClick={onOrderClick}
                  onCallClick={handleCallClick}
                  onWhatsAppClick={handleWhatsAppClick}
                />
              ))
            )}
          </div>

          {/* عرض المزيد */}
          {reminders.length > settings.maxRemindersVisible && (
            <button
              onClick={() => setShowFullList(true)}
              className="w-full mt-4 py-2 text-amber-700 hover:text-amber-800 font-medium"
            >
              عرض {reminders.length - settings.maxRemindersVisible} تنبيه آخر ←
            </button>
          )}
        </div>
      )}

      {/* نافذة الإعدادات */}
      <ReminderSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        updateSettings={updateSettings}
        updateThresholds={updateThresholds}
        resetDismissed={resetDismissed}
      />

      {/* نافذة القائمة الكاملة */}
      {showFullList && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">
                ⏰ جميع تنبيهات المتابعة ({reminders.length})
              </h2>
              <button
                onClick={() => setShowFullList(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {reminders.map(reminder => (
                <ReminderCard
                  key={reminder.id}
                  reminder={reminder}
                  onDismiss={dismissReminder}
                  onOrderClick={(order) => { onOrderClick?.(order); setShowFullList(false); }}
                  onCallClick={handleCallClick}
                  onWhatsAppClick={handleWhatsAppClick}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FollowUpReminders;
