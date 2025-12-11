import React from 'react';
import { useToast } from '../../contexts/ToastContext';
import ToastItem from './ToastItem';

/**
 * حاوية الإشعارات
 * تعرض جميع الإشعارات في الزاوية العلوية اليسرى
 */
function ToastContainer() {
    const { toasts, removeToast } = useToast();

    if (toasts.length === 0) {
        return null;
    }

    return (
        <div
            className="fixed top-4 left-4 z-[9999] flex flex-col gap-3"
            dir="rtl"
            aria-live="polite"
            aria-label="الإشعارات"
        >
            {toasts.map(toast => (
                <ToastItem
                    key={toast.id}
                    toast={toast}
                    onDismiss={removeToast}
                />
            ))}
        </div>
    );
}

export default ToastContainer;
