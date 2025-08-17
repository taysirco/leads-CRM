import React, { useState, useMemo } from 'react';
import { getStatusConfig, getStatusColor, getStatusIcon, sortStatusesByPriority } from '../utils/statusColors';

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
    name: string; // تصحيح اسم الحقل
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

  // استخدام نظام الألوان الموحد
  const getStatusColorClass = (status: string) => {
    return getStatusColor(status);
  };

  const getStatusIconEmoji = (status: string) => {
    return getStatusIcon(status);
  };

  // حساب النسب المئوية
  const getStatusPercentage = (count: number) => {
    return totalOrders > 0 ? ((count / totalOrders) * 100).toFixed(1) : '0.0';
  };

  // ترتيب الحالات حسب الأولوية باستخدام النظام الموحد
  const sortedStatuses = useMemo(() => {
    const availableStatuses = Object.keys(statusStats).filter(status => statusStats[status] > 0);
    const sortedStatusNames = sortStatusesByPriority(availableStatuses);
    
    return sortedStatusNames.map(status => ({ 
      status, 
      count: statusStats[status],
      config: getStatusConfig(status)
    }));
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
                {sortedStatuses.map(({ status, count, config }) => (
                  <div key={status} className={`flex items-center justify-between p-2 rounded border ${config.bgColor} ${config.borderColor}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{config.icon}</span>
                      <div className="flex flex-col">
                        <span className={`text-sm font-medium ${config.textColor}`}>{status}</span>
                        <span className="text-xs text-gray-500">{config.description}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${config.textColor}`}>{count}</span>
                      <span className="text-xs text-gray-500">
                        {getStatusPercentage(count)}%
                      </span>
                      <div className={`w-3 h-3 rounded-full ${config.color}`}></div>
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
                            <span className="text-lg">{getStatusIconEmoji(order.status)}</span>
                            <span className="font-bold text-sm">#{order.id}</span>
                            <span className={`px-2 py-1 rounded text-xs font-medium text-white ${getStatusColorClass(order.status)}`}>
                              {order.status}
                            </span>
                          </div>
                          <p className="text-sm font-medium">{order.name}</p>
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
                      <span className={`px-2 py-1 rounded text-white ${getStatusColorClass(change.previousStatus)}`}>
                        {change.previousStatus}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className={`px-2 py-1 rounded text-white ${getStatusColorClass(change.newStatus)}`}>
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
