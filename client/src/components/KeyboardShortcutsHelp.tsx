import React from 'react';

export const KeyboardShortcutsHelp: React.FC<{ show: boolean; onClose: () => void }> = ({ show, onClose }) => {
    if (!show) return null;

    const shortcuts = [
        { keys: ['Ctrl', 'N'], description: 'Nueva visita (enfocar cédula)' },
        { keys: ['Ctrl', 'K'], description: 'Buscar visitante' },
        { keys: ['/'], description: 'Enfocar búsqueda' },
        { keys: ['Esc'], description: 'Cerrar modal / Limpiar' },
    ];

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="panel-tech rounded-xl shadow-2xl p-6 max-w-md w-full mx-4"
                onClick={e => e.stopPropagation()}
            >
                <h3 className="text-lg font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] mb-4">Atajos de Teclado</h3>
                <div className="space-y-3">
                    {shortcuts.map((s, i) => (
                        <div key={i} className="flex items-center justify-between">
                            <span className="text-[color:var(--text-2)]">{s.description}</span>
                            <div className="flex gap-1">
                                {s.keys.map((key, j) => (
                                    <kbd
                                        key={j}
                                        className="px-2 py-1 bg-[color:var(--surface-2)] rounded text-sm font-mono text-[color:var(--text-2)] border border-[color:var(--border-1)]"
                                    >
                                        {key}
                                    </kbd>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <button
                    onClick={onClose}
                    className="mt-6 w-full btn-tech"
                >
                    Entendido
                </button>
            </div>
        </div>
    );
};
