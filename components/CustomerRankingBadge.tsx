import { useState, useEffect } from 'react';

/**
 * CustomerRankingBadge — بادج تقييم العميل من بوسطة
 * 
 * يعمل بوضعين:
 * 1. إذا الـ ranking محفوظ → يعرضه مباشرة (Column V)
 * 2. إذا فارغ → يفحص تلقائياً عبر API (create-wait-read-delete)
 */

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

interface Props {
  phone: string;
  compact?: boolean;
  storedRanking?: string; // القيمة المحفوظة في الشيت
  rowIndex?: number;
}

export default function CustomerRankingBadge({ 
  phone, 
  compact = true, 
  storedRanking = '',
  rowIndex,
}: Props) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [liveResult, setLiveResult] = useState<{
    ranking: number | null;
    classification: string;
    classificationAr: string;
    sheetValue: string;
  } | null>(null);

  // التحقق التلقائي: إذا لا يوجد ranking محفوظ، يفحص عبر الـ API
  useEffect(() => {
    if (storedRanking && storedRanking.trim() !== '') return; // محفوظ بالفعل
    if (!phone || phone.length < 10) return;
    if (isChecking || liveResult) return;

    // فحص تلقائي لأول مرة فقط
    const checkRanking = async () => {
      setIsChecking(true);
      try {
        const cleanPhone = phone.replace(/\D/g, '');
        const saveParam = rowIndex ? `&save=true&row=${rowIndex}` : '';
        const res = await fetch(`/api/bosta-ranking?phone=${cleanPhone}${saveParam}`);
        const data = await res.json();
        if (data.success && data.result) {
          setLiveResult({
            ranking: data.result.ranking,
            classification: data.result.classification,
            classificationAr: data.result.classificationAr,
            sheetValue: data.result.sheetValue,
          });
        }
      } catch (e) {
        console.error('خطأ فحص ranking:', e);
      } finally {
        setIsChecking(false);
      }
    };

    // تأخير عشوائي 2-8 ثوانٍ لتجنب طلبات متزامنة
    const delay = 2000 + Math.random() * 6000;
    const timer = setTimeout(checkRanking, delay);
    return () => clearTimeout(timer);
  }, [phone, storedRanking, rowIndex, isChecking, liveResult]);

  // القراءة الأولية
  const parsed = parseStoredRanking(storedRanking);
  
  // استخدام النتيجة المباشرة أو المحفوظة
  const displayData = liveResult || parsed;

  // جاري الفحص
  if (isChecking) {
    return (
      <span className="ranking-badge ranking-checking" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <span className="ranking-spinner" style={{
          display: 'inline-block',
          width: '12px',
          height: '12px',
          border: '2px solid #e5e7eb',
          borderTop: '2px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ fontSize: '11px', color: '#6b7280' }}>فحص...</span>
      </span>
    );
  }

  // لا بيانات = لا بادج
  if (!displayData) return null;

  const { ranking, classification, classificationAr } = displayData;

  // في الجدول: إخفاء العملاء الجُدد
  if (compact && classification === 'new') {
    return null;
  }

  // أيقونة ولون حسب التصنيف
  const config: Record<string, { icon: string; className: string; color: string }> = {
    excellent: { icon: '🟢', className: 'ranking-excellent', color: '#059669' },
    medium:    { icon: '🟡', className: 'ranking-medium',    color: '#d97706' },
    low:       { icon: '🔴', className: 'ranking-low',       color: '#dc2626' },
    new:       { icon: '⚪', className: 'ranking-new',       color: '#6b7280' },
  };

  const cfg = config[classification] || config.new;

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
            {liveResult && (
              <span className="ranking-tooltip-row" style={{ fontSize: '10px', color: '#059669' }}>
                <span>✅ تم الفحص والحفظ تلقائياً</span>
              </span>
            )}
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
          <span className="ranking-full-count">
            {liveResult ? '✅ تم الفحص والحفظ تلقائياً' : '✅ محفوظ في الشيت'}
          </span>
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
