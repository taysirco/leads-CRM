import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import ConfirmModal, { ModalVariant } from '../components/ui/ConfirmModal';

interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: ModalVariant;
}

interface ConfirmContextType {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
    confirmDanger: (title: string, message: string) => Promise<boolean>;
    confirmWarning: (title: string, message: string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

interface ConfirmState extends ConfirmOptions {
    isOpen: boolean;
    resolve: ((value: boolean) => void) | null;
}

/**
 * مزود سياق نوافذ التأكيد
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<ConfirmState>({
        isOpen: false,
        title: '',
        message: '',
        variant: 'info',
        resolve: null
    });

    const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setState({
                isOpen: true,
                resolve,
                ...options
            });
        });
    }, []);

    const confirmDanger = useCallback((title: string, message: string): Promise<boolean> => {
        return confirm({
            title,
            message,
            variant: 'danger',
            confirmText: 'حذف',
            cancelText: 'إلغاء'
        });
    }, [confirm]);

    const confirmWarning = useCallback((title: string, message: string): Promise<boolean> => {
        return confirm({
            title,
            message,
            variant: 'warning',
            confirmText: 'متابعة',
            cancelText: 'إلغاء'
        });
    }, [confirm]);

    const handleClose = useCallback(() => {
        if (state.resolve) {
            state.resolve(false);
        }
        setState(prev => ({ ...prev, isOpen: false, resolve: null }));
    }, [state.resolve]);

    const handleConfirm = useCallback(() => {
        if (state.resolve) {
            state.resolve(true);
        }
        setState(prev => ({ ...prev, isOpen: false, resolve: null }));
    }, [state.resolve]);

    return (
        <ConfirmContext.Provider value={{ confirm, confirmDanger, confirmWarning }}>
            {children}
            <ConfirmModal
                isOpen={state.isOpen}
                onClose={handleClose}
                onConfirm={handleConfirm}
                title={state.title}
                message={state.message}
                confirmText={state.confirmText}
                cancelText={state.cancelText}
                variant={state.variant}
            />
        </ConfirmContext.Provider>
    );
}

/**
 * Hook لاستخدام نوافذ التأكيد
 * 
 * @example
 * ```typescript
 * const { confirm, confirmDanger } = useConfirm();
 * 
 * // استخدام بسيط
 * const handleDelete = async () => {
 *   const confirmed = await confirmDanger('حذف العنصر', 'هل أنت متأكد من الحذف؟');
 *   if (confirmed) {
 *     await deleteItem();
 *   }
 * };
 * 
 * // استخدام متقدم
 * const handleAction = async () => {
 *   const confirmed = await confirm({
 *     title: 'تأكيد العملية',
 *     message: 'هل تريد المتابعة؟',
 *     variant: 'warning',
 *     confirmText: 'نعم',
 *     cancelText: 'لا'
 *   });
 *   if (confirmed) {
 *     // تنفيذ العملية
 *   }
 * };
 * ```
 */
export function useConfirm(): ConfirmContextType {
    const context = useContext(ConfirmContext);

    if (!context) {
        throw new Error('useConfirm must be used within a ConfirmProvider');
    }

    return context;
}

export default ConfirmContext;
