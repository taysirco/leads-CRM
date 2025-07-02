import React, { useState, useEffect } from 'react';

interface NotificationSettings {
  soundEnabled: boolean;
  browserNotifications: boolean;
  screenFlash: boolean;
  vibration: boolean;
  urgentAlerts: boolean;
  autoRefresh: boolean;
  refreshInterval: number;
}

interface NotificationSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange: (settings: NotificationSettings) => void;
}

const NotificationSettingsComponent: React.FC<NotificationSettingsProps> = ({
  isOpen,
  onClose,
  onSettingsChange
}) => {
  const [settings, setSettings] = useState<NotificationSettings>({
    soundEnabled: true,
    browserNotifications: true,
    screenFlash: true,
    vibration: true,
    urgentAlerts: true,
    autoRefresh: true,
    refreshInterval: 30
  });

  // Load settings from localStorage on component mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('notificationSettings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('notificationSettings', JSON.stringify(settings));
    onSettingsChange(settings);
  }, [settings, onSettingsChange]);

  const updateSetting = (key: keyof NotificationSettings, value: boolean | number) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const testNotification = () => {
    if (settings.soundEnabled) {
      // Play test sound
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      } catch (error) {
        console.log('Audio test failed');
      }
    }

    if (settings.browserNotifications && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('🧪 اختبار الإشعارات', {
        body: 'تم تفعيل الإشعارات بنجاح!',
        icon: '/favicon.ico',
        tag: 'test-notification'
      });
    }

    if (settings.vibration && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold flex items-center gap-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              إعدادات الإشعارات
            </h3>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors p-2 hover:bg-white hover:bg-opacity-20 rounded-full"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Sound Settings */}
          <div className="space-y-4">
            <h4 className="font-bold text-gray-900 flex items-center gap-2">
              <span>🔊</span>
              الأصوات والتنبيهات
            </h4>
            
            <div className="space-y-3">
              <label className="flex items-center justify-between">
                <span className="text-gray-700">تفعيل الأصوات</span>
                <input
                  type="checkbox"
                  checked={settings.soundEnabled}
                  onChange={(e) => updateSetting('soundEnabled', e.target.checked)}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
              </label>
              
              <label className="flex items-center justify-between">
                <span className="text-gray-700">إشعارات المتصفح</span>
                <input
                  type="checkbox"
                  checked={settings.browserNotifications}
                  onChange={(e) => updateSetting('browserNotifications', e.target.checked)}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
              </label>
              
              <label className="flex items-center justify-between">
                <span className="text-gray-700">وميض الشاشة</span>
                <input
                  type="checkbox"
                  checked={settings.screenFlash}
                  onChange={(e) => updateSetting('screenFlash', e.target.checked)}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
              </label>
              
              <label className="flex items-center justify-between">
                <span className="text-gray-700">الاهتزاز (موبايل)</span>
                <input
                  type="checkbox"
                  checked={settings.vibration}
                  onChange={(e) => updateSetting('vibration', e.target.checked)}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
              </label>
              
              <label className="flex items-center justify-between">
                <span className="text-gray-700">التنبيهات العاجلة</span>
                <input
                  type="checkbox"
                  checked={settings.urgentAlerts}
                  onChange={(e) => updateSetting('urgentAlerts', e.target.checked)}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                />
              </label>
            </div>
          </div>

          {/* Auto Refresh Settings */}
          <div className="space-y-4 border-t border-gray-200 pt-4">
            <h4 className="font-bold text-gray-900 flex items-center gap-2">
              <span>🔄</span>
              التحديث التلقائي
            </h4>
            
            <label className="flex items-center justify-between">
              <span className="text-gray-700">تفعيل التحديث التلقائي</span>
              <input
                type="checkbox"
                checked={settings.autoRefresh}
                onChange={(e) => updateSetting('autoRefresh', e.target.checked)}
                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
              />
            </label>
            
            {settings.autoRefresh && (
              <div className="space-y-2">
                <label className="text-gray-700 text-sm">
                  فترة التحديث (بالثواني): {settings.refreshInterval}
                </label>
                <input
                  type="range"
                  min="10"
                  max="120"
                  step="10"
                  value={settings.refreshInterval}
                  onChange={(e) => updateSetting('refreshInterval', parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>10 ثانية</span>
                  <span>دقيقتان</span>
                </div>
              </div>
            )}
          </div>

          {/* Test Button */}
          <div className="border-t border-gray-200 pt-4">
            <button
              onClick={testNotification}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 px-4 rounded-xl font-medium hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-lg"
            >
              🧪 اختبار الإشعارات
            </button>
          </div>

          {/* Info Text */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-blue-800 text-sm">
              <strong>💡 ملاحظة:</strong> يتم حفظ إعداداتك تلقائياً وستبقى مفعلة في المرات القادمة.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationSettingsComponent; 