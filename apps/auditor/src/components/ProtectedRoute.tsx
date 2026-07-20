import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@logmaster/auth';
import { useTenant } from '../contexts/TenantContext';
import { Loader2 } from 'lucide-react';

/**
 * Route guard that enforces:
 * 1. User is authenticated.
 * 2. User has the 'auditor' role (redirects non-auditors to /login).
 * 3. A tenant is selected (redirects to /select-tenant if not).
 */
export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
    const { user, loading } = useAuth();
    const { currentTenant, loading: tenantLoading } = useTenant();
    const location = useLocation();

    if (loading || tenantLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[color:var(--bg-0)]">
                <Loader2 className="animate-spin text-[color:var(--accent-0)]" size={32} />
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (user.role !== 'auditor') {
        // Non-auditor roles are not permitted in this portal.
        return <Navigate to="/login" replace />;
    }

    if (!currentTenant && location.pathname !== '/select-tenant') {
        return <Navigate to="/select-tenant" replace />;
    }

    return <>{children}</>;
};
