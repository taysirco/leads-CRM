import React, { useState } from 'react';
import { NotificationSettings, NotificationPriority, NotificationDisplayMode, DoNotDisturbSettings } from '../hooks/useSmartNotifications';
import { playNotificationSound, testAllSounds } from '../lib/notificationSounds';

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
  const [activeTab, setActiveTab] = useState<'general' | 'sounds' | 'dnd' | 'priorities'>('general');
  const [isTesting, setIsTesting] = useState(false);

  // تحديث إعداد عام
  const handleGeneralSettingChange = (key: keyof NotificationSettings, value: any) => {
    onSettingsChange({ [key]: value });
  };

  // تحديث إعدادات DND
  const handleDNDChange = (updates: Partial<DoNotDisturbSettings>) => {
    onSettingsChange({
      doNotDisturb: { ...settings.doNotDisturb, ...updates }
    });
  };

  // تحديث جدولة DND
  const handleDNDScheduleChange = (key: 'enabled' | 'startTime' | 'endTime', value: any) => {
    onSettingsChange({
      doNotDisturb: {
        ...settings.doNotDisturb,
        schedule: { ...settings.doNotDisturb.schedule, [key]: value }
      }
    });
  };

  // تحديث إعدادات الأولوية
  const handlePrioritySettingChange = (
    priority: NotificationPriority,
    key: string,
    value: any
  ) => {
    onSettingsChange({
      prioritySettings: {
        ...settings.prioritySettings,
        [priority]: {
          ...settings.prioritySettings[priority],
          [key]: value
        }
      }
    });
  };

  // تحديث أنماط العرض للأولوية
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

  // إعادة الإعدادات الافتراضية
  const resetToDefaults = () => {
    if (confirm('هل أنت متأكد من إعادة الإعدادات للوضع الافتراضي؟')) {
      onSettingsChange({
        enabled: true,
        soundEnabled: true,
        soundVolume: 0.5,
        browserNotifications: true,
        titleFlashing: true,
        maxVisibleNotifications: 5,
        defaultDuration: 5000,
        groupSimilarNotifications: true,
        groupingWindow: 5000,
        doNotDisturb: {
          enabled: false,
          schedule: { enabled: false, startTime: '22:00', endTime: '08:00' },
          allowCritical: true,
          silentMode: false
        },
        prioritySettings: {
          low: { enabled: true, displayModes: ['toast'], duration: 3000, sound: false },
          normal: { enabled: true, displayModes: ['toast'], duration: 5000, sound: true },
          high: { enabled: true, displayModes: ['toast', 'banner', 'browser'], duration: 8000, sound: true },
          critical: { enabled: true, displayModes: ['toast', 'banner', 'modal', 'browser', 'title'], duration: 0, sound: true }
        }
      });
    }
  };

  // اختبار الأصوات
  const handleTestSounds = async () => {
    setIsTesting(true);
    await testAllSounds();
    setIsTesting(false);
  };

  // اختبار صوت معين
  const testSingleSound = (type: 'newOrder' | 'success' | 'warning' | 'error' | 'critical' | 'message') => {
    playNotificationSound(type);
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'general', label: 'عام', icon: '⚙️' },
    { id: 'sounds', label: 'الأصوات', icon: '🔊' },
    { id: 'dnd', label: 'عدم الإزعاج', icon: '🌙' },
    { id: 'priorities', label: 'الأولويات', icon: '📊' },
  ];

  const displayModes = [
    { id: 'toast', label: 'Toast', icon: '💬' },
    { id: 'banner', label: 'شريط', icon: '📢' },
    { id: 'modal', label: 'نافذة', icon: '🪟' },
    { id: 'browser', label: 'متصفح', icon: '🔔' },
    { id: 'title', label: 'عنوان', icon: '📑' },
    { id: 'sound', label: 'صوت', icon: '🔊' },
  ];

  const priorities: { id: NotificationPriority; label: string; color: string }[] = [
    { id: 'low', label: 'منخفض', color: 'gray' },
    { id: 'normal', label: 'عادي', color: 'blue' },
    { id: 'high', label: 'مهم', color: 'orange' },
    { id: 'critical', label: 'حرج', color: 'red' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-700 to-gray-900 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚙️</span>
            <h2 className="text-white font-bold text-lg">إعدادات الإشعارات</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-300 p-2 hover:bg-white hover:bg-opacity-10 rounded-full transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-4">
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-3 text-sm font-medium transition-colors relative ${activeTab === tab.id
                    ? 'text-indigo-600'
                    : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                <span className="flex items-center gap-2">
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </span>
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600"></div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Tab: General */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Master Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <h3 className="font-medium text-gray-900">تفعيل الإشعارات</h3>
                  <p className="text-sm text-gray-500">إيقاف جميع الإشعارات</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(e) => handleGeneralSettingChange('enabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Browser Notifications */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <h3 className="font-medium text-gray-900">إشعارات المتصفح</h3>
                  <p className="text-sm text-gray-500">عرض إشعارات في المتصفح</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.browserNotifications}
                    onChange={(e) => handleGeneralSettingChange('browserNotifications', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Title Flashing */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <h3 className="font-medium text-gray-900">وميض العنوان</h3>
                  <p className="text-sm text-gray-500">وميض عنوان الصفحة عند وجود إشعارات</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.titleFlashing}
                    onChange={(e) => handleGeneralSettingChange('titleFlashing', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Group Similar */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <h3 className="font-medium text-gray-900">تجميع الإشعارات</h3>
                  <p className="text-sm text-gray-500">تجميع الإشعارات المتشابهة معاً</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.groupSimilarNotifications}
                    onChange={(e) => handleGeneralSettingChange('groupSimilarNotifications', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Max Visible */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-900">الحد الأقصى للإشعارات</h3>
                  <span className="text-sm font-medium text-indigo-600">{settings.maxVisibleNotifications}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={settings.maxVisibleNotifications}
                  onChange={(e) => handleGeneralSettingChange('maxVisibleNotifications', parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
            </div>
          )}

          {/* Tab: Sounds */}
          {activeTab === 'sounds' && (
            <div className="space-y-6">
              {/* Sound Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <h3 className="font-medium text-gray-900">تفعيل الأصوات</h3>
                  <p className="text-sm text-gray-500">تشغيل الأصوات عند وصول الإشعارات</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.soundEnabled}
                    onChange={(e) => handleGeneralSettingChange('soundEnabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Volume Control */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-900">مستوى الصوت</h3>
                  <span className="text-sm font-medium text-indigo-600">{Math.round(settings.soundVolume * 100)}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg">🔈</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.soundVolume * 100}
                    onChange={(e) => handleGeneralSettingChange('soundVolume', parseInt(e.target.value) / 100)}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    disabled={!settings.soundEnabled}
                  />
                  <span className="text-lg">🔊</span>
                </div>
              </div>

              {/* Sound Tests */}
              <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-100">
                <h3 className="font-medium text-gray-900 mb-4">اختبار الأصوات</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => testSingleSound('newOrder')}
                    disabled={!settings.soundEnabled}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                  >
                    <span>💰</span>
                    <span className="text-sm">طلب جديد</span>
                  </button>
                  <button
                    onClick={() => testSingleSound('success')}
                    disabled={!settings.soundEnabled}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors disabled:opacity-50"
                  >
                    <span>✅</span>
                    <span className="text-sm">نجاح</span>
                  </button>
                  <button
                    onClick={() => testSingleSound('warning')}
                    disabled={!settings.soundEnabled}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 hover:border-yellow-300 hover:bg-yellow-50 transition-colors disabled:opacity-50"
                  >
                    <span>⚠️</span>
                    <span className="text-sm">تحذير</span>
                  </button>
                  <button
                    onClick={() => testSingleSound('error')}
                    disabled={!settings.soundEnabled}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 hover:border-red-300 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <span>❌</span>
                    <span className="text-sm">خطأ</span>
                  </button>
                  <button
                    onClick={() => testSingleSound('critical')}
                    disabled={!settings.soundEnabled}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 hover:border-red-400 hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    <span>🚨</span>
                    <span className="text-sm">حرج</span>
                  </button>
                  <button
                    onClick={() => testSingleSound('message')}
                    disabled={!settings.soundEnabled}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    <span>📩</span>
                    <span className="text-sm">رسالة</span>
                  </button>
                </div>

                <button
                  onClick={handleTestSounds}
                  disabled={!settings.soundEnabled || isTesting}
                  className="w-full mt-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isTesting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span>جاري الاختبار...</span>
                    </>
                  ) : (
                    <>
                      <span>🎵</span>
                      <span>اختبار جميع الأصوات</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Tab: Do Not Disturb */}
          {activeTab === 'dnd' && (
            <div className="space-y-6">
              {/* DND Toggle */}
              <div className="flex items-center justify-between p-4 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border border-purple-100">
                <div>
                  <h3 className="font-medium text-gray-900 flex items-center gap-2">
                    <span>🌙</span>
                    وضع عدم الإزعاج
                  </h3>
                  <p className="text-sm text-gray-500">إيقاف الإشعارات مؤقتاً</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.doNotDisturb.enabled}
                    onChange={(e) => handleDNDChange({ enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              {/* Schedule */}
              <div className={`p-4 bg-gray-50 rounded-xl ${!settings.doNotDisturb.enabled ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-medium text-gray-900">جدولة تلقائية</h3>
                    <p className="text-sm text-gray-500">تفعيل وضع عدم الإزعاج تلقائياً</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.doNotDisturb.schedule.enabled}
                      onChange={(e) => handleDNDScheduleChange('enabled', e.target.checked)}
                      disabled={!settings.doNotDisturb.enabled}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-300 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                {settings.doNotDisturb.schedule.enabled && (
                  <div className="flex items-center gap-4 mt-4">
                    <div className="flex-1">
                      <label className="block text-sm text-gray-600 mb-1">من الساعة</label>
                      <input
                        type="time"
                        value={settings.doNotDisturb.schedule.startTime}
                        onChange={(e) => handleDNDScheduleChange('startTime', e.target.value)}
                        disabled={!settings.doNotDisturb.enabled}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm text-gray-600 mb-1">إلى الساعة</label>
                      <input
                        type="time"
                        value={settings.doNotDisturb.schedule.endTime}
                        onChange={(e) => handleDNDScheduleChange('endTime', e.target.value)}
                        disabled={!settings.doNotDisturb.enabled}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Allow Critical */}
              <div className={`flex items-center justify-between p-4 bg-gray-50 rounded-xl ${!settings.doNotDisturb.enabled ? 'opacity-50' : ''}`}>
                <div>
                  <h3 className="font-medium text-gray-900">السماح للإشعارات الحرجة</h3>
                  <p className="text-sm text-gray-500">الإشعارات الحرجة تمر رغم وضع عدم الإزعاج</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.doNotDisturb.allowCritical}
                    onChange={(e) => handleDNDChange({ allowCritical: e.target.checked })}
                    disabled={!settings.doNotDisturb.enabled}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Silent Mode */}
              <div className={`flex items-center justify-between p-4 bg-gray-50 rounded-xl ${!settings.doNotDisturb.enabled ? 'opacity-50' : ''}`}>
                <div>
                  <h3 className="font-medium text-gray-900">الوضع الصامت</h3>
                  <p className="text-sm text-gray-500">الإشعارات تظهر بدون صوت</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.doNotDisturb.silentMode}
                    onChange={(e) => handleDNDChange({ silentMode: e.target.checked })}
                    disabled={!settings.doNotDisturb.enabled}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            </div>
          )}

          {/* Tab: Priorities */}
          {activeTab === 'priorities' && (
            <div className="space-y-6">
              {priorities.map(priority => (
                <div key={priority.id} className={`p-4 rounded-xl bg-${priority.color}-50 border border-${priority.color}-100`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className={`w-3 h-3 rounded-full bg-${priority.color}-500`}></span>
                      <h3 className="font-medium text-gray-900">{priority.label}</h3>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.prioritySettings[priority.id].enabled}
                        onChange={(e) => handlePrioritySettingChange(priority.id, 'enabled', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className={`w-11 h-6 bg-gray-300 peer-focus:ring-4 peer-focus:ring-${priority.color}-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-${priority.color}-500`}></div>
                    </label>
                  </div>

                  {/* Display Modes */}
                  <div className="mb-4">
                    <label className="block text-sm text-gray-600 mb-2">أنماط العرض</label>
                    <div className="flex flex-wrap gap-2">
                      {displayModes.map(mode => (
                        <button
                          key={mode.id}
                          onClick={() => handleDisplayModeChange(
                            priority.id,
                            mode.id as NotificationDisplayMode,
                            !settings.prioritySettings[priority.id].displayModes.includes(mode.id as NotificationDisplayMode)
                          )}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${settings.prioritySettings[priority.id].displayModes.includes(mode.id as NotificationDisplayMode)
                              ? `bg-${priority.color}-500 text-white`
                              : 'bg-white text-gray-700 border border-gray-200'
                            }`}
                        >
                          <span>{mode.icon}</span>
                          <span>{mode.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Duration */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm text-gray-600">المدة</label>
                      <span className="text-sm font-medium text-gray-900">
                        {settings.prioritySettings[priority.id].duration === 0
                          ? 'دائم'
                          : `${(settings.prioritySettings[priority.id].duration || 0) / 1000} ثانية`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="15000"
                      step="1000"
                      value={settings.prioritySettings[priority.id].duration || 0}
                      onChange={(e) => handlePrioritySettingChange(priority.id, 'duration', parseInt(e.target.value))}
                      className={`w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-${priority.color}-500`}
                    />
                  </div>

                  {/* Sound */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">الصوت</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.prioritySettings[priority.id].sound}
                        onChange={(e) => handlePrioritySettingChange(priority.id, 'sound', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-300 peer-focus:ring-4 peer-focus:ring-gray-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between bg-gray-50">
          <button
            onClick={resetToDefaults}
            className="text-sm text-red-600 hover:text-red-700 font-medium"
          >
            إعادة الافتراضي
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            حفظ وإغلاق
          </button>
        </div>
      </div>
    </div>
  );
};

export default SmartNotificationSettings;
