// نظام ألوان موحد للحالات في جميع أنحاء التطبيق

export interface StatusConfig {
  color: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  icon: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  description: string;
}

export const STATUS_CONFIGS: Record<string, StatusConfig> = {
  // حالات حرجة - أحمر
  'عودة اتصال': {
    color: 'bg-red-600',
    bgColor: 'bg-red-50',
    textColor: 'text-red-800',
    borderColor: 'border-red-200',
    icon: '📞',
    priority: 'critical',
    description: 'يحتاج اتصال عاجل'
  },
  'اعتراض': {
    color: 'bg-red-700',
    bgColor: 'bg-red-50',
    textColor: 'text-red-900',
    borderColor: 'border-red-300',
    icon: '⚠️',
    priority: 'critical',
    description: 'اعتراض من العميل'
  },
  'شكوى': {
    color: 'bg-red-800',
    bgColor: 'bg-red-50',
    textColor: 'text-red-900',
    borderColor: 'border-red-400',
    icon: '😠',
    priority: 'critical',
    description: 'شكوى تحتاج معالجة فورية'
  },

  // حالات مهمة - برتقالي/أصفر
  'جديد': {
    color: 'bg-blue-500',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-800',
    borderColor: 'border-blue-200',
    icon: '🆕',
    priority: 'high',
    description: 'طلب جديد يحتاج معالجة'
  },
  'تم التأكيد': {
    color: 'bg-green-500',
    bgColor: 'bg-green-50',
    textColor: 'text-green-800',
    borderColor: 'border-green-200',
    icon: '✅',
    priority: 'high',
    description: 'تم تأكيد الطلب'
  },
  'إلغاء': {
    color: 'bg-orange-600',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-800',
    borderColor: 'border-orange-200',
    icon: '🚫',
    priority: 'high',
    description: 'تم إلغاء الطلب'
  },
  'معاد جدولة': {
    color: 'bg-yellow-500',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-800',
    borderColor: 'border-yellow-200',
    icon: '📅',
    priority: 'high',
    description: 'تم إعادة جدولة الطلب'
  },

  // حالات عادية - أزرق/بنفسجي
  'تم الاتصال': {
    color: 'bg-blue-400',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    icon: '📞',
    priority: 'normal',
    description: 'تم الاتصال بالعميل'
  },
  'مهتم': {
    color: 'bg-indigo-500',
    bgColor: 'bg-indigo-50',
    textColor: 'text-indigo-800',
    borderColor: 'border-indigo-200',
    icon: '👍',
    priority: 'normal',
    description: 'العميل مهتم بالمنتج'
  },
  'يفكر': {
    color: 'bg-purple-400',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
    icon: '🤔',
    priority: 'normal',
    description: 'العميل يفكر في الطلب'
  },
  'متابعة': {
    color: 'bg-cyan-500',
    bgColor: 'bg-cyan-50',
    textColor: 'text-cyan-800',
    borderColor: 'border-cyan-200',
    icon: '📋',
    priority: 'normal',
    description: 'يحتاج متابعة'
  },
  'تم الشحن': {
    color: 'bg-purple-600',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-800',
    borderColor: 'border-purple-200',
    icon: '🚚',
    priority: 'normal',
    description: 'تم شحن الطلب'
  },

  // حالات منخفضة - رمادي/أخضر فاتح
  'لا يرد': {
    color: 'bg-gray-400',
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-200',
    icon: '📵',
    priority: 'low',
    description: 'العميل لا يرد'
  },
  'رقم خطأ': {
    color: 'bg-gray-500',
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-800',
    borderColor: 'border-gray-300',
    icon: '📞',
    priority: 'low',
    description: 'رقم هاتف خطأ'
  },
  'مرفوض': {
    color: 'bg-red-400',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
    icon: '❌',
    priority: 'low',
    description: 'تم رفض الطلب'
  },
  'مكتمل': {
    color: 'bg-green-600',
    bgColor: 'bg-green-50',
    textColor: 'text-green-800',
    borderColor: 'border-green-200',
    icon: '🎉',
    priority: 'low',
    description: 'تم إكمال الطلب بنجاح'
  }
};

// الحصول على تكوين الحالة
export const getStatusConfig = (status: string): StatusConfig => {
  return STATUS_CONFIGS[status] || {
    color: 'bg-gray-400',
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-200',
    icon: '📝',
    priority: 'normal',
    description: status
  };
};

// الحصول على لون الحالة فقط
export const getStatusColor = (status: string): string => {
  return getStatusConfig(status).color;
};

// الحصول على أيقونة الحالة
export const getStatusIcon = (status: string): string => {
  return getStatusConfig(status).icon;
};

// الحصول على أولوية الحالة
export const getStatusPriority = (status: string): 'low' | 'normal' | 'high' | 'critical' => {
  return getStatusConfig(status).priority;
};

// ترتيب الحالات حسب الأولوية
export const sortStatusesByPriority = (statuses: string[]): string[] => {
  const priorityOrder = ['critical', 'high', 'normal', 'low'];
  
  return statuses.sort((a, b) => {
    const priorityA = getStatusPriority(a);
    const priorityB = getStatusPriority(b);
    
    return priorityOrder.indexOf(priorityA) - priorityOrder.indexOf(priorityB);
  });
};

// الحصول على جميع الحالات مرتبة حسب الأولوية
export const getAllStatusesSorted = (): string[] => {
  return sortStatusesByPriority(Object.keys(STATUS_CONFIGS));
};

// الحصول على الحالات حسب الأولوية
export const getStatusesByPriority = (priority: 'low' | 'normal' | 'high' | 'critical'): string[] => {
  return Object.entries(STATUS_CONFIGS)
    .filter(([_, config]) => config.priority === priority)
    .map(([status, _]) => status);
};

// تصدير الألوان للاستخدام في CSS Classes
export const STATUS_COLORS = Object.entries(STATUS_CONFIGS).reduce((acc, [status, config]) => {
  acc[status] = {
    bg: config.color.replace('bg-', ''),
    text: config.textColor.replace('text-', ''),
    border: config.borderColor.replace('border-', ''),
    bgLight: config.bgColor.replace('bg-', '')
  };
  return acc;
}, {} as Record<string, { bg: string; text: string; border: string; bgLight: string }>);
