import React, { useState, useEffect } from 'react';

interface NotificationPermissionProps {
  onPermissionChange?: (permission: NotificationPermission) => void;
}

const NotificationPermission: React.FC<NotificationPermissionProps> = ({ 
  onPermissionChange 
}) => {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if notifications are supported
    if ('Notification' in window) {
      setPermission(Notification.permission);
      
      // Show prompt if permission is default (not asked yet)
      if (Notification.permission === 'default') {
        // Show after a short delay to not be intrusive
        setTimeout(() => setShowPrompt(true), 3000);
      }
    }
  }, []);

  const requestPermission = async () => {
    if ('Notification' in window) {
      try {
        const result = await Notification.requestPermission();
        setPermission(result);
        setShowPrompt(false);
        onPermissionChange?.(result);
        
        // Show test notification if granted
        if (result === 'granted') {
          new Notification('🎉 تم تفعيل الإشعارات!', {
            body: 'ستحصل الآن على إشعارات فورية عند وصول طلبات جديدة',
            icon: '/favicon.ico',
            tag: 'permission-granted'
          });
        }
      } catch (error) {
        console.error('Error requesting notification permission:', error);
      }
    }
  };

  const dismissPrompt = () => {
    setShowPrompt(false);
  };

  // Don't show anything if notifications aren't supported or permission is already granted
  if (!('Notification' in window) || permission === 'granted' || !showPrompt) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-slide-in-right">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5z" />
              </svg>
            </div>
            <h3 className="text-white font-bold text-sm">تفعيل الإشعارات</h3>
          </div>
        </div>
        
        <div className="p-4">
          <p className="text-gray-700 text-sm mb-4">
            احصل على إشعارات فورية عند وصول طلبات جديدة لضمان عدم تفويت أي عميل
          </p>
          
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              إشعارات فورية
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              تنبيه صوتي
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={requestPermission}
              className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-sm hover:shadow-md"
            >
              تفعيل الإشعارات
            </button>
            <button
              onClick={dismissPrompt}
              className="px-3 py-2 text-gray-600 border border-gray-300 rounded-xl text-sm hover:bg-gray-50 transition-all duration-200"
            >
              لاحقاً
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationPermission; 