import { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { useAuth } from './hooks/useAuth';
import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import AdminDashboard from './components/AdminDashboard';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import VisitForm from './components/VisitForm';
import ActiveVisits from './components/ActiveVisits';
import WaitingVisits from './components/WaitingVisits';
import IntermittentVisits from './components/IntermittentVisits';
import VisitorAdmin from './components/VisitorAdmin';
import AuditDashboard from './components/AuditDashboard';
import LayoutDashboard from 'lucide-react/dist/esm/icons/layout-dashboard';
import HelpCircle from 'lucide-react/dist/esm/icons/help-circle';
import Keyboard from 'lucide-react/dist/esm/icons/keyboard';
import Shield from 'lucide-react/dist/esm/icons/shield';
import Clock from 'lucide-react/dist/esm/icons/clock';
import Activity from 'lucide-react/dist/esm/icons/activity';
import ArrowRightLeft from 'lucide-react/dist/esm/icons/arrow-right-left';
import Users from 'lucide-react/dist/esm/icons/users';
import { startGuidedTour } from './utils/guidedTour';
import { useSessionTimeout } from './hooks/useSessionTimeout';
import { SessionWarningModal } from './components/SessionWarningModal';
import { PasswordChangeModal } from './components/PasswordChangeModal';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { Toaster } from 'react-hot-toast';
import { Header } from './components/Header';
import { useActiveVisitsQuery, useIntermittentVisitsQuery, useInvalidateVisitQueries } from './hooks/useVisitQueries';
import { useVisitEvents } from './hooks/useVisitEvents';

// Main Operations View (Guard + Admin)
const OperationsView = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [activeTab, setActiveTab] = useState<'active' | 'waiting' | 'intermittent' | 'visitor-admin'>('active');
    const { logout, user } = useAuth();
    const { showWarning, timeLeft, extendSession, logout: sessionLogout } = useSessionTimeout();
    const navigate = useNavigate();
    const searchInputRef = useRef<HTMLInputElement>(null);
    const { isUsingFallbackPolling } = useVisitEvents();
    const invalidateVisitQueries = useInvalidateVisitQueries();
    const {
        data: visits = [],
        isFetching: isVisitsLoading,
    } = useActiveVisitsQuery({
        refetchInterval: isUsingFallbackPolling ? 15_000 : false,
    });

    const {
        data: intermittentVisits = [],
        isFetching: isIntermittentLoading,
    } = useIntermittentVisitsQuery({
        refetchInterval: isUsingFallbackPolling ? 15_000 : false,
    });

    useKeyboardShortcuts({
        onNewVisit: () => {
            const cedulaInput = document.querySelector('[data-tour="visit-form"] input[type="text"]');
            if (cedulaInput instanceof HTMLInputElement) {
                cedulaInput.focus();
            }
        },
        onSearch: () => {
            searchInputRef.current?.focus();
        },
        onEscape: () => {
            setSearchQuery('');
            setShowShortcuts(false);
            const activeElement = document.activeElement;
            if (activeElement instanceof HTMLElement) {
                activeElement.blur();
            }
        }
    });

    useEffect(() => {
        if (user?.username === 'demo') {
            setTimeout(() => startGuidedTour(), 500);
        }
    }, [user]);

    const filteredVisits = visits.filter(visit => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        const name = `${visit.Visitor?.first_name || ''} ${visit.Visitor?.last_name || ''}`.toLowerCase();
        const cedula = (visit.Visitor?.cedula || '').toLowerCase();
        const company = (visit.Visitor?.company || '').toLowerCase();
        return name.includes(query) || cedula.includes(query) || company.includes(query);
    });

    return (
        <div className="min-h-screen bg-[color:var(--bg-0)] text-[color:var(--text-1)] font-sans relative overflow-hidden transition-colors duration-300">
            <div className="absolute inset-0 bg-blueprint opacity-30 pointer-events-none" />
            <div className="absolute inset-0 bg-noise opacity-20 mix-blend-soft-light pointer-events-none" />
            <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[color:var(--accent-2)] opacity-15 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-48 -right-40 h-[28rem] w-[28rem] rounded-full bg-[color:var(--accent-0)] opacity-12 blur-3xl pointer-events-none" />

            <Toaster position="top-center" />
            <KeyboardShortcutsHelp show={showShortcuts} onClose={() => setShowShortcuts(false)} />

            <Header user={user} logout={logout}>
                <button
                    onClick={() => setShowShortcuts(true)}
                    className="p-2 text-[color:var(--text-3)] hover:text-[color:var(--text-1)] rounded-full hover:bg-[color:var(--surface-2)] transition-colors"
                    title="Atajos de teclado"
                >
                    <Keyboard size={18} />
                </button>

                <button
                    onClick={startGuidedTour}
                    className="p-2 text-[color:var(--text-3)] hover:text-[color:var(--text-1)] rounded-full hover:bg-[color:var(--surface-2)] transition-colors"
                    title="Ver tutorial"
                >
                    <HelpCircle size={18} />
                </button>

                {user?.role === 'admin' && (
                    <button
                        data-tour="admin-btn"
                        onClick={() => navigate('/admin')}
                        className="bg-[color:var(--accent-1)] hover:bg-[color:var(--accent-0)] text-[#081116] px-3 py-1.5 rounded-md text-xs font-semibold tracking-[0.18em] uppercase flex items-center transition-colors"
                    >
                        <LayoutDashboard size={16} className="mr-1" /> Admin
                    </button>
                )}

                {(user?.role === 'admin' || user?.role === 'auditor') && (
                    <button
                        onClick={() => navigate('/audit')}
                        className="bg-transparent border border-[color:var(--accent-2)] text-[color:var(--accent-0)] hover:text-[color:var(--text-1)] hover:border-[color:var(--accent-0)] px-3 py-1.5 rounded-md text-xs font-semibold tracking-[0.18em] uppercase flex items-center transition-colors"
                    >
                        <Shield size={16} className="mr-1" /> Auditoría
                    </button>
                )}
            </Header>

            <main className="container mx-auto px-4 py-8 relative z-10">
                <div className="flex flex-col xl:flex-row gap-8">
                    <div className="w-full xl:w-1/3" data-tour="visit-form">
                        <VisitForm onVisitAdded={invalidateVisitQueries} />
                    </div>
                    <div className="w-full xl:w-2/3" data-tour="active-visits">

                        {/* Tabs Navigation */}
                        <div className="flex gap-4 mb-6 border-b border-[color:var(--border-1)]">
                            <button
                                onClick={() => setActiveTab('active')}
                                className={`pb-2 px-1 flex items-center gap-2 font-display uppercase tracking-wider text-sm transition-colors relative ${activeTab === 'active' ? 'text-[color:var(--accent-0)]' : 'text-[color:var(--text-3)] hover:text-[color:var(--text-2)]'}`}
                            >
                                <Activity size={16} /> Activas
                                {visits.length > 0 && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[color:var(--accent-2)] text-[color:var(--accent-0)]">{visits.length}</span>
                                )}
                                {activeTab === 'active' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[color:var(--accent-0)]" />}
                            </button>
                            <button
                                onClick={() => setActiveTab('waiting')}
                                className={`pb-2 px-1 flex items-center gap-2 font-display uppercase tracking-wider text-sm transition-colors relative ${activeTab === 'waiting' ? 'text-[color:var(--status-warning)]' : 'text-[color:var(--text-3)] hover:text-[color:var(--text-2)]'}`}
                            >
                                <Clock size={16} /> En Espera
                                {activeTab === 'waiting' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[color:var(--status-warning)]" />}
                            </button>
                            <button
                                onClick={() => setActiveTab('intermittent')}
                                className={`pb-2 px-1 flex items-center gap-2 font-display uppercase tracking-wider text-sm transition-colors relative ${activeTab === 'intermittent' ? 'text-amber-400' : 'text-[color:var(--text-3)] hover:text-[color:var(--text-2)]'}`}
                            >
                                <ArrowRightLeft size={16} /> Intermitencia
                                {intermittentVisits.length > 0 && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">{intermittentVisits.length}</span>
                                )}
                                {activeTab === 'intermittent' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-amber-400" />}
                            </button>
                            {user?.role === 'admin' && (
                                <button
                                    onClick={() => setActiveTab('visitor-admin')}
                                    className={`pb-2 px-1 flex items-center gap-2 font-display uppercase tracking-wider text-sm transition-colors relative ${activeTab === 'visitor-admin' ? 'text-[color:var(--accent-0)]' : 'text-[color:var(--text-3)] hover:text-[color:var(--text-2)]'}`}
                                >
                                    <Users size={16} /> Admin Visitantes
                                    {activeTab === 'visitor-admin' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[color:var(--accent-0)]" />}
                                </button>
                            )}
                        </div>

                        {activeTab === 'visitor-admin' ? (
                            <VisitorAdmin />
                        ) : activeTab === 'intermittent' ? (
                            <>
                                <h2 className="text-lg font-display uppercase tracking-[0.18em] text-amber-400 border-l-2 border-amber-400 pl-3 mb-4">
                                    Visitas Intermitentes
                                    <span className="ml-2 text-xs font-semibold text-[color:var(--text-3)]">
                                        ({intermittentVisits.length})
                                    </span>
                                </h2>
                                <IntermittentVisits
                                    visits={intermittentVisits}
                                    onReactivated={invalidateVisitQueries}
                                    loading={isIntermittentLoading && intermittentVisits.length === 0}
                                />
                            </>
                        ) : activeTab === 'active' ? (
                            <>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                    <h2 className="text-lg font-display uppercase tracking-[0.18em] text-[color:var(--text-1)] border-l-2 border-[color:var(--accent-0)] pl-3">
                                        Visitas Activas
                                        <span className="ml-2 text-xs font-semibold text-[color:var(--text-3)]">
                                            ({filteredVisits.length})
                                        </span>
                                    </h2>

                                    <div className="relative">
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            placeholder="Buscar... (Ctrl+K)"
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            className="input-tech text-sm pl-10 sm:w-72"
                                        />
                                        <svg
                                            className="absolute left-3 top-2.5 h-4 w-4 text-[color:var(--text-3)]"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        {searchQuery && (
                                            <button
                                                onClick={() => setSearchQuery('')}
                                                className="absolute right-3 top-2.5 text-[color:var(--text-3)] hover:text-[color:var(--text-1)]"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <ActiveVisits
                                    visits={filteredVisits}
                                    onCheckout={invalidateVisitQueries}
                                    loading={isVisitsLoading && filteredVisits.length === 0}
                                />
                            </>
                        ) : activeTab === 'waiting' ? (
                            <WaitingVisits
                                fallbackPollingMs={isUsingFallbackPolling ? 15_000 : false}
                                onVisitAdmitted={() => {
                                    setActiveTab('active');
                                    invalidateVisitQueries();
                                }}
                            />
                        ) : null}
                    </div>
                </div>
            </main>

            <SessionWarningModal
                show={showWarning}
                timeLeft={timeLeft}
                onExtend={extendSession}
                onLogout={sessionLogout}
            />
        </div>
    );
};



const AdminRoute = ({ children }: { children: JSX.Element }) => {
    const { user, loading } = useAuth();
    if (loading) return <div>Loading...</div>;
    if (user?.role !== 'admin') return <Navigate to="/" />;
    return children;
};

const SuperAdminRoute = ({ children }: { children: JSX.Element }) => {
    const { user, loading } = useAuth();
    if (loading) return <div>Loading...</div>;
    if (user?.role !== 'superadmin') return <Navigate to="/" />;
    return children;
};

const AuditRoute = ({ children }: { children: JSX.Element }) => {
    const { user, loading } = useAuth();
    if (loading) return <div>Loading...</div>;
    if (user?.role !== 'admin' && user?.role !== 'auditor' && user?.role !== 'superadmin') return <Navigate to="/" />;
    return children;
};

const OperationsRoute = ({ children }: { children: JSX.Element }) => {
    const { user, loading } = useAuth();
    if (loading) return <div>Loading...</div>;
    if (!user) return <Navigate to="/login" />;

    // Si es auditor, redirigir a su dashboard
    if (user.role === 'auditor') return <Navigate to="/audit" />;

    return children;
};

function AppRoutes() {
    const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);

    useEffect(() => {
        // Listen for password-change-required event globally
        const handlePasswordChangeRequired = () => {
            setShowPasswordChangeModal(true);
        };

        window.addEventListener('password-change-required', handlePasswordChangeRequired);

        return () => {
            window.removeEventListener('password-change-required', handlePasswordChangeRequired);
        };
    }, []);

    return (
        <>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/" element={
                    <OperationsRoute>
                        <OperationsView />
                    </OperationsRoute>
                } />
                <Route path="/audit" element={
                    <AuditRoute>
                        <AuditDashboard />
                    </AuditRoute>
                } />
                <Route path="/admin" element={
                    <AdminRoute>
                        <AdminDashboard />
                    </AdminRoute>
                } />
                <Route path="/superadmin" element={
                    <SuperAdminRoute>
                        <SuperAdminDashboard />
                    </SuperAdminRoute>
                } />
            </Routes>

            {/* Global Password Change Modal */}
            <PasswordChangeModal
                show={showPasswordChangeModal}
                onPasswordChanged={() => {
                    setShowPasswordChangeModal(false);
                    // Reload the page to refresh all data
                    window.location.reload();
                }}
            />
        </>
    );
}

function App() {
    return (
        <AuthProvider>
            <ThemeProvider>
                <HashRouter>
                    <AppRoutes />
                </HashRouter>
            </ThemeProvider>
        </AuthProvider>
    );
}

export default App;
