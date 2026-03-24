import { useState, useEffect, useCallback } from 'react';

/**
 * CustomerRankingBadge — بادج تقييم العميل من بوسطة
 * 
 * يعمل بثلاث أوضاع:
 * 1. إذا الـ ranking محفوظ → يعرضه مباشرة (Column V)
 * 2. إذا فارغ → يفحص تلقائياً عبر API (create-wait-read-delete)
 * 3. زر إعادة الفحص يدوياً في نافذة التعديل
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
  storedRanking?: string;
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
  const [recheckDone, setRecheckDone] = useState(false);

  // دالة الفحص المشتركة — تُستخدم للفحص التلقائي واليدوي
  const doRankingCheck = useCallback(async () => {
    if (!phone || phone.length < 8) return;
    setIsChecking(true);
    setRecheckDone(false);
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
        setRecheckDone(true);
      }
    } catch (e) {
      console.error('خطأ فحص ranking:', e);
    } finally {
      setIsChecking(false);
    }
  }, [phone, rowIndex]);

  // الفحص التلقائي: فقط عندما Column V فارغ
  useEffect(() => {
    if (storedRanking && storedRanking.trim() !== '') return;
    if (!phone || phone.length < 8) return;
    if (isChecking || liveResult) return;

    const delay = 2000 + Math.random() * 6000;
    const timer = setTimeout(doRankingCheck, delay);
    return () => clearTimeout(timer);
  }, [phone, storedRanking, isChecking, liveResult, doRankingCheck]);

  // القراءة الأولية
  const parsed = parseStoredRanking(storedRanking);
  const displayData = liveResult || parsed;

  // لون ورمز التصنيف
  const config: Record<string, { icon: string; className: string; color: string }> = {
    excellent: { icon: '🟢', className: 'ranking-excellent', color: '#059669' },
    medium:    { icon: '🟡', className: 'ranking-medium',    color: '#d97706' },
    low:       { icon: '🔴', className: 'ranking-low',       color: '#dc2626' },
    new:       { icon: '⚪', className: 'ranking-new',       color: '#6b7280' },
  };

  // ───── Spinner أثناء الفحص (compact) ─────
  if (isChecking && compact) {
    return (
      <span className="ranking-badge ranking-checking" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <span style={{
          display: 'inline-block', width: '12px', height: '12px',
          border: '2px solid #e5e7eb', borderTop: '2px solid #3b82f6',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ fontSize: '11px', color: '#6b7280' }}>فحص...</span>
      </span>
    );
  }

  // ───── لا بيانات + لم يُفحص = لا بادج (compact only) ─────
  if (!displayData && compact && !isChecking) return null;

  const ranking = displayData?.ranking ?? null;
  const classification = displayData?.classification || 'new';
  const classificationAr = displayData?.classificationAr || 'عميل جديد';

  // في الجدول: إخفاء العملاء الجُدد
  if (compact && classification === 'new') return null;

  const cfg = config[classification] || config.new;

  // ════════════════════════════════════════
  // ───── Compact Mode (الجدول) ─────
  // ════════════════════════════════════════
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

  // ════════════════════════════════════════
  // ───── Full Mode (نافذة التعديل) ─────
  // ════════════════════════════════════════
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
            {recheckDone ? '✅ تم التحديث الآن' : liveResult ? '✅ تم الفحص تلقائياً' : '✅ محفوظ في الشيت'}
          </span>
        </div>

        {/* ── زر إعادة الفحص ── */}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); doRankingCheck(); }}
          disabled={isChecking}
          title="إعادة فحص التقييم من بوسطة"
          style={{
            marginRight: 'auto',
            marginLeft: '8px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 10px',
            fontSize: '12px',
            fontWeight: 600,
            color: isChecking ? '#9ca3af' : '#3b82f6',
            background: isChecking ? '#f3f4f6' : '#eff6ff',
            border: `1px solid ${isChecking ? '#e5e7eb' : '#bfdbfe'}`,
            borderRadius: '6px',
            cursor: isChecking ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { if (!isChecking) { (e.target as HTMLElement).style.background = '#dbeafe'; }}}
          onMouseLeave={(e) => { if (!isChecking) { (e.target as HTMLElement).style.background = '#eff6ff'; }}}
        >
          {isChecking ? (
            <>
              <span style={{
                display: 'inline-block', width: '14px', height: '14px',
                border: '2px solid #d1d5db', borderTop: '2px solid #3b82f6',
                borderRadius: '50%', animation: 'spin 0.8s linear infinite',
              }} />
              جاري الفحص...
            </>
          ) : (
            <>
              <span style={{ fontSize: '14px' }}>🔄</span>
              إعادة فحص
            </>
          )}
        </button>
      </div>

      {/* ── Progress Bar ── */}
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
