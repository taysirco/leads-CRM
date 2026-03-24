import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';

interface BostaNotification {
  id: string;
  titleAr: string;
  textAr: string;
  trackingNumber: string;
  consigneeName: string;
  consigneePhone: string;
  lastExceptionCode: number;
  exceptionReason: string;
  isNew: boolean;
  timeAgo: string;
  createdAt: string;
}

interface NotificationResponse {
  success: boolean;
  count: number;
  newCount: number;
  notifications: BostaNotification[];
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function BostaNotificationBar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data, error } = useSWR<NotificationResponse>(
    '/api/bosta-notifications',
    fetcher,
    {
      refreshInterval: 60000, // تحديث كل دقيقة
      revalidateOnFocus: true,
      dedupingInterval: 30000,
    }
  );

  // الإشعارات النشطة (بعد استبعاد المخفية)
  const activeNotifications = (data?.notifications || []).filter(n => !dismissed.has(n.id));
  const count = activeNotifications.length;

  // إذا لا توجد إشعارات أو خطأ — لا نعرض شيئاً
  if (error || !data?.success || count === 0) return null;

  // اختيار أيقونة ولون حسب السبب
  const getExceptionStyle = (code: number) => {
    switch (code) {
      case 8: case 9: // رفض الاستلام / إلغاء
        return { icon: '🚫', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' };
      case 4: case 5: case 6: case 7: // مشاكل الهاتف
        return { icon: '📵', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' };
      case 2: case 3: // مشاكل العنوان
        return { icon: '📍', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' };
      case 1: case 14: // تأجيل
        return { icon: '⏳', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' };
      case 13: // العميل لم يكن متواجداً
        return { icon: '🏠', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' };
      default:
        return { icon: '⚠️', color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' };
    }
  };

  // أهم إشعار (أحدث واحد)
  const latest = activeNotifications[0];
  const latestStyle = getExceptionStyle(latest.lastExceptionCode);

  return (
    <div className="bosta-notification-bar">
      {/* الشريط الرئيسي — دائماً ظاهر */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="bosta-notif-header"
      >
        <div className="bosta-notif-header-content">
          {/* أيقونة متحركة */}
          <div className="bosta-notif-bell">
            <span className="bosta-notif-bell-icon">🔔</span>
            <span className="bosta-notif-badge">{count}</span>
          </div>

          {/* النص الرئيسي */}
          <div className="bosta-notif-main-text">
            <span className="bosta-notif-title">
              {count === 1 
                ? 'طلب واحد يحتاج إجراءك' 
                : `${count} طلبات تحتاج إجراءك`}
            </span>
            <span className="bosta-notif-subtitle">
              {latest.consigneeName} — {latest.exceptionReason}
            </span>
          </div>

          {/* زر التوسيع */}
          <div className={`bosta-notif-chevron ${isExpanded ? 'expanded' : ''}`}>
            ‹
          </div>
        </div>
      </button>

      {/* القائمة المنسدلة */}
      {isExpanded && (
        <div className="bosta-notif-dropdown">
          {activeNotifications.map((notification) => {
            const style = getExceptionStyle(notification.lastExceptionCode);
            return (
              <div
                key={notification.id}
                className={`bosta-notif-item ${style.bg} ${style.border}`}
              >
                <div className="bosta-notif-item-header">
                  <div className="bosta-notif-item-icon">{style.icon}</div>
                  <div className="bosta-notif-item-info">
                    <div className="bosta-notif-item-name">
                      {notification.consigneeName}
                      <span className="bosta-notif-tracking">
                        #{notification.trackingNumber}
                      </span>
                    </div>
                    <div className={`bosta-notif-item-reason ${style.color}`}>
                      {notification.exceptionReason}
                    </div>
                  </div>
                  <div className="bosta-notif-item-meta">
                    <span className="bosta-notif-time">{notification.timeAgo}</span>
                    {notification.isNew && (
                      <span className="bosta-notif-new-badge">جديد</span>
                    )}
                  </div>
                  {/* زر إغلاق الإشعار */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDismissed(prev => new Set([...prev, notification.id]));
                    }}
                    className="bosta-notif-dismiss"
                    title="إغلاق الإشعار"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '16px',
                      color: '#9ca3af',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      lineHeight: 1,
                      marginRight: '4px',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.color = '#ef4444'; (e.target as HTMLElement).style.background = '#fee2e2'; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.color = '#9ca3af'; (e.target as HTMLElement).style.background = 'none'; }}
                  >
                    ✕
                  </button>
                </div>

                <div className="bosta-notif-item-details">
                  <a
                    href={`tel:${notification.consigneePhone}`}
                    className="bosta-notif-phone"
                    onClick={(e) => e.stopPropagation()}
                  >
                    📞 {notification.consigneePhone}
                  </a>
                  <a
                    href={`https://business.bosta.co/orders/${notification.trackingNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bosta-notif-bosta-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    فتح في بوسطة ↗
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
