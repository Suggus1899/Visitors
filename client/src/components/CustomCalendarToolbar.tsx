import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';
import CalendarIcon from 'lucide-react/dist/esm/icons/calendar';
// import { ToolbarProps } from 'react-big-calendar';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomCalendarToolbar = (props: any) => {
    const { label, onNavigate, onView, view } = props;

    // Custom navigation handlers
    const goToBack = () => {
        onNavigate('PREV');
    };

    const goToNext = () => {
        onNavigate('NEXT');
    };

    const goToCurrent = () => {
        onNavigate('TODAY');
    };

    // Custom view handler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const goToView = (viewName: any) => {
        onView(viewName);
    };

    return (
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-[color:var(--surface-2)] p-2 rounded-xl border border-[color:var(--border-1)]">
            {/* Left: Navigation */}
            <div className="flex items-center gap-2">
                <button
                    onClick={goToCurrent}
                    className="px-4 py-1.5 text-sm font-semibold text-[color:var(--text-2)] bg-[color:var(--surface-1)] hover:bg-[color:var(--surface-2)] rounded-full transition-colors flex items-center gap-2 border border-[color:var(--border-1)]"
                >
                    <CalendarIcon size={14} />
                    Hoy
                </button>
                <div className="flex items-center bg-[color:var(--surface-1)] border border-[color:var(--border-1)] rounded-full p-0.5 shadow-sm ml-2">
                    <button
                        onClick={goToBack}
                        className="p-1.5 hover:bg-[color:var(--surface-2)] rounded-full text-[color:var(--text-3)] transition-colors"
                        title="Anterior"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <button
                        onClick={goToNext}
                        className="p-1.5 hover:bg-[color:var(--surface-2)] rounded-full text-[color:var(--text-3)] transition-colors"
                        title="Siguiente"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>
            </div>

            {/* Center: Label */}
            <span className="text-xl font-display text-[color:var(--text-1)] uppercase tracking-[0.18em]">
                {label}
            </span>

            {/* Right: View Selector (Segmented Control) */}
            <div className="flex bg-[color:var(--surface-1)] p-1 rounded-lg border border-[color:var(--border-1)]">
                {[
                    { id: 'month', label: 'Mes' },
                    { id: 'week', label: 'Semana' },
                    { id: 'day', label: 'Día' },
                    { id: 'agenda', label: 'Agenda' }
                ].map((v) => (
                    <button
                        key={v.id}
                        onClick={() => goToView(v.id)}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                            view === v.id
                                ? 'bg-[color:var(--surface-2)] text-[color:var(--accent-0)] shadow-sm'
                                : 'text-[color:var(--text-3)] hover:text-[color:var(--text-1)] hover:bg-[color:var(--surface-2)]/60'
                        }`}
                    >
                        {v.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default CustomCalendarToolbar;
