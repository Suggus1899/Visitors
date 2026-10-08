import { useEffect, useCallback } from 'react';

interface ShortcutHandlers {
    onNewVisit?: () => void;
    onEscape?: () => void;
    onSearch?: () => void;
}

export const useKeyboardShortcuts = (handlers: ShortcutHandlers) => {
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        // Don't trigger if user is typing in an input
        const target = event.target as HTMLElement;
        const isInputFocused = target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable;

        // Ctrl/Cmd + N: New visit (focus cédula input)
        if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
            event.preventDefault();
            handlers.onNewVisit?.();
            return;
        }

        // Ctrl/Cmd + K: Focus search
        if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
            event.preventDefault();
            handlers.onSearch?.();
            return;
        }

        // Escape: Close/Clear (only if not in input)
        if (event.key === 'Escape') {
            handlers.onEscape?.();
            return;
        }

        // / to focus search (only if not already in input)
        if (event.key === '/' && !isInputFocused) {
            event.preventDefault();
            handlers.onSearch?.();
            return;
        }
    }, [handlers]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
};


