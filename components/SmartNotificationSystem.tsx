import React, { useState, useEffect, useMemo } from 'react';
import { SmartNotification, NotificationPriority, NotificationDisplayMode } from '../hooks/useSmartNotifications';
import { getStatusConfig, getStatusColor, getStatusIcon } from '../utils/statusColors';

interface SmartNotificationSystemProps {
  notifications: SmartNotification[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  onDismissType: (type: string) => void;
  hasUserInteracted: boolean;
  isDNDActive?: boolean;
}

const SmartNotificationSystem: React.FC<SmartNotificationSystemProps> = ({
  notifications,
  onDismiss,
  onDismissAll,
  onDismissType,
  hasUserInteracted,
  isDNDActive = false
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [expandedNotifications, setExpandedNotifications] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [swipingId, setSwipingId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  // التحقق من حجم الشاشة
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // تجميع الإشعارات حسب نوع العرض
  const groupedNotifications = useMemo(() => {
    const groups: Record<NotificationDisplayMode, SmartNotification[]> = {
      toast: [],
      banner: [],
      modal: [],
      fullscreen: [],
      browser: [],
      title: [],
      sound: []
    };

    notifications.forEach(notification => {
      notification.displayModes.forEach(mode => {
        if (groups[mode]) {
          groups[mode].push(notification);
        }
      });
    });

    return groups;
  }, [notifications]);

  // إحصائيات الإشعارات
  const stats = useMemo(() => {
    const byPriority = notifications.reduce((acc, n) => {
      acc[n.priority] = (acc[n.priority] || 0) + 1;
      return acc;
    }, {} as Record<NotificationPriority, number>);

    const byType = notifications.reduce((acc, n) => {
      acc[n.type] = (acc[n.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total: notifications.length,
      critical: byPriority.critical || 0,
      high: byPriority.high || 0,
      normal: byPriority.normal || 0,
      low: byPriority.low || 0,
      newOrders: byType.new_order || 0,
      byType
    };
  }, [notifications]);

  // تبديل توسيع الإشعار
  const toggleExpanded = (id: string) => {
    setExpandedNotifications(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // تبديل توسيع المجموعة
  const toggleGroupExpanded = (id: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // معالجة السحب للموبايل
  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    setTouchStart(e.touches[0].clientX);
    setSwipingId(id);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const currentTouch = e.touches[0].clientX;
    const diff = touchStart - currentTouch;
    // السحب لليمين فقط (للحذف) في RTL
    if (diff < 0) {
      setSwipeOffset(Math.min(Math.abs(diff), 100));
    }
  };

  const handleTouchEnd = () => {
    if (swipeOffset > 80 && swipingId) {
      onDismiss(swipingId);
    }
    setTouchStart(null);
    setSwipingId(null);
    setSwipeOffset(0);
  };

  // الحصول على أيقونة حسب النوع والبيانات
  const getNotificationIcon = (notification: SmartNotification) => {
    if (notification.data?.status) {
      return getStatusIcon(notification.data.status);
    }

    const typeIcons = {
      new_order: '🛒',
      order_update: '📝',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      info: 'ℹ️',
      stock_alert: '📦',
      system: '⚙️'
    };
    return typeIcons[notification.type as keyof typeof typeIcons] || '📢';
  };

  // الحصول على لون حسب الأولوية
  const getPriorityColor = (priority: NotificationPriority) => {
    const colors = {
      low: 'from-gray-500 to-gray-600',
      normal: 'from-blue-500 to-blue-600',
      high: 'from-orange-500 to-orange-600',
      critical: 'from-red-500 to-red-600'
    };
    return colors[priority];
  };

  // الحصول على لون الحد حسب الأولوية
  const getPriorityBorderColor = (priority: NotificationPriority) => {
    const colors = {
      low: 'border-gray-200',
      normal: 'border-blue-200',
      high: 'border-orange-200',
      critical: 'border-red-200'
    };
    return colors[priority];
  };

  // الحصول على لون الخلفية حسب الأولوية
  const getPriorityBgColor = (priority: NotificationPriority) => {
    const colors = {
      low: 'bg-gray-50',
      normal: 'bg-blue-50',
      high: 'bg-orange-50',
      critical: 'bg-red-50'
    };
    return colors[priority];
  };

  if (notifications.length === 0) return null;

  // مكون الإشعار الفردي
  const NotificationItem = ({ notification, index, isNested = false }: { notification: SmartNotification; index: number; isNested?: boolean }) => {
    const isExpanded = expandedNotifications.has(notification.id);
    const isLongMessage = notification.message.length > 100;
    const isSwiping = swipingId === notification.id;

    return (
      <div
        className={`relative overflow-hidden transition-all duration-200 ${isNested ? 'mr-4 border-r-2 border-purple-200' : ''
          }`}
        onTouchStart={(e) => handleTouchStart(e, notification.id)}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* خلفية السحب */}
        {isSwiping && (
          <div
            className="absolute inset-0 bg-red-500 flex items-center justify-start px-4"
            style={{ opacity: swipeOffset / 100 }}
          >
            <span className="text-white text-sm font-medium">🗑️ حذف</span>
          </div>
        )}

        <div
          className={`border-r-4 ${getPriorityBorderColor(notification.priority)} ${getPriorityBgColor(notification.priority)} p-3 sm:p-4 ${index < groupedNotifications.toast.length - 1 ? 'border-b border-gray-100' : ''
            } hover:bg-opacity-80 transition-all ${notification.priority === 'critical' ? 'animate-pulse' : ''
            }`}
          style={{
            transform: isSwiping ? `translateX(-${swipeOffset}px)` : 'translateX(0)',
            transition: isSwiping ? 'none' : 'transform 0.2s'
          }}
        >
          <div className="flex items-start gap-2 sm:gap-3">
            <div className="text-xl sm:text-2xl flex-shrink-0">
              {getNotificationIcon(notification)}
            </div>

            <div className="flex-1 min-w-0">
              {/* العنوان */}
              <div className="flex items-center justify-between mb-1 gap-2">
                <h4 className="font-bold text-gray-800 text-xs sm:text-sm truncate flex items-center gap-1">
                  {notification.title}
                  {notification.isGrouped && notification.groupCount && (
                    <span className="bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                      {notification.groupCount}
                    </span>
                  )}
                </h4>
                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                  <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium bg-gradient-to-r ${getPriorityColor(notification.priority)} text-white`}>
                    {notification.priority === 'critical' ? 'حرج' :
                      notification.priority === 'high' ? 'مهم' :
                        notification.priority === 'normal' ? 'عادي' : 'منخفض'}
                  </span>
                  <button
                    onClick={() => onDismiss(notification.id)}
                    className="text-gray-400 hover:text-red-500 text-xs transition-colors p-1"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* الرسالة */}
              <div className="text-gray-600 text-xs sm:text-sm">
                {isLongMessage && !isExpanded ? (
                  <>
                    {notification.message.substring(0, 80)}...
                    <button
                      onClick={() => toggleExpanded(notification.id)}
                      className="text-blue-500 hover:text-blue-700 mr-1 font-medium"
                    >
                      المزيد
                    </button>
                  </>
                ) : (
                  <>
                    {notification.message}
                    {isLongMessage && isExpanded && (
                      <button
                        onClick={() => toggleExpanded(notification.id)}
                        className="text-blue-500 hover:text-blue-700 mr-1 font-medium"
                      >
                        أقل
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* زر توسيع المجموعة */}
              {notification.isGrouped && notification.groupedNotifications && notification.groupedNotifications.length > 0 && (
                <button
                  onClick={() => toggleGroupExpanded(notification.id)}
                  className="mt-2 text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1"
                >
                  {expandedGroups.has(notification.id) ? '🔼 إخفاء التفاصيل' : '🔽 عرض التفاصيل'}
                </button>
              )}

              {/* الإجراءات */}
              {notification.actions && notification.actions.length > 0 && (
                <div className="flex flex-wrap gap-1 sm:gap-2 mt-2 sm:mt-3">
                  {notification.actions.map((action, actionIndex) => (
                    <button
                      key={actionIndex}
                      onClick={() => {
                        action.action();
                        onDismiss(notification.id);
                      }}
                      className={`px-2 sm:px-3 py-1 rounded text-xs font-medium transition-colors ${action.style === 'primary' ? 'bg-blue-500 text-white hover:bg-blue-600' :
                          action.style === 'danger' ? 'bg-red-500 text-white hover:bg-red-600' :
                            'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}

              {/* الوقت */}
              <div className="text-xs text-gray-400 mt-1 sm:mt-2">
                {new Intl.DateTimeFormat('ar-EG', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                }).format(notification.timestamp)}
              </div>
            </div>
          </div>
        </div>

        {/* الإشعارات المجمعة */}
        {notification.isGrouped && expandedGroups.has(notification.id) && notification.groupedNotifications && (
          <div className="bg-gray-100 border-r border-purple-300">
            {notification.groupedNotifications.slice(0, 5).map((subNotification, subIndex) => (
              <NotificationItem
                key={subNotification.id}
                notification={subNotification}
                index={subIndex}
                isNested={true}
              />
            ))}
            {notification.groupedNotifications.length > 5 && (
              <div className="text-center py-2 text-xs text-gray-500">
                +{notification.groupedNotifications.length - 5} إشعار آخر
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* مؤشر وضع عدم الإزعاج */}
      {isDNDActive && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9998] bg-purple-600 text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-lg">
          <span>🌙</span>
          <span>وضع عدم الإزعاج</span>
        </div>
      )}

      {/* إشعارات الشاشة الكاملة (الحرجة) */}
      {groupedNotifications.fullscreen.length > 0 && stats.critical >= 3 && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] animate-fade-in p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 max-w-lg mx-4 text-center shadow-2xl animate-bounce-in">
            <div className="text-5xl sm:text-6xl mb-4 animate-bounce">🚨</div>
            <h2 className="text-xl sm:text-2xl font-bold text-red-600 mb-4">
              تنبيه عاجل!
            </h2>
            <p className="text-base sm:text-lg text-gray-700 mb-6">
              يوجد <span className="font-bold text-red-600">{stats.critical}</span> إشعار حرج يحتاج مراجعة فورية
            </p>
            <div className="space-y-2 mb-6">
              {stats.newOrders > 0 && (
                <p className="text-sm text-gray-600">
                  📦 {stats.newOrders} طلب جديد
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => onDismissType('new_order')}
                className="bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-3 rounded-xl font-bold hover:from-red-600 hover:to-red-700 transition-all duration-200 shadow-lg"
              >
                مراجعة الآن
              </button>
              <button
                onClick={onDismissAll}
                className="bg-gray-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-600 transition-all duration-200"
              >
                تجاهل الكل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* شريط التنبيه للإشعارات المهمة */}
      {groupedNotifications.banner.length > 0 && !isMobile && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-r from-orange-500 to-red-500 text-white px-4 py-3 shadow-lg">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="animate-pulse">⚠️</div>
              <div>
                <span className="font-bold">تنبيه مهم:</span>
                <span className="mr-2">
                  {stats.high > 0 && `${stats.high} إشعار مهم`}
                  {stats.newOrders > 0 && ` • ${stats.newOrders} طلب جديد`}
                </span>
              </div>
            </div>
            <button
              onClick={() => onDismissType('high')}
              className="text-white hover:text-gray-200 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* لوحة الإشعارات الرئيسية */}
      {groupedNotifications.toast.length > 0 && (
        <div className={`fixed z-50 ${isMobile
            ? 'inset-x-0 bottom-0 px-0'
            : 'top-4 left-4 max-w-md'
          }`}>
          <div className={`bg-white shadow-2xl overflow-hidden transition-all duration-300 ${isMobile
              ? `rounded-t-2xl ${isMinimized ? 'h-14' : 'max-h-[70vh]'}`
              : `rounded-2xl border border-gray-200 ${isMinimized ? 'h-16' : 'max-h-[80vh]'}`
            }`}>

            {/* رأس اللوحة */}
            <div
              className="bg-gradient-to-r from-indigo-600 to-purple-600 px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between cursor-pointer"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="relative">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM12 7V3H8l4-4 4 4h-4zm0 0v4" />
                  </svg>
                  {stats.total > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center animate-bounce text-[10px] sm:text-xs">
                      {stats.total > 9 ? '9+' : stats.total}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-white font-bold text-xs sm:text-sm">
                    الإشعارات ({stats.total})
                  </h3>
                  {stats.critical > 0 && (
                    <p className="text-red-200 text-xs">
                      {stats.critical} حرج
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 sm:gap-2">
                {stats.total > 1 && !isMinimized && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismissAll();
                    }}
                    className="text-white hover:text-gray-200 text-xs bg-white bg-opacity-20 px-2 py-1 rounded transition-colors"
                    title="إغلاق الكل"
                  >
                    مسح
                  </button>
                )}
                <span className="text-white text-lg">
                  {isMinimized ? '🔼' : '🔽'}
                </span>
              </div>
            </div>

            {/* محتوى الإشعارات */}
            {!isMinimized && (
              <div className="max-h-80 sm:max-h-96 overflow-y-auto">
                {groupedNotifications.toast.map((notification, index) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    index={index}
                  />
                ))}
              </div>
            )}

            {/* تلميح السحب للموبايل */}
            {isMobile && !isMinimized && (
              <div className="text-center text-xs text-gray-400 py-2 bg-gray-50">
                ← اسحب لليسار للحذف
              </div>
            )}
          </div>
        </div>
      )}

      {/* إشعارات النافذة المنبثقة */}
      {groupedNotifications.modal.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9998] p-4">
          <div className="bg-white rounded-2xl p-4 sm:p-6 max-w-md mx-4 shadow-2xl w-full">
            {groupedNotifications.modal.slice(0, 1).map(notification => (
              <div key={notification.id}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-2xl sm:text-3xl">{getNotificationIcon(notification)}</div>
                  <div>
                    <h3 className="font-bold text-base sm:text-lg text-gray-800">
                      {notification.title}
                    </h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${getPriorityColor(notification.priority)} text-white`}>
                      {notification.priority === 'critical' ? 'حرج' :
                        notification.priority === 'high' ? 'مهم' :
                          notification.priority === 'normal' ? 'عادي' : 'منخفض'}
                    </span>
                  </div>
                </div>

                <p className="text-gray-600 mb-6 text-sm sm:text-base">
                  {notification.message}
                </p>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:justify-end">
                  {notification.actions?.map((action, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        action.action();
                        onDismiss(notification.id);
                      }}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors w-full sm:w-auto ${action.style === 'primary' ? 'bg-blue-500 text-white hover:bg-blue-600' :
                          action.style === 'danger' ? 'bg-red-500 text-white hover:bg-red-600' :
                            'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                      {action.label}
                    </button>
                  )) || (
                      <button
                        onClick={() => onDismiss(notification.id)}
                        className="bg-blue-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-600 transition-colors w-full sm:w-auto"
                      >
                        حسناً
                      </button>
                    )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default SmartNotificationSystem;
