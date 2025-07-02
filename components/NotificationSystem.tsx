import React, { useState, useEffect, useRef } from 'react';

interface Notification {
  id: string;
  type: 'new_order' | 'order_update' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  duration?: number; // in milliseconds
  persistent?: boolean; // stays until manually dismissed
  data?: any; // additional data like order info
}

interface NotificationSystemProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  soundEnabled?: boolean;
  initialUserInteraction: boolean;
}

const NotificationSystem: React.FC<NotificationSystemProps> = ({
  notifications,
  onDismiss,
  onDismissAll,
  soundEnabled = true,
  initialUserInteraction
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [lastNotificationTime, setLastNotificationTime] = useState<Date | null>(null);

  // Sound effect for new notifications (using Web Audio API for custom sound)
  const playNotificationSound = () => {
    if (!soundEnabled || !initialUserInteraction) return;
    
    try {
      // Create a custom notification sound using Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Configure sound - pleasant notification tone
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.log('Audio notification not supported');
    }
  };

  // Auto-dismiss non-persistent notifications
  useEffect(() => {
    notifications.forEach(notification => {
      if (!notification.persistent && notification.duration) {
        const timer = setTimeout(() => {
          onDismiss(notification.id);
        }, notification.duration);
        
        return () => clearTimeout(timer);
      }
    });
  }, [notifications, onDismiss]);

  // Play sound for new notifications
  useEffect(() => {
    const newOrderNotifications = notifications.filter(n => 
      n.type === 'new_order' && 
      (!lastNotificationTime || n.timestamp > lastNotificationTime)
    );
    
    if (newOrderNotifications.length > 0) {
      playNotificationSound();
      setLastNotificationTime(new Date());
    }
  }, [notifications, lastNotificationTime, soundEnabled, initialUserInteraction]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'new_order':
        return (
          <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center animate-pulse">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
        );
      case 'order_update':
        return (
          <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
        );
      case 'success':
        return (
          <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-r from-green-500 to-green-600 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'warning':
        return (
          <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        );
    }
  };

  const getNotificationBgColor = (type: string) => {
    switch (type) {
      case 'new_order':
        return 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200';
      case 'order_update':
        return 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200';
      case 'success':
        return 'bg-gradient-to-r from-green-50 to-green-50 border-green-200';
      case 'warning':
        return 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200';
      default:
        return 'bg-gradient-to-r from-red-50 to-red-50 border-red-200';
    }
  };

  const newOrdersCount = notifications.filter(n => n.type === 'new_order').length;

  if (notifications.length === 0) return null;

  return (
    <>
      {/* Desktop Notifications Panel */}
      <div className="fixed top-4 left-4 z-50 max-w-md">
        <div className={`bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden transition-all duration-300 ${
          isMinimized ? 'h-16' : 'max-h-96'
        }`}>
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM12 7V3H8l4-4 4 4h-4zm0 0v4m0 0h4.5m-4.5 0h-4.5" />
                </svg>
                {newOrdersCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-bounce">
                    {newOrdersCount}
                  </span>
                )}
              </div>
              <h3 className="text-white font-bold text-sm">
                الإشعارات {notifications.length > 0 && `(${notifications.length})`}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {notifications.length > 1 && (
                <button
                  onClick={onDismissAll}
                  className="text-white hover:text-gray-200 text-xs px-2 py-1 rounded bg-white bg-opacity-20 hover:bg-opacity-30 transition-all"
                >
                  مسح الكل
                </button>
              )}
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="text-white hover:text-gray-200 transition-colors p-1 rounded hover:bg-white hover:bg-opacity-20"
              >
                <svg className={`w-4 h-4 transition-transform ${isMinimized ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Notifications List */}
          {!isMinimized && (
            <div className="max-h-80 overflow-y-auto">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 border-b border-gray-100 last:border-b-0 ${getNotificationBgColor(notification.type)} hover:bg-opacity-80 transition-all duration-200`}
                >
                  <div className="flex items-start gap-3">
                    {getNotificationIcon(notification.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-bold text-gray-900 text-sm">{notification.title}</h4>
                        <button
                          onClick={() => onDismiss(notification.id)}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <p className="text-gray-700 text-sm mb-2">{notification.message}</p>
                      {notification.data && (
                        <div className="bg-white bg-opacity-60 rounded-lg p-2 text-xs">
                          <div className="grid grid-cols-2 gap-1">
                            <span>العميل: <strong>{notification.data.customerName}</strong></span>
                            <span>الهاتف: <strong>{notification.data.phone}</strong></span>
                            <span>المنتج: <strong>{notification.data.product}</strong></span>
                            <span>السعر: <strong>{notification.data.price}</strong></span>
                          </div>
                        </div>
                      )}
                      <span className="text-xs text-gray-500">
                        {notification.timestamp.toLocaleTimeString('ar-EG')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Bottom Notification */}
      {newOrdersCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-50 md:hidden">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white p-4 rounded-2xl shadow-2xl animate-bounce">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center animate-pulse">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-lg">طلب جديد!</h4>
                <p className="text-sm opacity-90">يوجد {newOrdersCount} طلب جديد بحاجة للمراجعة</p>
              </div>
              <button
                onClick={() => setIsMinimized(false)}
                className="bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full p-2 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button for New Orders */}
      {newOrdersCount > 0 && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={() => setIsMinimized(false)}
            className="relative bg-gradient-to-r from-red-500 to-pink-600 text-white w-16 h-16 rounded-full shadow-2xl hover:shadow-3xl transition-all duration-300 hover:scale-110 animate-pulse"
          >
            <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 7V3" />
            </svg>
            <span className="absolute -top-2 -right-2 bg-yellow-400 text-red-800 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-bounce">
              {newOrdersCount}
            </span>
            <div className="absolute inset-0 rounded-full bg-red-400 opacity-75 animate-ping"></div>
          </button>
        </div>
      )}
    </>
  );
};

export default NotificationSystem; 