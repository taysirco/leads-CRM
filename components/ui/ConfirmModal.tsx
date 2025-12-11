import React, { useEffect, useRef, useCallback } from 'react';

type ModalVariant = 'info' | 'warning' | 'danger' | 'success';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: ModalVariant;
    isLoading?: boolean;
}

const variantConfig: Record<ModalVariant, {
    iconBg: string;
    iconColor: string;
    buttonBg: string;
    buttonHover: string;
    icon: React.ReactNode;
}> = {
    info: {
        iconBg: 'bg-blue-100',
        iconColor: 'text-blue-600',
        buttonBg: 'bg-blue-600',
        buttonHover: 'hover:bg-blue-700',
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        )
    },
    warning: {
        iconBg: 'bg-yellow-100',
        iconColor: 'text-yellow-600',
        buttonBg: 'bg-yellow-600',
        buttonHover: 'hover:bg-yellow-700',
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        )
    },
    danger: {
        iconBg: 'bg-red-100',
        iconColor: 'text-red-600',
        buttonBg: 'bg-red-600',
        buttonHover: 'hover:bg-red-700',
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
        )
    },
    success: {
        iconBg: 'bg-green-100',
        iconColor: 'text-green-600',
        buttonBg: 'bg-green-600',
        buttonHover: 'hover:bg-green-700',
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
        )
    }
};

/**
 * نافذة تأكيد مخصصة لاستبدال window.confirm
 */
function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'تأكيد',
    cancelText = 'إلغاء',
    variant = 'info',
    isLoading = false
}: ConfirmModalProps) {
    const confirmButtonRef = useRef<HTMLButtonElement>(null);
    const config = variantConfig[variant];

    // التركيز على زر التأكيد عند الفتح
    useEffect(() => {
        if (isOpen && confirmButtonRef.current) {
            confirmButtonRef.current.focus();
        }
    }, [isOpen]);

    // إغلاق بـ Escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    // منع التمرير عند الفتح
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-gray-900 bg-opacity-50 transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div
                className="relative bg-white rounded-xl shadow-2xl max-w-md w-full transform transition-all animate-modal-enter"
                dir="rtl"
            >
                <div className="p-6">
                    {/* Icon & Title */}
                    <div className="flex items-start gap-4">
                        <div className={`flex-shrink-0 p-3 rounded-full ${config.iconBg}`}>
                            <span className={config.iconColor}>{config.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3
                                id="modal-title"
                                className="text-lg font-bold text-gray-900 mb-2"
                            >
                                {title}
                            </h3>
                            <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">
                                {message}
                            </p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isLoading}
                            className="flex-1 px-4 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
                        >
                            {cancelText}
                        </button>
                        <button
                            ref={confirmButtonRef}
                            type="button"
                            onClick={onConfirm}
                            disabled={isLoading}
                            className={`flex-1 px-4 py-2.5 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${config.buttonBg} ${config.buttonHover}`}
                        >
                            {isLoading && (
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                            )}
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>

            {/* Animation styles */}
            <style jsx>{`
        @keyframes modal-enter {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .animate-modal-enter {
          animation: modal-enter 0.2s ease-out;
        }
      `}</style>
        </div>
    );
}

export default ConfirmModal;
export type { ConfirmModalProps, ModalVariant };
