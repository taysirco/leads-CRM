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
      
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-4 border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">إجمالي المبيعات</p>
            <p className="text-xl font-bold text-purple-600">
              {revenue.toLocaleString('ar-EG')} ج.م
            </p>
          </div>
          <div className="text-3xl p-3 rounded-full bg-white bg-opacity-70">
            💰
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveStats; 