import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// أنواع الإشعارات
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message?: string;
    duration?: number;
    dismissible?: boolean;
}

interface ToastContextType {
    toasts: Toast[];
    addToast: (toast: Omit<Toast, 'id'>) => string;
    removeToast: (id: string) => void;
    clearToasts: () => void;
    // اختصارات سريعة
    success: (title: string, message?: string) => string;
    error: (title: string, message?: string) => string;
    warning: (title: string, message?: string) => string;
    info: (title: string, message?: string) => string;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// إعدادات افتراضية
const DEFAULT_DURATION = 5000; // 5 ثواني

/**
 * مزود سياق الإشعارات
 */
export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    // إضافة إشعار جديد
    const addToast = useCallback((toast: Omit<Toast, 'id'>): string => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const newToast: Toast = {
            id,
            duration: DEFAULT_DURATION,
            dismissible: true,
            ...toast
        };

        setToasts(prev => [...prev, newToast]);

        // إزالة تلقائية بعد المدة المحددة
        if (newToast.duration && newToast.duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, newToast.duration);
        }

        return id;
    }, []);

    // إزالة إشعار
    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    // مسح جميع الإشعارات
    const clearToasts = useCallback(() => {
        setToasts([]);
    }, []);

    // اختصارات سريعة
    const success = useCallback((title: string, message?: string) => {
        return addToast({ type: 'success', title, message });
    }, [addToast]);

    const error = useCallback((title: string, message?: string) => {
        return addToast({ type: 'error', title, message, duration: 8000 }); // أطول للأخطاء
    }, [addToast]);

    const warning = useCallback((title: string, message?: string) => {
        return addToast({ type: 'warning', title, message, duration: 6000 });
    }, [addToast]);

    const info = useCallback((title: string, message?: string) => {
        return addToast({ type: 'info', title, message });
    }, [addToast]);

    return (
        <ToastContext.Provider value={{
            toasts,
            addToast,
            removeToast,
            clearToasts,
            success,
            error,
            warning,
            info
        }}>
            {children}
        </ToastContext.Provider>
    );
}

/**
 * Hook لاستخدام نظام الإشعارات
 */
export function useToast(): ToastContextType {
    const context = useContext(ToastContext);

    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }

    return context;
}

export default ToastContext;
