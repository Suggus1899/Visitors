import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, ThemeProvider, QueryProvider } from '@logmaster/auth';
import { TenantProvider } from './contexts/TenantContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './components/LoginPage';
import { TenantSelectorPage } from './components/TenantSelectorPage';
import { DashboardPage } from './components/DashboardPage';
import { AuditLogsPage } from './components/AuditLogsPage';
import { ArcoRequestsPage } from './components/ArcoRequestsPage';
import { SubjectSearchPage } from './components/SubjectSearchPage';
import { ReportsPage } from './components/ReportsPage';
import { CompliancePage } from './components/CompliancePage';
import { StatisticsPage } from './components/StatisticsPage';
import { Toaster } from 'react-hot-toast';

function App() {
    return (
        <QueryProvider>
            <AuthProvider>
                <ThemeProvider>
                    <TenantProvider>
                        <HashRouter>
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
                                }}
                            />
                            <Routes>
                                {/* Public routes */}
                                <Route path="/login" element={<LoginPage />} />
                                <Route path="/select-tenant" element={<TenantSelectorPage />} />

                                {/* Protected routes — auditor only */}
                                <Route
                                    path="/*"
                                    element={
                                        <ProtectedRoute>
                                            <Layout>
                                                <Routes>
                                                    <Route path="/" element={<DashboardPage />} />
                                                    <Route path="/logs" element={<AuditLogsPage />} />
                                                    <Route path="/arco" element={<ArcoRequestsPage />} />
                                                    <Route path="/subjects" element={<SubjectSearchPage />} />
                                                    <Route path="/reports" element={<ReportsPage />} />
                                                    <Route path="/compliance" element={<CompliancePage />} />
                                                    <Route path="/statistics" element={<StatisticsPage />} />
                                                    <Route path="*" element={<Navigate to="/" replace />} />
                                                </Routes>
                                            </Layout>
                                        </ProtectedRoute>
                                    }
                                />
                            </Routes>
                        </HashRouter>
                    </TenantProvider>
                </ThemeProvider>
            </AuthProvider>
        </QueryProvider>
    );
}

export default App;
