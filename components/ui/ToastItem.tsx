import React, { useEffect, useState } from 'react';
import type { Toast, ToastType } from '../../contexts/ToastContext';

interface ToastItemProps {
    toast: Toast;
    onDismiss: (id: string) => void;
}

// أيقونات وألوان لكل نوع
const toastConfig: Record<ToastType, {
    bgColor: string;
    borderColor: string;
    iconBg: string;
    iconColor: string;
    icon: React.ReactNode;
}> = {
    success: {
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        iconBg: 'bg-green-100',
        iconColor: 'text-green-600',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
        )
    },
    error: {
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        iconBg: 'bg-red-100',
        iconColor: 'text-red-600',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
        )
    },
    warning: {
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200',
        iconBg: 'bg-yellow-100',
        iconColor: 'text-yellow-600',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        )
    },
    info: {
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        iconBg: 'bg-blue-100',
        iconColor: 'text-blue-600',
        icon: (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        )
    }
};

/**
 * مكون الإشعار الفردي
 */
function ToastItem({ toast, onDismiss }: ToastItemProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);

    const config = toastConfig[toast.type];

    useEffect(() => {
        // تأخير صغير للـ animation
        const timer = setTimeout(() => setIsVisible(true), 10);
        return () => clearTimeout(timer);
    }, []);

    const handleDismiss = () => {
        setIsLeaving(true);
        setTimeout(() => onDismiss(toast.id), 300);
    };

    return (
        <div
            className={`
        transform transition-all duration-300 ease-out
        ${isVisible && !isLeaving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
        >
            <div className={`
        flex items-start gap-3 p-4 rounded-lg border shadow-lg
        ${config.bgColor} ${config.borderColor}
        min-w-[300px] max-w-[400px]
      `}>
                {/* الأيقونة */}
                <div className={`flex-shrink-0 p-1.5 rounded-full ${config.iconBg}`}>
                    <span className={config.iconColor}>{config.icon}</span>
                </div>

                {/* المحتوى */}
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{toast.title}</p>
                    {toast.message && (
                        <p className="text-gray-600 text-sm mt-0.5">{toast.message}</p>
                    )}
                </div>

                {/* زر الإغلاق */}
                {toast.dismissible && (
                    <button
                        onClick={handleDismiss}
                        className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
}

export default ToastItem;
