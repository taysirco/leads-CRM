import React, { useState, useMemo } from 'react';
import { SmartNotification, NotificationType } from '../hooks/useSmartNotifications';
import { getStatusIcon } from '../utils/statusColors';

interface NotificationHistoryProps {
    history: SmartNotification[];
    unreadCount: number;
    onMarkAsRead: (id: string) => void;
    onMarkAllAsRead: () => void;
    onClearHistory: () => void;
    isOpen: boolean;
    onClose: () => void;
}

const NotificationHistory: React.FC<NotificationHistoryProps> = ({
    history,
    unreadCount,
    onMarkAsRead,
    onMarkAllAsRead,
    onClearHistory,
    isOpen,
    onClose
}) => {
    const [filter, setFilter] = useState<NotificationType | 'all'>('all');
    const [searchTerm, setSearchTerm] = useState('');

    // تصفية الإشعارات
    const filteredHistory = useMemo(() => {
        return history.filter(notification => {
            // تصفية حسب النوع
            if (filter !== 'all' && notification.type !== filter) {
                return false;
            }

            // تصفية حسب البحث
            if (searchTerm) {
                const searchLower = searchTerm.toLowerCase();
                return (
                    notification.title.toLowerCase().includes(searchLower) ||
                    notification.message.toLowerCase().includes(searchLower)
                );
            }

            return true;
        });
    }, [history, filter, searchTerm]);

    // أنواع الإشعارات للفلترة
    const notificationTypes: { value: NotificationType | 'all'; label: string; icon: string }[] = [
        { value: 'all', label: 'الكل', icon: '📋' },
        { value: 'new_order', label: 'طلبات جديدة', icon: '🛒' },
        { value: 'order_update', label: 'تحديثات', icon: '📝' },
        { value: 'success', label: 'نجاح', icon: '✅' },
        { value: 'warning', label: 'تحذيرات', icon: '⚠️' },
        { value: 'error', label: 'أخطاء', icon: '❌' },
        { value: 'info', label: 'معلومات', icon: 'ℹ️' },
        { value: 'stock_alert', label: 'تنبيهات مخزون', icon: '📦' },
    ];

    // الحصول على لون الأولوية
    const getPriorityBadge = (priority: string) => {
        const badges: Record<string, { bg: string; text: string; label: string }> = {
            critical: { bg: 'bg-red-100', text: 'text-red-800', label: 'حرج' },
            high: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'مهم' },
            normal: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'عادي' },
            low: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'منخفض' }
        };
        return badges[priority] || badges.normal;
    };

    // الحصول على أيقونة النوع
    const getNotificationIcon = (notification: SmartNotification) => {
        if (notification.data?.status) {
            return getStatusIcon(notification.data.status);
        }

        const typeIcons: Record<string, string> = {
            new_order: '🛒',
            order_update: '📝',
            success: '✅',
            warning: '⚠️',
            error: '❌',
            info: 'ℹ️',
            stock_alert: '📦',
            system: '⚙️'
        };
        return typeIcons[notification.type] || '📢';
    };

    // تنسيق الوقت
    const formatTime = (date: Date) => {
        const now = new Date();
        const diffMs = now.getTime() - new Date(date).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'الآن';
        if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
        if (diffHours < 24) return `منذ ${diffHours} ساعة`;
        if (diffDays < 7) return `منذ ${diffDays} يوم`;

        return new Intl.DateTimeFormat('ar-EG', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(date));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM12 7V3H8l4-4 4 4h-4zm0 0v4" />
                            </svg>
                            {unreadCount > 0 && (
                                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                            )}
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-lg">سجل الإشعارات</h2>
                            <p className="text-indigo-200 text-sm">{history.length} إشعار</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {unreadCount > 0 && (
                            <button
                                onClick={onMarkAllAsRead}
                                className="text-white text-sm bg-white bg-opacity-20 hover:bg-opacity-30 px-3 py-1 rounded-lg transition-colors"
                            >
                                تعليم الكل كمقروء
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="text-white hover:text-gray-200 p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="border-b border-gray-200 p-4 space-y-3">
                    {/* Search */}
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="بحث في الإشعارات..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-4 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                        />
                        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>

                    {/* Type Filter */}
                    <div className="flex flex-wrap gap-2">
                        {notificationTypes.map(type => (
                            <button
                                key={type.value}
                                onClick={() => setFilter(type.value)}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${filter === type.value
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                            >
                                <span>{type.icon}</span>
                                <span>{type.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {filteredHistory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                            <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                            <p className="text-lg font-medium">لا توجد إشعارات</p>
                            <p className="text-sm">سيظهر هنا سجل الإشعارات السابقة</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {filteredHistory.map((notification) => {
                                const priorityBadge = getPriorityBadge(notification.priority);

                                return (
                                    <div
                                        key={notification.id}
                                        onClick={() => !notification.isRead && onMarkAsRead(notification.id)}
                                        className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${!notification.isRead ? 'bg-blue-50 border-r-4 border-blue-500' : ''
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            {/* Icon */}
                                            <div className="text-2xl flex-shrink-0">
                                                {getNotificationIcon(notification)}
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <h4 className={`font-medium text-gray-900 text-sm truncate ${!notification.isRead ? 'font-bold' : ''
                                                        }`}>
                                                        {notification.title}
                                                    </h4>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <span className={`px-2 py-0.5 rounded-full text-xs ${priorityBadge.bg} ${priorityBadge.text}`}>
                                                            {priorityBadge.label}
                                                        </span>
                                                        {!notification.isRead && (
                                                            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                                        )}
                                                    </div>
                                                </div>

                                                <p className="text-gray-600 text-sm line-clamp-2">
                                                    {notification.message}
                                                </p>

                                                <div className="flex items-center justify-between mt-2">
                                                    <span className="text-xs text-gray-400">
                                                        {formatTime(notification.timestamp)}
                                                    </span>

                                                    {notification.isGrouped && notification.groupCount && (
                                                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                                                            {notification.groupCount} مجمّع
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {history.length > 0 && (
                    <div className="border-t border-gray-200 px-6 py-3 flex items-center justify-between bg-gray-50">
                        <span className="text-sm text-gray-500">
                            عرض {filteredHistory.length} من {history.length} إشعار
                        </span>
                        <button
                            onClick={() => {
                                if (confirm('هل أنت متأكد من مسح سجل الإشعارات؟')) {
                                    onClearHistory();
                                }
                            }}
                            className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            مسح السجل
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationHistory;
