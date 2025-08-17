import React, { useState, useEffect, useMemo } from 'react';
import { SmartNotification, NotificationPriority, NotificationDisplayMode } from '../hooks/useSmartNotifications';
import { getStatusConfig, getStatusColor, getStatusIcon } from '../utils/statusColors';

interface SmartNotificationSystemProps {
  notifications: SmartNotification[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  onDismissType: (type: string) => void;
  hasUserInteracted: boolean;
}

const SmartNotificationSystem: React.FC<SmartNotificationSystemProps> = ({
  notifications,
  onDismiss,
  onDismissAll,
  onDismissType,
  hasUserInteracted
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [expandedNotifications, setExpandedNotifications] = useState<Set<string>>(new Set());

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

  // الحصول على أيقونة حسب النوع والبيانات
  const getNotificationIcon = (notification: SmartNotification) => {
    // إذا كان الإشعار يحتوي على معلومات الطلب، استخدم أيقونة الحالة
    if (notification.data?.status) {
      return getStatusIcon(notification.data.status);
    }
    
    // أيقونات حسب نوع الإشعار
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

  if (notifications.length === 0) return null;

  return (
    <>
      {/* إشعارات الشاشة الكاملة (الحرجة) */}
      {groupedNotifications.fullscreen.length > 0 && stats.critical >= 3 && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] animate-fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-lg mx-4 text-center shadow-2xl animate-bounce-in">
            <div className="text-6xl mb-4 animate-bounce">🚨</div>
            <h2 className="text-2xl font-bold text-red-600 mb-4">
              تنبيه عاجل!
            </h2>
            <p className="text-lg text-gray-700 mb-6">
              يوجد <span className="font-bold text-red-600">{stats.critical}</span> إشعار حرج يحتاج مراجعة فورية
            </p>
            <div className="space-y-2 mb-6">
              {stats.newOrders > 0 && (
                <p className="text-sm text-gray-600">
                  📦 {stats.newOrders} طلب جديد
                </p>
              )}
            </div>
            <div className="flex gap-3 justify-center">
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
      {groupedNotifications.banner.length > 0 && (
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

      {/* لوحة الإشعارات الرئيسية (Toast) */}
      {groupedNotifications.toast.length > 0 && (
        <div className="fixed top-4 left-4 z-50 max-w-md">
          <div className={`bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden transition-all duration-300 ${
            isMinimized ? 'h-16' : 'max-h-[80vh]'
          }`}>
            
            {/* رأس اللوحة */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM12 7V3H8l4-4 4 4h-4zm0 0v4" />
                  </svg>
                  {stats.total > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-bounce">
                      {stats.total}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm">
                    الإشعارات ({stats.total})
                  </h3>
                  {stats.critical > 0 && (
                    <p className="text-red-200 text-xs">
                      {stats.critical} حرج
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {stats.total > 1 && (
                  <button
                    onClick={onDismissAll}
                    className="text-white hover:text-gray-200 text-xs bg-white bg-opacity-20 px-2 py-1 rounded transition-colors"
                    title="إغلاق الكل"
                  >
                    مسح الكل
                  </button>
                )}
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="text-white hover:text-gray-200 transition-colors"
                >
                  {isMinimized ? '🔼' : '🔽'}
                </button>
              </div>
            </div>

            {/* محتوى الإشعارات */}
            {!isMinimized && (
              <div className="max-h-96 overflow-y-auto">
                {groupedNotifications.toast.map((notification, index) => {
                  const isExpanded = expandedNotifications.has(notification.id);
                  const isLongMessage = notification.message.length > 100;
                  
                  return (
                    <div
                      key={notification.id}
                      className={`border-l-4 ${getPriorityBorderColor(notification.priority)} p-4 ${
                        index < groupedNotifications.toast.length - 1 ? 'border-b border-gray-100' : ''
                      } hover:bg-gray-50 transition-colors`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-2xl flex-shrink-0">
                          {getNotificationIcon(notification)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          {/* العنوان */}
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-bold text-gray-800 text-sm truncate">
                              {notification.title}
                            </h4>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${getPriorityColor(notification.priority)} text-white`}>
                                {notification.priority === 'critical' ? 'حرج' :
                                 notification.priority === 'high' ? 'مهم' :
                                 notification.priority === 'normal' ? 'عادي' : 'منخفض'}
                              </span>
                              <button
                                onClick={() => onDismiss(notification.id)}
                                className="text-gray-400 hover:text-red-500 text-xs transition-colors"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                          
                          {/* الرسالة */}
                          <div className="text-gray-600 text-sm">
                            {isLongMessage && !isExpanded ? (
                              <>
                                {notification.message.substring(0, 100)}...
                                <button
                                  onClick={() => toggleExpanded(notification.id)}
                                  className="text-blue-500 hover:text-blue-700 mr-1 font-medium"
                                >
                                  اقرأ المزيد
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
                                    أظهر أقل
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                          
                          {/* الإجراءات */}
                          {notification.actions && notification.actions.length > 0 && (
                            <div className="flex gap-2 mt-3">
                              {notification.actions.map((action, actionIndex) => (
                                <button
                                  key={actionIndex}
                                  onClick={() => {
                                    action.action();
                                    onDismiss(notification.id);
                                  }}
                                  className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                                    action.style === 'primary' ? 'bg-blue-500 text-white hover:bg-blue-600' :
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
                          <div className="text-xs text-gray-400 mt-2">
                            {new Intl.DateTimeFormat('ar-EG', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            }).format(notification.timestamp)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* إشعارات النافذة المنبثقة */}
      {groupedNotifications.modal.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9998]">
          <div className="bg-white rounded-2xl p-6 max-w-md mx-4 shadow-2xl">
            {groupedNotifications.modal.slice(0, 1).map(notification => (
              <div key={notification.id}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-3xl">{getNotificationIcon(notification)}</div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-800">
                      {notification.title}
                    </h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${getPriorityColor(notification.priority)} text-white`}>
                      {notification.priority === 'critical' ? 'حرج' :
                       notification.priority === 'high' ? 'مهم' :
                       notification.priority === 'normal' ? 'عادي' : 'منخفض'}
                    </span>
                  </div>
                </div>
                
                <p className="text-gray-600 mb-6">
                  {notification.message}
                </p>
                
                <div className="flex gap-3 justify-end">
                  {notification.actions?.map((action, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        action.action();
                        onDismiss(notification.id);
                      }}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        action.style === 'primary' ? 'bg-blue-500 text-white hover:bg-blue-600' :
                        action.style === 'danger' ? 'bg-red-500 text-white hover:bg-red-600' :
                        'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {action.label}
                    </button>
                  )) || (
                    <button
                      onClick={() => onDismiss(notification.id)}
                      className="bg-blue-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-600 transition-colors"
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
