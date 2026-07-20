import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, ThemeProvider } from '@logmaster/auth';
import { PasswordChangeModal, ErrorBoundary } from '@logmaster/ui';
import { useState, useEffect, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';

import { TenantProvider, useTenant } from './context/TenantContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import Login from './components/Login';
import TenantSelector from './components/TenantSelector';

import Dashboard from './components/Dashboard';
import VisitorsPage from './components/VisitorsPage';
import VisitsPage from './components/VisitsPage';
import CalendarPage from './components/CalendarPage';
import ReportsPage from './components/ReportsPage';
import StatisticsPage from './components/StatisticsPage';
import BackupsPage from './components/BackupsPage';
import ActivityLogsPage from './components/ActivityLogsPage';
import SettingsPage from './components/SettingsPage';

import { useVisitSSE } from './hooks/useVisitSSE';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

// ---------------------------------------------------------------------------
// AdminLayout — the main authenticated layout with sidebar + topbar
// ---------------------------------------------------------------------------

const AdminLayout = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
    const [showShortcuts, setShowShortcuts] = useState(false);

    // Real-time SSE for visit events
    useVisitSSE({ enabled: !!user });

    // Keyboard shortcuts
    const handleShowShortcuts = useCallback(() => setShowShortcuts(true), []);
    useKeyboardShortcuts({ onShowShortcuts: handleShowShortcuts });

    // Listen for password-change-required events from the API interceptor
    useEffect(() => {
        const handlePasswordChangeRequired = () => setShowPasswordChangeModal(true);
        window.addEventListener('password-change-required', handlePasswordChangeRequired);
        return () => window.removeEventListener('password-change-required', handlePasswordChangeRequired);
    }, []);

    // Show error toast for access denied from ProtectedRoute
    useEffect(() => {
        const state = location.state as { error?: string } | null;
        if (state?.error) {
            toast.error(state.error);
            // Clear the error from state so it doesn't show again
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location, navigate]);

    return (
        <div className="min-h-screen bg-[color:var(--bg-0)] text-[color:var(--text-1)] font-sans relative overflow-hidden">
            <div className="absolute inset-0 bg-blueprint opacity-30 pointer-events-none" />
            <div className="absolute inset-0 bg-noise opacity-20 mix-blend-soft-light pointer-events-none" />
            <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[color:var(--accent-2)] opacity-15 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-48 -right-40 h-[28rem] w-[28rem] rounded-full bg-[color:var(--accent-0)] opacity-12 blur-3xl pointer-events-none" />

            <Toaster
                position="top-center"
                toastOptions={{
                    duration: 3000,
                    style: {
                        background: 'var(--surface-1)',
                        color: 'var(--text-1)',
                        borderRadius: '10px',
                        border: '1px solid var(--border-1)',
                    },
                    success: { iconTheme: { primary: '#4dd7ff', secondary: '#081116' } },
                    error: { iconTheme: { primary: '#ff6b6b', secondary: '#0b0f12' } },
                }}
            />

            <div className="flex relative z-10">
                <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

                <div className="flex-1 min-w-0">
                    <TopBar
                        onToggleSidebar={() => setSidebarOpen(true)}
                        onShowShortcuts={() => setShowShortcuts(true)}
                        onShowPasswordChange={() => setShowPasswordChangeModal(true)}
                    />

                    <main className="p-4 md:p-8 overflow-auto min-h-[calc(100vh-65px)]">
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/visitors" element={<VisitorsPage />} />
                            <Route path="/visits" element={<VisitsPage />} />
                            <Route path="/calendar" element={<CalendarPage />} />
                            <Route path="/reports" element={<ReportsPage />} />
                            <Route path="/statistics" element={<StatisticsPage />} />
                            <Route path="/backups" element={<BackupsPage />} />
                            <Route path="/activity-logs" element={<ActivityLogsPage />} />
                            <Route path="/settings" element={<SettingsPage />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </main>
                </div>
            </div>

            <KeyboardShortcutsModal
                isOpen={showShortcuts}
                onClose={() => setShowShortcuts(false)}
            />

            <PasswordChangeModal
                show={showPasswordChangeModal}
                onPasswordChanged={() => {
                    setShowPasswordChangeModal(false);
                    window.location.reload();
                }}
            />
        </div>
    );
};

// ---------------------------------------------------------------------------
// AppRouter — handles public routes (login, tenant selector) and protected routes
// ---------------------------------------------------------------------------

const AppRouter = () => {
    const { user, loading } = useAuth();
    const { selectedSlug, loadingTenants, tenants } = useTenant();

    if (loading || loadingTenants) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[color:var(--bg-0)]">
                <div className="animate-spin w-8 h-8 border-4 border-[color:var(--accent-0)] border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <Routes>
            {/* Login route — accessible when not authenticated */}
            <Route
                path="/login"
                element={user ? <Navigate to="/" replace /> : <Login />}
            />

            {/* Tenant selector — accessible when authenticated but no tenant selected */}
            <Route
                path="/select-tenant"
                element={
                    user && !selectedSlug && tenants.length > 1
                        ? <TenantSelector />
                        : <Navigate to="/" replace />
                }
            />

            {/* Protected routes */}
            <Route
                path="/*"
                element={
                    <ProtectedRoute>
                        <AdminLayout />
                    </ProtectedRoute>
                }
            />
        </Routes>
    );
};

// ---------------------------------------------------------------------------
// App — root component with all providers
// ---------------------------------------------------------------------------

function App() {
    return (
        <ErrorBoundary>
            <AuthProvider>
                <ThemeProvider>
                    <TenantProvider>
                        <HashRouter>
                            <AppRouter />
                        </HashRouter>
                    </TenantProvider>
                </ThemeProvider>
            </AuthProvider>
        </ErrorBoundary>
    );
}

export default App;
