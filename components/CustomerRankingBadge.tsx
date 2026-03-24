import { useState } from 'react';
import useSWR from 'swr';

/**
 * CustomerRankingBadge — بادج تقييم العميل من بوسطة
 * 
 * يقرأ الـ ranking المحفوظ في الشيت مباشرة
 * إذا لم يكن محفوظاً، يفحصه من API ويحفظه تلقائياً
 */

interface RankingApiResponse {
  success: boolean;
  result?: {
    ranking: number | null;
    classification: 'excellent' | 'medium' | 'low' | 'new' | 'error';
    classificationAr: string;
    saved: boolean;
  };
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

// تحليل الـ ranking المحفوظ في الشيت (format: "88% - ممتاز" أو "جديد")
function parseStoredRanking(stored: string): {
  ranking: number | null;
  classification: 'excellent' | 'medium' | 'low' | 'new';
  classificationAr: string;
} | null {
  if (!stored || stored.trim() === '') return null;

  if (stored === 'جديد') {
    return { ranking: null, classification: 'new', classificationAr: 'عميل جديد' };
  }

  const match = stored.match(/^(\d+)%\s*-\s*(.+)$/);
  if (match) {
    const ranking = parseInt(match[1], 10);
    const label = match[2].trim();
    let classification: 'excellent' | 'medium' | 'low' = 'low';
    if (ranking >= 70) classification = 'excellent';
    else if (ranking >= 40) classification = 'medium';
    return { ranking, classification, classificationAr: label };
  }

  return null;
}

// تنظيف رقم الهاتف
const cleanPhone = (phone: string): string => {
  if (!phone) return '';
  return phone.replace(/\D/g, '').replace(/^\+?2?0?/, '0');
};

interface Props {
  phone: string;
  compact?: boolean;
  storedRanking?: string; // القيمة المحفوظة في الشيت
  rowIndex?: number; // لتمريره للـ API لحفظ النتيجة
  onRankingLoaded?: (ranking: string) => void; // callback عند تحميل ranking جديد
}

export default function CustomerRankingBadge({ 
  phone, 
  compact = true, 
  storedRanking = '',
  rowIndex,
  onRankingLoaded
}: Props) {
  const [showTooltip, setShowTooltip] = useState(false);

  // أولاً: محاولة قراءة الـ ranking المحفوظ
  const parsed = parseStoredRanking(storedRanking);

  const cleanedPhone = cleanPhone(phone);
  const shouldFetch = !parsed && cleanedPhone.length >= 10;

  // فقط نستدعي API إذا لم يكن هناك ranking محفوظ
  const { data, error, isLoading } = useSWR<RankingApiResponse>(
    shouldFetch ? `/api/bosta-ranking?phone=${cleanedPhone}${rowIndex ? `&rowIndex=${rowIndex}` : ''}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 600000, // 10 دقائق cache
      errorRetryCount: 0, // لا نعيد المحاولة لأن create-delete مكلف
      onSuccess: (data) => {
        if (data?.result?.saved && onRankingLoaded) {
          const r = data.result.ranking;
          const label = data.result.classificationAr;
          const value = r !== null ? `${Math.round(r)}% - ${label}` : 'جديد';
          onRankingLoaded(value);
        }
      }
    }
  );

  // تحديد البيانات من المصدر المتاح (محفوظ أو API)
  let ranking: number | null = null;
  let classification: string = 'new';
  let classificationAr: string = 'عميل جديد';

  if (parsed) {
    // استخدام البيانات المحفوظة
    ranking = parsed.ranking;
    classification = parsed.classification;
    classificationAr = parsed.classificationAr;
  } else if (data?.result) {
    // استخدام بيانات API
    ranking = data.result.ranking;
    classification = data.result.classification;
    classificationAr = data.result.classificationAr;
  } else if (shouldFetch && !isLoading && !error) {
    return null; // لا بيانات بعد
  } else if (error || (!shouldFetch && !parsed)) {
    return null;
  }

  // حالة التحميل
  if (isLoading) {
    return (
      <span className="ranking-badge ranking-loading" title="جاري فحص تقييم العميل من بوسطة...">
        <span className="ranking-spinner">⏳</span>
      </span>
    );
  }

  // في الجدول: إخفاء العملاء الجُدد
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
              <span>المصدر:</span>
              <span>{parsed ? 'محفوظ' : 'فحص جديد'}</span>
            </span>
          </span>
        )}
      </span>
    );
  }

  // Full mode (for edit modal)
  return (
    <div className={`ranking-full ${cfg.className}`}>
      <div className="ranking-full-header">
        <span className="ranking-full-icon">{cfg.icon}</span>
        <div className="ranking-full-info">
          <span className="ranking-full-label">تقييم بوسطة: {classificationAr}</span>
          {ranking !== null && classification !== 'new' && (
            <span className="ranking-full-percent">نسبة الاستلام {Math.round(ranking)}%</span>
          )}
          <span className="ranking-full-count">{parsed ? '✅ محفوظ في الشيت' : '🔄 تم الفحص الآن'}</span>
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
