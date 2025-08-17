import React, { useState, useMemo } from 'react';

interface StatusChangeEvent {
  orderId: number;
  previousStatus: string;
  newStatus: string;
  timestamp: Date;
  customerName: string;
  productName: string;
  totalPrice?: string;
}

interface RealTimeStatusTrackerProps {
  statusStats: Record<string, number>;
  criticalOrders: Array<{
    id: number;
    customerName: string;
    status: string;
    productName: string;
    totalPrice?: string;
    source?: string;
  }>;
  statusChangeHistory: StatusChangeEvent[];
  totalOrders: number;
}

const RealTimeStatusTracker: React.FC<RealTimeStatusTrackerProps> = ({
  statusStats,
  criticalOrders,
  statusChangeHistory,
  totalOrders
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'critical' | 'history'>('stats');

  // تحديد ألوان الحالات
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'جديد': 'bg-blue-500',
      'تم الاتصال': 'bg-yellow-500',
      'تم التأكيد': 'bg-green-500',
      'تم الشحن': 'bg-purple-500',
      'مرفوض': 'bg-red-500',
      'عودة اتصال': 'bg-orange-500',
      'اعتراض': 'bg-red-600',
      'شكوى': 'bg-red-700',
      'مكتمل': 'bg-gray-500',
      'لا يرد': 'bg-gray-400',
      'إلغاء': 'bg-red-400'
    };
    return colors[status] || 'bg-gray-300';
  };

  // تحديد أيقونة الحالة
  const getStatusIcon = (status: string) => {
    const icons: Record<string, string> = {
      'جديد': '🆕',
      'تم الاتصال': '📞',
      'تم التأكيد': '✅',
      'تم الشحن': '🚚',
      'مرفوض': '❌',
      'عودة اتصال': '📞',
      'اعتراض': '⚠️',
      'شكوى': '😠',
      'مكتمل': '🎉',
      'لا يرد': '📵',
      'إلغاء': '🚫'
    };
    return icons[status] || '📝';
  };

  // حساب النسب المئوية
  const getStatusPercentage = (count: number) => {
    return totalOrders > 0 ? ((count / totalOrders) * 100).toFixed(1) : '0.0';
  };

  // ترتيب الحالات حسب الأولوية
  const sortedStatuses = useMemo(() => {
    const priorityOrder = [
      'عودة اتصال', 'اعتراض', 'شكوى', // حرجة
      'جديد', 'تم التأكيد', 'إلغاء', // مهمة
      'تم الاتصال', 'تم الشحن', // عادية
      'مرفوض', 'لا يرد', 'مكتمل' // منخفضة
    ];

    return priorityOrder
      .filter(status => statusStats[status] > 0)
      .map(status => ({ status, count: statusStats[status] }));
  }, [statusStats]);

  // تنسيق الوقت
  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };

  return (
    <div className="fixed bottom-4 left-4 bg-white border border-gray-300 rounded-lg shadow-lg z-40 max-w-md">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 flex items-center justify-between text-white rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          <h3 className="font-bold text-sm">📊 متابعة فورية</h3>
          <span className="bg-white bg-opacity-20 px-2 py-1 rounded text-xs">
            {totalOrders} طلب
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-white hover:text-gray-200 transition-colors"
        >
          {isExpanded ? '🔽' : '🔼'}
        </button>
      </div>

      {isExpanded && (
        <div className="p-4">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-3">
            {[
              { id: 'stats', label: 'الإحصائيات', icon: '📊' },
              { id: 'critical', label: 'حرجة', icon: '🚨' },
              { id: 'history', label: 'التاريخ', icon: '📝' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-blue-600 bg-blue-50'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                <span className="mr-1">{tab.icon}</span>
                {tab.label}
                {tab.id === 'critical' && criticalOrders.length > 0 && (
                  <span className="ml-1 bg-red-500 text-white rounded-full px-1 text-xs">
                    {criticalOrders.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="max-h-64 overflow-y-auto">
            {activeTab === 'stats' && (
              <div className="space-y-2">
                {sortedStatuses.map(({ status, count }) => (
                  <div key={status} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getStatusIcon(status)}</span>
                      <span className="text-sm font-medium">{status}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{count}</span>
                      <span className="text-xs text-gray-500">
                        {getStatusPercentage(count)}%
                      </span>
                      <div className={`w-3 h-3 rounded-full ${getStatusColor(status)}`}></div>
                    </div>
                  </div>
                ))}
                
                {sortedStatuses.length === 0 && (
                  <div className="text-center text-gray-500 py-4">
                    <span className="text-2xl">📭</span>
                    <p className="text-sm mt-1">لا توجد طلبات حالياً</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'critical' && (
              <div className="space-y-2">
                {criticalOrders.map(order => (
                  <div key={order.id} className="p-3 bg-red-50 border border-red-200 rounded">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{getStatusIcon(order.status)}</span>
                          <span className="font-bold text-sm">#{order.id}</span>
                          <span className={`px-2 py-1 rounded text-xs font-medium text-white ${getStatusColor(order.status)}`}>
                            {order.status}
                          </span>
                        </div>
                        <p className="text-sm font-medium">{order.customerName}</p>
                        <p className="text-xs text-gray-600">{order.productName}</p>
                        {order.totalPrice && (
                          <p className="text-xs font-medium text-green-600">
                            {order.totalPrice} جنيه
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {criticalOrders.length === 0 && (
                  <div className="text-center text-gray-500 py-4">
                    <span className="text-2xl">✅</span>
                    <p className="text-sm mt-1">لا توجد طلبات حرجة</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-2">
                {statusChangeHistory.slice(0, 10).map((change, index) => (
                  <div key={`${change.orderId}-${change.timestamp.getTime()}`} 
                       className="p-2 bg-gray-50 rounded text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">#{change.orderId}</span>
                      <span className="text-gray-500">{formatTime(change.timestamp)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`px-2 py-1 rounded text-white ${getStatusColor(change.previousStatus)}`}>
                        {change.previousStatus}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className={`px-2 py-1 rounded text-white ${getStatusColor(change.newStatus)}`}>
                        {change.newStatus}
                      </span>
                    </div>
                    <p className="text-gray-600 mt-1">{change.customerName}</p>
                  </div>
                ))}
                
                {statusChangeHistory.length === 0 && (
                  <div className="text-center text-gray-500 py-4">
                    <span className="text-2xl">📝</span>
                    <p className="text-sm mt-1">لا توجد تغييرات حديثة</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 pt-2 mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>آخر تحديث: {formatTime(new Date())}</span>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>مباشر</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RealTimeStatusTracker;
