import { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { VisitService } from './services/api.v1';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { useAuth } from './hooks/useAuth';
import Login from './components/Login';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import AdminDashboard from './components/AdminDashboard';
import VisitForm from './components/VisitForm';
import ActiveVisits from './components/ActiveVisits';
import AuditDashboard from './components/AuditDashboard';
import LayoutDashboard from 'lucide-react/dist/esm/icons/layout-dashboard';
import HelpCircle from 'lucide-react/dist/esm/icons/help-circle';
import Keyboard from 'lucide-react/dist/esm/icons/keyboard';
import Shield from 'lucide-react/dist/esm/icons/shield';
import { Visit } from './types';
import { startGuidedTour } from './utils/guidedTour';
import { useSessionTimeout } from './hooks/useSessionTimeout';
import { SessionWarningModal } from './components/SessionWarningModal';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp';
import { Toaster } from 'react-hot-toast';
import { Header } from './components/Header';

// Main Operations View (Guard + Admin)
const OperationsView = () => {
    const [visits, setVisits] = useState<Visit[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showShortcuts, setShowShortcuts] = useState(false);
    const { logout, user } = useAuth();
    const { showWarning, timeLeft, extendSession, logout: sessionLogout } = useSessionTimeout();
    const navigate = useNavigate();
    const searchInputRef = useRef<HTMLInputElement>(null);

    const fetchVisits = async () => {
        try {
            const data = await VisitService.getActiveVisits();
            setVisits(data);
        } catch (error) {
            console.error(error);
        }
    };

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
        fetchVisits();
        const interval = setInterval(fetchVisits, 3000);

        if (user?.username === 'demo') {
            setTimeout(() => startGuidedTour(), 500);
        }

        return () => clearInterval(interval);
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
                        <VisitForm onVisitAdded={fetchVisits} />
                    </div>
                    <div className="w-full xl:w-2/3" data-tour="active-visits">
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

                        <ActiveVisits visits={filteredVisits} onCheckout={fetchVisits} />
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

const AuditRoute = ({ children }: { children: JSX.Element }) => {
    const { user, loading } = useAuth();
    if (loading) return <div>Loading...</div>;
    if (user?.role !== 'admin' && user?.role !== 'auditor') return <Navigate to="/" />;
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
    return (
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
        </Routes>
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
