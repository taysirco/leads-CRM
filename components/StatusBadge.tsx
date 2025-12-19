interface StatusBadgeProps {
  status: string;
}

const statusConfig: Record<string, { color: string; bgColor: string }> = {
  'جديد': { color: 'text-blue-700', bgColor: 'bg-blue-100' },
  'تم التأكيد': { color: 'text-green-700', bgColor: 'bg-green-100' },
  'في انتظار تأكيد العميل': { color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  'رفض التأكيد': { color: 'text-red-700', bgColor: 'bg-red-100' },
  'لم يرد': { color: 'text-gray-700', bgColor: 'bg-gray-100' },
  'تم التواصل معه واتساب': { color: 'text-purple-700', bgColor: 'bg-purple-100' },
  'طلب مصاريف الشحن': { color: 'text-orange-700', bgColor: 'bg-orange-100' },
  'تم الشحن': { color: 'text-indigo-700', bgColor: 'bg-indigo-100' },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || { color: 'text-gray-700', bgColor: 'bg-gray-100' };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color} ${config.bgColor}`}>
      {status || 'جديد'}
    </span>
  );
} 