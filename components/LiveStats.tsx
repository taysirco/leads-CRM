import React, { useState, useEffect } from 'react';

interface Order {
  id: number;
  name: string;
  status: string;
  orderDate: string;
  totalPrice: string;
}

interface LiveStatsProps {
  orders: Order[];
}

const LiveStats: React.FC<LiveStatsProps> = ({ orders }) => {
  const [blinkingStats, setBlinkingStats] = useState<Set<string>>(new Set());
  const [previousStats, setPreviousStats] = useState<any>(null);

  // Calculate current statistics
  const stats = {
    total: orders.length,
    new: orders.filter(o => !o.status || o.status === 'جديد').length,
    confirmed: orders.filter(o => o.status === 'تم التأكيد').length,
    shipped: orders.filter(o => o.status === 'تم الشحن').length,
    rejected: orders.filter(o => o.status === 'رفض التأكيد').length,
    pending: orders.filter(o => 
      o.status === 'في انتظار تأكيد العميل' || 
      o.status === 'لم يرد' || 
      o.status === 'تم التواصل معه واتساب'
    ).length,
  };

  // Calculate revenue
  const revenue = orders
    .filter(o => o.status === 'تم الشحن')
    .reduce((sum, order) => {
      const price = parseFloat(order.totalPrice?.replace(/[^\d.]/g, '') || '0');
      return sum + price;
    }, 0);

  // Detect changes and trigger animations/sounds
  useEffect(() => {
    if (previousStats) {
      const changedStats = new Set<string>();
      
      // Check for increases in critical stats
      if (stats.new > previousStats.new) {
        changedStats.add('new');
        playAlertSound('new_order');
      }
      if (stats.confirmed > previousStats.confirmed) {
        changedStats.add('confirmed');
        playAlertSound('success');
      }
      if (stats.shipped > previousStats.shipped) {
        changedStats.add('shipped');
        playAlertSound('success');
      }
      if (stats.rejected > previousStats.rejected) {
        changedStats.add('rejected');
        playAlertSound('warning');
      }
      
      setBlinkingStats(changedStats);
      
      // Clear blinking after animation
      if (changedStats.size > 0) {
        setTimeout(() => setBlinkingStats(new Set()), 2000);
      }
    }
    
    setPreviousStats(stats);
  }, [stats.new, stats.confirmed, stats.shipped, stats.rejected]);

  const playAlertSound = (type: 'new_order' | 'success' | 'warning') => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      switch (type) {
        case 'new_order':
          // Urgent alert sound
          oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
          oscillator.frequency.setValueAtTime(1200, audioContext.currentTime + 0.1);
          oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.2);
          gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.4);
          break;
          
        case 'success':
          // Pleasant success sound
          oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
          oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.1);
          gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.2);
          break;
          
        case 'warning':
          // Warning sound
          oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
          oscillator.frequency.setValueAtTime(350, audioContext.currentTime + 0.15);
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.3);
          break;
      }
    } catch (error) {
      console.log('Audio not supported');
    }
  };

  const StatCard = ({ 
    title, 
    value, 
    icon, 
    color, 
    bgColor, 
    statKey 
  }: { 
    title: string;
    value: number;
    icon: string;
    color: string;
    bgColor: string;
    statKey: string;
  }) => (
    <div className={`
      ${bgColor} rounded-xl p-4 border border-gray-200 transition-all duration-500
      ${blinkingStats.has(statKey) ? 'animate-pulse-glow scale-105' : 'hover:scale-102'}
    `}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className={`text-2xl font-bold ${color} ${blinkingStats.has(statKey) ? 'animate-bounce' : ''}`}>
            {value.toLocaleString('ar-EG')}
          </p>
        </div>
        <div className={`
          text-3xl p-3 rounded-full bg-white bg-opacity-70
          ${blinkingStats.has(statKey) ? 'animate-bounce' : ''}
        `}>
          {icon}
        </div>
      </div>
    </div>
  );

  // Calculate enhanced performance indicator
  const successfulOrders = stats.confirmed + stats.shipped;
  const totalOrders = stats.total;
  const performancePercentage = totalOrders > 0 ? Math.round((successfulOrders / totalOrders) * 100) : 0;
  
  const getPerformanceLevel = () => {
    if (performancePercentage >= 70) {
      return {
        level: 'ممتاز',
        color: 'text-emerald-600',
        bgColor: 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200',
        progressColor: 'text-emerald-500'
      };
    }
    if (performancePercentage >= 55) {
      return {
        level: 'جيد',
        color: 'text-green-600',
        bgColor: 'bg-gradient-to-br from-green-50 to-lime-50 border-green-200',
        progressColor: 'text-green-500'
      };
    }
    if (performancePercentage >= 35) {
      return {
        level: 'ضعيف',
        color: 'text-yellow-600',
        bgColor: 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200',
        progressColor: 'text-yellow-500'
      };
    }
    return {
      level: 'سيء',
      color: 'text-red-600',
      bgColor: 'bg-gradient-to-br from-red-50 to-pink-50 border-red-200',
      progressColor: 'text-red-500'
    };
  };

  const performance = getPerformanceLevel();

  const PerformanceIndicator = () => (
    <div className={`
      rounded-xl p-4 border transition-all duration-500 flex flex-col items-center justify-center text-center
      ${performance.bgColor}
    `}>
      <div className="relative w-20 h-20">
        <svg className="w-full h-full" viewBox="0 0 36 36" transform="rotate(-90)">
          <path
            className="text-gray-200"
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
          />
          <path
            className={performance.progressColor}
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeDasharray={`${performancePercentage}, 100`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.5s ease-in-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-xl font-bold ${performance.color}`}>
            {performancePercentage}%
          </span>
        </div>
      </div>
      <p className="text-sm font-bold mt-2 text-gray-800">مؤشر الأداء</p>
      <p className={`text-xs font-medium ${performance.color}`}>
        أداء {performance.level}
      </p>
    </div>
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      <StatCard
        title="طلبات جديدة"
        value={stats.new}
        icon="🆕"
        color="text-red-600"
        bgColor="bg-gradient-to-br from-red-50 to-pink-50"
        statKey="new"
      />
      
      <StatCard
        title="في الانتظار"
        value={stats.pending}
        icon="⏳"
        color="text-yellow-600"
        bgColor="bg-gradient-to-br from-yellow-50 to-orange-50"
        statKey="pending"
      />
      
      <StatCard
        title="مؤكدة"
        value={stats.confirmed}
        icon="✅"
        color="text-green-600"
        bgColor="bg-gradient-to-br from-green-50 to-emerald-50"
        statKey="confirmed"
      />
      
      <StatCard
        title="مشحونة"
        value={stats.shipped}
        icon="🚚"
        color="text-blue-600"
        bgColor="bg-gradient-to-br from-blue-50 to-indigo-50"
        statKey="shipped"
      />
      
      <StatCard
        title="مرفوضة"
        value={stats.rejected}
        icon="❌"
        color="text-gray-600"
        bgColor="bg-gradient-to-br from-gray-50 to-slate-50"
        statKey="rejected"
      />
      <PerformanceIndicator />
    </div>
  );
};

export default LiveStats; 