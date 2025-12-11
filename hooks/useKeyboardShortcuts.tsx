import React, { useEffect, useCallback } from 'react';

type KeyHandler = (event: KeyboardEvent) => void;

interface ShortcutConfig {
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
    handler: KeyHandler;
    description?: string;
    preventDefault?: boolean;
}

interface UseKeyboardShortcutsOptions {
    enabled?: boolean;
    target?: 'window' | 'document';
}

/**
 * Hook لإدارة اختصارات لوحة المفاتيح
 * 
 * @example
 * ```typescript
 * useKeyboardShortcuts([
 *   { key: 's', ctrl: true, handler: handleSave, description: 'حفظ' },
 *   { key: 'f', ctrl: true, handler: handleSearch, description: 'بحث' },
 *   { key: 'Escape', handler: handleClose, description: 'إغلاق' }
 * ]);
 * ```
 */
export function useKeyboardShortcuts(
    shortcuts: ShortcutConfig[],
    options: UseKeyboardShortcutsOptions = {}
) {
    const { enabled = true, target = 'window' } = options;

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (!enabled) return;

        // تجاهل الاختصارات عند الكتابة في input أو textarea
        const activeElement = document.activeElement;
        const isInputActive = activeElement instanceof HTMLInputElement ||
            activeElement instanceof HTMLTextAreaElement ||
            activeElement?.getAttribute('contenteditable') === 'true';

        for (const shortcut of shortcuts) {
            const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
            const ctrlMatches = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey;
            const shiftMatches = shortcut.shift ? event.shiftKey : !event.shiftKey;
            const altMatches = shortcut.alt ? event.altKey : !event.altKey;

            if (keyMatches && ctrlMatches && shiftMatches && altMatches) {
                // السماح ببعض الاختصارات حتى في inputs
                const alwaysAllow = ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5'];

                if (isInputActive && !alwaysAllow.includes(shortcut.key) && !shortcut.ctrl) {
                    continue;
                }

                if (shortcut.preventDefault !== false) {
                    event.preventDefault();
                }

                shortcut.handler(event);
                return;
            }
        }
    }, [shortcuts, enabled]);

    useEffect(() => {
        const targetElement = target === 'window' ? window : document;

        targetElement.addEventListener('keydown', handleKeyDown as EventListener);

        return () => {
            targetElement.removeEventListener('keydown', handleKeyDown as EventListener);
        };
    }, [handleKeyDown, target]);
}

/**
 * اختصارات شائعة جاهزة للاستخدام
 */
export const commonShortcuts = {
    save: (handler: KeyHandler): ShortcutConfig => ({
        key: 's',
        ctrl: true,
        handler,
        description: 'حفظ (Ctrl+S)'
    }),

    search: (handler: KeyHandler): ShortcutConfig => ({
        key: 'f',
        ctrl: true,
        handler,
        description: 'بحث (Ctrl+F)'
    }),

    close: (handler: KeyHandler): ShortcutConfig => ({
        key: 'Escape',
        handler,
        description: 'إغلاق (Esc)'
    }),

    refresh: (handler: KeyHandler): ShortcutConfig => ({
        key: 'r',
        ctrl: true,
        handler,
        description: 'تحديث (Ctrl+R)'
    }),

    newItem: (handler: KeyHandler): ShortcutConfig => ({
        key: 'n',
        ctrl: true,
        handler,
        description: 'جديد (Ctrl+N)'
    }),

    delete: (handler: KeyHandler): ShortcutConfig => ({
        key: 'Delete',
        handler,
        description: 'حذف (Delete)'
    }),

    selectAll: (handler: KeyHandler): ShortcutConfig => ({
        key: 'a',
        ctrl: true,
        handler,
        description: 'تحديد الكل (Ctrl+A)'
    }),

    undo: (handler: KeyHandler): ShortcutConfig => ({
        key: 'z',
        ctrl: true,
        handler,
        description: 'تراجع (Ctrl+Z)'
    }),

    help: (handler: KeyHandler): ShortcutConfig => ({
        key: '?',
        shift: true,
        handler,
        description: 'مساعدة (?)'
    })
};

/**
 * مكون لعرض قائمة الاختصارات المتاحة
 */
export function ShortcutsHelp({ shortcuts }: { shortcuts: ShortcutConfig[] }) {
    return (
        <div className="bg-white rounded-lg shadow-lg p-4 max-w-md" dir="rtl">
            <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span>⌨️</span>
                <span>اختصارات لوحة المفاتيح</span>
            </h3>
            <div className="space-y-2">
                {shortcuts.filter(s => s.description).map((shortcut, index) => (
                    <div key={index} className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">{shortcut.description?.split('(')[0]}</span>
                        <kbd className="px-2 py-1 bg-gray-100 rounded text-xs font-mono text-gray-700">
                            {formatShortcut(shortcut)}
                        </kbd>
                    </div>
                ))}
            </div>
        </div>
    );
}

function formatShortcut(shortcut: ShortcutConfig): string {
    const parts: string[] = [];
    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.shift) parts.push('Shift');
    if (shortcut.alt) parts.push('Alt');
    parts.push(shortcut.key.toUpperCase());
    return parts.join(' + ');
}

export default useKeyboardShortcuts;
export type { ShortcutConfig, KeyHandler };
