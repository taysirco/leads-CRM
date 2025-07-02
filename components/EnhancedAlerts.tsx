import React, { useState, useEffect, useRef } from 'react';

interface EnhancedAlertsProps {
  hasNewOrders: boolean;
  newOrdersCount: number;
  onAlert?: () => void;
  initialUserInteraction: boolean;
}

const EnhancedAlerts: React.FC<EnhancedAlertsProps> = ({
  hasNewOrders,
  newOrdersCount,
  onAlert,
  initialUserInteraction
}) => {
  const flashOverlayRef = useRef<HTMLDivElement>(null);
  const lastAlertTime = useRef<number>(0);
  const [isFullscreenVisible, setIsFullscreenVisible] = useState(false);

  useEffect(() => {
    if (hasNewOrders && newOrdersCount > 0 && initialUserInteraction) {
      const now = Date.now();
      
      // Prevent too frequent alerts (max once every 3 seconds)
      if (now - lastAlertTime.current < 3000) return;
      
      lastAlertTime.current = now;
      
      // Trigger all alert mechanisms
      triggerScreenFlash();
      triggerVibration();
      triggerDocumentTitleAlert();
      
      if (newOrdersCount >= 3) {
        setIsFullscreenVisible(true);
      }
      
      onAlert?.();
    }
  }, [hasNewOrders, newOrdersCount, onAlert, initialUserInteraction]);

  const triggerScreenFlash = () => {
    if (flashOverlayRef.current) {
      flashOverlayRef.current.style.display = 'block';
      
      // Flash animation
      setTimeout(() => {
        if (flashOverlayRef.current) {
          flashOverlayRef.current.style.display = 'none';
        }
      }, 300);
    }
  };

  const triggerVibration = () => {
    if ('vibrate' in navigator && initialUserInteraction) {
      navigator.vibrate([200, 100, 200, 100, 300]);
    }
  };

  const triggerDocumentTitleAlert = () => {
    let isFlashing = false;
    let flashCount = 0;
    const maxFlashes = 10;
    const originalTitle = document.title;
    
    const flashInterval = setInterval(() => {
      if (flashCount >= maxFlashes) {
        document.title = originalTitle;
        clearInterval(flashInterval);
        return;
      }
      
      document.title = isFlashing 
        ? `🔴 (${newOrdersCount}) طلبات جديدة عاجلة!`
        : '🚨 تحتاج مراجعة فورية!';
      
      isFlashing = !isFlashing;
      flashCount++;
    }, 800);
  };

  return (
    <>
      {/* Screen Flash Overlay */}
      <div
        ref={flashOverlayRef}
        className="fixed inset-0 bg-red-500 opacity-30 pointer-events-none z-[9998]"
        style={{ display: 'none' }}
      />

      {/* Fullscreen Alert for Critical Cases */}
      {isFullscreenVisible && newOrdersCount >= 3 && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999] animate-fade-in-up">
          <div className="bg-white rounded-3xl p-8 max-w-md mx-4 text-center shadow-2xl animate-bounce-in">
            <div className="text-6xl mb-4 animate-bounce">🚨</div>
            <h2 className="text-2xl font-bold text-red-600 mb-4">
              تنبيه عاجل!
            </h2>
            <p className="text-lg text-gray-700 mb-6">
              يوجد <span className="font-bold text-red-600">{newOrdersCount}</span> طلبات جديدة تحتاج مراجعة فورية
            </p>
            <button
              onClick={() => setIsFullscreenVisible(false)}
              className="bg-gradient-to-r from-red-500 to-red-600 text-white px-8 py-3 rounded-xl font-bold hover:from-red-600 hover:to-red-700 transition-all duration-200 shadow-lg"
            >
              مراجعة الطلبات الآن
            </button>
          </div>
        </div>
      )}

      {/* Persistent Alert Bar for Multiple Orders */}
      {newOrdersCount >= 2 && (
        <div className="fixed top-0 left-0 right-0 bg-gradient-to-r from-red-500 to-red-600 text-white py-3 px-4 z-50 animate-slide-in-down">
          <div className="flex items-center justify-center gap-3">
            <div className="animate-bounce">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <span className="font-bold text-lg">
              عاجل: {newOrdersCount} طلبات جديدة بحاجة لمراجعة فورية!
            </span>
            <div className="animate-ping">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5z" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* Browser Tab Favicon Change */}
      {hasNewOrders && (
        <style jsx>{`
          @keyframes favicon-flash {
            0%, 50% { opacity: 1; }
            25%, 75% { opacity: 0.3; }
          }
        `}</style>
      )}
    </>
  );
};

export default EnhancedAlerts; 