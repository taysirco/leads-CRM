import React from 'react';

interface Stats {
  total: number;
  new: number;
  confirmed: number;
  pending: number;
  rejected: number;
  noAnswer: number;
  contacted: number;
  shipped: number;
  today: number;
}

interface ReportCardProps {
  title: string;
  stats: Stats;
}

// Calculate percentage, handling division by zero
const getPercentage = (value: number, total: number) => {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
};

const ReportCard: React.FC<ReportCardProps> = ({ title, stats }) => {
  const { total, confirmed, rejected, shipped, pending, noAnswer, contacted, new: newOrders } = stats;

  const successRate = getPercentage(shipped, total);
  const rejectionRate = getPercentage(rejected, total);
  const noAnswerRate = getPercentage(noAnswer, total);
  const inProgress = confirmed + pending + contacted + newOrders;
  const inProgressRate = getPercentage(inProgress, total);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 flex flex-col h-full">
      <h3 className="text-xl font-semibold mb-4 text-gray-800">{title}</h3>
      
      <div className="mb-4">
        <p className="text-3xl font-bold text-center text-blue-600">{total}</p>
        <p className="text-sm text-gray-500 text-center">إجمالي الطلبات</p>
      </div>

      <div className="space-y-4 mt-auto">
        {/* Success Rate (Shipped) */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-base font-medium text-green-700">نجاح (تم الشحن)</span>
            <span className="text-sm font-medium text-green-700">{shipped} ({successRate}%)</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${successRate}%` }}></div>
          </div>
        </div>
        
        {/* In Progress Rate */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-base font-medium text-blue-700">قيد المتابعة</span>
            <span className="text-sm font-medium text-blue-700">{inProgress} ({inProgressRate}%)</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: `${inProgressRate}%` }}></div>
          </div>
        </div>

        {/* Rejection Rate */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-base font-medium text-red-700">مرفوض</span>
            <span className="text-sm font-medium text-red-700">{rejected} ({rejectionRate}%)</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-red-500 h-2.5 rounded-full" style={{ width: `${rejectionRate}%` }}></div>
          </div>
        </div>
        
        {/* No Answer Rate */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-base font-medium text-yellow-700">لم يرد</span>
            <span className="text-sm font-medium text-yellow-700">{noAnswer} ({noAnswerRate}%)</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div className="bg-yellow-400 h-2.5 rounded-full" style={{ width: `${noAnswerRate}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportCard; 