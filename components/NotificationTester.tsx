import React, { useState, useRef } from 'react';

const NotificationTester: React.FC = () => {
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // تشغيل الصوت مع تكوين مختلف حسب الأولوية
  const playTestSound = async (priority: 'low' | 'normal' | 'high' | 'critical') => {
    try {
      // التأكد من تفاعل المستخدم أولاً
      if (!hasUserInteracted) {
        setHasUserInteracted(true);
      }

      // إنشاء أو استخدام AudioContext موجود
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const audioContext = audioContextRef.current;
      
      // استئناف AudioContext إذا كان متوقف
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // تكوين الصوت حسب الأولوية
      const soundConfig = {
        low: { freq: [400], duration: 0.2, volume: 0.1 },
        normal: { freq: [600, 800], duration: 0.3, volume: 0.2 },
        high: { freq: [800, 1000, 800], duration: 0.5, volume: 0.3 },
        critical: { freq: [1200, 800, 1200, 800], duration: 0.8, volume: 0.4 }
      };
      
      const config = soundConfig[priority];
      const freqChangeDuration = config.duration / config.freq.length;
      
      // تطبيق الترددات المختلفة
      config.freq.forEach((freq, index) => {
        oscillator.frequency.setValueAtTime(
          freq, 
          audioContext.currentTime + (index * freqChangeDuration)
        );
      });
      
      // تطبيق مستوى الصوت
      gainNode.gain.setValueAtTime(config.volume, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01, 
        audioContext.currentTime + config.duration
      );
      
      // تشغيل الصوت
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + config.duration);
      
      console.log(`✅ تم تشغيل صوت ${priority} بنجاح`);
      
    } catch (error) {
      console.error('❌ خطأ في تشغيل الصوت:', error);
      alert(`خطأ في تشغيل الصوت: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
    }
  };

  // اختبار إشعار المتصفح
  const testBrowserNotification = async () => {
    if (!('Notification' in window)) {
      alert('المتصفح لا يدعم إشعارات النظام');
      return;
    }

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('تم رفض إذن الإشعارات');
        return;
      }
    }

    if (Notification.permission === 'granted') {
      new Notification('اختبار الإشعارات', {
        body: 'هذا إشعار تجريبي للتأكد من عمل النظام',
        icon: '/favicon.ico',
        tag: 'test-notification'
      });
      console.log('✅ تم إرسال إشعار المتصفح');
    }
  };

  // اختبار شامل للنظام
  const runFullTest = async () => {
    console.log('🧪 بدء اختبار شامل للتنبيهات...');
    
    // اختبار الأصوات
    for (const priority of ['low', 'normal', 'high', 'critical'] as const) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await playTestSound(priority);
    }
    
    // اختبار إشعار المتصفح
    await new Promise(resolve => setTimeout(resolve, 1000));
    await testBrowserNotification();
    
    console.log('✅ انتهى الاختبار الشامل');
  };

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-300 rounded-lg shadow-lg p-4 z-50">
      <h3 className="font-bold text-sm mb-3 text-gray-800">🧪 اختبار التنبيهات</h3>
      
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => playTestSound('low')}
            className="bg-gray-500 text-white text-xs px-2 py-1 rounded hover:bg-gray-600"
          >
            🔉 منخفض
          </button>
          <button
            onClick={() => playTestSound('normal')}
            className="bg-blue-500 text-white text-xs px-2 py-1 rounded hover:bg-blue-600"
          >
            🔊 عادي
          </button>
          <button
            onClick={() => playTestSound('high')}
            className="bg-orange-500 text-white text-xs px-2 py-1 rounded hover:bg-orange-600"
          >
            🔊 مهم
          </button>
          <button
            onClick={() => playTestSound('critical')}
            className="bg-red-500 text-white text-xs px-2 py-1 rounded hover:bg-red-600"
          >
            🚨 حرج
          </button>
        </div>
        
        <button
          onClick={testBrowserNotification}
          className="w-full bg-indigo-500 text-white text-xs px-2 py-1 rounded hover:bg-indigo-600"
        >
          💻 اختبار إشعار المتصفح
        </button>
        
        <button
          onClick={runFullTest}
          className="w-full bg-green-500 text-white text-xs px-2 py-1 rounded hover:bg-green-600"
        >
          🧪 اختبار شامل
        </button>
      </div>
      
      <div className="mt-2 text-xs text-gray-600">
        <p>• يجب التفاعل مع الصفحة أولاً</p>
        <p>• تحقق من وحدة التحكم للسجلات</p>
      </div>
    </div>
  );
};

export default NotificationTester;
