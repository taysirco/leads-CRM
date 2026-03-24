import { useState } from 'react';

/**
 * CustomerRankingBadge — بادج تقييم العميل من بوسطة
 * 
 * يقرأ الـ ranking المحفوظ في الشيت مباشرة (Column V)
 * لا يستدعي API — الـ batch check يملأ البيانات بشكل مجمع
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
}: Props) {
  const [showTooltip, setShowTooltip] = useState(false);

  // قراءة الـ ranking المحفوظ فقط
  const parsed = parseStoredRanking(storedRanking);
  
  // لا بيانات = لا بادج
  if (!parsed) return null;

  const { ranking, classification, classificationAr } = parsed;

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
          <span className="ranking-full-count">✅ محفوظ في الشيت</span>
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
