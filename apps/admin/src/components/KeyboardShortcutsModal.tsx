'use client';

import { useEffect } from 'react';
import X from 'lucide-react/dist/esm/icons/x';
import Keyboard from 'lucide-react/dist/esm/icons/keyboard';

interface KeyboardShortcutsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SHORTCUTS: { keys: string; description: string }[] = [
    { keys: 'g d', description: 'Go to Dashboard' },
    { keys: 'g v', description: 'Go to Visitantes' },
    { keys: 'g i', description: 'Go to Visitas' },
    { keys: 'g c', description: 'Go to Calendario' },
    { keys: 'g r', description: 'Go to Reportes' },
    { keys: 'g s', description: 'Go to Estadísticas' },
    { keys: 'g b', description: 'Go to Backups' },
    { keys: 'g a', description: 'Go to Logs de Actividad' },
    { keys: 'g t', description: 'Go to Configuración' },
    { keys: '?', description: 'Show this help' },
    { keys: 'Esc', description: 'Close dialogs / modals' },
];

const KeyboardShortcutsModal = ({ isOpen, onClose }: KeyboardShortcutsModalProps) => {
    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="panel-tech rounded-2xl max-w-lg w-full p-6 relative"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label="Keyboard shortcuts"
            >
                <div className="absolute inset-x-0 top-0 h-0.5 bg-[color:var(--accent-0)] rounded-t-2xl" />

                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-[color:var(--accent-0)]/10">
                            <Keyboard size={20} className="text-[color:var(--accent-0)]" />
                        </div>
                        <h3 className="text-lg font-display uppercase tracking-[0.15em] text-[color:var(--text-1)]">
                            Keyboard Shortcuts
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full text-[color:var(--text-3)] hover:text-[color:var(--text-1)] hover:bg-[color:var(--surface-2)] transition-colors"
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="space-y-2">
                    {SHORTCUTS.map((shortcut, i) => (
                        <div
                            key={i}
                            className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[color:var(--surface-2)] transition-colors"
                        >
                            <span className="text-sm text-[color:var(--text-2)]">{shortcut.description}</span>
                            <div className="flex items-center gap-1">
                                {shortcut.keys.split(' ').map((key, j) => (
                                    <kbd
                                        key={j}
                                        className="px-2 py-1 text-xs font-mono font-semibold bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded text-[color:var(--text-1)]"
                                    >
                                        {key}
                                    </kbd>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <p className="text-xs text-[color:var(--text-3)] mt-4 text-center">
                    Press <kbd className="px-1.5 py-0.5 text-xs bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded">Esc</kbd> to close
                </p>
            </div>
        </div>
    );
};

export default KeyboardShortcutsModal;
