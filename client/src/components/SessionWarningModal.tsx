

export const SessionWarningModal = ({
    show,
    timeLeft,
    onExtend,
    onLogout
}: {
    show: boolean;
    timeLeft: number;
    onExtend: () => void;
    onLogout: () => void;
}) => {
    if (!show) return null;

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="panel-tech rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
                <div className="text-center">
                    <div className="w-16 h-16 bg-[color:var(--surface-2)] border border-[color:var(--border-1)] rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-[color:var(--accent-0)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-display text-[color:var(--text-1)] mb-2">Sesión por expirar</h3>
                    <p className="text-[color:var(--text-2)] mb-4">
                        Tu sesión expirará en <span className="font-semibold text-red-400">{minutes}:{seconds.toString().padStart(2, '0')}</span> minutos por inactividad.
                    </p>
                    <div className="flex gap-3 justify-center">
                        <button
                            onClick={onLogout}
                            className="btn-ghost px-4 py-2"
                        >
                            Cerrar sesión
                        </button>
                        <button
                            onClick={onExtend}
                            className="btn-tech px-4 py-2"
                        >
                            Continuar trabajando
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
