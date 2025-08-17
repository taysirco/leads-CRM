import React, { useState } from 'react';
import { NotificationSettings, NotificationPriority, NotificationDisplayMode } from '../hooks/useSmartNotifications';

interface SmartNotificationSettingsProps {
  settings: NotificationSettings;
  onSettingsChange: (settings: Partial<NotificationSettings>) => void;
  isOpen: boolean;
  onClose: () => void;
}

const SmartNotificationSettings: React.FC<SmartNotificationSettingsProps> = ({
  settings,
  onSettingsChange,
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'priority' | 'display'>('general');

  if (!isOpen) return null;

  const handleGeneralSettingChange = (key: keyof NotificationSettings, value: any) => {
    onSettingsChange({ [key]: value });
  };

  const handlePrioritySettingChange = (
    priority: NotificationPriority, 
    key: string, 
    value: any
  ) => {
    const newPrioritySettings = {
      ...settings.prioritySettings,
      [priority]: {
        ...settings.prioritySettings[priority],
        [key]: value
      }
    };
    onSettingsChange({ prioritySettings: newPrioritySettings });
  };

  const handleDisplayModeChange = (
    priority: NotificationPriority,
    mode: NotificationDisplayMode,
    enabled: boolean
  ) => {
    const currentModes = settings.prioritySettings[priority].displayModes;
    const newModes = enabled 
      ? [...currentModes, mode]
      : currentModes.filter(m => m !== mode);
    
    handlePrioritySettingChange(priority, 'displayModes', newModes);
  };

  const resetToDefaults = () => {
    if (confirm('هل أنت متأكد من إعادة تعيين جميع الإعدادات إلى الافتراضية؟')) {
      onSettingsChange({
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
            duration: 0,
            sound: true
          }
        }
      });
    }
  };

  const testNotification = async () => {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      
      if (Notification.permission === 'granted') {
        new Notification('اختبار الإشعارات', {
          body: 'هذا إشعار تجريبي للتأكد من عمل النظام',
          icon: '/favicon.ico'
        });
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        
        {/* رأس النافذة */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-white text-xl font-bold">⚙️ إعدادات الإشعارات الذكية</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl transition-colors"
          >
            ✕
          </button>
        </div>

        {/* التبويبات */}
        <div className="border-b border-gray-200">
          <nav className="flex">
            {[
              { id: 'general', label: 'عام', icon: '⚙️' },
              { id: 'priority', label: 'الأولويات', icon: '🔥' },
              { id: 'display', label: 'العرض', icon: '🎨' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-6 py-3 font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'text-indigo-600 border-indigo-600 bg-indigo-50'
                    : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* محتوى التبويبات */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          
          {/* التبويب العام */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* تمكين الإشعارات */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={settings.enabled}
                      onChange={(e) => handleGeneralSettingChange('enabled', e.target.checked)}
                      className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <div>
                      <span className="font-medium">تمكين الإشعارات</span>
                      <p className="text-sm text-gray-600">تشغيل أو إيقاف جميع الإشعارات</p>
                    </div>
                  </label>
                </div>

                {/* الأصوات */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={settings.soundEnabled}
                      onChange={(e) => handleGeneralSettingChange('soundEnabled', e.target.checked)}
                      className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <div>
                      <span className="font-medium">تمكين الأصوات</span>
                      <p className="text-sm text-gray-600">تشغيل الأصوات مع الإشعارات</p>
                    </div>
                  </label>
                </div>

                {/* إشعارات المتصفح */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={settings.browserNotifications}
                      onChange={(e) => handleGeneralSettingChange('browserNotifications', e.target.checked)}
                      className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <div>
                      <span className="font-medium">إشعارات المتصفح</span>
                      <p className="text-sm text-gray-600">إظهار إشعارات في نظام التشغيل</p>
                    </div>
                  </label>
                </div>

                {/* وميض العنوان */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={settings.titleFlashing}
                      onChange={(e) => handleGeneralSettingChange('titleFlashing', e.target.checked)}
                      className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <div>
                      <span className="font-medium">وميض العنوان</span>
                      <p className="text-sm text-gray-600">وميض عنوان الصفحة عند الإشعارات الجديدة</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* الإعدادات الرقمية */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* عدد الإشعارات المرئية */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="block">
                    <span className="font-medium">عدد الإشعارات المرئية</span>
                    <p className="text-sm text-gray-600 mb-2">الحد الأقصى للإشعارات المعروضة</p>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      value={settings.maxVisibleNotifications}
                      onChange={(e) => handleGeneralSettingChange('maxVisibleNotifications', parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="text-center text-sm text-gray-600 mt-1">
                      {settings.maxVisibleNotifications} إشعار
                    </div>
                  </label>
                </div>

                {/* مدة الإشعار الافتراضية */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="block">
                    <span className="font-medium">مدة الإشعار الافتراضية</span>
                    <p className="text-sm text-gray-600 mb-2">بالثواني</p>
                    <input
                      type="range"
                      min="1"
                      max="30"
                      value={settings.defaultDuration / 1000}
                      onChange={(e) => handleGeneralSettingChange('defaultDuration', parseInt(e.target.value) * 1000)}
                      className="w-full"
                    />
                    <div className="text-center text-sm text-gray-600 mt-1">
                      {settings.defaultDuration / 1000} ثانية
                    </div>
                  </label>
                </div>
              </div>

              {/* أزرار الاختبار */}
              <div className="flex gap-3">
                <button
                  onClick={testNotification}
                  className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
                >
                  🧪 اختبار الإشعارات
                </button>
                <button
                  onClick={resetToDefaults}
                  className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  🔄 إعادة تعيين
                </button>
              </div>
            </div>
          )}

          {/* تبويب الأولويات */}
          {activeTab === 'priority' && (
            <div className="space-y-6">
              {Object.entries(settings.prioritySettings).map(([priority, config]) => (
                <div key={priority} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-white text-sm ${
                        priority === 'critical' ? 'bg-red-500' :
                        priority === 'high' ? 'bg-orange-500' :
                        priority === 'normal' ? 'bg-blue-500' : 'bg-gray-500'
                      }`}>
                        {priority === 'critical' ? '🚨 حرج' :
                         priority === 'high' ? '🔥 مهم' :
                         priority === 'normal' ? '📝 عادي' : '📋 منخفض'}
                      </span>
                    </h3>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={config.enabled}
                        onChange={(e) => handlePrioritySettingChange(priority as NotificationPriority, 'enabled', e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                      <span className="text-sm">مفعل</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* مدة الإشعار */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        مدة الإشعار (ثانية)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="60"
                        value={(config.duration || 0) / 1000}
                        onChange={(e) => handlePrioritySettingChange(
                          priority as NotificationPriority, 
                          'duration', 
                          parseInt(e.target.value) * 1000
                        )}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="0 = دائم"
                      />
                      <p className="text-xs text-gray-500 mt-1">0 = دائم حتى الإغلاق اليدوي</p>
                    </div>

                    {/* تمكين الصوت */}
                    <div className="flex items-center">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={config.sound}
                          onChange={(e) => handlePrioritySettingChange(priority as NotificationPriority, 'sound', e.target.checked)}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <span className="text-sm">تمكين الصوت</span>
                      </label>
                    </div>
                  </div>

                  {/* أنماط العرض */}
                  <div className="mt-4">
                    <label className="block text-sm font-medium mb-2">أنماط العرض</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {[
                        { mode: 'toast', label: '🍞 منبثق', desc: 'إشعار صغير في الزاوية' },
                        { mode: 'banner', label: '📢 شريط', desc: 'شريط في أعلى الصفحة' },
                        { mode: 'modal', label: '🪟 نافذة', desc: 'نافذة منبثقة' },
                        { mode: 'browser', label: '💻 متصفح', desc: 'إشعار النظام' },
                        { mode: 'title', label: '📝 العنوان', desc: 'وميض العنوان' },
                        { mode: 'sound', label: '🔊 صوت', desc: 'صوت فقط' }
                      ].map(({ mode, label, desc }) => (
                        <label key={mode} className="flex items-start gap-2 p-2 bg-gray-50 rounded text-sm">
                          <input
                            type="checkbox"
                            checked={config.displayModes.includes(mode as NotificationDisplayMode)}
                            onChange={(e) => handleDisplayModeChange(
                              priority as NotificationPriority,
                              mode as NotificationDisplayMode,
                              e.target.checked
                            )}
                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 mt-0.5"
                          />
                          <div>
                            <div className="font-medium">{label}</div>
                            <div className="text-xs text-gray-500">{desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* تبويب العرض */}
          {activeTab === 'display' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-bold text-blue-800 mb-2">🎨 معاينة الأنماط</h3>
                <p className="text-blue-700 text-sm">
                  هنا يمكنك رؤية كيف ستبدو الإشعارات بأنماط العرض المختلفة
                </p>
              </div>

              {/* معاينات */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* معاينة Toast */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-bold mb-2">🍞 الإشعار المنبثق (Toast)</h4>
                  <div className="bg-white border-l-4 border-blue-500 rounded shadow p-3 text-sm">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">🛒</span>
                      <div>
                        <div className="font-bold">طلب جديد</div>
                        <div className="text-gray-600">طلب جديد من أحمد محمد - جرس الباب</div>
                        <div className="text-xs text-gray-400 mt-1">منذ دقيقة</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* معاينة Banner */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-bold mb-2">📢 الشريط (Banner)</h4>
                  <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white px-3 py-2 rounded text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>⚠️</span>
                        <span>تنبيه مهم: 3 طلبات جديدة تحتاج مراجعة</span>
                      </div>
                      <button className="text-white">✕</button>
                    </div>
                  </div>
                </div>

                {/* معاينة Modal */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-bold mb-2">🪟 النافذة المنبثقة (Modal)</h4>
                  <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-lg text-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🚨</span>
                      <div>
                        <div className="font-bold">تنبيه حرج</div>
                        <span className="bg-red-500 text-white px-2 py-1 rounded text-xs">حرج</span>
                      </div>
                    </div>
                    <p className="text-gray-600 mb-3">المخزون نفد تماماً من 3 منتجات</p>
                    <div className="flex gap-2">
                      <button className="bg-red-500 text-white px-3 py-1 rounded text-xs">عرض المخزون</button>
                      <button className="bg-gray-300 text-gray-700 px-3 py-1 rounded text-xs">إغلاق</button>
                    </div>
                  </div>
                </div>

                {/* معاينة Browser */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-bold mb-2">💻 إشعار المتصفح</h4>
                  <div className="bg-gray-100 border border-gray-300 rounded p-3 text-sm">
                    <div className="flex items-start gap-2">
                      <img src="/favicon.ico" alt="icon" className="w-6 h-6" />
                      <div>
                        <div className="font-bold">Leads CRM</div>
                        <div className="text-gray-600">طلب جديد من أحمد محمد</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* إعدادات إضافية */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-bold mb-3">⚙️ إعدادات إضافية</h4>
                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
                    <span className="text-sm">إخفاء الإشعارات تلقائياً عند تبديل التبويبات</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
                    <span className="text-sm">تجميع الإشعارات المتشابهة</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
                    <span className="text-sm">إظهار معاينة المحتوى في الإشعارات</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* أسفل النافذة */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-between items-center bg-gray-50">
          <div className="text-sm text-gray-600">
            💡 تُحفظ الإعدادات تلقائياً
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmartNotificationSettings;
