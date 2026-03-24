import { useState } from 'react';
import useSWR from 'swr';

/**
 * CustomerRankingBadge — بادج تقييم العميل من بوسطة
 * 
 * يعرض نسبة استلام العميل بجانب اسمه في جدول الطلبات
 * يجلب البيانات lazily عند أول ظهور فقط
 */

interface RankingData {
  success: boolean;
  ranking: number | null;
  classification: 'excellent' | 'medium' | 'low' | 'new' | 'error';
  classificationAr: string;
  totalDeliveries: number;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

// تنظيف رقم الهاتف
const cleanPhone = (phone: string): string => {
  if (!phone) return '';
  return phone.replace(/\D/g, '').replace(/^\+?2?0?/, '0');
};

interface Props {
  phone: string;
  compact?: boolean; // عرض مختصر للجداول
}

export default function CustomerRankingBadge({ phone, compact = true }: Props) {
  const [showTooltip, setShowTooltip] = useState(false);

  const cleanedPhone = cleanPhone(phone);
  
  // لا نجلب إذا الرقم غير صالح
  const shouldFetch = cleanedPhone.length >= 10;

  const { data, error, isLoading } = useSWR<RankingData>(
    shouldFetch ? `/api/bosta-ranking?phone=${cleanedPhone}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 300000, // 5 دقائق cache
      errorRetryCount: 1,
    }
  );

  // لا نعرض شيء إذا لا يوجد رقم أو خطأ
  if (!shouldFetch || error) return null;
  
  // حالة التحميل
  if (isLoading) {
    return (
      <span className="ranking-badge ranking-loading" title="جاري فحص تقييم العميل...">
        <span className="ranking-spinner">⏳</span>
      </span>
    );
  }

  if (!data?.success) return null;

  const { classification, classificationAr, ranking, totalDeliveries } = data;

  // في الوضع المختصر (الجدول): إخفاء البادج للعملاء الجُدد — فقط نظهره عندما يكون هناك ranking فعلي
  // هذا يمنع ظهور "عميل جديد" بشكل متكرر لكل العملاء الجدد
  if (compact && (classification === 'new' || classification === 'error')) {
    return null;
  }

  // أيقونة ولون حسب التصنيف
  const config: Record<string, { icon: string; className: string; color: string }> = {
    excellent: { icon: '🟢', className: 'ranking-excellent', color: '#059669' },
    medium:    { icon: '🟡', className: 'ranking-medium',    color: '#d97706' },
    low:       { icon: '🔴', className: 'ranking-low',       color: '#dc2626' },
    new:       { icon: '⚪', className: 'ranking-new',       color: '#6b7280' },
    error:     { icon: '⚠️', className: 'ranking-error',     color: '#9ca3af' },
  };

  const cfg = config[classification] || config.error;

  // نص التولتيب
  const tooltipText = classification === 'new'
    ? 'عميل جديد — لم يسبق التسليم له'
    : `نسبة الاستلام: ${ranking !== null ? Math.round(ranking) + '%' : 'غير محدد'} | ${totalDeliveries} طلب سابق`;

  if (compact) {
    return (
      <span 
        className={`ranking-badge ${cfg.className}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        style={{ position: 'relative', display: 'inline-flex' }}
      >
        <span className="ranking-icon">{cfg.icon}</span>
        <span className="ranking-label">{classificationAr}</span>
        {ranking !== null && classification !== 'new' && (
          <span className="ranking-percent">{Math.round(ranking)}%</span>
        )}
        
        {/* Tooltip */}
        {showTooltip && (
          <span className="ranking-tooltip">
            <span className="ranking-tooltip-title">📊 تقييم بوسطة</span>
            <span className="ranking-tooltip-row">
              <span>التصنيف:</span>
              <span style={{ color: cfg.color, fontWeight: 700 }}>{classificationAr}</span>
            </span>
            {ranking !== null && (
              <span className="ranking-tooltip-row">
                <span>نسبة الاستلام:</span>
                <span>{Math.round(ranking)}%</span>
              </span>
            )}
            <span className="ranking-tooltip-row">
              <span>الطلبات السابقة:</span>
              <span>{totalDeliveries}</span>
            </span>
          </span>
        )}
      </span>
    );
  }

  // Full mode (for edit modal or expanded view)
  return (
    <div className={`ranking-full ${cfg.className}`}>
      <div className="ranking-full-header">
        <span className="ranking-full-icon">{cfg.icon}</span>
        <div className="ranking-full-info">
          <span className="ranking-full-label">تقييم بوسطة: {classificationAr}</span>
          {ranking !== null && classification !== 'new' && (
            <span className="ranking-full-percent">نسبة الاستلام {Math.round(ranking)}%</span>
          )}
          <span className="ranking-full-count">{totalDeliveries} طلب سابق</span>
        </div>
      </div>
      {ranking !== null && classification !== 'new' && (
        <div className="ranking-progress-bar">
          <div 
            className="ranking-progress-fill"
            style={{ 
              width: `${Math.min(ranking, 100)}%`,
              backgroundColor: cfg.color 
            }}
          />
        </div>
      )}
    </div>
  );
}
